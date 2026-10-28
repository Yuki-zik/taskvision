import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer, type ViteDevServer } from 'vite';
import type { Snapshot } from '../../packages/shared/src/types';

const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root: string;
let base: string;
let backend: Awaited<ReturnType<typeof startServer>>;
let frontend: ViteDevServer;
let url: string;
const sources: Record<string, string> = {
  'apps/web/src/index.ts':
    '// CORE: User entry consumes the shared engine.\nimport {run} from "../../../packages/core/src/engine.js";\nexport const app=run();\n',
  'apps/api/src/index.ts':
    '// INTENT: API boundary stays compatible.\nimport {run} from "../../../packages/core/src/engine.js";\nexport const serve=run;\n',
  'packages/core/src/engine.ts':
    '// CORE: One shared engine with a readable full explanation of the real module.\n// REUSE: Extend this engine.\n// INTENT: Preserve the interface.\n// REVIEW: Verify empty input.\n// TODO: Document options.\nimport type {Options} from "../../shared/src/types.js";\nexport const run=(options?: Options)=>options?.value??1;\n',
  'packages/core/src/helper.ts': '// REUSE: Existing pure helper.\nexport const helper=1;\n',
  'packages/shared/src/types.ts':
    '// CORE: Shared protocol.\nexport interface Options {value: number}\n',
  '.gitignore': '.taskvision/\nnode_modules/\n',
};

test.beforeEach(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-click-detail-'));
  root = path.join(base, 'fixture');
  for (const [relative, content] of Object.entries(sources)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  backend = await startServer({
    root,
    port: 0,
    preferencesDir: path.join(base, 'private-preferences'),
    publicRoot: path.resolve('workspace/public'),
  });
  // Serve current owned source, without overwriting generated workspace/public assets.
  frontend = await createServer({
    configFile: path.resolve('apps/web/vite.config.ts'),
    cacheDir: path.join(base, 'vite-cache'),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: backend.url,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (request) => {
              if (request.getHeader('origin'))
                request.setHeader('Origin', new URL(backend.url).origin);
            });
          },
        },
      },
    },
  });
  await frontend.listen();
  url = frontend.resolvedUrls!.local[0]!;
});
test.afterEach(async () => {
  await frontend?.close();
  await backend?.close();
  fs.rmSync(base, { recursive: true, force: true });
});
const popup = (page: Page) => page.locator('.node-detail-popover');
const core = (page: Page) => page.locator('.react-flow__node[data-id="module:packages/core"]');
async function ready(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(url);
  await expect(page.locator('.graph-node')).toHaveCount(4);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '适合画布，保留文字可读', exact: true }).click();
  await page.waitForTimeout(400);
}
async function clickNode(node: Locator) {
  // Node surface, not its source-summary or drill buttons.
  await node.locator('.node-icon').click();
}
async function insideViewport(page: Page) {
  await expect(popup(page)).toBeVisible();
  const box = await popup(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(10);
  expect(box!.y).toBeGreaterThanOrEqual(10);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 10);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 10);
}

test('one click reveals real facts, bounded annotations and provenance without opening an inspector or changing geometry', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const before = await page.locator('.react-flow').boundingBox();
  const positions = await page
    .locator('.react-flow__node')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform));
  await clickNode(core(page));
  await insideViewport(page);
  await expect(popup(page)).toHaveAttribute('data-node-id', 'module:packages/core');
  await expect(popup(page)).toHaveAttribute('data-theme', 'dark');
  await expect(popup(page)).toContainText('One shared engine');
  await expect(popup(page).locator('.ndp-title')).toContainText('packages/core');
  const indexed = (
    await (await page.request.get(new URL('/api/bootstrap', backend.url).href)).json()
  ).snapshot as Snapshot;
  const indexedCore = indexed.files.filter((file) => file.path.startsWith('packages/core/'));
  const metrics = popup(page).locator('.ndp-metrics dd');
  await expect(metrics.nth(0)).toHaveText(String(indexedCore.length));
  await expect(metrics.nth(1)).toHaveText(
    indexedCore.reduce((sum, file) => sum + file.lines, 0).toLocaleString(),
  );
  await expect(metrics.nth(2)).toHaveText('22 处引用');
  await expect(metrics.nth(3)).toHaveText('11 处引用');
  for (const tag of ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO']) {
    await expect(popup(page).locator(`.ndp-tags [data-tag="${tag}"]`)).toHaveCount(1);
  }
  await expect(popup(page).locator('.ndp-annotations li')).toHaveCount(5);
  await expect(popup(page)).toContainText('另有 1 条标注');
  await expect(popup(page)).toContainText('packages/core/src/engine.ts:1');
  await expect(popup(page)).toContainText('源码注释');
  await expect(popup(page).locator('.ndp-statuses')).toHaveText('未认领');
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  expect(await page.locator('.react-flow').boundingBox()).toEqual(before);
  expect(
    await page
      .locator('.react-flow__node')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.transform)),
  ).toEqual(positions);
  await expect(page.locator('.tv-node-detail, .tv-node-actions')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('click-detail-dark.png') });
  await popup(page).getByRole('button', { name: '关闭节点详情' }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(core(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await popup(page).getByRole('button', { name: '完整检查器', exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator('.detail-slot')).toBeVisible();
  expect(errors).toEqual([]);
});

test('another node updates the sole popup; Escape, blank canvas and edges dismiss it and keep relation evidence', async ({
  page,
}) => {
  await ready(page);
  await clickNode(core(page));
  await expect(popup(page)).toBeVisible();
  // Keyboard is also a real node activation and transfers focus into the popup.
  const web = page.locator('.react-flow__node[data-id="module:apps/web"]');
  await web.focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toHaveCount(1);
  await expect(popup(page)).toHaveAttribute('data-node-id', 'module:apps/web');
  await expect(popup(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(popup(page).getByRole('button', { name: '关闭节点详情' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
  await expect(web).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  const pane = page.locator('.react-flow__pane');
  await pane.click({ position: { x: 8, y: 8 } });
  await expect(popup(page)).toHaveCount(0);
  // Outside pointer activity follows its own focus target. Escape/explicit
  // close restore node focus; a blank canvas click should never steal focus.
  await web.focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toBeVisible();
  const edge = page.locator('.react-flow__edge').first();
  await edge.focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator('.relation-details')).toBeVisible();
});

test('repeated double clicks drill without a transient popup, single click then expansion and file source work', async ({
  page,
}) => {
  await ready(page);
  for (const delay of [70, 170, 210]) {
    await core(page).locator('.node-icon').dblclick({ delay });
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('.graph-breadcrumb')).toContainText('core');
    await expect(
      page.locator('.react-flow__node[data-id="module:packages/core/src"]'),
    ).toBeVisible();
    await page.locator('.breadcrumb-trail > button').last().click();
    await expect(core(page)).toBeVisible();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: '切换项目上下文', exact: true }).click();
  await clickNode(core(page));
  await expect(popup(page)).toBeVisible();
  await popup(page).getByRole('button', { name: '展开文件', exact: true }).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByRole('button', { name: '收起文件', exact: true })).toBeVisible();
  const file = page.locator('.react-flow__node[data-id="file:packages/core/src/engine.ts"]');
  await file.focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toHaveAttribute('data-node-id', 'file:packages/core/src/engine.ts');
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await popup(page).getByRole('button', { name: '打开源码', exact: true }).click();
  await expect(page.locator('.source-code')).toContainText('export const run');
});

test('far zoom retains screen-sized type; a 390px light viewport keeps the card and actions in bounds', async ({
  page,
}) => {
  await ready(page);
  for (let step = 0; step < 4; step++) await page.locator('.react-flow__controls-zoomout').click();
  await core(page).focus();
  await page.keyboard.press('Enter');
  await insideViewport(page);
  // A compact neon card is intentionally 13px, but remains a real
  // screen-sized control even after the graph has been zoomed far out.
  expect(
    await popup(page)
      .locator('.ndp-summary')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(13);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  // Use the application's persisted preference API, never page script injection.
  const bootstrap = await page.request.get(new URL('/api/bootstrap', backend.url).href);
  const data = await bootstrap.json();
  const preferenceResponse = await page.request.post(
    new URL('/api/preferences', backend.url).href,
    {
      headers: { 'X-TaskVision-Token': data.token },
      data: { preferences: { theme: 'light' } },
    },
  );
  expect(preferenceResponse.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '适合画布，保留文字可读', exact: true }).click();
  await page.waitForTimeout(350);
  await core(page).focus();
  await page.keyboard.press('Enter');
  await insideViewport(page);
  await expect(popup(page)).toHaveAttribute('data-theme', 'light');
  await expect(popup(page).getByRole('button', { name: '完整检查器', exact: true })).toBeVisible();
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('click-detail-mobile-light.png') });
});

test('project switching dismisses source details and opens only the new project facts', async ({
  page,
}) => {
  await ready(page);
  await clickNode(core(page));
  await expect(popup(page)).toContainText('One shared engine');
  const other = path.join(base, 'other-project');
  fs.mkdirSync(path.join(other, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(other, 'src', 'new.ts'),
    '// CORE: A different project source.\nexport const fresh=2;\n',
  );
  // Registration requires an explicitly approved real project directory.
  // A random unversioned temp folder is correctly rejected by the server.
  fs.writeFileSync(path.join(other, 'package.json'), '{"name":"other-fixture","private":true}');
  execFileSync('git', ['init', '-q', other]);
  execFileSync('git', ['-C', other, 'add', '.']);
  execFileSync('git', [
    '-C',
    other,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'source switch',
  ]);
  await page.getByRole('button', { name: '切换观察项目' }).click();
  await page.getByRole('button', { name: /添加本地工程路径/ }).click();
  await page.getByLabel('工程文件夹的绝对路径').fill(other);
  await page.getByRole('button', { name: '确认添加并打开' }).click();
  await expect(page.getByRole('button', { name: '切换观察项目' })).toContainText('other-project');
  await expect(popup(page)).toHaveCount(0);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const next = page.locator('.react-flow__node[data-id="module:src"]');
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(popup(page)).toContainText('A different project source');
  await expect(popup(page)).not.toContainText('One shared engine');
  await expect(page.locator('.detail-slot')).toHaveCount(0);
});

test('GitHub heritage neon is the new-project default, with per-tag glass, localized glow and a reversible light choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const node = core(page);
  await clickNode(node);
  const card = popup(page);
  await insideViewport(page);
  await expect(card).toHaveAttribute('data-theme', 'dark');
  const appearance = await card.evaluate((element) => {
    const theme = getComputedStyle(element);
    const core = element.querySelector<HTMLElement>('.ndp-tag[data-tag="CORE"]');
    const row = element.querySelector<HTMLElement>('.ndp-annotations li[data-tag="CORE"]');
    if (!core || !row) throw new Error('Expected real CORE source annotation');
    const badge = getComputedStyle(core);
    const glass = getComputedStyle(row);
    return {
      panelBackground: theme.backgroundImage,
      panelBlur: theme.backdropFilter,
      coreColor: badge.color,
      coreGlow: badge.textShadow,
      glassBackground: glass.backgroundImage,
      glassOutline: glass.borderLeftWidth,
    };
  });
  expect(appearance.panelBackground).toContain('gradient(');
  expect(appearance.panelBlur).not.toBe('none');
  expect(appearance.coreColor).toBe('rgb(96, 165, 250)');
  expect(appearance.coreGlow).not.toBe('none');
  expect(appearance.glassBackground).toContain('gradient(');
  expect(parseFloat(appearance.glassOutline)).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  // Choosing theme in the toolbar intentionally dismisses a non-modal node
  // card. Reopen it in-place and verify the saved light appearance.
  await clickNode(node);
  await expect(card).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(card.getByRole('button', { name: '完整检查器' })).toBeVisible();
  await card.getByRole('button', { name: '关闭节点详情' }).click();
  await expect(card).toHaveCount(0);
});
