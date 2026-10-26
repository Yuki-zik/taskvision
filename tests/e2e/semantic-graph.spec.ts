import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// User-facing acceptance: a real source index -> real graph -> relation evidence -> original code.
const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root = '';
let server: Awaited<ReturnType<typeof startServer>>;
test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-relations-user-'));
  const files: Record<string, string> = {
    'apps/web/src/App.ts': `// CORE: Web entry. [tv:id=core.web]\nimport { run } from '../../../packages/core/src/service.js';\nimport type { CoreOptions } from '../../../packages/shared/src/types.js';\nexport { run as sharedRun } from '../../../packages/core/src/service.js';\nexport async function load() { return import('../../../packages/core/src/service.js'); }\nconst legacy = require('../../../packages/core/src/service.js');\nexport const result = run(1);\n`,
    'packages/core/src/service.ts': `// REUSE: Use this service for the web API. [tv:id=reuse.service]\nimport type { CoreOptions } from '../../../packages/shared/src/types.js';\nexport function run(value: number): number { return value + 1; }\n`,
    'packages/shared/src/types.ts': 'export interface CoreOptions { value: number; }\n',
    '.gitignore': '.taskvision/\nnode_modules/\n',
  };
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'source relation fixture']);
  server = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('real architecture links explain type/runtime/reexport/dynamic evidence and remain readable after drag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  // The initial automatic fit must make all modules visible without a manual zoom.
  await page.waitForTimeout(400);
  const rects = await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, bottom: rect.bottom, width: rect.width };
  }));
  const bounds = await page.locator('.react-flow').boundingBox();
  expect(bounds).not.toBeNull();
  for (const rect of rects) {
    expect(rect.y).toBeGreaterThanOrEqual(bounds!.y - 4);
    expect(rect.bottom).toBeLessThanOrEqual(bounds!.y + bounds!.height + 4);
    expect(rect.width).toBeGreaterThan(160);
  }
  // Summary view: exactly one directed link between web importer and service provider.
  const runtimeLabel = page.getByRole('group', { name: '关系类型' });
  await expect(runtimeLabel).toContainText('运行时');
  await expect(runtimeLabel).toContainText('类型');
  await expect(runtimeLabel).toContainText('再导出');
  await expect(runtimeLabel).toContainText('动态');
  const webToCore = page.locator('.react-flow__edge[data-id*="module:apps/web→module:packages/core"]');
  await expect(webToCore).toHaveCount(1);
  await webToCore.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toBeVisible();
  const evidence = await page.locator('.relation-details').innerText();
  expect(evidence).toContain('apps/web');
  expect(evidence).toContain('packages/core');
  expect(evidence).toContain('App.ts:2');
  expect(evidence).toContain('service.js');
  await page.locator('.relation-details .evidence-source').first().click();
  await expect(page.locator('.source-code')).toContainText("import { run }");
  // Switching to individual kinds reveals exactly verified category paths, without fake calls.
  await page.getByRole('button', { name: '分类', exact: true }).click();
  await expect(page.locator('.react-flow__edge[data-id^="dependency:type:"]')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge[data-id^="dependency:dynamic:"]')).toHaveCount(1);
  const typeToggle = runtimeLabel.getByRole('button', { name: /类型/ });
  await typeToggle.click();
  await expect(typeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.react-flow__edge[data-id^="dependency:type:"]')).toHaveCount(0);
  // User dragging a module must invalidate obsolete geometry and retain the changed location.
  const node = page.locator('[data-id="module:apps/web"]');
  const trackedEdge = page.locator('.react-flow__edge[data-id^="dependency:runtime:module:apps/web→module:packages/core"] path.react-flow__edge-path').first();
  const beforePath = await trackedEdge.getAttribute('d');
  const initial = await node.boundingBox();
  if (initial) {
    await page.mouse.move(initial.x + 35, initial.y + 15);
    await page.mouse.down();
    await page.mouse.move(initial.x + 55, initial.y + 42, { steps: 8 });
    await page.waitForTimeout(80);
    const livePath = await trackedEdge.getAttribute('d');
    expect(livePath).not.toBe(beforePath); // During a drag no stale Smart Edge path survives.
    await page.mouse.up();
    await page.waitForTimeout(500);
    const moved = await node.boundingBox();
    expect(moved!.x + moved!.y).not.toBe(initial.x + initial.y);
  }
  await page.waitForTimeout(2300); // Real workspace polling must not reset selected zoom/pan.
  expect(errors).toEqual([]);
});
