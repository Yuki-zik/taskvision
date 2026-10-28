import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

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
  // ELK finishes before React Flow's initial 200ms fit animation settles.
  // Aim the double-click at a stable module instead of the moving canvas.
  await page.waitForTimeout(420);
  const module = page.locator('.react-flow__node[data-id="module:apps/train"]');
  await expect(module).toBeVisible();
  await module.dblclick();
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

test('new guidance drafts stay bound to the selected source line across navigation and reload', async ({ page }) => {
  await open(page);
  await navigate(page, '知识索引');
  await page.getByRole('button', { name: 'Training entry for acceptance', exact: true }).click();
  const inspector = page.locator('.source-inspector');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByLabel('锚点行号')).toHaveValue('1');
  await page.getByRole('textbox', { name: '指导摘要', exact: true }).fill('Line one has its own unfinished draft');
  await page.getByRole('button', { name: '保留草稿并关闭' }).click();

  await inspector.getByRole('button', { name: '选择第 2 行' }).click();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByLabel('锚点行号')).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: '指导摘要', exact: true }).fill('Line two independent draft');
  await page.getByRole('button', { name: '保留草稿并关闭' }).click();

  await inspector.getByRole('button', { name: '选择第 1 行' }).click();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('Line one has its own unfinished draft');
  await expect(page.getByLabel('锚点行号')).toHaveValue('1');
  await page.reload();
  await navigate(page, '知识索引');
  await page.getByRole('button', { name: 'Training entry for acceptance', exact: true }).click();
  await page.locator('.source-inspector').getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('Line one has its own unfinished draft');
});

test('old path-only drafts migrate only at the matching line and are not silently discarded', async ({ page }) => {
  await open(page);
  const workspaceId = workspace.dispatch('snapshot').project.workspaceId;
  const oldKey = `taskvision:${workspaceId}:note:new:${feature}`;
  const legacyDraft = {
    tag: 'INTENT',
    summary: 'Preserve the unfinished legacy draft',
    body: 'The author left this before updating TaskVision',
    path: feature,
    line: 1,
    baseHash: null,
  };
  await page.evaluate(({ key, draft }) => {
    localStorage.setItem(key, JSON.stringify(draft));
  }, { key: oldKey, draft: legacyDraft });
  await navigate(page, '知识索引');
  await page.getByRole('button', { name: 'Training entry for acceptance', exact: true }).click();
  const inspector = page.locator('.source-inspector');

  await inspector.getByRole('button', { name: '选择第 2 行' }).click();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByLabel('锚点行号')).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('');
  expect(await page.evaluate((key) => localStorage.getItem(key), oldKey)).toContain('unfinished legacy draft');
  await page.getByRole('button', { name: '保留草稿并关闭' }).click();

  await inspector.getByRole('button', { name: '选择第 1 行' }).click();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue(legacyDraft.summary);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), oldKey)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key + ':1'), oldKey)).toContain(legacyDraft.summary);
  await page.getByRole('button', { name: '保留草稿并关闭' }).click();

  await inspector.getByRole('button', { name: '选择第 2 行' }).click();
  await inspector.getByRole('button', { name: '指导', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '指导摘要', exact: true })).toHaveValue('');
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

test('legacy Review with a newly ignored file remains readable, labels old commit and allows re-review', async ({
  page,
}) => {
  const task = workspace.dispatch(
    'task_create',
    {
      title: 'Old release review after source policy changed',
      paths: [feature, 'packages/common/src/statistics.js'],
    },
    human,
  ).task;
  const claim = workspace.dispatch('task_claim', { taskId: task.id, agentId: 'old-agent' }).claim;
  const review = workspace.dispatch('review_submit', {
    taskId: task.id,
    agentId: claim.agentId,
    token: claim.token,
    summary: 'Old release submitted before reliable review baselines',
    evidence: ['Old agent claimed these files passed a test; this is not verified by the server.'],
  }).review;
  // Reproduce the actual 2.1 -> 3.2 migration: the old review has no recorded
  // before/after source, and an originally readable file becomes gitignored.
  const db = new DatabaseSync(workspace.dispatch('snapshot').project.storePath);
  db.prepare("DELETE FROM records WHERE id=? AND kind IN ('review-baseline','review-source')").run(
    review.id,
  );
  db.close();
  const hiddenPath = 'packages/common/src/statistics.js';
  fs.writeFileSync(
    path.join(root, hiddenPath),
    '// PREVIOUSLY_VISIBLE_REVIEW_SECRET\nexport const summarize = () => 0;\n',
  );
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    `.taskvision/
${hiddenPath}
`,
  );
  execFileSync('git', ['-C', root, 'add', '.gitignore']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@localhost',
    'commit',
    '-qm',
    'tighten source access',
  ]);
  const detailResponse = await page.request.get(`${app.url}api/reviews/${review.id}`);
  expect(detailResponse.status()).toBe(200);
  const detail = await detailResponse.json();
  expect(detail.stale).toBe(true);
  expect(detail.baselineAvailable).toBe(false);
  expect(detail.baselineRecorded).toBe(false);
  expect(detail.files).toEqual([]);
  expect(JSON.stringify(detail)).not.toContain('PREVIOUSLY_VISIBLE_REVIEW_SECRET');
  await open(page);
  await navigate(page, '人工审阅');
  await expect(page.locator('.review-history-banner')).toContainText('历史提交');
  await expect(page.locator('.review-missing-baseline')).toContainText('没有可信的代码前后对比');
  await expect(page.locator('.review-detail')).not.toContainText('Ignored files are not exposed');
  await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '要求修改', exact: true })).toBeEnabled();
  await expect(page.locator('.review-detail')).toContainText('历史记录 · 缺少可信基线');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('textbox', { name: '审阅意见' })
    .fill('旧交付缺少可验证源码基线，请重新提交当前版本');
  await page.getByRole('button', { name: '要求修改', exact: true }).click();
  await expect(page.locator('.resolved-review')).toContainText('要求修改');
  expect(
    workspace.dispatch('snapshot').tasks.find((item: { id: string }) => item.id === task.id)
      ?.status,
  ).toBe('todo');
});

test('current Review with a newly ignored file still shows permitted Diff and blocks approval', async ({
  page,
}) => {
  const shared = 'packages/common/src/statistics.js';
  const task = workspace.dispatch(
    'task_create',
    {
      title: 'Review scoped changes with a later excluded file',
      paths: [feature, shared],
    },
    human,
  ).task;
  const claim = workspace.dispatch('task_claim', { taskId: task.id, agentId: 'scope-agent' }).claim;
  fs.writeFileSync(
    path.join(root, feature),
    sourceBefore.replace('return values.length;', 'return values.length + 1;'),
  );
  fs.writeFileSync(
    path.join(root, shared),
    '// DO_NOT_DISCLOSE_OLD_REVIEW_CONTENT\nexport const summarize = () => 0;\n',
  );
  const review = workspace.dispatch('review_submit', {
    taskId: task.id,
    agentId: claim.agentId,
    token: claim.token,
    summary: 'Review before source visibility changed',
  }).review;
  fs.writeFileSync(path.join(root, '.gitignore'), `.taskvision/\n${shared}\n`);
  const response = await page.request.get(`${app.url}api/reviews/${review.id}`);
  expect(response.status()).toBe(200);
  const detail = await response.json();
  expect(detail.baselineRecorded).toBe(true);
  expect(detail.baselineAvailable).toBe(false);
  expect(detail.excludedFileCount).toBe(1);
  expect(detail.files.map((item: { path: string }) => item.path)).toEqual([feature]);
  expect(JSON.stringify(detail)).not.toContain('DO_NOT_DISCLOSE_OLD_REVIEW_CONTENT');
  await open(page);
  await navigate(page, '人工审阅');
  await expect(page.locator('.diff-code')).toContainText('return values.length + 1;');
  await expect(page.locator('.review-detail')).toContainText('1 项历史文件');
  await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '要求修改', exact: true })).toBeEnabled();
});

test('nested checkout Review has a valid root-scope baseline and can be accepted by a human', async ({ page }) => {
  const nestedRoot = path.join(root, 'packages/common');
  const nested = createWorkspace(nestedRoot);
  const nestedApp = await startServer({ root: nestedRoot, port: 0, publicRoot: path.resolve('workspace/public') });
  try {
    const task = workspace.dispatch('task_create', { title: 'Nested workspace Review', paths: ['packages/common'] }, human).task;
    const claim = nested.dispatch('task_claim', { taskId: task.id, agentId: 'nested-agent' }).claim;
    fs.appendFileSync(path.join(nestedRoot, 'src/statistics.js'), '\n// REVIEW: Updated reusable logic\n');
    const review = nested.dispatch('review_submit', {
      taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Nested checkout change',
    }).review;
    expect(review.paths).toEqual(['']);
    await page.goto(nestedApp.url);
    await navigate(page, '人工审阅');
    await expect(page.locator('.diff-code')).toContainText('Updated reusable logic');
    await expect(page.locator('.review-history-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '人工验收通过', exact: true }).click();
    await expect(page.locator('.resolved-review')).toContainText('已验收');
    expect(workspace.dispatch('snapshot').tasks.find((item: { id: string }) => item.id === task.id)?.status).toBe('done');
  } finally {
    await nestedApp.close();
    nested.close();
  }
});

test('approval in an already-open Review is rejected when a deleted baseline path becomes ignored', async ({ page }) => {
  const retired = 'packages/common/src/retired.js';
  fs.writeFileSync(path.join(root, retired), '// Reviewed before deletion\nexport const retired = 1;\n');
  const task = workspace.dispatch('task_create', { title: 'Review removal of old code', paths: ['packages/common'] }, human).task;
  const claim = workspace.dispatch('task_claim', { taskId: task.id, agentId: 'remove-agent' }).claim;
  fs.unlinkSync(path.join(root, retired));
  const review = workspace.dispatch('review_submit', {
    taskId: task.id, agentId: claim.agentId, token: claim.token, summary: 'Deleted retired module',
  }).review;
  await open(page);
  await navigate(page, '人工审阅');
  await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeEnabled();
  fs.writeFileSync(path.join(root, '.gitignore'), `.taskvision/\n${retired}\n`);
  // The button may still look enabled until polling/revalidation. The server
  // must independently block the mutation based on the historical baseline.
  await page.getByRole('button', { name: '人工验收通过', exact: true }).click();
  await expect(page.locator('.review-detail')).toContainText('当前源码或安全可读范围已变化');
  expect(workspace.dispatch('snapshot').reviews.find((item: { id: string }) => item.id === review.id)?.status).toBe('pending');
  await page.reload();
  await navigate(page, '人工审阅');
  await expect(page.getByRole('button', { name: '人工验收通过', exact: true })).toBeDisabled();
  await expect(page.locator('.review-detail')).toContainText('1 项历史文件');
});
