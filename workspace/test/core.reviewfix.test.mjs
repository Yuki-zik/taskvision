import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const { createWorkspace } = await import(
  process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href
);
const human = { role: 'human', id: 'reviewer' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-reviewfix-'));
  fs.mkdirSync(path.join(root, 'packages/core/src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages/core/src/index.ts'),
    '// REUSE: Exact optimizer helper\nexport const optimizer = () => 1;\n',
  );
  fs.writeFileSync(path.join(root, 'other.ts'), '// CORE: Other module\nexport const other = 2;\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@local',
    'commit',
    '-qm',
    'fixture',
  ]);
  const clients = [];
  function open(relative = '', options = {}) {
    const w = createWorkspace(path.join(root, relative), options);
    clients.push(w);
    return w;
  }
  t.after(() => {
    for (const w of clients) w.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, open };
}
const conflict = (e) => e.code === 'CONFLICT';
test('nested Git workspace clients fence leases for the same repository source', (t) => {
  const { open } = fixture(t),
    parent = open(),
    nested = open('packages/core');
  assert.equal(
    parent.dispatch('snapshot').project.storePath,
    nested.dispatch('snapshot').project.storePath,
  );
  const a = parent.dispatch('task_create', {
    title: 'Parent file',
    paths: ['packages/core/src/index.ts'],
  }).task;
  const b = nested.dispatch('task_create', { title: 'Nested file', paths: ['src/index.ts'] }).task;
  parent.dispatch('task_claim', { taskId: a.id, agentId: 'parent' });
  assert.throws(() => nested.dispatch('task_claim', { taskId: b.id, agentId: 'nested' }), conflict);
  assert.deepEqual(nested.dispatch('snapshot').tasks.find((x) => x.id === a.id).paths, [
    'src/index.ts',
  ]);
  assert.deepEqual(parent.dispatch('snapshot').tasks.find((x) => x.id === b.id).paths, [
    'packages/core/src/index.ts',
  ]);
});
test('a narrow task is claimable and reviewable when the project index is capped', (t) => {
  const { root, open } = fixture(t),
    w = open('', { maxFiles: 1 });
  assert.equal(w.dispatch('snapshot').limits.truncated, true);
  const task = w.dispatch('task_create', {
    title: 'One scoped file',
    paths: ['packages/core/src/index.ts'],
  }).task;
  const claim = w.dispatch('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  fs.appendFileSync(path.join(root, 'packages/core/src/index.ts'), '// REVIEW: Scoped edit\n');
  const review = w.dispatch('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Single file complete',
  }).review;
  assert.deepEqual(Object.keys(review.fileHashes), ['packages/core/src/index.ts']);
  assert.equal(w.dispatch('review_detail', { reviewId: review.id }).baselineAvailable, true);
  assert.equal(
    w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human).task.status,
    'done',
  );
});
test('import across source revisions discloses conflicts and cannot approve a silently refreshed anchor', (t) => {
  const { root, open } = fixture(t),
    w = open();
  const note = w.dispatch(
    'annotation_upsert',
    {
      tag: 'REUSE',
      summary: 'Guidance for revision A',
      path: 'packages/core/src/index.ts',
      line: 2,
    },
    human,
  ).annotation;
  const document = w.dispatch('export');
  document.project.workspaceId = 'source-revision-a';
  document.annotations = [note];
  fs.appendFileSync(path.join(root, 'packages/core/src/index.ts'), '// Revision B\n');
  const preview = w.dispatch('knowledge_import', { document, dryRun: true }, human);
  assert.ok(preview.conflicts.length > 0);
  const imported = w.dispatch('knowledge_import', { document }, human);
  if (imported.imported) {
    const copy = w.dispatch('snapshot').annotations.find((a) => a.id.startsWith('import.'));
    assert.equal(copy.fileHash, note.fileHash);
    assert.equal(copy.freshness, 'stale');
    assert.throws(
      () =>
        w.dispatch(
          'annotation_decide',
          { id: copy.id, decision: 'accept', expectedRevision: copy.revision },
          human,
        ),
      (e) => e.code === 'STALE',
    );
  } else assert.ok(imported.conflicts.length > 0);
});
test('bounded context preserves exact reuse matches and relevant guidance with omission counts', (t) => {
  const { open } = fixture(t),
    w = open();
  for (let index = 0; index < 45; index++)
    w.dispatch(
      'annotation_upsert',
      { tag: 'INTENT', summary: 'Applicable constraint ' + index },
      human,
    );
  const result = w.dispatch('context', { query: 'Exact optimizer helper' });
  assert.ok(
    result.annotations.some((a) => a.tag === 'REUSE' && a.summary === 'Exact optimizer helper'),
  );
  assert.ok(result.annotations.some((a) => a.tag === 'INTENT'));
  assert.equal(result.selection.matched, 1);
  assert.equal(result.selection.returned, 40);
  assert.equal(result.selection.omittedMatches, 0);
  assert.equal(result.selection.omittedGuidance, 6);
});
test('context exposes scan completeness for a query whose file lies outside the cap', (t) => {
  const { open } = fixture(t),
    w = open('', { maxFiles: 1 });
  const result = w.dispatch('context', { path: 'packages/core/src/index.ts', query: 'optimizer' });
  assert.equal(result.annotations.length, 0);
  assert.equal(result.limits.truncated, true);
  assert.equal(result.limits.scannedFiles, 1);
  assert.equal(result.selection.matched, 0);
});

test('legacy SQLite leases retain their fencing token during root and nested scope migration', (t) => {
  const { root, open } = fixture(t),
    parent = open();
  const info = parent.dispatch('snapshot').project,
    db = new DatabaseSync(info.storePath);
  t.after(() => db.close());
  const task = {
    id: 'task.old',
    title: 'Old nested task',
    description: '',
    paths: ['src/index.ts'],
    dependsOn: [],
    status: 'doing',
    updatedAt: new Date().toISOString(),
  };
  const nestedRoot = fs.realpathSync(path.join(root, 'packages/core'));
  const workspaceId = createHash('sha256').update(nestedRoot).digest('hex').slice(0, 20);
  const old = {
    taskId: task.id,
    agentId: 'old-worker',
    token: 'existing-fencing-token',
    workspaceId,
    paths: task.paths,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  for (const [kind, id, value] of [
    ['task', task.id, task],
    ['claim', task.id, old],
  ])
    db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?)').run(
      kind,
      id,
      JSON.stringify(value),
    );
  const other = parent.dispatch('task_create', { title: 'Other file', paths: ['other.ts'] }).task;
  assert.throws(
    () => parent.dispatch('task_claim', { taskId: other.id, agentId: 'new-worker' }),
    conflict,
    'unknown old origin must not be treated as a different scope',
  );
  const nested = open('packages/core');
  const renewed = nested.dispatch('task_heartbeat', {
    taskId: task.id,
    agentId: old.agentId,
    token: old.token,
  }).claim;
  assert.equal(renewed.token, old.token);
  const stored = JSON.parse(
    db.prepare("SELECT data FROM records WHERE kind='claim' AND id=?").get(task.id).data,
  );
  assert.deepEqual(stored.coordinates.paths, ['packages/core/src/index.ts']);
  assert.equal(stored.token, old.token);
  parent.dispatch('task_claim', { taskId: other.id, agentId: 'new-worker' });
  const collision = parent.dispatch('task_create', {
    title: 'Same old source',
    paths: ['packages/core/src/index.ts'],
  }).task;
  assert.throws(
    () => parent.dispatch('task_claim', { taskId: collision.id, agentId: 'collision' }),
    conflict,
  );
  assert.throws(
    () =>
      nested.dispatch('task_heartbeat', {
        taskId: task.id,
        agentId: old.agentId,
        token: 'wrong-token',
      }),
    conflict,
  );
  assert.deepEqual(parent.dispatch('snapshot').tasks.find((x) => x.id === task.id).paths, [
    'packages/core/src/index.ts',
  ]);
  assert.ok(!JSON.stringify(parent.dispatch('snapshot')).includes(old.token));
});

test('sibling worktree notes and tasks never point at a different checkout file by coincidental local path', (t) => {
  const { root, open } = fixture(t),
    parent = open();
  const peerRoot = root + '-peer';
  execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'peer-test', peerRoot]);
  const peer = createWorkspace(peerRoot);
  t.after(() => {
    peer.close();
    fs.rmSync(peerRoot, { recursive: true, force: true });
  });
  const nested = open('packages/core');
  const note = nested.dispatch(
    'annotation_upsert',
    { tag: 'INTENT', summary: 'Anchored nested guidance', path: 'src/index.ts', line: 1 },
    human,
  ).annotation;
  assert.equal(
    parent.dispatch('snapshot').annotations.find((a) => a.id === note.id).path,
    'packages/core/src/index.ts',
  );
  fs.writeFileSync(path.join(peerRoot, 'peer-only.ts'), '// CORE: Exists only in peer\n');
  const peerNote = peer.dispatch(
    'annotation_upsert',
    { tag: 'INTENT', summary: 'Peer source evidence', path: 'packages/core/src/index.ts', line: 2 },
    human,
  ).annotation;
  const peerTask = peer.dispatch('task_create', {
    title: 'Peer-only file',
    paths: ['peer-only.ts'],
  }).task;
  const snap = parent.dispatch('snapshot');
  assert.ok(!snap.annotations.some((a) => a.id === peerNote.id));
  assert.deepEqual(snap.tasks.find((task) => task.id === peerTask.id).paths, []);
});

test('scope capture accounts for new directory files, enforces its own cap and fails on unreadable source', (t) => {
  const { root, open } = fixture(t),
    w = open('', { maxFiles: 2 });
  const task = w.dispatch('task_create', {
    title: 'Directory coverage',
    paths: ['packages/core'],
  }).task;
  const claim = w.dispatch('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  fs.writeFileSync(path.join(root, 'packages/core/src/new.ts'), 'export const added = 1;\n');
  const review = w.dispatch('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Both source files',
  }).review;
  assert.equal(Object.keys(review.fileHashes).length, 2);
  fs.writeFileSync(
    path.join(root, 'packages/core/src/overflow.ts'),
    'export const overflow = 1;\n',
  );
  assert.throws(
    () => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    conflict,
  );
  fs.rmSync(path.join(root, 'packages/core/src/overflow.ts'));
  fs.writeFileSync(path.join(root, 'packages/core/src/new.ts'), Buffer.from([0, 1, 2]));
  assert.throws(
    () => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    (e) => e.code === 'FORBIDDEN',
  );
  fs.rmSync(path.join(root, 'packages/core/src/new.ts'));
  fs.symlinkSync(path.join(root, 'other.ts'), path.join(root, 'packages/core/src/linked.ts'));
  const unsafe = w.dispatch('review_detail', { reviewId: review.id });
  assert.equal(unsafe.stale, true);
  assert.equal(unsafe.baselineAvailable, false);
  assert.deepEqual(unsafe.files, [], 'do not disclose historical source when a symlink appears');
  assert.match(unsafe.warning, /cannot be safely captured/);
  assert.throws(
    () => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    (e) => e.code === 'FORBIDDEN',
  );
});

test('old root leases migrate without token rotation and unknown legacy leases release their fence on expiry', (t) => {
  const { open } = fixture(t),
    w = open(),
    project = w.dispatch('snapshot').project;
  const db = new DatabaseSync(project.storePath);
  t.after(() => db.close());
  const task = {
    id: 'task.legacy-root',
    title: 'Old root',
    description: '',
    paths: ['other.ts'],
    dependsOn: [],
    status: 'doing',
    updatedAt: new Date().toISOString(),
  };
  const lease = {
    taskId: task.id,
    agentId: 'root-old',
    token: 'root-old-token',
    workspaceId: project.workspaceId,
    paths: task.paths,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  for (const [kind, id, value] of [
    ['task', task.id, task],
    ['claim', task.id, lease],
  ])
    db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?)').run(
      kind,
      id,
      JSON.stringify(value),
    );
  const refreshed = w.dispatch('task_heartbeat', {
    taskId: task.id,
    agentId: lease.agentId,
    token: lease.token,
  }).claim;
  assert.equal(refreshed.token, lease.token);
  assert.deepEqual(refreshed.paths, ['other.ts']);
  const stored = JSON.parse(
    db.prepare("SELECT data FROM records WHERE kind='claim' AND id=?").get(task.id).data,
  );
  assert.deepEqual(stored.coordinates.paths, ['other.ts']);
  w.dispatch('task_release', { taskId: task.id, agentId: lease.agentId, token: lease.token });
  const replacement = w.dispatch('task_create', { title: 'Replacement', paths: ['other.ts'] }).task;
  db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?)').run(
    'claim',
    'task.unknown',
    JSON.stringify({ ...lease, taskId: 'task.unknown', workspaceId: 'unrecoverable-old-origin' }),
  );
  assert.throws(
    () => w.dispatch('task_claim', { taskId: replacement.id, agentId: 'new-worker' }),
    conflict,
  );
  db.prepare("UPDATE records SET data=? WHERE kind='claim' AND id=?").run(
    JSON.stringify({
      ...lease,
      taskId: 'task.unknown',
      workspaceId: 'unrecoverable-old-origin',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
    'task.unknown',
  );
  const next = w.dispatch('task_claim', { taskId: replacement.id, agentId: 'new-worker' }).claim;
  assert.notEqual(next.token, lease.token);
  assert.throws(
    () =>
      w.dispatch('task_heartbeat', { taskId: task.id, agentId: lease.agentId, token: lease.token }),
    conflict,
  );
});

test('nested project guidance projects into its parent module and stays out of sibling context', (t) => {
  const {open}=fixture(t), parent=open(), nested=open('packages/core');
  const note=nested.dispatch('annotation_upsert',{tag:'INTENT',summary:'Keep core schema stable'},human).annotation;
  const projected=parent.dispatch('snapshot').annotations.find(a=>a.id===note.id);
  assert.ok(projected,'Parent sees nested guidance');
  assert.equal(projected.path,'packages/core');
  assert.equal(projected.anchorKind,'module');
  assert.equal(projected.freshness,'current');
  assert.ok(parent.dispatch('context',{path:'packages/core/src/index.ts'}).annotations.some(a=>a.id===note.id));
  assert.ok(!parent.dispatch('context',{path:'other.ts'}).annotations.some(a=>a.id===note.id));
  const updated=parent.dispatch('annotation_upsert',{id:note.id,tag:'INTENT',summary:'Keep module schema stable',path:projected.path,expectedRevision:note.revision},human).annotation;
  assert.equal(updated.anchorKind,'module');
  assert.ok(nested.dispatch('context',{path:'src/index.ts'}).annotations.some(a=>a.id===note.id));
});

test('legacy claim release persists recovered task coordinates for the next worker', (t) => {
  const {open}=fixture(t), w=open();
  const task=w.dispatch('task_create',{title:'Legacy handoff',paths:['packages/core/src/index.ts']}).task;
  const claim=w.dispatch('task_claim',{taskId:task.id,agentId:'legacy'}).claim;
  const db=new DatabaseSync(w.dispatch('snapshot').project.storePath);
  for(const kind of ['task','claim']){
    const value=JSON.parse(db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,task.id).data);
    delete value.coordinates;
    db.prepare('UPDATE records SET data=? WHERE kind=? AND id=?').run(JSON.stringify(value),kind,task.id);
  }
  db.close();
  w.dispatch('task_heartbeat',{taskId:task.id,agentId:'legacy',token:claim.token});
  const released=w.dispatch('task_release',{taskId:task.id,agentId:'legacy',token:claim.token});
  assert.deepEqual(released.task.paths,['packages/core/src/index.ts']);
  assert.equal(w.dispatch('task_claim',{taskId:task.id,agentId:'next'}).task.status,'doing');
});

test('human acceptance preserves the proposed nested module scope instead of broadening it', (t) => {
  const {open}=fixture(t), parent=open(), nested=open('packages/core');
  const note=nested.dispatch('annotation_upsert',{tag:'INTENT',summary:'Only core uses this policy'}).annotation;
  const proposed=parent.dispatch('snapshot').annotations.find(a=>a.id===note.id);
  assert.equal(proposed.anchorKind,'module');
  const accepted=parent.dispatch('annotation_decide',{id:note.id,decision:'accept',expectedRevision:note.revision},human).annotation;
  assert.equal(accepted.path,'packages/core');
  assert.equal(accepted.anchorKind,'module');
  assert.ok(parent.dispatch('context',{path:'packages/core/src/index.ts'}).annotations.some(a=>a.id===note.id));
  assert.ok(!parent.dispatch('context',{path:'other.ts'}).annotations.some(a=>a.id===note.id));
  assert.ok(nested.dispatch('context',{path:'src/index.ts'}).annotations.some(a=>a.id===note.id&&a.status==='active'));
});

test('historical review lists safe remaining files when one earlier reviewed file becomes gitignored', (t) => {
  const { root, open } = fixture(t);
  const hidden = 'packages/core/src/previously-public.ts';
  fs.writeFileSync(path.join(root, hidden), '// once-readable\nconst secret = "REVIEW-SOURCE-MUST-STAY-HIDDEN";\n');
  const w = open();
  const task = w.dispatch('task_create', { title: 'Two-file review', paths: ['packages/core'] }).task;
  const claim = w.dispatch('task_claim', { taskId: task.id, agentId: 'agent' }).claim;
  fs.appendFileSync(path.join(root, 'packages/core/src/index.ts'), '// verified change\n');
  const review = w.dispatch('review_submit', {
    taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Review including once-public file',
  }).review;
  assert.equal(w.dispatch('review_detail', { reviewId: review.id }).baselineAvailable, true);
  fs.writeFileSync(path.join(root, '.gitignore'), hidden + '\n');
  const detail = w.dispatch('review_detail', { reviewId: review.id });
  assert.equal(detail.stale, true);
  assert.equal(detail.baselineAvailable, false, 'a historical review with blocked evidence is not approvable');
  assert.equal(detail.excludedFileCount, 1);
  assert.ok(detail.files.some(file => file.path === 'packages/core/src/index.ts'));
  assert.ok(!detail.files.some(file => file.path === hidden));
  assert.ok(!JSON.stringify(detail).includes('REVIEW-SOURCE-MUST-STAY-HIDDEN'));
  assert.throws(() => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    error => error.code === 'STALE');
  assert.equal(w.dispatch('review_resolve', {
    reviewId: review.id, decision: 'changes-requested', note: 'Reviewed source is no longer accessible',
  }, human).task.status, 'todo');
});

test('old review without claim-time baseline cannot be silently accepted even on unchanged HEAD', (t) => {
  const { open } = fixture(t), w = open();
  const task = w.dispatch('task_create', { title: 'Legacy review', paths: ['other.ts'] }).task;
  const claim = w.dispatch('task_claim', { taskId: task.id, agentId: 'agent' }).claim;
  const review = w.dispatch('review_submit', {
    taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Old review format',
  }).review;
  const db = new DatabaseSync(w.dispatch('snapshot').project.storePath);
  db.prepare("DELETE FROM records WHERE id=? AND kind IN ('review-baseline','review-source')").run(review.id);
  db.close();
  const detail = w.dispatch('review_detail', { reviewId: review.id });
  assert.equal(detail.baselineAvailable, false);
  assert.equal(detail.baselineRecorded, false);
  assert.equal(detail.stale, true);
  assert.deepEqual(detail.files, [], 'do not return current source when claim-time history is absent');
  assert.ok(detail.warning);
  assert.throws(() => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    error => error.code === 'STALE', 'a missing baseline cannot receive human approval');
});

test('nested checkout root-scope review stays verifiable and approvable', (t) => {
  const { root, open } = fixture(t);
  const parent = open();
  const nested = open('packages/core');
  const task = parent.dispatch('task_create', { title: 'Nested-root review', paths: ['packages/core'] }).task;
  const claim = nested.dispatch('task_claim', { taskId: task.id, agentId: 'nested-agent' }).claim;
  fs.appendFileSync(path.join(root, 'packages/core/src/index.ts'), '// verified nested change\n');
  const review = nested.dispatch('review_submit', {
    taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Nested checkout delivered',
  }).review;
  assert.deepEqual(review.paths, [''], 'empty scope represents this checkout root, not an invalid path');
  const detail = nested.dispatch('review_detail', { reviewId: review.id });
  assert.equal(detail.stale, false);
  assert.equal(detail.baselineAvailable, true);
  assert.ok(detail.files.some(file => file.path === 'src/index.ts'));
  assert.equal(nested.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human).task.status, 'done');
});

test('acceptance rejects deleted baseline-only paths made forbidden after review submit', (t) => {
  const { root, open } = fixture(t);
  const retired = 'packages/core/src/retired.ts';
  fs.writeFileSync(path.join(root, retired), '// old reviewed implementation\nexport const retired = 1;\n');
  const w = open();
  const task = w.dispatch('task_create', { title: 'Delete obsolete file', paths: ['packages/core'] }).task;
  const claim = w.dispatch('task_claim', { taskId: task.id, agentId: 'agent' }).claim;
  fs.unlinkSync(path.join(root, retired));
  const review = w.dispatch('review_submit', {
    taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Removed retired module',
  }).review;
  assert.equal(w.dispatch('review_detail', { reviewId: review.id }).baselineAvailable, true);
  fs.writeFileSync(path.join(root, '.gitignore'), retired + '\n');
  const detail = w.dispatch('review_detail', { reviewId: review.id });
  assert.equal(detail.stale, true);
  assert.equal(detail.baselineAvailable, false);
  assert.equal(detail.excludedFileCount, 1);
  assert.throws(() => w.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    error => error.code === 'STALE', 'Backend must never approve historical evidence that the Web has withheld');
  assert.equal(w.dispatch('snapshot').reviews.find(r => r.id === review.id).status, 'pending');
  assert.equal(w.dispatch('snapshot').tasks.find(t => t.id === task.id).status, 'review');
});
