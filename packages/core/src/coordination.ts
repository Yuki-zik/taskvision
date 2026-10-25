import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  Actor,
  Claim,
  OperationArgs,
  OperationResult,
  ProjectInfo,
  PublicClaim,
  Review,
  ReviewDetail,
  ReviewFile,
  Task,
} from '../../shared/src/types';
import {
  git,
  scopeInventory,
  normalizePath,
  readSource,
  safePath,
  statFingerprint,
} from './filesystem';
import {
  type Baseline,
  type Capture,
  type CapturedFile,
  type StoredClaim,
  type StoredTask,
  Store,
} from './store';
import { Coordinates, type ScopeCoordinates } from './coordinates';
import { fail, integer, now, overlaps, requireHuman, strings, text } from './validation';

const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
export type InspectedReviewFile = ReviewFile & {
  current: string | null;
  currentHash: string | null;
};
const inScope = (relative: string, scopes: string[]): boolean =>
  scopes.some((scope) => relative === scope || relative.startsWith(scope + '/'));
function hashes(capture: Capture): Record<string, string> {
  return Object.fromEntries(
    Object.entries(capture.files).map(([relative, file]) => [relative, file.hash]),
  );
}
function sameHashes(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a).sort(),
    other = Object.keys(b).sort();
  return (
    keys.length === other.length &&
    keys.every((key, index) => key === other[index] && a[key] === b[key])
  );
}
export class Coordination {
  constructor(
    private project: ProjectInfo,
    private store: Store,
    private maxFiles: number,
    private coordinates: Coordinates,
  ) {}
  scopes(value: unknown): string[] {
    const paths = strings(value, 'paths');
    if (!paths.length)
      fail('INVALID_ARGUMENT', 'At least one explicit file or directory scope is required.');
    for (const relative of paths)
      safePath(this.project, normalizePath(relative), { directory: true, allowMissing: true });
    return paths;
  }
  tasks(): Task[] {
    return this.store.list('task').map((task) => this.coordinates.publicTask(task));
  }
  reviews(): Review[] {
    return this.store
      .list('review')
      .map(({ coordinates: _coordinates, ...review }) =>
        review.workspaceId === this.project.workspaceId
          ? review
          : { ...review, paths: [], focusPaths: [], fileHashes: {} },
      );
  }
  claims(): PublicClaim[] {
    return this.store
      .list('claim')
      .filter((c) => Date.parse(c.expiresAt) > Date.now())
      .map((claim) => {
        const { token: _token, ...record } = this.publicClaim(claim);
        return record;
      });
  }
  private publicClaim(claim: StoredClaim): Claim {
    const { coordinates: _coordinates, ...record } = claim;
    return {
      ...record,
      paths: this.coordinates.publicPaths(
        claim.coordinates || this.coordinates.forWorkspace(claim.workspaceId, claim.paths),
      ),
    };
  }
  private taskScope(task: StoredTask): ScopeCoordinates {
    const scope = this.coordinates.taskScope(task);
    if (!scope)
      fail(
        'CONFLICT',
        'This legacy task has no recoverable workspace origin. Create an explicitly scoped replacement; the original record is preserved.',
      );
    if (!task.coordinates) this.store.save('task', task.id, { ...task, coordinates: scope });
    return scope;
  }
  private migrateClaim(claim: StoredClaim): StoredClaim {
    if (claim.coordinates) return claim;
    const coordinates = this.coordinates.forWorkspace(claim.workspaceId, claim.paths);
    if (!coordinates)
      fail(
        'CONFLICT',
        'An active legacy lease has an unknown workspace origin. Open its original workspace or wait for its expiry before claiming new scopes.',
      );
    const migrated = { ...claim, coordinates };
    this.store.save('claim', claim.taskId, migrated);
    return migrated;
  }
  private lease(args: OperationArgs<'task_heartbeat'>): StoredClaim {
    const claim = this.store.get('claim', text(args.taskId, 'taskId', 128));
    text(args.agentId, 'agentId', 128);
    text(args.token, 'token', 128);
    if (
      !claim ||
      claim.agentId !== args.agentId ||
      claim.token !== args.token ||
      Date.parse(claim.expiresAt) <= Date.now() ||
      claim.workspaceId !== this.project.workspaceId
    )
      fail(
        'CONFLICT',
        'Lease is expired, belongs to a different workspace, or has a stale fencing token.',
      );
    return this.migrateClaim(claim);
  }
  /** Source fingerprints never consult parsing caches, even when metadata appears unchanged. */
  private capture(scopes: string[]): Capture {
    for (const scope of scopes)
      if (scope) safePath(this.project, scope, { directory: true, allowMissing: true });
    const beforeInventory = scopeInventory(this.project, scopes, this.maxFiles);
    if (beforeInventory.truncated)
      fail(
        'CONFLICT',
        'Task scope exceeds its source-file budget. Narrow the scope or increase maxFiles.',
      );
    const selected = beforeInventory.paths;
    const files: Record<string, CapturedFile> = {},
      fingerprints = new Map<string, string>();
    let used = 0,
      complete = true;
    for (const relative of selected) {
      const filename = safePath(this.project, relative, { allowMissing: true, checkIgnore: false });
      if (!fs.existsSync(filename)) continue; // Git inventories still contain deleted tracked files.
      const fingerprint = statFingerprint(this.project, relative),
        source = readSource(this.project, relative, { checkIgnore: false });
      if (fingerprint !== statFingerprint(this.project, relative))
        fail('STALE', 'Source changed while capturing review evidence. Retry after writes finish.');
      fingerprints.set(relative, fingerprint);
      const bytes = Buffer.byteLength(source.text);
      if (used + bytes <= MAX_CAPTURE_BYTES) {
        files[relative] = { hash: source.hash, text: source.text };
        used += bytes;
      } else {
        files[relative] = { hash: source.hash, text: null };
        complete = false;
      }
    }
    const afterInventory = scopeInventory(this.project, scopes, this.maxFiles);
    if (afterInventory.truncated || selected.join('\0') !== afterInventory.paths.join('\0'))
      fail('STALE', 'Source inventory changed while capturing review evidence. Retry.');
    for (const [relative, fingerprint] of fingerprints)
      if (statFingerprint(this.project, relative) !== fingerprint)
        fail('STALE', 'Source changed while capturing review evidence. Retry.');
    return { files, complete, capturedAt: now() };
  }
  create(args: OperationArgs<'task_create'>, actor: Actor): OperationResult<'task_create'> {
    const title = text(args.title, 'title', 500),
      description = text(args.description, 'description', 8000, true),
      paths = this.scopes(args.paths),
      dependsOn = strings(args.dependsOn, 'dependsOn');
    return this.store.transaction(() => {
      for (const id of dependsOn) this.store.require('task', id);
      const task: StoredTask = {
        coordinates: this.coordinates.scope(paths),
        id: 'task.' + crypto.randomUUID(),
        title,
        description,
        paths,
        dependsOn,
        status: 'todo',
        updatedAt: now(),
      };
      this.store.save('task', task.id, task);
      return {
        task: this.coordinates.publicTask(task),
        revision: this.store.event('task-created', actor, { taskId: task.id, paths }),
      };
    });
  }
  claim(args: OperationArgs<'task_claim'>, actor: Actor): OperationResult<'task_claim'> {
    const agentId = text(args.agentId, 'agentId', 128),
      ttl = integer(args.ttlSeconds, 300, 30, 3600);
    return this.store.transaction(() => {
      const current = this.store.require('task', args.taskId);
      const scope = this.taskScope(current);
      if (current.status === 'done' || current.status === 'review')
        fail('CONFLICT', 'Task is completed or waiting for human review.');
      for (const id of current.dependsOn)
        if (this.store.require('task', id).status !== 'done')
          fail('CONFLICT', 'Task dependencies are not satisfied.');
      for (const record of this.store.list('claim')) {
        if (Date.parse(record.expiresAt) <= Date.now()) continue;
        const claim = this.migrateClaim(record);
        if (
          claim.taskId === current.id ||
          claim.coordinates!.paths.some((a) => scope.paths.some((b) => overlaps(a, b)))
        )
          fail(
            'CONFLICT',
            'Task or overlapping source scope is already leased by ' + claim.agentId + '.',
          );
      }
      const localPaths = this.coordinates.localScopes(scope);
      const capture = this.capture(localPaths);
      const baseline: Baseline = {
        ...capture,
        taskId: current.id,
        workspaceId: this.project.workspaceId,
      };
      this.store.remove('baseline', current.id);
      this.store.savePrivate('baseline', current.id, baseline);
      const claim: StoredClaim = {
        coordinates: { version: 1, workspaceId: this.project.workspaceId, paths: scope.paths },
        taskId: current.id,
        agentId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        paths: localPaths,
        workspaceId: this.project.workspaceId,
      };
      const task: StoredTask = {
        ...current,
        coordinates: scope,
        status: 'doing',
        owner: agentId,
        updatedAt: now(),
      };
      this.store.save('claim', task.id, claim);
      this.store.save('task', task.id, task);
      return {
        task: this.coordinates.publicTask(task),
        claim: this.publicClaim(claim),
        revision: this.store.event('task-claimed', actor, {
          taskId: task.id,
          agentId,
          paths: task.paths,
          expiresAt: claim.expiresAt,
        }),
      };
    });
  }
  heartbeat(
    args: OperationArgs<'task_heartbeat'>,
    actor: Actor,
  ): OperationResult<'task_heartbeat'> {
    return this.store.transaction(() => {
      const claim: StoredClaim = {
        ...this.lease(args),
        expiresAt: new Date(
          Date.now() + integer(args.ttlSeconds, 300, 30, 3600) * 1000,
        ).toISOString(),
      };
      this.store.save('claim', claim.taskId, claim);
      return {
        claim: this.publicClaim(claim),
        revision: this.store.event('lease-renewed', actor, {
          taskId: claim.taskId,
          expiresAt: claim.expiresAt,
        }),
      };
    });
  }
  release(args: OperationArgs<'task_release'>, actor: Actor): OperationResult<'task_release'> {
    return this.store.transaction(() => {
      const claim = this.lease(args),
        previous = this.store.require('task', claim.taskId);
      // Preserve the origin while the legacy claim/baseline still provides evidence.
      const coordinates = this.taskScope(previous);
      this.store.remove('claim', claim.taskId);
      this.store.remove('baseline', claim.taskId);
      const { owner: _owner, ...withoutOwner } = previous;
      const task: StoredTask = {
        ...withoutOwner,
        coordinates,
        status: previous.status === 'doing' ? 'todo' : previous.status,
        updatedAt: now(),
      };
      this.store.save('task', task.id, task);
      return {
        task: this.coordinates.publicTask(task),
        revision: this.store.event('task-released', actor, { taskId: task.id }),
      };
    });
  }
  submit(args: OperationArgs<'review_submit'>, actor: Actor): OperationResult<'review_submit'> {
    const task = this.store.require('task', args.taskId);
    this.lease(args);
    const scope = this.taskScope(task),
      localPaths = this.coordinates.localScopes(scope);
    const focusPaths = args.paths === undefined ? localPaths : this.scopes(args.paths);
    if (focusPaths.some((p) => !localPaths.some((s) => s === '' || inScope(p, [s]))))
      fail('FORBIDDEN', 'Review must stay within the claimed task scope.');
    const summary = text(args.summary, 'summary', 8000),
      evidence = strings(args.evidence, 'evidence', 50);
    return this.store.transaction(() => {
      this.lease(args);
      const current = this.store.require('task', task.id);
      if (current.status !== 'doing')
        fail('CONFLICT', 'Only an active task can be submitted for review.');
      const after = this.capture(localPaths);
      this.lease(args);
      const baseline = this.store.get('baseline', task.id);
      if (!Object.keys(after.files).length && !Object.keys(baseline?.files || {}).length)
        fail('NOT_FOUND', 'Review scope has no readable source or deletion baseline.');
      for (const relative of Object.keys(baseline?.files || {})) {
        if (after.files[relative]) continue;
        const filename = safePath(this.project, relative, { allowMissing: true });
        if (fs.existsSync(filename))
          fail(
            'STALE',
            'A baseline source is no longer included in the project inventory. Restore its visibility before review.',
          );
      }
      const review: import('./store').StoredReview = {
        id: 'review.' + crypto.randomUUID(),
        taskId: task.id,
        summary,
        paths: localPaths,
        coordinates: { version: 1, workspaceId: this.project.workspaceId, paths: scope.paths },
        focusPaths,
        evidence,
        evidenceStatus: 'agent-reported',
        status: 'pending',
        workspaceId: this.project.workspaceId,
        head: git(this.project.root, ['rev-parse', 'HEAD']),
        fileHashes: hashes(after),
        createdAt: now(),
      };
      this.store.remove('baseline', task.id);
      if (baseline?.workspaceId === this.project.workspaceId)
        this.store.savePrivate('review-baseline', review.id, baseline);
      this.store.savePrivate('review-source', review.id, after);
      this.store.save('review', review.id, review);
      const next: Task = { ...current, status: 'review', updatedAt: now() };
      this.store.save('task', next.id, next);
      this.store.remove('claim', next.id);
      return {
        review: this.publicReview(review),
        task: this.coordinates.publicTask(next),
        revision: this.store.event('review-submitted', actor, {
          reviewId: review.id,
          taskId: next.id,
          paths: review.paths,
        }),
      };
    });
  }
  private publicReview(record: import('./store').StoredReview): Review {
    const { coordinates: _coordinates, ...review } = record;
    return review;
  }
  detail(args: OperationArgs<'review_detail'>): ReviewDetail {
    const storedReview = this.store.require('review', args.reviewId);
    const review = this.publicReview(storedReview);
    // Cross-checkout details cannot expose another checkout's private stored source.
    if (review.workspaceId !== this.project.workspaceId)
      return {
        review: this.publicReview(review),
        files: [],
        baselineAvailable: false,
        stale: true,
        warning: 'Review belongs to another checkout. Open its workspace to inspect source.',
      };
    const baseline = this.store.get('review-baseline', review.id),
      submitted = this.store.get('review-source', review.id),
      current = this.capture(review.paths);
    const stale =
      review.head !== git(this.project.root, ['rev-parse', 'HEAD']) ||
      !sameHashes(review.fileHashes, hashes(current));
    const paths = [
      ...new Set([
        ...Object.keys(baseline?.files || {}),
        ...Object.keys(review.fileHashes),
        ...Object.keys(current.files),
      ]),
    ].sort();
    const files: InspectedReviewFile[] = paths.map((relative) => {
      // A newly ignored/blocked path must not expose source retained before the boundary changed.
      safePath(this.project, relative, { allowMissing: true });
      const before = baseline?.files[relative],
        afterHash = review.fileHashes[relative] || null;
      const after =
        submitted?.files[relative] ||
        (current.files[relative]?.hash === afterHash ? current.files[relative] : undefined);
      const beforeHash = before?.hash || null;
      return {
        path: relative,
        status:
          !baseline || beforeHash === afterHash
            ? 'unchanged'
            : beforeHash === null
              ? 'added'
              : afterHash === null
                ? 'deleted'
                : 'modified',
        before: before?.text ?? null,
        after: after?.text ?? null,
        beforeHash,
        afterHash,
        current: current.files[relative]?.text ?? null,
        currentHash: current.files[relative]?.hash ?? null,
        ...((before && before.text === null) ||
        (afterHash !== null && !after?.text && after?.text !== '')
          ? { truncated: true }
          : {}),
      };
    });
    const baselineAvailable = !!baseline?.complete;
    const warning = !baseline
      ? 'No claim-time source baseline is available for this historical review or storage budget.'
      : !baseline.complete || !submitted?.complete
        ? 'Source capture exceeded its byte budget; some before/after content is unavailable.'
        : undefined;
    return { review, files, baselineAvailable, stale, ...(warning ? { warning } : {}) };
  }
  resolve(args: OperationArgs<'review_resolve'>, actor: Actor): OperationResult<'review_resolve'> {
    requireHuman(actor);
    if (args.decision !== 'accepted' && args.decision !== 'changes-requested')
      fail('INVALID_ARGUMENT', 'Unsupported review decision.');
    const note = text(args.note, 'note', 8000, true);
    return this.store.transaction(() => {
      const current = this.store.require('review', args.reviewId);
      if (current.status !== 'pending')
        fail('CONFLICT', 'This review already has a human decision.');
      if (args.decision === 'accepted') {
        if (
          current.workspaceId !== this.project.workspaceId ||
          current.head !== git(this.project.root, ['rev-parse', 'HEAD'])
        )
          fail('STALE', 'Review belongs to a different checkout or commit.');
        const capture = this.capture(current.paths);
        if (!sameHashes(current.fileHashes, hashes(capture)))
          fail('STALE', 'Reviewed code changed. Request a new review before accepting.');
      }
      const review: Review = {
        ...current,
        status: args.decision,
        note,
        reviewedBy: actor.id,
        reviewedAt: now(),
      };
      this.store.save('review', review.id, review);
      const { owner: _owner, ...previous } = this.store.require('task', review.taskId);
      const task: Task = {
        ...previous,
        status: args.decision === 'accepted' ? 'done' : 'todo',
        updatedAt: now(),
      };
      this.store.save('task', task.id, task);
      return {
        review: this.publicReview(review),
        task: this.coordinates.publicTask(task),
        revision: this.store.event('review-resolved', actor, {
          reviewId: review.id,
          taskId: task.id,
          decision: args.decision,
        }),
      };
    });
  }
}
