import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
const { createWorkspace } = await import(
  pathToFileURL(path.resolve('workspace/core/index.mjs')).href
);
let root: string;
let server: Awaited<ReturnType<typeof startServer>>;
let workspace: ReturnType<typeof createWorkspace>;
const sources: Record<string, string> = {
  'apps/alpha/src/index.ts':
    '// CORE: Source A consumes the common engine.\nimport {run} from "../../../packages/core/src/engine.js";\nexport const a=run();\n',
  'apps/zulu/src/index.ts':
    '// CORE: Source Z consumes the common engine.\nimport type {Options} from "../../../packages/core/src/engine.js";\nexport const z: Options = {};\n',
  'apps/worker/src/index.ts':
    '// INTENT: Use the same protocol boundary.\nexport {run} from "../../../packages/core/src/engine.js";\nexport const lazy=()=>import("../../../packages/core/src/engine.js");\n',
  'packages/core/src/engine.ts':
    '// CORE: Single shared engine for this repository.\n// REUSE: Extend the existing engine rather than duplicate it.\n// INTENT: Keep the protocol compatible.\n// REVIEW: Inspect empty input and error behavior.\n// TODO: Document the optional configuration.\nimport type {Protocol} from "../../shared/src/types.js";\nexport interface Options extends Protocol {}\nexport const run=()=>1;\n',
  'packages/core/src/helper.ts':
    '// REUSE: Pure helper retained by the implementation.\nexport const helper=1;\n',
  'packages/shared/src/types.ts':
    '// CORE: Source-backed protocol boundary.\nexport interface Protocol {version?: number}\n',
  '.gitignore': '.taskvision/\nnode_modules/\n',
};

test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-studio-'));
  for (const [relative, text] of Object.entries(sources)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
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
    'actual studio fixture',
  ]);
  workspace = createWorkspace(root);
  const task = workspace.dispatch(
    'task_create',
    { title: 'Inspect the engine change', paths: ['packages/core/src/engine.ts'] },
    { role: 'human', id: 'fixture' },
  ).task;
  const claim = workspace.dispatch('task_claim', {
    taskId: task.id,
    agentId: 'fixture-review',
  }).claim;
  workspace.dispatch('review_submit', {
    taskId: task.id,
    agentId: claim.agentId,
    token: claim.token,
    summary: 'One real pending handoff',
    evidence: ['Isolated source fixture; not production approval'],
  });
  const second = workspace.dispatch('task_create', {
    title: 'Helper maintenance',
    paths: ['packages/core/src/helper.ts'],
  }).task;
  workspace.dispatch('task_claim', {
    taskId: second.id,
    agentId: 'fixture-agent',
    ttlSeconds: 1800,
  });
  server = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await server?.close();
  workspace?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function openGraph(page: Page) {
  await page.goto(server.url);
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(250);
}

test('studio cards expose real knowledge, references, review and owner without hover', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openGraph(page);
  const core = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  await page.getByRole('button', { name: '切换缩略图', exact: true }).click();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await page.getByRole('button', { name: '切换缩略图', exact: true }).click();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  for (const tag of ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO']) {
    const chip = core.locator('.node-tags').getByText(new RegExp('^' + tag));
    await expect(chip).toBeVisible();
  }
  await expect(core).toContainText('2');
  await expect(core).toContainText('fixture-agent');
  await expect(core).toContainText('待验收');
  const facts = await core.innerText();
  expect(facts).toMatch(/依赖/);
  expect(facts).toMatch(/LOC/);
  const geometry = await core.locator('.graph-node').evaluate((node) => ({
    height: node.clientHeight,
    scroll: node.scrollHeight,
    background: getComputedStyle(node).backgroundColor,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.height + 2);
  const metricFont = await core
    .locator('.node-metrics > span')
    .first()
    .evaluate((el) => {
      const card = el.closest('.graph-node') as HTMLElement;
      return (
        (parseFloat(getComputedStyle(el).fontSize) * card.getBoundingClientRect().width) /
        card.offsetWidth
      );
    });
  expect(metricFont).toBeGreaterThanOrEqual(10);
  await expect(page.getByRole('button', { name: '阅读缩放', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const canvas = await page
    .locator('.react-flow')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(canvas).not.toBe('rgb(250, 251, 246)');
  expect(errors).toEqual([]);
});

test('line styles and legend explain geometry separately from real source semantics', async ({
  page,
}) => {
  await openGraph(page);
  const edges = page.locator('.react-flow__edge');
  const count = await edges.count();
  const initial = await edges.first().locator('.react-flow__edge-path').getAttribute('d');
  await page.getByRole('button', { name: '圆角连线', exact: true }).click();
  await expect(page.getByRole('button', { name: '圆角连线', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '直连连线', exact: true }).click();
  const straight = await edges.first().locator('.react-flow__edge-path').getAttribute('d');
  expect(straight).not.toBe(initial);
  expect(straight).toMatch(/L/);
  await expect(page.locator('.canvas-footer')).toContainText('不避障');
  await page.getByRole('button', { name: '展开图例', exact: true }).click();
  const legend = page.getByRole('region', { name: '节点与连线图例' });
  await expect(legend).toContainText('运行时');
  await expect(legend).toContainText('类型');
  await expect(legend).toContainText('动态');
  await expect(legend).toContainText('词法');
  await expect(legend).toContainText('不表示执行顺序');
  await expect(legend).toContainText('待验收');
  await page.getByRole('button', { name: '关闭图例', exact: true }).click();
  await page.getByRole('button', { name: '展开图例', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(legend).toHaveCount(0);
  await expect(page.getByRole('button', { name: '展开图例', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '流线连线', exact: true }).click();
  await expect(edges).toHaveCount(count);
  await edges.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toBeVisible();
  await expect(page.locator('.relation-details')).toContainText('core');
});

test('fan-in ports follow the visual source order and use small independent direction marks', async ({
  page,
}) => {
  await openGraph(page);
  const incoming = page.locator('.react-flow__edge[data-id*="→module:packages/core"]');
  await expect(incoming).toHaveCount(3);
  const ordered = await incoming.evaluateAll((items) =>
    items.map((element) => {
      const id = element.getAttribute('data-id')!;
      const source = id.replace(/^dependency:[^:]+:/, '').split('→')[0]!;
      const sourceElement = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(
        (node) => node.dataset.id === source,
      )!;
      const target = document.querySelector<HTMLElement>(
        '.react-flow__node[data-id="module:packages/core"]',
      )!;
      const handle = [...target.querySelectorAll<HTMLElement>('.react-flow__handle')].find(
        (node) => node.getAttribute('data-handleid') === 'in:' + id,
      )!;
      const sourceBox = sourceElement.getBoundingClientRect(),
        handleBox = handle.getBoundingClientRect();
      const path = element.querySelector<SVGPathElement>('.react-flow__edge-path')!;
      const length = path.getTotalLength(),
        end = path.getPointAtLength(length);
      const near = path.getPointAtLength(Math.max(0, length - 18));
      return {
        sourceY: sourceBox.y + sourceBox.height / 2,
        portY: handleBox.y + handleBox.height / 2,
        end: { x: end.x, y: end.y },
        near: { x: near.x, y: near.y },
        d: path.getAttribute('d'),
      };
    }),
  );
  ordered.sort((a, b) => a.sourceY - b.sourceY);
  for (let i = 1; i < ordered.length; i++)
    expect(ordered[i]!.portY - ordered[i - 1]!.portY).toBeGreaterThan(10);
  for (const wire of ordered) expect(wire.end.x - wire.near.x).toBeGreaterThan(12);
  const markers = await page.locator('marker').evaluateAll((items) =>
    items.map((node) => ({
      units: node.getAttribute('markerUnits'),
      width: Number(node.getAttribute('markerWidth')),
    })),
  );
  expect(markers.every((marker) => marker.units === 'userSpaceOnUse' && marker.width <= 10)).toBe(
    true,
  );
});

test('dark workbench preserves typed search contrast, selected filters and task titles', async ({
  page,
}) => {
  await openGraph(page);
  const search = page.getByRole('textbox', { name: '搜索文件、符号或知识', exact: true });
  await search.fill('engine');
  const colors = await search.evaluate((el) => ({
    fg: getComputedStyle(el).color,
    bg: getComputedStyle(el.closest('.search-field')!).backgroundColor,
  }));
  const contrast = (foreground: string, background: string) => {
    const lum = (color: string) => {
      const values = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          const v = x / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
    };
    const a = lum(foreground),
      b = lum(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  expect(contrast(colors.fg, colors.bg)).toBeGreaterThanOrEqual(4.5);
  await search.fill('');
  const filter = page.locator('.tag-filters').getByRole('button', { name: 'CORE', exact: true });
  const before = await filter.evaluate((el) => getComputedStyle(el).backgroundColor);
  await filter.click();
  await page.mouse.move(150, 100);
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  // Assert the persistent selected state after its real CSS color transition,
  // not the first transparent animation frame immediately after aria changes.
  await expect
    .poll(() => filter.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(before);
  await page.locator('.primary-nav').getByRole('button', { name: '协作任务', exact: true }).click();
  const title = page.locator('.task-main h3').first();
  await expect(title).toBeVisible();
  const taskColors = await title.evaluate((el) => ({
    fg: getComputedStyle(el).color,
    bg: getComputedStyle(el.closest('.tasks-view') ?? el.closest('.content-view')!).backgroundColor,
  }));
  expect(contrast(taskColors.fg, taskColors.bg)).toBeGreaterThanOrEqual(4.5);
});
