import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root = '';
let app: Awaited<ReturnType<typeof startServer>>;
test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-impact-'));
  const files: Record<string, string> = {
    'packages/core/src/base.ts':
      '// CORE: Shared dependency. [tv:id=core.base]\nexport const base = () => 1;\n',
    'apps/api/src/service.ts':
      "// REUSE: API extension.\nimport { base } from '../../../packages/core/src/base.js';\nexport const service = () => base();\n",
    'apps/web/src/client.ts':
      "import { service } from '../../api/src/service.js';\nexport const client = () => service();\n",
    'apps/admin/src/dashboard.ts':
      "import { base } from '../../../packages/core/src/base.js';\nexport const dashboard = () => base();\n",
    'apps/unused/src/independent.ts': 'export const unrelated = true;\n',
    '.gitignore': '.taskvision/\nnode_modules/\n',
  };
  for (const [relative, source] of Object.entries(files)) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@localhost',
    'commit',
    '-qm',
    'chain',
  ]);
  app = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('actual reverse-impact exploration distinguishes direct and transitive consumers without relayout', async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.goto(app.url);
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  const core = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await core.click();
  const lens = page.getByRole('region', { name: '依赖与影响分析' });
  await expect(lens).toBeVisible();
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await lens.getByRole('button', { name: '潜在影响', exact: true }).click();
  await expect(lens).toContainText('2 个直接');
  await expect(lens).toContainText('1 个间接');
  await expect(page.locator('.react-flow__node[data-id="module:apps/api"]')).toHaveClass(/impact-direct/);
  await expect(page.locator('.react-flow__node[data-id="module:apps/admin"]')).toHaveClass(/impact-direct/);
  await expect(page.locator('.react-flow__node[data-id="module:apps/web"]')).toHaveClass(/impact-indirect/);
  await expect(page.locator('.react-flow__node[data-id="module:apps/unused"]')).toHaveClass(/impact-muted/);
  await expect(viewport).toHaveAttribute('style', before!);
  // Expanding the target replaces module connectors with file connectors.
  // The reverse-impact traversal must keep using those displayed source files.
  await core.getByRole('button', { name: '展开 packages/core' }).click();
  await expect(lens).toContainText('2 个直接');
  await expect(lens).toContainText('1 个间接');
  await expect(page.locator('.react-flow__node[data-id="file:packages/core/src/base.ts"]')).toHaveClass(
    /impact-focus/,
  );
  await core.getByRole('button', { name: '收起 packages/core' }).click();
  await expect(lens).toContainText('2 个直接');
  await lens.getByRole('button', { name: '依赖它', exact: true }).click();
  await expect(lens).toContainText('2 个直接');
  await expect(lens).toContainText('0 个间接');
  await expect(page.locator('.react-flow__node[data-id="module:apps/web"]')).toHaveClass(/impact-muted/);
  await lens.getByRole('button', { name: '它依赖', exact: true }).click();
  await expect(lens).toContainText('0 个直接');
  await lens.getByRole('button', { name: '全图', exact: true }).click();
  await expect(page.locator('.react-flow__node.impact-muted')).toHaveCount(0);
  // Keyboard selection (Enter) must choose an analysis center just like a click.
  // Start from an *actual selected file*, not just a module: the parent inspector
  // must not restore stale file selection after keyboard activation.
  await core.getByRole('button', { name: '展开 packages/core' }).click();
  await page.locator('.react-flow__node[data-id="file:packages/core/src/base.ts"]').click();
  await expect(page.getByRole('heading', { name: '文件详情' })).toBeVisible();
  await page.locator('.react-flow__node[data-id="module:apps/web"]').focus();
  await page.keyboard.press('Enter');
  await expect(lens).toContainText('apps/web');
  await page.waitForTimeout(2250);
  await expect(lens).toContainText('apps/web');
  await core.click();
  await expect(lens).toContainText('packages/core');
  // Expanded modules expose file-level endpoints. Collapse explicitly before
  // checking the module-to-module edge; never expect both endpoint shapes at once.
  await core.getByRole('button', { name: '收起 packages/core' }).click();
  // The original dependency arrow remains importer -> provider after traversing impact in reverse.
  const edge = page.locator('.react-flow__edge[data-id*="module:apps/api→module:packages/core"]');
  await expect(edge).toHaveCount(1);
  await edge.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toContainText('apps/api');
  await expect(page.locator('.relation-details')).toContainText('packages/core');
  await page.waitForTimeout(2500); // One real polling interval cannot reset the zoom.
  await page.setViewportSize({ width: 390, height: 844 });
  // At mobile width, a selected source is shown in a dedicated detail drawer.
  // Close the detail drawer before interacting with the underlying architecture.
  const closeDetail = page.getByRole('button', { name: '关闭面板' });
  if (await closeDetail.isVisible()) await closeDetail.click();
  await expect(lens.getByRole('button', { name: '潜在影响', exact: true })).toBeVisible();
  await lens.getByRole('button', { name: '潜在影响', exact: true }).click();
  await expect(lens).toContainText('1 个间接');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(exceptions).toEqual([]);
});
