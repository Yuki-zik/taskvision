import {errorMessage} from './validation';
interface Service {child?: childProcess.ChildProcess; ready: Promise<string>; cancelled: boolean}

import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
const KNOWLEDGE_TAGS = ['CORE', 'REUSE', 'INTENT', 'REVIEW'];

// REUSE: The legacy extension owns decoration and task rendering. This bridge only starts the opt-in workspace.
function mergeKnowledgeTags(tags: unknown) {
    const result: unknown[] = Array.isArray(tags) ? tags.slice() : [];
    KNOWLEDGE_TAGS.forEach(function (tag) {
        if (!result.some(function (value) { return String(value).toUpperCase() === tag; })) result.push(tag);
    });
    return result;
}

function supportedNodeVersion(value: unknown) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || '').trim());
    return !!match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 18));
}

function buildMcpConfig(nodePath: string, root: string, extensionPath: string) {
    const bundled = path.join(extensionPath, 'workspace', 'mcp.bundle.mjs');
    const entry = fs.existsSync(bundled) ? bundled : path.join(extensionPath, 'workspace', 'mcp.mjs');
    return { mcpServers: { taskvision: { command: nodePath, args: [entry, '--root', root] } } };
}

function register(vscode: typeof import("vscode"), context: import("vscode").ExtensionContext, processes?: typeof childProcess) {
    const cp = processes || childProcess;
    const services = new Map<string, Service>();
    const output = vscode.window.createOutputChannel('TaskVision Workspace');
    const chinese = /^zh/i.test(vscode.env.language || '');
    function text(en: string, zh: string) { return chinese ? zh : en; }
    function trusted() {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(text('Trust this workspace before starting TaskVision services.', '请先信任当前工作区，再启动 TaskVision 服务。'));
            return false;
        }
        return true;
    }
    async function chooseRoot() {
        const folders = (vscode.workspace.workspaceFolders || []).filter(function (folder) { return folder.uri.scheme === 'file'; });
        if (!folders.length) {
            vscode.window.showWarningMessage(text('Open a local project folder first.', '请先打开项目文件夹。'));
            return undefined;
        }
        if (folders.length === 1) return folders[0].uri.fsPath;
        const selected = await vscode.window.showQuickPick(folders.map(function (folder) {
            return { label: folder.name, description: folder.uri.fsPath, root: folder.uri.fsPath };
        }), { placeHolder: text('Choose a project', '选择项目') });
        return selected && selected.root;
    }
    function runtime() {
        // INTENT: Executable selection is machine/user-only. A repository setting must never select an executable.
        const config = vscode.workspace.getConfiguration('taskvision');
        const inspected = config.inspect<string>('workspace.nodePath');
        const value = inspected && (inspected.globalValue || inspected.defaultValue);
        return value || 'node';
    }
    function checkRuntime(nodePath: string) {
        return new Promise<void>(function (resolve, reject) {
            cp.execFile(nodePath, ['--version'], { timeout: 5000, windowsHide: true }, function (error, stdout) {
                if (error || !supportedNodeVersion(stdout)) {
                    reject(new Error(text('TaskVision Workspace needs Node.js 22.18+. Set taskvision.workspace.nodePath in User Settings.', 'TaskVision 工作台需要 Node.js 22.18+。请在用户设置中配置 taskvision.workspace.nodePath。')));
                } else resolve();
            });
        });
    }
    function start(root: string) {
        if (services.has(root)) return services.get(root)!.ready;
        const entry = path.join(context.extensionPath, 'workspace', 'server.mjs');
        if (!fs.existsSync(entry)) return Promise.reject(new Error(text('Workspace runtime is missing. Reinstall the complete extension package.', '缺少工作台运行文件，请安装完整的插件包。')));
        const record: Service = { ready: Promise.resolve(''), cancelled: false };
        function removeRecord() { if (services.get(root) === record) services.delete(root); }
        record.ready = checkRuntime(runtime()).then(function () {
            if (record.cancelled) throw new Error(text('Workspace startup was cancelled.', '工作台启动已取消。'));
            return new Promise<string>(function (resolve, reject) {
                // Read effective VS Code highlighting configuration once when
                // the user explicitly starts this trusted project service.
                // This is visual data only, never an executable path or script.
                // The browser applies supported color/glow/glass scopes using the
                // same package defaults; unresolved ThemeColor falls back safely.
                const highlightConfig = vscode.workspace.getConfiguration('taskvision.highlights', vscode.Uri.file(root));
                const effectiveStyles = {
                    customHighlight: highlightConfig.get<Record<string, unknown>>('customHighlight', {}),
                    defaultHighlight: highlightConfig.get<Record<string, unknown>>('defaultHighlight', {}),
                    enabled: highlightConfig.get<boolean>('enabled', true)
                };
                const encodedStyles = JSON.stringify(effectiveStyles);
                const environment = Object.assign({}, process.env);
                if (Buffer.byteLength(encodedStyles) < 90 * 1024) environment.TASKVISION_VSCODE_HIGHLIGHTS = encodedStyles;
                const child = cp.spawn(runtime(), [entry, '--root', root, '--port', '0'], {
                    cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
                    env: environment
                });
                record.child = child;
                let settled = false, received = '';
                const timeout = setTimeout(function () {
                    if (settled) return;
                    settled = true;
                    child.kill();
                    removeRecord();
                    reject(new Error(text('TaskVision service did not become ready. See the TaskVision Workspace output.', 'TaskVision 服务启动失败，请查看 TaskVision Workspace 输出。')));
                }, 20000);
                function receive(data: Buffer | string) {
                    const value = String(data);
                    output.appendLine(value.trim());
                    received = (received + value).slice(-8192);
                    const match = /http:\/\/127\.0\.0\.1:(\d{1,5})(?:\/|\b)/.exec(received);
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
        const root = await chooseRoot();
        if (!root) return;
        try {
            const url = await start(root);
            let uri = vscode.Uri.parse(url);
            if (vscode.env.asExternalUri) uri = await vscode.env.asExternalUri(uri);
            await vscode.env.openExternal(uri);
            return url;
        } catch (error) { vscode.window.showErrorMessage(errorMessage(error)); }
    }
    function stopAll() {
        services.forEach(function (record) { record.cancelled = true; if (record.child) record.child.kill(); });
        services.clear();
    }
    async function copyMcpConfig() {
        if (!trusted()) return;
        const root = await chooseRoot();
        if (!root) return;
        await vscode.env.clipboard.writeText(JSON.stringify(buildMcpConfig(runtime(), root, context.extensionPath), null, 2));
        vscode.window.showInformationMessage(text('TaskVision MCP configuration copied. No global agent configuration was changed.', 'TaskVision MCP 配置已复制，未修改全局 Agent 配置。'));
    }
    async function enableKnowledgeTags() {
        if (!trusted()) return;
        const config = vscode.workspace.getConfiguration('taskvision.general');
        const tags = mergeKnowledgeTags(config.get('tags', []));
        await config.update('tags', tags, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(text('CORE, REUSE, INTENT and REVIEW are enabled; custom tags were preserved.', '已启用 CORE、REUSE、INTENT、REVIEW，原有自定义标签保持不变。'));
    }
    const commands: [string, () => unknown][] = [['openWorkspace', openWorkspace], ['stopWorkspace', stopAll], ['copyMcpConfig', copyMcpConfig], ['enableKnowledgeTags', enableKnowledgeTags]];
    commands.forEach(function (entry) {
        context.subscriptions.push(vscode.commands.registerCommand('taskvision.' + entry[0], entry[1]));
    });
    const disposable = { dispose: function () { stopAll(); output.dispose(); } };
    context.subscriptions.push(disposable);
    return disposable;
}

export { register, mergeKnowledgeTags, supportedNodeVersion, buildMcpConfig };
