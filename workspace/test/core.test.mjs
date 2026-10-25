import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
const coreModule = process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href;
const { createWorkspace } = await import(coreModule);

const human = { role: 'human', id: 'human' };
const agent = { role: 'agent', id: 'worker-a' };
function fixture(t, git = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-test-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'trainer.js'), '// CORE: Original training loop [tv:id=core.trainer]\n// REUSE: Extend the training step\nexport function train() { return 1; }\n');
  fs.writeFileSync(path.join(root, 'src', 'main.js'), "// INTENT: Reuse the training lifecycle\nimport { train } from './trainer.js';\ntrain();\n");
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  if (git) {
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@local', 'commit', '-qm', 'fixture']);
  }
  const core = createWorkspace(root);
  t.after(() => { core.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, core, run: (op, args = {}, actor = agent) => core.dispatch(op, args, actor) };
}
const isCode = code => error => error.code === code;

test('indexes existing semantic tags and real import relationships; refreshes edits', t => {
  const { root, run } = fixture(t);
  let snap = run('snapshot');
  assert.equal(snap.annotations.filter(a => a.tag === 'CORE').length, 1);
  assert.ok(snap.edges.some(e => e.from === 'src/main.js' && e.to === 'src/trainer.js'));
  assert.equal(run('snapshot').revision, snap.revision, 'unchanged reads do not add events');
  fs.appendFileSync(path.join(root, 'src/trainer.js'), '// REVIEW: Validate optimizer state\n');
  snap = run('snapshot');
  assert.ok(snap.annotations.some(a => a.tag === 'REVIEW'));
  assert.ok(run('context', { query: 'optimizer' }).annotations.some(a => a.tag === 'INTENT'), 'global/related intent remains visible');
});

test('string literals and Python docstrings are not source annotations', t => {
  const { root, run } = fixture(t);
  fs.writeFileSync(path.join(root, 'src/fake.js'), 'const x = `\n// CORE: fake in template\n`;\n// REUSE: real comment\n');
  fs.writeFileSync(path.join(root, 'src/fake.py'), '"""\n# CORE: fake in docstring\n"""\n# REUSE: real Python comment\n');
  const annotations = run('snapshot').annotations;
  assert.equal(annotations.filter(a => a.summary.includes('fake')).length, 0);
  assert.equal(annotations.filter(a => a.path.startsWith('src/fake')).length, 2);
});

test('human guidance is immediately queryable, optimistic, and protected from agents', t => {
  const { run } = fixture(t);
  const first = run('annotation_upsert', { tag: 'INTENT', summary: 'Keep all optimizer states' }, human).annotation;
  assert.ok(run('context', { query: 'optimizer' }).annotations.some(a => a.id === first.id));
  assert.throws(() => run('annotation_upsert', { id: first.id, tag: 'INTENT', summary: 'overwrite', expectedRevision: 0 }, human), isCode('CONFLICT'));
  assert.throws(() => run('annotation_upsert', { id: first.id, tag: 'INTENT', summary: 'overwrite', expectedRevision: first.revision }), isCode('FORBIDDEN'));
  const updated = run('annotation_upsert', { id: first.id, tag: 'INTENT', summary: 'Keep optimizer and RNG', expectedRevision: first.revision }, human).annotation;
  assert.equal(updated.revision, first.revision + 1);
  assert.equal(run('annotation_upsert', { tag: 'REUSE', summary: 'Agent suggestion' }).annotation.status, 'proposed');
});

test('source annotation edit preserves directives and refuses stale or nonhuman writes', t => {
  const { root, run } = fixture(t);
  const item = run('snapshot').annotations.find(a => a.tag === 'CORE');
  assert.throws(() => run('edit_source_annotation', { id: item.id, summary: 'New', expectedHash: item.fileHash }), isCode('FORBIDDEN'));
  run('edit_source_annotation', { id: item.id, summary: 'Approved training loop', expectedHash: item.fileHash }, human);
  const text = fs.readFileSync(path.join(root, item.path), 'utf8');
  assert.match(text, /CORE: Approved training loop \[tv:id=core.trainer\]/);
  assert.throws(() => run('edit_source_annotation', { id: item.id, summary: 'Stale', expectedHash: item.fileHash }, human), isCode('STALE'));
});

test('source access denies traversal, secrets, symlinks and ignored files', t => {
  const { root, run } = fixture(t, true);
  fs.writeFileSync(path.join(root, '.env'), 'API_KEY=secret');
  fs.mkdirSync(path.join(root, 'ignored')); fs.writeFileSync(path.join(root, 'ignored/secret.js'), '// CORE: private');
  fs.symlinkSync(os.tmpdir(), path.join(root, 'src/outside'));
  for (const p of ['../etc/passwd', '/etc/passwd', '.env', '.git/config', 'ignored/secret.js', 'src/outside/anything.js']) {
    assert.throws(() => run('source', { path: p }), e => ['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'].includes(e.code), p);
  }
  assert.ok(!run('snapshot').files.some(f => f.path.includes('ignored') || f.path === '.env'));
});

test('scan limits are explicit and deterministic', t => {
  const { root } = fixture(t);
  const limited = createWorkspace(root, { maxFiles: 1 });
  t.after(() => limited.close());
  const s = limited.dispatch('snapshot');
  assert.equal(s.limits.truncated, true);
  assert.equal(s.limits.scannedFiles, 1);
});

test('two workspace clients share fenced task leases and reject overlapping scopes', t => {
  const { root, run } = fixture(t);
  const second = createWorkspace(root); t.after(() => second.close());
  const one = run('task_create', { title: 'Trainer', paths: ['src/trainer.js'] }).task;
  const two = run('task_create', { title: 'Whole module', paths: ['src'] }).task;
  const claim = run('task_claim', { taskId: one.id, agentId: 'worker-a', ttlSeconds: 60 }).claim;
  assert.throws(() => second.dispatch('task_claim', { taskId: one.id, agentId: 'worker-b' }), isCode('CONFLICT'));
  assert.throws(() => second.dispatch('task_claim', { taskId: two.id, agentId: 'worker-b' }), isCode('CONFLICT'));
  assert.throws(() => run('task_heartbeat', { taskId: one.id, agentId: 'worker-a', token: 'wrong' }), isCode('CONFLICT'));
  run('task_release', { taskId: one.id, agentId: 'worker-a', token: claim.token });
  const next = second.dispatch('task_claim', { taskId: one.id, agentId: 'worker-b' }).claim;
  assert.notEqual(next.token, claim.token);
  assert.throws(() => run('task_release', { taskId: one.id, agentId: 'worker-a', token: claim.token }), isCode('CONFLICT'));
});

test('dependencies block claims; missing dependencies are rejected', t => {
  const { run } = fixture(t);
  assert.throws(() => run('task_create', { title: 'Invalid', paths: ['src/main.js'], dependsOn: ['missing'] }), isCode('NOT_FOUND'));
  const a = run('task_create', { title: 'First', paths: ['src/trainer.js'] }).task;
  const b = run('task_create', { title: 'Second', paths: ['src/main.js'], dependsOn: [a.id] }).task;
  assert.throws(() => run('task_claim', { taskId: b.id, agentId: 'b' }), isCode('CONFLICT'));
});

test('review requires human and current content; stale acceptance never succeeds', t => {
  const { root, run } = fixture(t);
  const task = run('task_create', { title: 'Review training', paths: ['src/trainer.js'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'a' }).claim;
  const review = run('review_submit', { taskId: task.id, agentId: 'a', token: claim.token, summary: 'Ready', evidence: ['unit tests reported passing'] }).review;
  assert.throws(() => run('review_resolve', { reviewId: review.id, decision: 'accepted' }), isCode('FORBIDDEN'));
  fs.appendFileSync(path.join(root, 'src/trainer.js'), '// Changed after review\n');
  assert.throws(() => run('review_resolve', { reviewId: review.id, decision: 'accepted' }, human), isCode('STALE'));
  assert.equal(run('review_resolve', { reviewId: review.id, decision: 'changes-requested', note: 'Recheck current code' }, human).task.status, 'todo');
});

test('human can accept an unchanged review and events are paginated', t => {
  const { run } = fixture(t);
  const task = run('task_create', { title: 'Review training', paths: ['src/trainer.js'] }).task;
  const claim = run('task_claim', { taskId: task.id, agentId: 'a' }).claim;
  const review = run('review_submit', { taskId: task.id, agentId: 'a', token: claim.token, summary: 'Ready' }).review;
  assert.equal(run('review_resolve', { reviewId: review.id, decision: 'accepted' }, human).task.status, 'done');
  const p = run('updates', { after: 0, limit: 2 });
  assert.equal(p.events.length, 2); assert.equal(p.hasMore, true);
  const next = run('updates', { after: p.cursor, limit: 2 });
  assert.ok(next.events[0].sequence > p.cursor);
});

test('Git worktrees share coordination but review acceptance is workspace-bound', t => {
  const { root, run } = fixture(t, true);
  const other = root + '-worktree';
  execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'test-other', other]);
  const peer = createWorkspace(other);
  t.after(() => { peer.close(); fs.rmSync(other, { recursive: true, force: true }); });
  const task = run('task_create', { title: 'Shared', paths: ['src/trainer.js'] }).task;
  assert.ok(peer.dispatch('snapshot').tasks.some(x => x.id === task.id));
  const claim = run('task_claim', { taskId: task.id, agentId: 'a' }).claim;
  assert.throws(() => peer.dispatch('task_claim', { taskId: task.id, agentId: 'b' }), isCode('CONFLICT'));
  const review = run('review_submit', { taskId: task.id, agentId: 'a', token: claim.token, summary: 'Ready' }).review;
  assert.throws(() => peer.dispatch('review_resolve', { reviewId: review.id, decision: 'accepted' }, human), isCode('STALE'));
});
