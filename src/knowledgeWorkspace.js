/* jshint esversion:8, node:true */
'use strict';

var path = require('path');
var fs = require('fs');
var childProcess = require('child_process');
var KNOWLEDGE_TAGS = ['CORE', 'REUSE', 'INTENT', 'REVIEW'];

// REUSE: The legacy extension owns decoration and task rendering. This bridge only starts the opt-in workspace.
function mergeKnowledgeTags(tags) {
    var result = Array.isArray(tags) ? tags.slice() : [];
    KNOWLEDGE_TAGS.forEach(function (tag) {
        if (!result.some(function (value) { return String(value).toUpperCase() === tag; })) result.push(tag);
    });
    return result;
}

function supportedNodeVersion(value) {
    var match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || '').trim());
    return !!match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 18));
}

function buildMcpConfig(nodePath, root, extensionPath) {
    var bundled = path.join(extensionPath, 'workspace', 'mcp.bundle.mjs');
    var entry = fs.existsSync(bundled) ? bundled : path.join(extensionPath, 'workspace', 'mcp.mjs');
    return { mcpServers: { taskvision: { command: nodePath, args: [entry, '--root', root] } } };
}

function register(vscode, context, processes) {
    var cp = processes || childProcess;
    var services = new Map();
    var output = vscode.window.createOutputChannel('TaskVision Workspace');
    var chinese = /^zh/i.test(vscode.env.language || '');
    function text(en, zh) { return chinese ? zh : en; }
    function trusted() {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(text('Trust this workspace before starting TaskVision services.', '请先信任当前工作区，再启动 TaskVision 服务。'));
            return false;
        }
        return true;
    }
    async function chooseRoot() {
        var folders = (vscode.workspace.workspaceFolders || []).filter(function (folder) { return folder.uri.scheme === 'file'; });
        if (!folders.length) {
            vscode.window.showWarningMessage(text('Open a local project folder first.', '请先打开项目文件夹。'));
            return undefined;
        }
        if (folders.length === 1) return folders[0].uri.fsPath;
        var selected = await vscode.window.showQuickPick(folders.map(function (folder) {
            return { label: folder.name, description: folder.uri.fsPath, root: folder.uri.fsPath };
        }), { placeHolder: text('Choose a project', '选择项目') });
        return selected && selected.root;
    }
    function runtime() {
        // INTENT: Executable selection is machine/user-only. A repository setting must never select an executable.
        var config = vscode.workspace.getConfiguration('taskvision');
        var inspected = config.inspect('workspace.nodePath');
        var value = inspected && (inspected.globalValue || inspected.defaultValue);
        return value || 'node';
    }
    function checkRuntime(nodePath) {
        return new Promise(function (resolve, reject) {
            cp.execFile(nodePath, ['--version'], { timeout: 5000, windowsHide: true }, function (error, stdout) {
                if (error || !supportedNodeVersion(stdout)) {
                    reject(new Error(text('TaskVision Workspace needs Node.js 22.18+. Set taskvision.workspace.nodePath in User Settings.', 'TaskVision 工作台需要 Node.js 22.18+。请在用户设置中配置 taskvision.workspace.nodePath。')));
                } else resolve();
            });
        });
    }
    function start(root) {
        if (services.has(root)) return services.get(root).ready;
        var entry = path.join(context.extensionPath, 'workspace', 'server.mjs');
        if (!fs.existsSync(entry)) return Promise.reject(new Error(text('Workspace runtime is missing. Reinstall the complete extension package.', '缺少工作台运行文件，请安装完整的插件包。')));
        var record = { child: undefined, ready: undefined, cancelled: false };
        function removeRecord() { if (services.get(root) === record) services.delete(root); }
        record.ready = checkRuntime(runtime()).then(function () {
            if (record.cancelled) throw new Error(text('Workspace startup was cancelled.', '工作台启动已取消。'));
            return new Promise(function (resolve, reject) {
                var child = cp.spawn(runtime(), [entry, '--root', root, '--port', '0'], {
                    cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
                });
                record.child = child;
                var settled = false, received = '';
                var timeout = setTimeout(function () {
                    if (settled) return;
                    settled = true;
                    child.kill();
                    removeRecord();
                    reject(new Error(text('TaskVision service did not become ready. See the TaskVision Workspace output.', 'TaskVision 服务启动失败，请查看 TaskVision Workspace 输出。')));
                }, 20000);
                function receive(data) {
                    var value = String(data);
                    output.appendLine(value.trim());
                    received = (received + value).slice(-8192);
                    var match = /http:\/\/127\.0\.0\.1:(\d{1,5})(?:\/|\b)/.exec(received);
                    if (!settled && match && Number(match[1]) > 0 && Number(match[1]) <= 65535) {
                        settled = true;
                        clearTimeout(timeout);
                        resolve('http://127.0.0.1:' + match[1] + '/');
                    }
                }
                child.stdout.on('data', receive);
                child.stderr.on('data', receive);
                child.on('error', function (error) {
                    clearTimeout(timeout); removeRecord();
                    if (!settled) { settled = true; reject(error); }
                });
                child.on('exit', function (code) {
                    clearTimeout(timeout); removeRecord();
                    if (!settled) { settled = true; reject(new Error('TaskVision service exited (' + code + ').')); }
                });
            });
        }).catch(function (error) { removeRecord(); throw error; });
        services.set(root, record);
        return record.ready;
    }
    async function openWorkspace() {
        if (!trusted()) return;
        var root = await chooseRoot();
        if (!root) return;
        try {
            var url = await start(root);
            var uri = vscode.Uri.parse(url);
            if (vscode.env.asExternalUri) uri = await vscode.env.asExternalUri(uri);
            await vscode.env.openExternal(uri);
        } catch (error) { vscode.window.showErrorMessage(String(error.message || error)); }
    }
    function stopAll() {
        services.forEach(function (record) { record.cancelled = true; if (record.child) record.child.kill(); });
        services.clear();
    }
    async function copyMcpConfig() {
        if (!trusted()) return;
        var root = await chooseRoot();
        if (!root) return;
        await vscode.env.clipboard.writeText(JSON.stringify(buildMcpConfig(runtime(), root, context.extensionPath), null, 2));
        vscode.window.showInformationMessage(text('TaskVision MCP configuration copied. No global agent configuration was changed.', 'TaskVision MCP 配置已复制，未修改全局 Agent 配置。'));
    }
    async function enableKnowledgeTags() {
        if (!trusted()) return;
        var config = vscode.workspace.getConfiguration('taskvision.general');
        var tags = mergeKnowledgeTags(config.get('tags', []));
        await config.update('tags', tags, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(text('CORE, REUSE, INTENT and REVIEW are enabled; custom tags were preserved.', '已启用 CORE、REUSE、INTENT、REVIEW，原有自定义标签保持不变。'));
    }
    [['openWorkspace', openWorkspace], ['stopWorkspace', stopAll], ['copyMcpConfig', copyMcpConfig], ['enableKnowledgeTags', enableKnowledgeTags]].forEach(function (entry) {
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.' + entry[0], entry[1]));
    });
    var disposable = { dispose: function () { stopAll(); output.dispose(); } };
    context.subscriptions.push(disposable);
    return disposable;
}

module.exports.register = register;
module.exports.mergeKnowledgeTags = mergeKnowledgeTags;
module.exports.supportedNodeVersion = supportedNodeVersion;
module.exports.buildMcpConfig = buildMcpConfig;
