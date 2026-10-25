import path from 'node:path';
import type {
  Actor,
  OperationArgs,
  OperationName,
  OperationResult,
  ProjectInfo,
  Snapshot,
  Workspace,
  WorkspaceOptions,
} from '../../shared/src/types';
import { Coordination } from './coordination';
import { Coordinates } from './coordinates';
import { digest, git, projectInfo, readSource } from './filesystem';
import { Knowledge } from './knowledge';
import { SourceIndex, type ScanData } from './scanner';
import { Store } from './store';
import { actorIdentity, fail, integer, now, object, WorkspaceError } from './validation';

export { WorkspaceError } from './validation';
type Handlers = {
  [K in OperationName]: (args: OperationArgs<K>, actor: Actor) => OperationResult<K>;
};

// CORE: Transports supply the trusted actor; operation payloads never select a role.
export function createWorkspace(root: string, options: WorkspaceOptions = {}): Workspace {
  const project = projectInfo(path.resolve(root)),
    maxFiles = integer(options.maxFiles, 2000, 1, 10000);
  const store = new Store(project),
    index = new SourceIndex(project, maxFiles);
  const coordinates = new Coordinates(project, store);
  const knowledge = new Knowledge(project, store, index, coordinates),
    coordination = new Coordination(project, store, maxFiles, coordinates);
  let closed = false;
  function scan(): ScanData {
    const data = index.scan();
    store.recordScan(project.workspaceId, digest(JSON.stringify(data.hashes)), data.files.length);
    return data;
  }
  function currentProject(): ProjectInfo {
    return {
      ...project,
      head: git(project.root, ['rev-parse', 'HEAD']),
      branch: git(project.root, ['branch', '--show-current']),
    };
  }
  function snapshot(): Snapshot {
    const data = scan();
    return {
      project: currentProject(),
      revision: store.revision(),
      files: data.files,
      annotations: knowledge.annotations(data),
      tasks: coordination.tasks(),
      claims: coordination.claims(),
      reviews: coordination.reviews(),
      edges: data.edges,
      limits: data.limits,
      stats: data.stats,
    };
  }
  const handlers: Handlers = {
    snapshot: () => snapshot(),
    source: (args) => readSource(project, args.path),
    context: (args) => knowledge.context(snapshot(), args),
    annotation_upsert: (args, actor) => knowledge.upsert(args, actor),
    annotation_decide: (args, actor) => knowledge.decide(args, actor),
    edit_source_annotation: (args, actor) => knowledge.editSource(args, actor, scan),
    task_create: (args, actor) => coordination.create(args, actor),
    task_claim: (args, actor) => coordination.claim(args, actor),
    task_heartbeat: (args, actor) => coordination.heartbeat(args, actor),
    task_release: (args, actor) => coordination.release(args, actor),
    review_submit: (args, actor) => coordination.submit(args, actor),
    review_detail: (args) => coordination.detail(args),
    review_resolve: (args, actor) => coordination.resolve(args, actor),
    updates: (args) => store.updates(args.after, args.limit),
    export: () => {
      const snap = snapshot();
      return {
        version: 1,
        project: snap.project,
        annotations: snap.annotations,
        tasks: snap.tasks,
        reviews: snap.reviews,
        exportedAt: now(),
      };
    },
    knowledge_import: (args, actor) => knowledge.import(args, actor),
  };
  function dispatch<K extends OperationName>(
    operation: K,
    args?: OperationArgs<K>,
    identity: Actor = { role: 'agent', id: 'agent' },
  ): OperationResult<K> {
    if (closed) fail('INTERNAL', 'Workspace has been closed.');
    const values = args === undefined ? {} : args;
    object(values);
    const actor = actorIdentity(identity);
    if (!Object.prototype.hasOwnProperty.call(handlers, operation))
      fail('INVALID_ARGUMENT', 'Unknown operation: ' + String(operation));
    // The mapped handler table preserves each operation's concrete argument/result contract.
    const handler: (args: OperationArgs<K>, actor: Actor) => OperationResult<K> =
      handlers[operation];
    try {
      return handler(values as OperationArgs<K>, actor);
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      fail('INTERNAL', error instanceof Error ? error.message : 'Workspace operation failed.');
    }
  }
  return {
    dispatch,
    close() {
      if (!closed) {
        closed = true;
        try {
          index.close();
        } finally {
          store.close();
        }
      }
    },
  };
}
