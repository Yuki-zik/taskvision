import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root: string;
let server: Awaited<ReturnType<typeof startServer>>;
const files: Record<string, string> = {
  'apps/web/src/App.ts': `// CORE: Entry routing and user workspace. [tv:id=core.web-entry]\n// REVIEW: Validate interface behavior after updates.\nimport { run } from '../../../packages/core/src/engine.js';\nexport const app = run();\n`,
  'apps/web/src/Extra.ts': `// REUSE: Source link follows existing routing code.\nexport { app } from './App.js';\n`,
  'apps/cli/src/index.ts': `// CORE: Command line entrypoint uses the shared engine.\nimport { run } from '../../../packages/core/src/engine.js';\nexport const start = () => run();\n`,
  'packages/core/src/engine.ts': `// REUSE: Prefer the existing engine rather than creating a parallel implementation. [tv:id=reuse.engine]\nexport function run(): number { return 1; }\n`,
  'packages/core/src/this-is-a-deliberately-long-implementation-filename.ts': `// INTENT: Keep module exports compatible with existing integrations and never silently rewrite shared command interfaces.\nexport const engineV2 = () => 2;\n`,
  'README.md': '# Node card acceptance fixture\n',
  '.gitignore': '.taskvision/\nnode_modules/\n',
};

test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-design-'));
  for (const [relative, source] of Object.entries(files)) {
    const dest = path.join(root, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, source);
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
    'real source cards',
  ]);
  server = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});

test.afterEach(async () => {
  await server?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('architecture cards show genuine information with accessible source/drill/expand controls and accurate layout geometry', async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.goto(server.url);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.graph-node.module-node')).toHaveCount(3);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const cards = await page.locator('.graph-node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const wrapper = node.closest('.react-flow__node') as HTMLElement;
      const heading = node.querySelector('.node-title strong') as HTMLElement | null;
      const summary = node.querySelector('.node-summary') as HTMLElement | null;
      const footer = node.querySelector('.node-footer') as HTMLElement | null;
      const rect = node.getBoundingClientRect();
      const headerRect = heading?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      return {
        id: wrapper?.dataset.id,
        width: node.clientWidth,
        height: node.clientHeight,
        modelWidth: wrapper?.offsetWidth,
        modelHeight: wrapper?.offsetHeight,
        scrollOverflow: node.scrollHeight > node.clientHeight + 2,
        title: heading?.textContent,
        titleInBounds:
          !!headerRect && headerRect.bottom <= rect.bottom && headerRect.top >= rect.top,
        footerInBounds: !!footerRect && footerRect.bottom <= rect.bottom + 2,
        summaryInBounds: !summary || summary.getBoundingClientRect().bottom <= rect.bottom,
      };
    }),
  );
  expect(cards.length).toBe(3);
  for (const card of cards) {
    expect(card.title?.trim().length).toBeGreaterThan(0);
    expect(card.width).toBeGreaterThanOrEqual(225);
    expect(card.height).toBeGreaterThanOrEqual(148);
    expect(Math.abs(card.width - (card.modelWidth ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs(card.height - (card.modelHeight ?? 0))).toBeLessThanOrEqual(2);
    expect(card.scrollOverflow).toBe(false);
    expect(card.titleInBounds).toBe(true);
    expect(card.summaryInBounds).toBe(true);
    expect(card.footerInBounds).toBe(true);
  }
  const core = page.locator('[data-id="module:packages/core"]');
  await expect(page.locator('[data-id="module:apps/web"]')).toContainText('CORE');
  await expect(core).toContainText('REUSE');
  await expect(core).toContainText('INTENT');
  await core.getByRole('button', { name: '展开 packages/core' }).click();
  await expect(page.locator('.graph-node.file-node')).toHaveCount(2);
  const file = page.locator(
    '[data-id="file:packages/core/src/this-is-a-deliberately-long-implementation-filename.ts"]',
  );
  await expect(file).toBeVisible();
  // An existing source tag must still open the actual code after the visual redesign.
  const sourceLink = page.locator('[data-id="module:apps/web"] .node-summary-link');
  await sourceLink.click();
  await page.getByRole('tab', { name: /^源码/ }).click();
  await expect(page.locator('.source-code')).toContainText('Entry routing and user workspace');
  await expect(page.locator('.source-code')).toContainText('import { run }');
  expect(exceptions).toEqual([]);
});

test('module cards preserve visibility and primary actions at laptop and narrow mobile sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1280 ? 800 : 960 });
    await page.goto(server.url);
    await expect(page.locator('.graph-node.module-node')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '添加指导', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const node = page.locator('[data-id="module:apps/web"]');
    await expect(node.getByRole('button', { name: '进入 apps/web 模块' })).toBeVisible();
    await expect(node.getByRole('button', { name: '展开 apps/web' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('eight-module architecture remains inbounds on laptop after initial and either Fit control', async ({
  page,
}) => {
  // Use an isolated real repository with the same eight module categories and
  // source-anchored import direction as the actual TaskVision overview.
  const more: Record<string, string> = {
    'apps/mcp/src/server.ts':
      "import { run } from '../../../packages/core/src/engine.js';\nexport const serve = run;\n",
    'apps/server/src/server.ts':
      "import { run } from '../../../packages/core/src/engine.js';\nexport const handle = run;\n",
    'packages/shared/src/types.ts': 'export interface EngineOptions { enabled: boolean }\n',
    'src/extension.ts':
      "import type { EngineOptions } from '../packages/shared/src/types.js';\nexport const extension = 1;\n",
    'test/engine.test.ts':
      "import { run } from '../packages/core/src/engine.js';\nexport const testEngine = run;\n",
  };
  for (const [relative, source] of Object.entries(more)) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.url);
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const check = async () => {
    const canvas = await page.locator('.react-flow').boundingBox();
    const minimap = await page.locator('.react-flow__minimap').boundingBox();
    expect(canvas).not.toBeNull();
    expect(minimap).not.toBeNull();
    const cards = await page.locator('.react-flow__node').evaluateAll((nodes) =>
      nodes.map((node) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
      }),
    );
    expect(cards.length).toBe(8);
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(canvas!.x + 1);
      expect(card.right).toBeLessThanOrEqual(canvas!.x + canvas!.width - 1);
      expect(card.y).toBeGreaterThanOrEqual(canvas!.y + 1);
      expect(card.bottom).toBeLessThanOrEqual(canvas!.y + canvas!.height - 1);
      expect(
        card.x < minimap!.x + minimap!.width &&
          card.right > minimap!.x &&
          card.y < minimap!.y + minimap!.height &&
          card.bottom > minimap!.y,
      ).toBe(false);
    }
  };
  // Layout and Fit run asynchronously after React Flow measures the new nodes.
  // A fixed 420ms delay previously captured the 100% pre-fit transition frame;
  // wait for a real, in-bounds layout while retaining strict overlap assertions.
  await expect
    .poll(
      async () => {
        const canvas = await page.locator('.react-flow').boundingBox();
        const minimap = await page.locator('.react-flow__minimap').boundingBox();
        if (!canvas || !minimap) return false;
        const cards = await page.locator('.react-flow__node').evaluateAll((nodes) =>
          nodes.map((node) => {
            const b = node.getBoundingClientRect();
            return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
          }),
        );
        return (
          cards.length === 8 &&
          cards.every(
            (card) =>
              card.x >= canvas.x + 1 &&
              card.right <= canvas.x + canvas.width - 1 &&
              card.y >= canvas.y + 1 &&
              card.bottom <= canvas.y + canvas.height - 1 &&
              !(
                card.x < minimap.x + minimap.width &&
                card.right > minimap.x &&
                card.y < minimap.y + minimap.height &&
                card.bottom > minimap.y
              ),
          )
        );
      },
      { timeout: 8000, intervals: [150, 200, 300, 450] },
    )
    .toBe(true);
  await check();
  // Both official Controls Fit and TaskVision's own Fit must share the same
  // responsive policy; earlier only the top button was fixed.
  await page.locator('.react-flow__controls-fitview').click();
  await page.waitForTimeout(300);
  await check();
  await page.getByRole('button', { name: '适合画布，保留文字可读' }).click();
  await page.waitForTimeout(300);
  await check();
});
