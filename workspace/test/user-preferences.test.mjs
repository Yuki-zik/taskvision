import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { startServer } = await import(
  process.env.TASKVISION_SERVER_MODULE || new URL('../server.mjs', import.meta.url).href
);

async function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-preferences-'));
  const roots = ['alpha', 'beta'].map((name) => {
    const root = path.join(base, name);
    fs.mkdirSync(root);
    execFileSync('git', ['init', '-q', root]);
    fs.writeFileSync(path.join(root, 'main.js'), `// INTENT: ${name}\n`);
    return root;
  });
  const preferencesDir = path.join(base, 'user-state');
  let app;
  t.after(async () => {
    await app?.close();
    fs.rmSync(base, { recursive: true, force: true });
  });
  app = await startServer({ root: roots[0], port: 0, preferencesDir });
  const headers = { 'content-type': 'application/json', 'x-taskvision-token': app.token };
  const post = (endpoint, data, extra = {}) =>
    fetch(app.url + endpoint, {
      method: 'POST',
      headers: { ...headers, ...extra },
      body: JSON.stringify(data),
    });
  const { project } = await (await post('api/projects/register', { root: roots[1] })).json();
  return { base, roots, preferencesDir, app, post, headers, secondId: project.id };
}

test('per-project personal preferences restore across server/port changes, patch independently, and reset', async (t) => {
  const { roots, preferencesDir, app, post, secondId } = await fixture(t);
  const defaults = await (
    await fetch(app.url + 'api/preferences')
  )
    .json()
    .then((body) => body.preferences);
  assert.equal(defaults.theme, 'system');
  const changed = {
    theme: 'light',
    sidebarWidth: 280,
    detailWidth: 560,
    detailHeight: 440,
    detailDock: 'bottom',
    sidebarCollapsed: true,
    graphViews: {
      overview: {
        positions: { 'file:main.js': { x: -120, y: 360 } },
        viewport: { x: 10, y: -20, zoom: 0.85 },
      },
    },
  };
  assert.deepEqual(await (await post('api/preferences', { preferences: changed })).json(), {
    preferences: changed,
  });
  assert.deepEqual(await (await fetch(app.url + 'api/preferences?project=' + secondId)).json(), {
    preferences: defaults,
  });
  await post('api/preferences?project=' + secondId, { theme: 'dark', detailDock: 'left' });
  await post('api/preferences', { detailDock: 'right' });
  await app.close();
  const restarted = await startServer({ root: roots[0], port: 0, preferencesDir });
  t.after(() => restarted.close());
  assert.deepEqual(await (await fetch(restarted.url + 'api/preferences')).json(), {
    preferences: { ...changed, detailDock: 'right' },
  });
  const other = await (
    await fetch(restarted.url + 'api/preferences?project=' + secondId)
  )
    .json()
    .then((body) => body.preferences);
  assert.equal(other.theme, 'dark');
  assert.equal(other.detailDock, 'left');
  const reset = await fetch(restarted.url + 'api/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-taskvision-token': restarted.token },
    body: '{"reset":true}',
  });
  assert.deepEqual(await reset.json(), { preferences: defaults });
  for (const root of roots)
    assert.deepEqual(
      execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], {
        encoding: 'utf8',
      }).trim(),
      'main.js',
    );
  assert.equal(fs.statSync(preferencesDir).mode & 0o777, 0o700);
  for (const entry of fs.readdirSync(preferencesDir)) {
    assert.equal(fs.statSync(path.join(preferencesDir, entry)).mode & 0o777, 0o600);
    assert.ok(!entry.endsWith('.tmp'));
  }
});

test('preferences reject invalid fields, numeric limits, oversized graphs and CSRF without overwriting valid state', async (t) => {
  const { app, post, headers } = await fixture(t);
  await post('api/preferences', { theme: 'dark' });
  const invalid = [
    null,
    [],
    { theme: 'auto' },
    { sidebarWidth: 159 },
    { sidebarWidth: 341 },
    { detailWidth: 289 },
    { detailWidth: 741 },
    { detailHeight: 219 },
    { detailHeight: 2001 },
    { sidebarCollapsed: 1 },
    { detailDock: 'top' },
    { unknown: true },
    { reset: true, theme: 'light' },
    {
      graphViews: {
        overview: { positions: { n: { x: '1', y: 1 } }, viewport: { x: 0, y: 0, zoom: 1 } },
      },
    },
    { graphViews: { overview: { positions: {}, viewport: { x: 0, y: 0, zoom: 0 } } } },
    JSON.parse('{"__proto__":{"theme":"light"}}'),
    {
      graphViews: {
        overview: {
          positions: Object.fromEntries(
            Array.from({ length: 2001 }, (_, i) => ['n' + i, { x: 0, y: 0 }]),
          ),
        },
      },
    },
    {
      graphViews: Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => ['v' + i, { positions: {} }]),
      ),
    },
    { graphViews: { overview: { positions: { n: { x: 1_000_001, y: 0 } } } } },
  ];
  for (const value of invalid)
    assert.equal((await post('api/preferences', value)).status, 400, JSON.stringify(value));
  assert.equal(
    (await post('api/preferences', { theme: 'light' }, { 'x-taskvision-token': '' })).status,
    403,
  );
  assert.equal(
    (await post('api/preferences', { theme: 'light' }, { origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal(
    (await post('api/preferences', { theme: 'light' }, { 'content-type': 'text/plain' })).status,
    415,
  );
  assert.equal(
    (
      await fetch(app.url + 'api/preferences', {
        method: 'POST',
        headers,
        body: 'x'.repeat(270000),
      })
    ).status,
    413,
  );
  const response = await fetch(app.url + 'api/preferences', {
    method: 'POST',
    headers,
    body: '{"sidebarWidth":1e999}',
  });
  assert.equal(response.status, 400);
  const saved = await (
    await fetch(app.url + 'api/preferences')
  )
    .json()
    .then((body) => body.preferences);
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.sidebarWidth, 184);
});

test('private state rejects symlink files and directory aliases instead of exposing or overwriting targets', async (t) => {
  const { base, preferencesDir, app, post } = await fixture(t);
  const before = new Set(fs.readdirSync(preferencesDir));
  await post('api/preferences', { theme: 'light' });
  const preferenceFile = fs.readdirSync(preferencesDir).find((name) => !before.has(name));
  assert.ok(preferenceFile);
  const target = path.join(base, 'private-target');
  fs.writeFileSync(target, '{"theme":"dark"}', { mode: 0o600 });
  fs.unlinkSync(path.join(preferencesDir, preferenceFile));
  fs.symlinkSync(target, path.join(preferencesDir, preferenceFile));
  assert.equal((await fetch(app.url + 'api/preferences')).status, 403);
  assert.equal((await post('api/preferences', { theme: 'system' })).status, 403);
  assert.equal(fs.readFileSync(target, 'utf8'), '{"theme":"dark"}');
  await app.close();
  const alias = path.join(base, 'alias');
  fs.symlinkSync(preferencesDir, alias, 'dir');
  await assert.rejects(
    startServer({ root: path.join(base, 'alpha'), port: 0, preferencesDir: alias }),
  );
});
