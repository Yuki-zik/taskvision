import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Exercise the actual packaged-runtime boundary, not a mocked browser API.
const { startServer } = await import(pathToFileURL(path.resolve('workspace/server.mjs')).href);
const { createWorkspace } = await import(pathToFileURL(path.resolve('workspace/core/index.mjs')).href);

type TestWorkspace = ReturnType<typeof createWorkspace>;
let root: string;
let workspace: TestWorkspace;
let app: Awaited<ReturnType<typeof startServer>>;
const human = { role: 'human', id: 'e2e-human' };
const feature = 'apps/train/src/metrics.js';
const sourceBefore = "// CORE: Training entry for acceptance [tv:id=core.training]\n// REVIEW: Verify empty input boundary\nexport function train(values) { return values.length; }\n";

async function open(page: Page) {
  await page.goto(app.url);
  await expect(page.getByRole('heading', { name: '项目架构', exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.getByText('正在整理结构…', { exact: true })).toHaveCount(0);
}
async function navigate(page: Page, name: string) {
  await page.locator('.primary-nav').getByRole('button', { name: new RegExp('^' + name) }).click();
}
async function newGuidance(page: Page, summary: string) {
  await page.getByRole('button', { name: '添加指导', exact: true }).click();
  await page.getByRole('textbox', { name: '指导摘要', exact: true }).fill(summary);
  await page.getByLabel(/^作用范围/).fill('');
  await page.getByRole('button', { name: '保存指导', exact: true }).click();
  await expect(page.locator('.editor-pane')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('项目知识已保存');
}
async function editNote(page: Page, summary: string) {
  await navigate(page, '知识索引');
  const entry = page.locator('.knowledge-entry').filter({ has: page.getByRole('button', { name: summary, exact: true }) }).first();
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: '编辑', exact: true }).click();
}

// Each scenario gets its own real repo/database and makes no production review decisions.
test.beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-userflow-'));
  const files: Record<string, string> = {
    [feature]: sourceBefore,
    'packages/common/src/statistics.js': '// REUSE: Shared summary for training\nexport const summarize = values => values.length;\n',
    'apps/api/src/route.js': "// CORE: API route\nimport {summarize} from '../../../packages/common/src/statistics.js';\nexport const route = summarize;\n",
    'README.md': '# Acceptance project\n',
    '.gitignore': '.taskvision/\nnode_modules/\n',
  };
  for (const [name, contents] of Object.entries(files)) {
    const filename = path.join(root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, contents);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Acceptance', '-c', 'user.email=test@localhost', 'commit', '-qm', 'fixture']);
  workspace = createWorkspace(root);
  app = await startServer({ root, port: 0, publicRoot: path.resolve('workspace/public') });
});
test.afterEach(async () => {
  await app?.close();
  workspace?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('project discovery: graph navigation, readable nodes, stable viewport and narrow-screen controls', async ({ page }) => {
  const exceptions: string[] = [];
  page.on('pageerror', error => exceptions.push(error.message));
  await open(page);
  const nodes = await page.locator('.react-flow__node').evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-id'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
  })));
  expect(nodes.length).toBeGreaterThan(0);
  expect(Math.max(...nodes.map(node => node.width))).toBeGreaterThanOrEqual(160);
  await page.locator('[data-id="module:apps/train"]').dblclick();
  await expect(page.locator('.breadcrumb-trail')).toContainText('train');
  await page.getByRole('button', { name: 'Training entry for acceptance', exact: true }).first().click();
  await page.getByRole('tab', { name: /^源码/ }).click();
  await expect(page.locator('.source-code')).toContainText('export function train');
  const viewport = page.locator('.react-flow__viewport');
  // Wait for the documented 250ms scope-fit animation, then make a user zoom.
  // Sampling the middle of that animation would incorrectly label it a polling reset.
  await page.waitForTimeout(350);
  await page.locator('.react-flow__controls-zoomin').click();
  await page.waitForTimeout(350);
  const transform = await viewport.getAttribute('style');
  await page.waitForTimeout(3000); // One real polling cycle must retain the user's chosen zoom.
  expect(await viewport.getAttribute('style')).toBe(transform);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '添加指导', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(exceptions).toEqual([]);
});

test('human guidance survives polling, reload and concurrent editing without silent overwrite', async ({ page, context }) => {
  await open(page);
  await newGuidance(page, 'Preserve optimizer state');
  expect(workspace.dispatch('context', { query: 'optimizer' }).annotations.some((a: { summary: string }) => a.summary === 'Preserve optimizer state')).toBe(true);
  await editNote(page, 'Preserve optimizer state');
  await page.getByRole('textbox', { name: '指导摘要', exact: true }).fill('Draft from first window');
  await page.reload();
  await editNote(page, 'Preserve optimizer state');
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('Draft from first window');
  const peer = await context.newPage();
  await open(peer);
  await editNote(peer, 'Preserve optimizer state');
  await peer.getByRole('textbox', { name: '指导摘要', exact: true }).fill('Updated from second window');
  await peer.getByRole('button', { name: '保存指导', exact: true }).click();
  await expect(peer.locator('.editor-pane')).toHaveCount(0);
  await expect(peer.getByRole('status')).toContainText('项目知识已保存');
  await page.getByRole('button', { name: '保存指导', exact: true }).click();
  await expect(page.locator('.editor-pane')).toContainText('草稿未丢失');
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('Draft from first window');
  expect(workspace.dispatch('context', { query: 'second window' }).annotations.some((a: { summary: string }) => a.summary === 'Updated from second window')).toBe(true);
  await peer.close();
});

test('review displays real before/after and rejects changes made after submission', async ({ page }) => {
  const task = workspace.dispatch('task_create', { title: 'Review the training change', paths: [feature] }, human).task;
  const claim = workspace.dispatch('task_claim', { taskId: task.id, agentId: 'e2e-agent' }).claim;
  fs.writeFileSync(path.join(root, feature), sourceBefore.replace('return values.length;', 'return values.length + 1;'));
  const review = workspace.dispatch('review_submit', { taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Actual feature diff', evidence: ['Isolated fixture; test evidence not independently executed by the server.'] }).review;
  await open(page);
  await navigate(page, '人工审阅');
  await expect(page.locator('.diff-code')).toContainText('return values.length + 1;');
  await expect(page.locator('.diff-code')).toContainText('return values.length;');
  await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeEnabled();
  fs.appendFileSync(path.join(root, feature), '// changed after submit\n');
  await page.getByRole('button', { name: '人工验收通过', exact: true }).click();
  await expect(page.locator('.review-detail')).toContainText('变化');
  expect(workspace.dispatch('review_detail', { reviewId: review.id }).review.status).toBe('pending');
  await page.getByRole('button', { name: '要求修改', exact: true }).click();
  await expect(page.locator('.resolved-review')).toContainText('要求修改');
});

test('portable knowledge has an explicit import preview and agent proposals require human adoption', async ({ page }) => {
  const proposed = workspace.dispatch('annotation_upsert', { tag: 'REUSE', summary: 'Agent proposed reusable checkpoint' }).annotation;
  await open(page);
  await navigate(page, '知识索引');
  const entry = page.locator('.knowledge-entry').filter({ hasText: proposed.summary }).first();
  await entry.getByRole('button', { name: '采纳', exact: true }).click();
  await expect(entry.getByRole('button', { name: '采纳', exact: true })).toHaveCount(0);
  expect(workspace.dispatch('snapshot').annotations.find((a: { id: string }) => a.id === proposed.id).status).toBe('active');
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click();
  const document = workspace.dispatch('export');
  document.project.workspaceId = 'different-project';
  document.annotations = [{ ...proposed, id: 'transferable-note', summary: 'Imported guidance awaiting confirmation', status: 'active' }];
  await page.locator('input[type=file]').setInputFiles({ name: 'knowledge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.getByRole('button', { name: '预检与冲突预览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '预检结果', exact: true })).toBeVisible();
  expect(workspace.dispatch('snapshot').annotations.some((a: { summary: string }) => a.summary === 'Imported guidance awaiting confirmation')).toBe(false);
  await page.getByRole('button', { name: /确认导入 1 条记录/ }).click();
  await expect(page.getByText('已完成导入，当前知识已刷新。', { exact: true })).toBeVisible();
  expect(workspace.dispatch('snapshot').annotations.find((a: { summary: string }) => a.summary === 'Imported guidance awaiting confirmation').status).toBe('proposed');
});
