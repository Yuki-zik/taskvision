import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root: string;
let app: Awaited<ReturnType<typeof startServer>>;
const files: Record<string, string> = {
  'apps/web/src/App.ts':
    '// CORE: User workspace entry with source-linked guidance.\nimport { run } from "../../../packages/core/src/engine.js";\nexport const app = run();\n',
  'apps/api/src/index.ts':
    '// INTENT: Respect the established interface contract.\nimport { run } from "../../../packages/core/src/engine.js";\nexport const serve = run;\n',
  'apps/mcp/src/index.ts':
    '// CORE: Agent access uses the same project knowledge.\nimport { run } from "../../../packages/core/src/engine.js";\nexport const tools = run;\n',
  'apps/cli/src/index.ts':
    '// CORE: CLI entry.\nimport { run } from "../../../packages/core/src/engine.js";\nexport const cli = run;\n',
  'packages/core/src/engine.ts':
    '// REUSE: Existing engine for all application entry points.\n// REVIEW: Check behavior at the shared boundary.\nimport type { Options } from "../../shared/src/types.js";\nexport function run(options?: Options): number { return options?.value ?? 1; }\n',
  'packages/core/src/helper.ts':
    '// REUSE: Keep shared extension semantics.\nexport const helper = 1;\n',
  'packages/shared/src/types.ts':
    '// CORE: Shared protocol model.\nexport interface Options { value: number }\n',
  'src/extension.ts':
    '// CORE: Editor commands and highlighter.\nimport type { Options } from "../packages/shared/src/types.js";\nexport const activated = true;\n',
  'tests/core.test.ts':
    'import { run } from "../packages/core/src/engine.js";\nexport const fixture = run();\n',
  '.gitignore': '.taskvision/\nnode_modules/\n',
};

test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-official-kit-'));
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
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
    'official node kit acceptance',
  ]);
  app = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function settle(page: Page) {
  await expect(page.locator('.graph-node.tv-node-kit')).toHaveCount(8);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  // Wait for measured, settled actual layout rather than the asynchronous100% first frame.
  await expect
    .poll(
      async () => {
        const canvas = await page.locator('.react-flow').boundingBox();
        if (!canvas) return false;
        const nodes = await page.locator('.graph-node.tv-node-kit').evaluateAll((items) =>
          items.map((item) => {
            const box = item.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
          }),
        );
        return nodes.every(
          (node) =>
            node.left >= canvas.x &&
            node.right <= canvas.x + canvas.width &&
            node.top >= canvas.y &&
            node.bottom <= canvas.y + canvas.height,
        );
      },
      { timeout: 10000 },
    )
    .toBe(true);
}

test('official node kit opens a readable canvas-first architecture with reversible context', async ({
  page,
}) => {
  const exceptions: string[] = [];
  page.on('pageerror', (failure) => exceptions.push(failure.message));
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(app.url);
    await settle(page);
    await expect(page.locator('[data-slot="base-node-title"]')).toHaveCount(8);
    await expect(page.locator('.detail-slot')).toHaveCount(0);
    const canvas = await page.locator('.react-flow').boundingBox();
    expect(canvas!.width).toBeGreaterThan(viewport.width * 0.7);
    const titles = await page.locator('.tv-node-kit .node-title strong').evaluateAll((items) =>
      items.map((item) => {
        const card = item.closest('.tv-node-kit') as HTMLElement;
        const scale = card.getBoundingClientRect().width / card.offsetWidth;
        return {
          text: item.textContent?.trim(),
          screenFont: parseFloat(getComputedStyle(item).fontSize) * scale,
        };
      }),
    );
    expect(titles.every((title) => title.text && title.screenFont >= 11)).toBe(true);
    await page.getByRole('button', { name: '切换项目上下文', exact: true }).click();
    await expect(page.locator('.project-inspector')).toBeVisible();
    await page.getByRole('button', { name: '切换项目上下文', exact: true }).click();
    await expect(page.locator('.detail-slot')).toHaveCount(0);
  }
  expect(exceptions).toEqual([]);
});

test('contextual zoom removes tiny detail clutter while source actions stay available at screen size', async ({
  page,
}) => {
  await page.goto(app.url);
  await settle(page);
  const positions = await page.locator('.react-flow__node').evaluateAll((items) =>
    items.map((item) => ({
      id: item.getAttribute('data-id'),
      style: (item as HTMLElement).style.transform,
    })),
  );
  for (let i = 0; i < 4; i++) {
    await page.locator('.react-flow__controls-zoomout').click();
    await page.waitForTimeout(230);
  }
  await expect(page.locator('.tv-node-kit[data-reading-mode="map"]')).toHaveCount(8);
  expect(
    await page.locator('.react-flow__node').evaluateAll((items) =>
      items.map((item) => ({
        id: item.getAttribute('data-id'),
        style: (item as HTMLElement).style.transform,
      })),
    ),
  ).toEqual(positions);
  const core = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await core.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '模块详情', exact: true })).toBeVisible();
  const toolbar = page
    .locator('.react-flow__node-toolbar')
    .filter({ has: page.getByRole('button', { name: /源码|查看源码/ }) })
    .first();
  await expect(toolbar).toBeVisible();
  const toolbarFont = await toolbar.evaluate((item) => parseFloat(getComputedStyle(item).fontSize));
  expect(toolbarFont).toBeGreaterThanOrEqual(11);
  await toolbar
    .getByRole('button', { name: /源码|查看源码/ })
    .first()
    .click();
  await expect(page.locator('.source-code')).toContainText('Existing engine');
  await expect(page.locator('.source-code')).toContainText('export function run');
});

test('upstream tooltip supports pointer and keyboard inspection without disrupting editors', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(app.url);
  await settle(page);
  const core = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await core.hover();
  const tooltip = page.locator('.tv-node-detail[role=dialog]');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Existing engine');
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.getByRole('button', { name: '添加指导', exact: true }).click();
  await page
    .getByRole('textbox', { name: '指导摘要', exact: true })
    .fill('Keep the official node integration source-grounded');
  await page.getByRole('button', { name: '保存指导', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('项目知识已保存');
  expect(failures).toEqual([]);
});

test('node details and selected actions flip inside the viewport and card has one primary keyboard target', async ({
  page,
}) => {
  await page.goto(app.url);
  await settle(page);
  const cards = page.locator('.react-flow__node');
  const bottomId = await cards.evaluateAll((items) =>
    [...items]
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]
      ?.getAttribute('data-id'),
  );
  expect(bottomId).toBeTruthy();
  const node = page.locator(`.react-flow__node[data-id="${bottomId}"]`);
  await expect(node).toHaveAttribute('tabindex', '0');
  await expect(node.locator('.graph-node')).toHaveAttribute('tabindex', '-1');
  await node.hover();
  const panel = page.locator('.tv-node-detail[role=dialog]');
  await expect(panel).toBeVisible();
  const inside = async (target: ReturnType<Page['locator']>) => {
    const canvas = await page.locator('.react-flow').boundingBox();
    const box = await target.boundingBox();
    return (
      !!canvas &&
      !!box &&
      box.x >= canvas.x &&
      box.y >= canvas.y &&
      box.x + box.width <= canvas.x + canvas.width &&
      box.y + box.height <= canvas.y + canvas.height
    );
  };
  await expect.poll(() => inside(panel)).toBe(true);
  await panel.hover();
  await expect(panel.getByRole('button', { name: /打开源码/ })).toBeVisible();
  await panel.getByRole('button', { name: /打开源码/ }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(node).toBeFocused();
  await node.focus();
  await page.keyboard.press('Enter');
  const actions = page.locator('.tv-node-actions');
  await expect(actions).toBeVisible();
  await expect.poll(() => inside(actions)).toBe(true);
});

test('Escape returns keyboard focus to a zoomed-out file after inspecting source details', async ({
  page,
}) => {
  await page.goto(app.url);
  await settle(page);
  await page.locator('.react-flow__node[data-id="module:packages/core"]').dblclick();
  await expect(page.locator('.react-flow__node[data-id="module:packages/core/src"]')).toBeVisible();
  await page.locator('.react-flow__node[data-id="module:packages/core/src"]').dblclick();
  const file = page.locator('.react-flow__node[data-id="file:packages/core/src/engine.ts"]');
  await expect(file).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.locator('.react-flow__controls-zoomout').click();
    await page.waitForTimeout(220);
  }
  await expect(file.locator('.graph-node')).toHaveAttribute('data-reading-mode', 'map');
  await file.hover();
  const panel = page.locator('.tv-node-detail[role=dialog]');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /打开源码/ }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(file).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '文件详情', exact: true })).toBeVisible();
});
