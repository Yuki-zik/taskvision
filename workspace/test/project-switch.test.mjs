import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
const { startServer } = await import(
  process.env.TASKVISION_SERVER_MODULE || new URL('../server.mjs', import.meta.url).href
);

function repository(base, name) {
  const root = path.join(base, name);
  fs.mkdirSync(root);
  fs.writeFileSync(
    path.join(root, 'main.js'),
    `// CORE: ${name} entry\nexport const value = '${name}';\n`,
  );
  fs.writeFileSync(path.join(root, '.gitignore'), 'secret.js\n');
  fs.writeFileSync(path.join(root, 'secret.js'), 'PRIVATE_SOURCE');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    name,
  ]);
  return fs.realpathSync(root);
}
async function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-projects-'));
  const first = repository(base, 'first');
  const second = repository(base, 'second');
  const preferencesDir = path.join(base, 'personal');
  let app;
  t.after(async () => {
    await app?.close();
    fs.rmSync(base, { recursive: true, force: true });
  });
  app = await startServer({ root: first, port: 0, preferencesDir });
  const post = (endpoint, body, headers = {}) =>
    fetch(app.url + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-taskvision-token': app.token, ...headers },
      body: JSON.stringify(body),
    });
  return { base, first, second, preferencesDir, app, post };
}

test('two real Git projects keep concurrent requests, mutations and read-only sources isolated', async (t) => {
  const { first, second, app, post } = await fixture(t);
  const initial = await (await fetch(app.url + 'api/projects')).json();
  assert.equal(initial.projects.length, 1);
  assert.equal(initial.projects[0].path, first);
  assert.equal(
    initial.initialId,
    crypto.createHash('sha256').update(first).digest('hex').slice(0, 20),
  );
  const registered = await post('api/projects/register', { root: second });
  assert.equal(registered.status, 200);
  const { project } = await registered.json();
  assert.notEqual(project.id, initial.initialId);
  const ids = [initial.initialId, project.id];
  const snapshots = await Promise.all(
    ids.map((id) => fetch(app.url + 'api/bootstrap?project=' + id).then((r) => r.json())),
  );
  for (let i = 0; i < ids.length; i++) {
    assert.equal(snapshots[i].snapshot.project.workspaceId, ids[i]);
    assert.equal(snapshots[i].snapshot.project.root, [first, second][i]);
    assert.equal(snapshots[i].token, app.token);
  }
  assert.notEqual(snapshots[0].snapshot.project.head, snapshots[1].snapshot.project.head);
  await Promise.all(
    ids.map((id, i) =>
      post('api/operation?project=' + id, {
        operation: 'annotation_upsert',
        args: { tag: 'INTENT', summary: `private intent ${i}` },
      }).then((r) => assert.equal(r.status, 200)),
    ),
  );
  for (let i = 0; i < ids.length; i++) {
    const snapshot = await (await fetch(app.url + 'api/snapshot?project=' + ids[i])).json();
    assert.ok(snapshot.annotations.some((a) => a.summary === `private intent ${i}`));
    assert.ok(!snapshot.annotations.some((a) => a.summary === `private intent ${1 - i}`));
    const source = await (
      await fetch(app.url + 'api/source?project=' + ids[i] + '&path=main.js')
    ).json();
    assert.ok(source.text.includes(i ? "'second'" : "'first'"));
    assert.equal(
      (await fetch(app.url + 'api/source?project=' + ids[i] + '&path=secret.js')).status,
      403,
    );
    assert.equal(
      (await fetch(app.url + 'api/source?project=' + ids[i] + '&path=..%2Fmain.js')).status,
      403,
    );
    const exported = await (await fetch(app.url + 'api/export?project=' + ids[i])).json();
    assert.equal(exported.project.workspaceId, ids[i]);
    const updates = await (await fetch(app.url + 'api/updates?project=' + ids[i])).json();
    assert.ok(!JSON.stringify(updates).includes(`private intent ${1 - i}`));
  }
  const sourceAnnotation = snapshots[0].snapshot.annotations.find((a) => a.tag === 'CORE');
  assert.equal(
    (
      await post('api/operation?project=' + ids[0], {
        operation: 'edit_source_annotation',
        args: {
          id: sourceAnnotation.id,
          expectedHash: sourceAnnotation.fileHash,
          summary: 'First project changed safely',
        },
      })
    ).status,
    200,
  );
  assert.ok(
    fs.readFileSync(path.join(first, 'main.js'), 'utf8').includes('First project changed safely'),
  );
  assert.ok(
    !fs.readFileSync(path.join(second, 'main.js'), 'utf8').includes('First project changed safely'),
  );
  const { createWorkspace } = await import(
    process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href
  );
  const reviewing = createWorkspace(second);
  let reviewId;
  try {
    const task = reviewing.dispatch('task_create', {
      title: 'Second project review',
      paths: ['main.js'],
    }).task;
    const claim = reviewing.dispatch('task_claim', { taskId: task.id, agentId: 'fixture' }).claim;
    reviewId = reviewing.dispatch('review_submit', {
      taskId: task.id,
      agentId: 'fixture',
      token: claim.token,
      summary: 'Second only',
      paths: ['main.js'],
    }).review.id;
  } finally {
    reviewing.close();
  }
  assert.equal(
    (await fetch(app.url + 'api/reviews/' + reviewId + '?project=' + ids[0])).status,
    404,
  );
  assert.equal(
    (await fetch(app.url + 'api/reviews/' + reviewId + '?project=' + ids[1])).status,
    200,
  );
  assert.equal((await (await fetch(app.url + 'api/snapshot')).json()).project.root, first);
  assert.match(
    (await fetch(app.url + 'api/bootstrap')).headers.get('content-security-policy'),
    /script-src 'self';/,
  );
});

test('registration requires token and same-origin; rejects traversal, symlink, home, filesystem and non-project roots', async (t) => {
  const { base, first, second, app, post } = await fixture(t);
  assert.equal(
    (await post('api/projects/register', { root: second }, { 'x-taskvision-token': '' })).status,
    403,
  );
  assert.equal(
    (await post('api/projects/register', { root: second }, { origin: 'https://evil.example' }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(app.url + 'api/projects/register?root=' + encodeURIComponent(second))).status,
    404,
  );
  const plain = path.join(base, 'plain');
  fs.mkdirSync(plain);
  const alias = path.join(base, 'alias');
  fs.symlinkSync(second, alias, 'dir');
  for (const root of [
    path.join(second, '..', 'first') + '/..',
    second + '/../first',
    alias,
    alias + '/.',
    alias + '/',
    os.homedir(),
    '/',
    plain,
    'relative',
    path.join(base, 'missing'),
    path.join(first, 'main.js'),
  ]) {
    const response = await post('api/projects/register', { root });
    assert.ok([400, 403].includes(response.status), `${root}: ${response.status}`);
  }
  assert.equal((await (await fetch(app.url + 'api/projects')).json()).projects.length, 1);
  assert.ok(!fs.existsSync(path.join(plain, '.taskvision')));
  const duplicate = await post('api/projects/register', { root: first + '/' });
  assert.equal(duplicate.status, 200);
  assert.equal((await (await fetch(app.url + 'api/projects')).json()).projects.length, 1);
});

test('every scoped API forbids unknown, empty, duplicate and path-like project IDs without registering them', async (t) => {
  const { second, app, post } = await fixture(t);
  for (const query of ['unknown', '', encodeURIComponent(second), 'unknown&project=other']) {
    for (const endpoint of [
      'bootstrap',
      'snapshot',
      'source?path=main.js',
      'updates',
      'export',
      'reviews/missing',
      'preferences',
    ]) {
      const separator = endpoint.includes('?') ? '&' : '?';
      assert.equal(
        (await fetch(app.url + 'api/' + endpoint + separator + 'project=' + query)).status,
        403,
        endpoint,
      );
    }
    assert.equal(
      (
        await post('api/operation?project=' + query, {
          operation: 'annotation_upsert',
          args: { tag: 'INTENT', summary: 'denied' },
        })
      ).status,
      403,
    );
    assert.equal((await post('api/preferences?project=' + query, { theme: 'light' })).status, 403);
  }
  assert.equal((await (await fetch(app.url + 'api/projects')).json()).projects.length, 1);
});

test('approved paths and stable IDs survive restart on another port; offline and replaced roots fail explicitly', async (t) => {
  const { first, second, preferencesDir, app, post } = await fixture(t);
  const { project } = await (await post('api/projects/register', { root: second })).json();
  await app.close();
  const restarted = await startServer({ root: first, port: 0, preferencesDir });
  t.after(() => restarted.close());
  const list = await (await fetch(restarted.url + 'api/projects')).json();
  assert.ok(list.projects.some((p) => p.id === project.id && p.path === second));
  assert.equal(
    (await (await fetch(restarted.url + 'api/snapshot?project=' + project.id)).json()).project.root,
    second,
  );
  fs.renameSync(second, second + '-offline');
  assert.equal((await fetch(restarted.url + 'api/snapshot?project=' + project.id)).status, 409);
  fs.mkdirSync(second);
  assert.equal((await fetch(restarted.url + 'api/snapshot?project=' + project.id)).status, 409);
  fs.rmdirSync(second);
  fs.symlinkSync(first, second, 'dir');
  assert.equal((await fetch(restarted.url + 'api/snapshot?project=' + project.id)).status, 409);
  fs.unlinkSync(second);
  fs.renameSync(second + '-offline', second);
  assert.equal((await fetch(restarted.url + 'api/snapshot?project=' + project.id)).status, 200);
});

test('closing the underlying HTTP server closes every cached project database exactly once', async (t) => {
  const { second, app, post } = await fixture(t);
  const { project } = await (await post('api/projects/register', { root: second })).json();
  assert.equal((await fetch(app.url + 'api/snapshot?project=' + project.id)).status, 200);
  const originalClose = DatabaseSync.prototype.close;
  let closed = 0;
  DatabaseSync.prototype.close = function () {
    closed++;
    return originalClose.call(this);
  };
  try {
    await new Promise((resolve) => app.server.close(resolve));
    assert.equal(closed, 2);
    await app.close();
    await app.close();
    assert.equal(closed, 2);
  } finally {
    DatabaseSync.prototype.close = originalClose;
  }
});
