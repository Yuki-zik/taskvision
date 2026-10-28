import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
let base: string;
let initial: string;
let other: string;
let preferencesDir: string;
let app: Awaited<ReturnType<typeof startServer>>;

function gitProject(name: string, instruction: string) {
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'entry.ts'),
    '// INTENT: ' +
      instruction +
      '\n' +
      '// CORE: ' +
      name +
      ' project entry\n' +
      'export const title = \"' +
      name +
      '\";\n' +
      'export function run(): number { return 2027; }\n' +
      'const literal = \"<img src=x onerror=alert(1)>\";\n',
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name, private: true, version: '1.0.0' }, null, 2),
  );
  fs.writeFileSync(path.join(root, '.gitignore'), '.taskvision/\nnode_modules/\n');
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    name,
  ]);
  return root;
}
test.beforeEach(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-e2e-personal-'));
  initial = gitProject('alpha', 'Alpha review and reuse must be preserved');
  other = gitProject('beta', 'Beta instructions are different from Alpha');
  preferencesDir = path.join(base, 'private-user');
  app = await startServer({
    root: initial,
    port: 0,
    preferencesDir,
    publicRoot: path.resolve('workspace/public'),
  });
});
test.afterEach(async () => {
  await app?.close();
  fs.rmSync(base, { recursive: true, force: true });
});
async function ready(page: Page, name: string) {
  await expect(page.getByRole('button', { name: '切换观察项目' })).toContainText(name);
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
}
test('in-page project registration and switching keep separate source intent even across browser tabs', async ({
  browser,
  page,
}) => {
  const exceptions: string[] = [];
  page.on('pageerror', (e) => exceptions.push(e.message));
  await page.goto(app.url);
  await ready(page, 'alpha');
  await page.getByRole('button', { name: '切换观察项目' }).click();
  await page.getByRole('button', { name: /添加本地工程路径/ }).click();
  await page.getByLabel('工程文件夹的绝对路径').fill(other);
  await page.getByRole('button', { name: '确认添加并打开' }).click();
  await ready(page, 'beta');
  await expect(page.locator('.rail-project')).toContainText('beta');
  await page
    .getByRole('button', { name: /INTENT/ })
    .first()
    .click();
  // The graph tag filter intentionally stays on the graph. Enter the linked
  // Knowledge view to read the full INTENT text and provenance.
  await page.getByRole('button', { name: '知识索引', exact: true }).click();
  await expect(page.locator('.knowledge-entry')).toContainText([
    'Beta instructions are different from Alpha',
  ]);
  await expect(page.getByText('Alpha review and reuse must be preserved')).toHaveCount(0);
  const url = new URL(page.url());
  const betaId = url.searchParams.get('project');
  expect(betaId).toMatch(/^[a-f0-9]{20}$/);
  const tab = await browser.newPage();
  await tab.goto(app.url);
  await ready(tab, 'alpha');
  await expect(tab.getByRole('button', { name: '切换观察项目' })).toContainText('alpha');
  await page.getByRole('button', { name: '切换观察项目' }).click();
  await page
    .getByRole('dialog', { name: '切换和添加本地项目' })
    .getByRole('button', { name: /^alpha / })
    .click();
  await ready(page, 'alpha');
  await expect(page.getByRole('button', { name: '切换观察项目' })).toContainText('alpha');
  await expect(tab.getByRole('button', { name: '切换观察项目' })).toContainText('alpha');
  await tab.goto(app.url + '?project=' + betaId);
  await ready(tab, 'beta');
  await expect(page.getByRole('button', { name: '切换观察项目' })).toContainText('alpha');
  await tab.close();
  expect(exceptions).toEqual([]);
});
test('theme, dock and dragged personal pane sizes restore on a fresh service port without touching Git', async ({
  page,
}) => {
  await page.goto(app.url);
  await ready(page, 'alpha');
  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '详情在下方' }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.getByRole('button', { name: '切换项目上下文' }).click();
  const stage = page.locator('.workspace-stage');
  await expect(stage).toHaveAttribute('data-dock', 'bottom');
  const detail = page.locator('.detail-slot');
  const before = await detail.boundingBox();
  const splitter = page.getByRole('separator', { name: '调整详情面板高度' });
  const box = await splitter.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 64, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await detail.boundingBox())?.height ?? 0)
    .toBeGreaterThan((before?.height ?? 0) + 35);
  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page
    .getByRole('dialog', { name: '工作台个性化' })
    .getByRole('button', { name: '收起左侧导航', exact: true })
    .click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.waitForTimeout(750);
  const height = (await detail.boundingBox())!.height;
  await page.reload();
  await ready(page, 'alpha');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: '切换项目上下文' }).click();
  await expect(stage).toHaveAttribute('data-dock', 'bottom');
  expect(Math.abs((await detail.boundingBox())!.height - height)).toBeLessThan(3);
  await app.close();
  app = await startServer({
    root: initial,
    port: 0,
    preferencesDir,
    publicRoot: path.resolve('workspace/public'),
  });
  await page.goto(app.url);
  await ready(page, 'alpha');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: '切换项目上下文' }).click();
  await expect(stage).toHaveAttribute('data-dock', 'bottom');
  expect(Math.abs((await detail.boundingBox())!.height - height)).toBeLessThan(3);
  expect(
    execFileSync('git', ['-C', initial, 'status', '--porcelain'], { encoding: 'utf8' }).trim(),
  ).toBe('');
});
test('source inspector has real TextMate token colors, TaskVision annotation decorations and safe read-only code in both themes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(app.url);
  await ready(page, 'alpha');
  await page.getByRole('button', { name: 'entry.ts' }).first().click();
  await expect(page.locator('.tv-code-source')).toBeVisible();
  await expect(page.locator('.tv-code-source')).toHaveAttribute('data-syntax-mode', 'textmate');
  await expect(page.locator('.tv-source-tag[data-taskvision-tag=INTENT]')).toHaveCount(1);
  await expect(page.locator('.tv-source-tag[data-taskvision-tag=CORE]')).toHaveCount(1);
  await expect(page.locator('.tv-code-source')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.tv-code-source img')).toHaveCount(0);
  const keyword = page
    .locator('.tv-code-source .source-line')
    .filter({ hasText: 'export function' })
    .locator('code span')
    .first();
  await expect(keyword).toBeVisible();
  const colored = await keyword.evaluate((el) => getComputedStyle(el).color);
  expect(colored).not.toBe('rgba(0, 0, 0, 0)');
  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('.tv-code-source')).toHaveAttribute('data-source-theme', 'light');
  await expect(page.locator('.tv-code-source')).toHaveAttribute('data-syntax-mode', 'textmate');
  await expect(page.locator('.tv-source-tag[data-taskvision-tag=INTENT]')).toHaveCount(1);
  await expect(page.locator('.tv-code-source')).toContainText('return 2027');
  expect(errors).toEqual([]);
});

test('Export JSON follows the actually selected project, never silently exporting the initial root', async ({
  page,
}) => {
  await page.goto(app.url);
  await ready(page, 'alpha');
  await page.getByRole('button', { name: '切换观察项目' }).click();
  await page.getByRole('button', { name: '添加本地工程路径' }).click();
  await page.getByLabel('工程文件夹的绝对路径').fill(other);
  await page.getByRole('button', { name: '确认添加并打开' }).click();
  await ready(page, 'beta');
  const beta = new URL(page.url()).searchParams.get('project');
  expect(beta).toMatch(/^[0-9a-f]{20}$/);
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  const link = page.getByRole('link', { name: '下载 JSON' });
  await expect(link).toHaveAttribute('href', '/api/export?project=' + beta);
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const exported = JSON.parse(fs.readFileSync(file!, 'utf8'));
  expect(exported.project.workspaceId).toBe(beta);
  expect(exported.project.root).toBe(fs.realpathSync(other));
  expect(JSON.stringify(exported)).toContain('Beta instructions are different from Alpha');
  expect(JSON.stringify(exported)).not.toContain('Alpha review and reuse must be preserved');
});

test('system appearance follows OS color scheme and left dock uses keyboard resizing', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(app.url);
  await ready(page, 'alpha');
  // New projects use their original dark neon appearance. Opt into the saved
  // Follow System mode before testing OS theme changes.
  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '个性化布局与主题' }).click();
  await page.getByRole('button', { name: '详情在左侧' }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.getByRole('button', { name: '切换项目上下文' }).click();
  const stage = page.locator('.workspace-stage');
  await expect(stage).toHaveAttribute('data-dock', 'left');
  const separator = page.getByRole('separator', { name: '调整详情面板宽度' });
  await separator.focus();
  const initialWidth = Number(await separator.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 40));
  await page.waitForTimeout(720);
  await page.reload();
  await ready(page, 'alpha');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '切换项目上下文' }).click();
  await expect(stage).toHaveAttribute('data-dock', 'left');
  await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 40));
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('manually moved graph node positions and camera persist across reload, without appearing in another project', async ({
  page,
}) => {
  await page.goto(app.url);
  await ready(page, 'alpha');
  // Complete the actual initial Fit interaction before testing a manual drag.
  // The page's layout spinner can disappear while a CSS/React Flow viewport
  // animation is still running and a pointer-down may hit an old position.
  await page.getByRole('button', { name: '适合画布，保留文字可读', exact: true }).click();
  await page.waitForTimeout(390);
  const node = page.locator('.react-flow__node[data-id="module:src"]');
  await expect(node).toHaveClass(/draggable/);
  const readPosition = () => node.evaluate((el) => el.style.transform);
  const before = await readPosition();
  const title = node.locator('.node-title');
  await title.hover();
  await expect(node).toHaveClass(/draggable/);
  const rect = await title.boundingBox();
  expect(rect).toBeTruthy();
  const from = { x: rect!.x + Math.min(rect!.width * 0.5, 70), y: rect!.y + rect!.height / 2 };
  // A pointer test is meaningful only if the graph node is actually under the
  // cursor after asynchronous Fit/ELK measurement; a missed down cannot drag.
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('.react-flow__node')?.getAttribute('data-id'),
        from,
      ),
    )
    .toBe('module:src');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 76, from.y + 52, { steps: 12 });
  await expect(node).toHaveClass(/dragging/);
  await page.mouse.up();
  await expect.poll(readPosition, { timeout: 10000 }).not.toBe(before);
  const moved = await readPosition();
  const id = new URL(page.url()).searchParams.get('project');
  expect(id).toMatch(/^[0-9a-f]{20}$/);
  await expect
    .poll(
      async () => {
        const reply = await page.request.get(app.url + 'api/preferences?project=' + id);
        const pref = (await reply.json()).preferences;
        return Object.values(
          pref.graphViews as Record<
            string,
            { positions: Record<string, { x: number; y: number }> }
          >,
        ).some(
          (view) => view.positions['module:src'] && Number.isFinite(view.positions['module:src'].x),
        );
      },
      { timeout: 12000 },
    )
    .toBe(true);
  await page.reload();
  await ready(page, 'alpha');
  await expect.poll(readPosition, { timeout: 12000 }).toBe(moved);
  await page.getByRole('button', { name: '切换观察项目' }).click();
  await page.getByRole('button', { name: '添加本地工程路径' }).click();
  await page.getByLabel('工程文件夹的绝对路径').fill(other);
  await page.getByRole('button', { name: '确认添加并打开' }).click();
  await ready(page, 'beta');
  const second = page.locator('.react-flow__node[data-id="module:src"]');
  await expect(second).toBeVisible();
  await expect.poll(async () => second.evaluate((el) => el.style.transform)).not.toBe(moved);
});
