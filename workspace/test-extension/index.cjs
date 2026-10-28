const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 3000 }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject); request.on('timeout', () => request.destroy(new Error('HTTP timeout')));
  });
}
async function withDeadline(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), 10000); })
    ]);
  } finally { clearTimeout(timer); }
}

// Exercise the installed command's real QuickPick with native workbench actions.
// Retry the harmless accept/close command while the picker mounts; no production
// API replacement, command arguments or settings are needed to steer the picker.
async function driveQuickActions(accept, command = 'taskvision.quickActions') {
  let settled = false;
  const result = vscode.commands.executeCommand(command);
  const observed = result.then(value => { settled = true; return value; }, error => { settled = true; throw error; });
  const driver = (async () => {
    for (let attempt = 0; !settled && attempt < 30; attempt++) {
      await delay(100);
      if (!settled) await vscode.commands.executeCommand(accept
        ? 'workbench.action.acceptSelectedQuickOpenItem'
        : 'workbench.action.closeQuickOpen');
    }
  })();
  try { return await withDeadline(observed, 'TaskVision Quick Actions'); }
  finally { settled = true; await driver; }
}
exports.run = async function () {
  const extension = vscode.extensions.all.find(entry => entry.id.toLowerCase() === 'a-znk.taskvision');
  assert.ok(extension, 'installed preview exists');
  await extension.activate();
  assert.ok(extension.isActive);
  const expectedVersion = process.env.TASKVISION_EXPECTED_VERSION || require('../../package.json').version;
  assert.equal(extension.packageJSON.version, expectedVersion);
  const commands = await vscode.commands.getCommands(true);
  const required = ['openWorkspace', 'stopWorkspace', 'copyMcpConfig', 'enableKnowledgeTags', 'exportAiContext', 'syncDataModel', 'setTaskStatus', 'refresh', 'quickActions', 'gettingStarted', 'configureAppearanceAndWorkspace'];
  for (const name of required) assert.ok(commands.includes('taskvision.' + name), name);
  const titleMenu = extension.packageJSON.contributes.menus['view/title'];
  assert.deepEqual(titleMenu.filter(item => /^navigation(?:@|$)/.test(item.group))
    .sort((a, b) => a.group.localeCompare(b.group)).map(item => item.command),
    ['taskvision.openWorkspace', 'taskvision.refresh', 'taskvision.quickActions']);
  const beforeSettings = JSON.stringify(vscode.workspace.getConfiguration('taskvision'));
  await vscode.commands.executeCommand('taskvision.configureAppearanceAndWorkspace');
  assert.equal(JSON.stringify(vscode.workspace.getConfiguration('taskvision')), beforeSettings, 'opening native Settings never writes preferences');
  assert.ok(vscode.window.tabGroups.all.some(group => group.tabs.some(tab => /settings|设置/i.test(tab.label))), 'native Settings tab opened');
  assert.equal(await driveQuickActions(false), undefined, 'cancel real Quick Actions without dispatching');
  assert.equal(await driveQuickActions(false, 'taskvision.gettingStarted'), undefined, 'cancel real Getting Started without changing settings');
  assert.equal(JSON.stringify(vscode.workspace.getConfiguration('taskvision')), beforeSettings, 'cancelling Quick Actions preserves settings');
  const config = vscode.workspace.getConfiguration('taskvision.general');
  const beforeHighlights = JSON.stringify(vscode.workspace.getConfiguration('taskvision.highlights').get('customHighlight'));
  await config.update('tags', ['TODO', 'CUSTOM'], vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('taskvision.enableKnowledgeTags');
  const tags = vscode.workspace.getConfiguration('taskvision.general').get('tags');
  for (const tag of ['TODO', 'CUSTOM', 'CORE', 'REUSE', 'INTENT', 'REVIEW']) assert.ok(tags.includes(tag), tag);
  assert.equal(JSON.stringify(vscode.workspace.getConfiguration('taskvision.highlights').get('customHighlight')), beforeHighlights, 'custom highlight channels preserved when enabling tags');
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const document = await vscode.workspace.openTextDocument(path.join(folder, 'sample.ts'));
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('taskvision.refresh');
  await delay(400);
  const originalClipboard = await vscode.env.clipboard.readText();
  try {
    await vscode.commands.executeCommand('taskvision.copyMcpConfig');
    const copied = JSON.parse(await vscode.env.clipboard.readText());
    assert.equal(copied.mcpServers.taskvision.args.at(-1), folder);
    assert.ok(copied.mcpServers.taskvision.args[0].endsWith('mcp.bundle.mjs'));
  } finally { await vscode.env.clipboard.writeText(originalClipboard); }
  const url = await vscode.commands.executeCommand('taskvision.openWorkspace');
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/, 'real service returns its loopback URL');
  const response = await get(url + 'api/snapshot');
  assert.equal(response.status, 200);
  const snapshot = JSON.parse(response.body);
  assert.ok(snapshot.annotations.some(annotation => annotation.tag === 'CORE'));
  assert.ok(snapshot.annotations.some(annotation => annotation.tag === 'REUSE'));
  const web = await get(url);
  assert.equal(web.status, 200);
  assert.match(web.body, /assets\//, 'installed React bundle is served');
  const quickUrl = await driveQuickActions(true);
  assert.equal(quickUrl, url, 'first real Quick Action opens the same running knowledge workspace');
  assert.equal((await get(quickUrl + 'api/snapshot')).status, 200, 'Quick Action reaches a working service');
  await vscode.commands.executeCommand('taskvision.stopWorkspace');
  let stopped = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await get(url + 'api/snapshot'); await delay(100); }
    catch { stopped = true; break; }
  }
  assert.ok(stopped, 'stop command terminates the service owned by the extension');
  const result = { passed: true, locale: vscode.env.language, extensionVersion: extension.packageJSON.version, active: extension.isActive, registeredCommands: required, enabledTags: tags, workspaceTrusted: vscode.workspace.isTrusted, realEditorOpened: true, nativeSettingsOpenedWithoutMutation: true, realQuickActionsCancelledAndOpenedWorkspace: true, customHighlightChannelsPreserved: true, mcpConfigCopiedAndClipboardRestored: true, realWorkspaceHttp: response.status, packagedWebHttp: web.status, serviceStopped: stopped };
  fs.writeFileSync(process.env.TASKVISION_EHOST_RESULTS, JSON.stringify(result, null, 2));
  console.log('TASKVISION_EXTENSION_HOST_PASS ' + JSON.stringify(result));
};
