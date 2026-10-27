import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Inspect the real scanner/server/React Flow wires for a fan-in dependency graph.
const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let root = '';
let server: Awaited<ReturnType<typeof startServer>>;

test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-wire-geometry-'));
  const files: Record<string, string> = {
    'apps/a/src/index.ts':
      [
        '// CORE: UI importer with runtime, type and dynamic dependencies.',
        "import { run } from '../../../packages/core/src/engine.js';",
        "import type { Options } from '../../../packages/core/src/engine.js';",
        "export { run as sharedRun } from '../../../packages/core/src/engine.js';",
        "export const lazy = () => import('../../../packages/core/src/engine.js');",
        'export const value = run(1);',
      ].join('\n') + '\n',
    'apps/b/src/index.ts':
      "import { run } from '../../../packages/core/src/engine.js';\nexport const b = run(2);\n",
    'apps/c/src/index.ts':
      "import { run } from '../../../packages/core/src/engine.js';\nexport const c = run(3);\n",
    'apps/d/src/index.ts':
      "import { run } from '../../../packages/core/src/engine.js';\nexport const d = run(4);\n",
    'packages/core/src/engine.ts':
      '// REUSE: Single engine for every app.\nexport interface Options { allow?: boolean }\nexport const run = (x: number) => x + 1;\n',
    '.gitignore': '.taskvision/\nnode_modules/\n',
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Acceptance',
    '-c',
    'user.email=wire@local',
    'commit',
    '-qm',
    'real shared-provider graph',
  ]);
  server = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await server?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('multiple importers entering one core module have independently traceable endpoints', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(server.url);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const connections = page.locator('.react-flow__edge[data-id*="→module:packages/core"]');
  await expect(connections).toHaveCount(4);
  const wires = await connections.evaluateAll((items) =>
    items.map((element) => {
      const p = element.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
      if (!p) throw new Error('Missing real path');
      const end = p.getPointAtLength(p.getTotalLength());
      return { id: element.getAttribute('data-id'), path: p.getAttribute('d'), targetY: end.y };
    }),
  );
  assertUniqueWires(wires);
  const targets = [...wires.map((wire) => wire.targetY)].sort((a, b) => a - b);
  for (let i = 1; i < targets.length; i++) {
    expect(targets[i]! - targets[i - 1]!).toBeGreaterThanOrEqual(7);
  }
  // Dedicated colored ports match each visible wire; extra phantom wires are forbidden.
  const core = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await expect(core.locator('.react-flow__handle[data-handleid^="in:"]')).toHaveCount(4);
  const first = connections.first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toBeVisible();
  await expect(page.locator('.relation-details')).toContainText('packages/core');
  await page.locator('.relation-details .evidence-source').first().click();
  await expect(page.locator('.source-code')).toContainText('import');
  expect(pageErrors).toEqual([]);
});

function assertUniqueWires(
  wires: Array<{ id: string | null; path: string | null; targetY: number }>,
) {
  expect(new Set(wires.map((item) => item.id)).size).toBe(wires.length);
  expect(new Set(wires.map((item) => item.path)).size).toBe(wires.length);
}

test('multiple typed relations from one module stay separately selectable and visible on drag', async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '分类', exact: true }).click();
  const matches = page.locator('.react-flow__edge[data-id*="module:apps/a→module:packages/core"]');
  await expect(matches).toHaveCount(4);
  const rows = await matches.evaluateAll((items) =>
    items.map((element) => {
      const p = element.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
      if (!p) throw new Error('Missing category path');
      const start = p.getPointAtLength(0),
        end = p.getPointAtLength(p.getTotalLength());
      return {
        id: element.getAttribute('data-id'),
        startY: start.y,
        endY: end.y,
        d: p.getAttribute('d'),
      };
    }),
  );
  expect(new Set(rows.map((item) => item.startY)).size).toBe(rows.length);
  expect(new Set(rows.map((item) => item.endY)).size).toBe(rows.length);
  for (const category of ['runtime', 'type', 'reexport', 'dynamic']) {
    const edge = page.locator(
      '.react-flow__edge[data-id^="dependency:' +
        category +
        ':module:apps/a→module:packages/core"]',
    );
    await expect(edge).toHaveCount(1);
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.relation-details')).toBeVisible();
    await expect(page.locator('.relation-details')).toContainText('apps/a');
  }
  // A moved node must reconnect to its new port rather than keeping an old line.
  const node = page.locator('.react-flow__node[data-id="module:apps/a"]');
  // Category changes start an async ELK layout. React Flow explicitly marks
  // its nodes non-draggable until that layout finishes. Check the real node
  // drag state; an enabled toolbar button is not equivalent to layout-ready.
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  await expect(node).toHaveClass(/draggable/);
  const pathTarget = page.locator(
    '.react-flow__edge[data-id^="dependency:runtime:module:apps/a→module:packages/core"] path.react-flow__edge-path',
  );
  // Switching relation filters relayouts ELK asynchronously. Drags become
  // enabled when the layout finishes, so target a real non-button title after
  // that control becomes interactive. Avoid header icon/tooltip hit regions.
  await expect(page.getByRole('button', { name: '重新布局' })).toBeEnabled();
  const before = await pathTarget.getAttribute('d');
  const title = node.locator('.node-title');
  await expect(title).toBeVisible();
  // Hover can reveal a portalled tooltip or trigger a final graph measurement.
  // Target the title after that transition, not at its old screen coordinates.
  await title.hover();
  await expect(node).toHaveClass(/draggable/);
  const rect = await title.boundingBox();
  expect(rect).not.toBeNull();
  const start = { x: rect!.x + rect!.width * 0.45, y: rect!.y + rect!.height * 0.45 };
  const hit = await page.evaluate(
    (point) =>
      document
        .elementFromPoint(point.x, point.y)
        ?.closest('.react-flow__node')
        ?.getAttribute('data-id'),
    start,
  );
  expect(hit).toBe('module:apps/a');
  await page.mouse.move(start.x, start.y);
  // Hover can open a portalled node tooltip. Verify that the real title is
  // still the pointer target before initiating the drag.
  await expect
    .poll(async () =>
      page.evaluate(
        (point) =>
          document
            .elementFromPoint(point.x, point.y)
            ?.closest('.react-flow__node')
            ?.getAttribute('data-id'),
        start,
      ),
    )
    .toBe('module:apps/a');
  await page.mouse.down();
  await page.mouse.move(start.x + 53, start.y + 39, { steps: 9 });
  await expect.poll(() => pathTarget.getAttribute('d'), { timeout: 8000 }).not.toBe(before);
  await page.mouse.up();
  await expect.poll(async () => await pathTarget.getAttribute('d')).not.toBe(before);
  await page.waitForTimeout(2300); // The existing real polling cycle must preserve this edit.
  expect(await pathTarget.getAttribute('d')).not.toBe(before);
});

test('a single focused wire overrides the selected provider and dims its siblings', async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const provider = page.locator('.react-flow__node[data-id="module:packages/core"]');
  await provider.click();
  const wires = page.locator('.react-flow__edge[data-id*="→module:packages/core"]');
  await expect(wires).toHaveCount(4);
  const focused = wires.first();
  await focused.focus();
  const active = focused.locator('path.react-flow__edge-path');
  await expect
    .poll(() => active.evaluate((el) => Number(getComputedStyle(el).strokeWidth.replace('px', ''))))
    .toBeGreaterThan(2);
  for (let index = 1; index < 4; index++) {
    const other = wires.nth(index);
    const otherMain = other.locator('path.react-flow__edge-path');
    const otherCasing = other.locator('path.tv-wire-casing');
    await expect
      .poll(() => otherMain.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeLessThan(0.2);
    await expect
      .poll(() => otherCasing.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeLessThan(0.2);
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toBeVisible();
  await expect(page.locator('.relation-details')).toContainText('依赖');
});

test('switching focus from an already selected evidence wire leaves exactly one active path', async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
  const links = page.locator('.react-flow__edge[data-id*="→module:packages/core"]');
  await expect(links).toHaveCount(4);
  const a = links.first();
  const b = links.nth(1);
  await a.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.relation-details')).toBeVisible();
  await b.focus();
  await expect
    .poll(() =>
      b
        .locator('path.react-flow__edge-path')
        .evaluate((path) => Number(getComputedStyle(path).opacity)),
    )
    .toBeGreaterThan(0.9);
  await expect
    .poll(() =>
      a
        .locator('path.react-flow__edge-path')
        .evaluate((path) => Number(getComputedStyle(path).opacity)),
    )
    .toBeLessThan(0.2);
  await expect
    .poll(() =>
      a.locator('path.tv-wire-casing').evaluate((path) => Number(getComputedStyle(path).opacity)),
    )
    .toBeLessThan(0.2);
});
