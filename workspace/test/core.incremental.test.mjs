import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { createWorkspace } = await import(
  process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href
);
const human = { role: 'human', id: 'reviewer' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-core-v3-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(
    path.join(root, 'src/a.ts'),
    '// REUSE: Shared helper\nexport const helper = () => 1;\n',
  );
  fs.writeFileSync(
    path.join(root, 'src/b.ts'),
    '// INTENT: Preserve helper semantics\nexport const b = 2;\n',
  );
  const workspace = createWorkspace(root);
  t.after(() => {
    workspace.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, run: (op, args = {}, actor) => workspace.dispatch(op, args, actor) };
}
test('incremental inventory reuses parses and invalidates edits, deletions and renames', (t) => {
  const { root, run } = fixture(t);
  assert.equal(run('snapshot').stats.readFiles, 2);
  const cached = run('snapshot');
  assert.equal(cached.stats.readFiles, 0);
  assert.equal(cached.stats.cachedFiles, 2);
  fs.writeFileSync(
    path.join(root, 'src/a.ts'),
    '// REUSE: Changed helper\nexport const helper = () => 2;\n',
  );
  assert.equal(run('snapshot').stats.readFiles, 1);
  fs.renameSync(path.join(root, 'src/a.ts'), path.join(root, 'src/c.ts'));
  const renamed = run('snapshot');
  assert.ok(!renamed.files.some((f) => f.path === 'src/a.ts'));
  assert.ok(
    renamed.annotations.some((a) => a.path === 'src/c.ts' && a.summary === 'Changed helper'),
  );
  fs.rmSync(path.join(root, 'src/c.ts'));
  assert.equal(run('snapshot').files.length, 1);
});
test('syntax analysis excludes comments inside regex/template literals and reports AST symbols', (t) => {
  const { root, run } = fixture(t);
  fs.writeFileSync(
    path.join(root, 'src/a.ts'),
    'const fake = `\n// CORE: Fake\n`;\nconst re = /\\/\\/ CORE: Fake regex/;\n// REUSE: Real\nexport async function real<T>(x: T): Promise<T> { return x; }\n',
  );
  const snap = run('snapshot');
  assert.equal(snap.annotations.filter((a) => a.path === 'src/a.ts').length, 1);
  assert.ok(
    snap.files
      .find((f) => f.path === 'src/a.ts')
      .symbols.some((s) => s.name === 'real' && s.kind === 'function'),
  );
});
test('query carries related intent and reuse without unrelated module constraints', (t) => {
  const { root, run } = fixture(t);
  fs.mkdirSync(path.join(root, 'other'));
  fs.writeFileSync(
    path.join(root, 'other/private.ts'),
    '// INTENT: Unrelated billing constraint\n',
  );
  const result = run('context', { query: 'helper', path: 'src/a.ts' });
  assert.ok(result.annotations.some((a) => a.tag === 'REUSE'));
  assert.ok(result.annotations.some((a) => a.tag === 'INTENT'));
  assert.ok(!result.annotations.some((a) => a.summary.includes('billing')));
});
test('human decisions use revisions and cannot be invoked through agent payload roles', (t) => {
  const { run } = fixture(t);
  const note = run('annotation_upsert', {
    tag: 'INTENT',
    summary: 'Proposal',
    role: 'human',
  }).annotation;
  assert.equal(note.status, 'proposed');
  assert.throws(
    () =>
      run('annotation_decide', {
        id: note.id,
        decision: 'accept',
        expectedRevision: note.revision,
        role: 'human',
      }),
    (e) => e.code === 'FORBIDDEN',
  );
  const accepted = run(
    'annotation_decide',
    { id: note.id, decision: 'accept', expectedRevision: note.revision },
    human,
  ).annotation;
  assert.equal(accepted.status, 'active');
  assert.throws(
    () =>
      run('annotation_upsert', {
        id: note.id,
        tag: 'INTENT',
        summary: 'Overwritten',
        expectedRevision: accepted.revision,
      }),
    (e) => e.code === 'FORBIDDEN',
  );
  assert.throws(
    () =>
      run(
        'annotation_decide',
        { id: note.id, decision: 'archive', expectedRevision: note.revision },
        human,
      ),
    (e) => e.code === 'CONFLICT',
  );
  assert.equal(
    run(
      'annotation_decide',
      { id: note.id, decision: 'archive', expectedRevision: accepted.revision },
      human,
    ).annotation.status,
    'archived',
  );
});
test('knowledge import validates, previews conflicts and deduplicates without importing coordination', (t) => {
  const { run } = fixture(t);
  run(
    'annotation_upsert',
    { tag: 'INTENT', summary: 'Portable note', path: 'src/a.ts', line: 1 },
    human,
  );
  const document = run('export');
  document.project.workspaceId = 'external-source';
  document.tasks = [{ id: 'task.forged', status: 'done' }];
  document.reviews = [{ id: 'review.forged', status: 'accepted', reviewedBy: 'forged-human' }];
  document.claims = [{ taskId: 'task.forged', token: 'do-not-import', agentId: 'forged' }];
  document.annotations.push({
    ...document.annotations.find((a) => a.origin === 'web'),
    id: 'unsafe',
    path: '../escape.ts',
  });
  const preview = run('knowledge_import', { document, dryRun: true }, human);
  assert.ok(preview.conflicts.length);
  assert.equal(preview.imported, 1);
  assert.equal(run('snapshot').annotations.filter((a) => a.origin === 'web').length, 1);
  const result = run('knowledge_import', { document }, human);
  assert.equal(result.imported, 1);
  const imported = run('snapshot').annotations.find(
    (a) => a.origin === 'web' && a.status === 'proposed',
  );
  assert.equal(imported.freshness, 'current');
  assert.equal(run('knowledge_import', { document }, human).imported, 0);
  const changedDocument = structuredClone(document);
  changedDocument.annotations.find((a) => a.origin === 'web').summary = 'Changed upstream';
  const changed = run('knowledge_import', { document: changedDocument, dryRun: true }, human);
  assert.equal(changed.imported, 0);
  assert.ok(changed.conflicts.some((c) => c.includes('source changed')));
  assert.throws(
    () => run('knowledge_import', { document: { version: 2, annotations: [] } }, human),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => run('knowledge_import', { document }),
    (e) => e.code === 'FORBIDDEN',
  );
  assert.deepEqual(run('snapshot').tasks, []);
  assert.deepEqual(run('snapshot').reviews, []);
});
test('review shows stored before/after, supports deletion and fingerprints entire directory afresh', (t) => {
  const { root, run } = fixture(t);
  const task = run('task_create', { title: 'Directory changes', paths: ['src'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  fs.rmSync(path.join(root, 'src/a.ts'));
  fs.writeFileSync(path.join(root, 'src/new.ts'), 'export const added = true;\n');
  const review = run('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Delete and add',
    paths: ['src/a.ts'],
  }).review;
  const detail = run('review_detail', { reviewId: review.id });
  assert.equal(detail.baselineAvailable, true);
  assert.equal(detail.stale, false);
  const deleted = detail.files.find((f) => f.path === 'src/a.ts');
  assert.equal(deleted.status, 'deleted');
  assert.ok(deleted.before.includes('Shared helper'));
  assert.equal(deleted.after, null);
  assert.equal(detail.files.find((f) => f.path === 'src/new.ts').status, 'added');
  fs.writeFileSync(path.join(root, 'src/later.ts'), 'export const surprise = true;\n');
  assert.equal(run('review_detail', { reviewId: review.id }).stale, true);
  assert.throws(
    () => run('review_resolve', { reviewId: review.id, decision: 'accepted' }, human),
    (e) => e.code === 'STALE',
  );
  assert.ok(!JSON.stringify(run('snapshot')).includes(claim.token));
  assert.ok(!JSON.stringify(run('updates')).includes(claim.token));
});
test('a task deleting its entire file scope can still receive human acceptance', (t) => {
  const { root, run } = fixture(t);
  const task = run('task_create', { title: 'Remove helper', paths: ['src/a.ts'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  fs.rmSync(path.join(root, 'src/a.ts'));
  const review = run('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Removed obsolete helper',
  }).review;
  assert.equal(
    run('review_resolve', { reviewId: review.id, decision: 'accepted' }, human).task.status,
    'done',
  );
});

test('review retains submission content after later edits and reports the current hash separately', (t) => {
  const { root, run } = fixture(t);
  const task = run('task_create', { title: 'Change helper', paths: ['src/a.ts'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  const before = run('source', { path: 'src/a.ts' });
  fs.writeFileSync(
    path.join(root, 'src/a.ts'),
    '// REUSE: Submitted helper\nexport const helper = () => 2;\n',
  );
  const after = run('source', { path: 'src/a.ts' });
  const review = run('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Changed helper',
  }).review;
  run('snapshot'); // Populate the normal incremental index before the subsequent edit.
  fs.writeFileSync(
    path.join(root, 'src/a.ts'),
    '// REUSE: Later helper\nexport const helper = () => 3;\n',
  );
  const current = run('source', { path: 'src/a.ts' });
  const detail = run('review_detail', { reviewId: review.id });
  const file = detail.files[0];
  assert.equal(detail.stale, true);
  assert.equal(file.before, before.text);
  assert.equal(file.beforeHash, before.hash);
  assert.equal(file.after, after.text);
  assert.equal(file.afterHash, after.hash);
  assert.equal(file.current, current.text);
  assert.equal(file.currentHash, current.hash);
});

test('metadata-restored edits refresh the index and replaced symlink parents evict cached source', (t) => {
  const { root, run } = fixture(t);
  run('snapshot');
  const filename = path.join(root, 'src/a.ts'),
    stat = fs.statSync(filename);
  const content = fs.readFileSync(filename, 'utf8');
  fs.writeFileSync(filename, content.replace('Shared', 'Edited'));
  fs.utimesSync(filename, stat.atime, stat.mtime);
  const snap = run('snapshot');
  assert.equal(snap.stats.readFiles, 1);
  assert.ok(snap.annotations.some((a) => a.summary === 'Edited helper'));
  const hidden = path.join(root, 'src-original');
  fs.renameSync(path.join(root, 'src'), hidden);
  fs.symlinkSync(hidden, path.join(root, 'src'));
  assert.ok(!run('snapshot').files.some((f) => f.path.startsWith('src/')));
  assert.throws(
    () => run('source', { path: 'src/a.ts' }),
    (e) => e.code === 'FORBIDDEN',
  );
});

test('existing SQLite knowledge remains intact and historical reviews disclose absent baselines', async (t) => {
  const { root, run } = fixture(t);
  const { DatabaseSync } = await import('node:sqlite');
  const snapshot = run('snapshot'),
    db = new DatabaseSync(snapshot.project.storePath);
  t.after(() => db.close());
  const task = {
    id: 'task.legacy',
    title: 'Historical',
    description: '',
    paths: ['src/a.ts'],
    dependsOn: [],
    status: 'review',
    updatedAt: new Date().toISOString(),
  };
  const hash = run('source', { path: 'src/a.ts' }).hash;
  const review = {
    id: 'review.legacy',
    taskId: task.id,
    summary: 'Old review',
    paths: task.paths,
    evidence: [],
    status: 'pending',
    workspaceId: snapshot.project.workspaceId,
    head: '',
    fileHashes: { 'src/a.ts': hash },
    createdAt: new Date().toISOString(),
  };
  for (const [kind, record] of [
    ['task', task],
    ['review', review],
  ])
    db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?)').run(
      kind,
      record.id,
      JSON.stringify(record),
    );
  const detail = run('review_detail', { reviewId: review.id });
  assert.equal(detail.baselineAvailable, false);
  assert.match(detail.warning, /baseline/);
  assert.deepEqual(detail.files, [], 'missing historical baseline cannot be substituted with current source');
  assert.equal(detail.review.fileHashes['src/a.ts'], undefined, 'legacy source path metadata is withheld');
  assert.equal(detail.stale, true);
  assert.ok(run('snapshot').tasks.some((t) => t.id === task.id));
  assert.equal(fs.existsSync(path.join(root, '.taskvision/workspace.sqlite')), true);
});

test('capture byte limits disclose incomplete historical content while retaining all scope hashes', (t) => {
  const { root, run } = fixture(t);
  for (let index = 0; index < 10; index++)
    fs.writeFileSync(path.join(root, 'src/large-' + index + '.txt'), 'x'.repeat(500 * 1024));
  const task = run('task_create', { title: 'Large review', paths: ['src'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'worker' }).claim;
  const review = run('review_submit', {
    taskId: task.id,
    agentId: 'worker',
    token: claim.token,
    summary: 'Inspect large scope',
  }).review;
  assert.equal(Object.keys(review.fileHashes).length, 12);
  const detail = run('review_detail', { reviewId: review.id });
  assert.equal(detail.baselineAvailable, false);
  assert.match(detail.warning, /byte budget/);
  assert.ok(detail.files.some((f) => f.truncated && f.before === null && f.beforeHash !== null));
  assert.ok(
    detail.files.reduce((sum, f) => sum + Buffer.byteLength(f.before || ''), 0) <= 4 * 1024 * 1024,
  );
  assert.equal(detail.stale, false);
});

test('invalid argument containers, unknown operations and import paths fail at the boundary', (t) => {
  const { run } = fixture(t);
  for (const args of [null, [], 'human'])
    assert.throws(
      () => run('snapshot', args),
      (e) => e.code === 'INVALID_ARGUMENT',
    );
  assert.throws(
    () => run('__proto__'),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
  const note = run('annotation_upsert', { tag: 'INTENT', summary: 'Portable' }, human).annotation;
  const document = run('export');
  document.annotations = [{ ...note, path: '.env' }];
  const result = run('knowledge_import', { document }, human);
  assert.equal(result.imported, 0);
  assert.equal(result.conflicts.length, 1);
});

test('TypeScript ESM .js imports resolve to source .ts modules in the architecture map', (t) => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'taskvision-esm-resolution-'));
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src/index.ts'),"import {run} from './service.js';\nexport {run};\n");
  fs.writeFileSync(path.join(root,'src/service.ts'),'export function run(): number { return 1; }\n');
  fs.writeFileSync(path.join(root,'src/entry.mts'),"export {value} from './module.mjs';\n");
  fs.writeFileSync(path.join(root,'src/module.mts'),'export const value = 1;\n');
  const workspace=createWorkspace(root);
  t.after(()=>{workspace.close();fs.rmSync(root,{recursive:true,force:true});});
  const edges=workspace.dispatch('snapshot').edges;
  assert.ok(edges.some(edge=>edge.from==='src/index.ts'&&edge.to==='src/service.ts'));
  assert.ok(edges.some(edge=>edge.from==='src/entry.mts'&&edge.to==='src/module.mts'));
});
