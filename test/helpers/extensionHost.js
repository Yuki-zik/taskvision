const fs = require('fs');
const Module = require('module');
const path = require('path');
const { EventEmitter } = require('events');

function createHost(overrides = {}) {
    const defaults = {};
    const contributions = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).contributes.configuration;
    contributions.forEach(group => Object.entries(group.properties).forEach(([key, definition]) => {
        defaults[key] = definition.default;
    }));
    Object.assign(defaults, overrides.settings || {});
    const commands = new Map(), updates = [], messages = [], logs = [];
    const disposables = [];
    const disposable = () => { const value = { dispose() {} }; disposables.push(value); return value; };
    const listeners = {};
    const state = (initial = {}) => ({get(key, fallback) { return key in initial ? initial[key] : fallback; }, update(key, value) { initial[key] = value; return Promise.resolve(); }});
    const context = {
        extensionPath: path.resolve(__dirname, '../..'),
        subscriptions: [],
        workspaceState: state(overrides.workspaceState),
        globalState: state({ migratedVersion: 2000 }),
        globalStorageUri: { fsPath: '/tmp/taskvision-test-icons' },
        asAbsolutePath(file) { return path.resolve(this.extensionPath, file); }
    };
    const workspace = {
        isTrusted: true,
        workspaceFolders: [{name: 'project', uri: {scheme: 'file', fsPath: '/tmp/taskvision-project'}}],
        getConfiguration(section) {
            return {
                get(key, fallback) {
                    const full = section + '.' + key;
                    if (full in defaults) return defaults[full];
                    if (full === 'taskvision.tree.buttons') return {};
                    return fallback;
                },
                inspect() { return {}; },
                update(key, value, target) { updates.push({section, key, value, target}); defaults[section + '.' + key] = value; return Promise.resolve(); }
            };
        },
        registerTextDocumentContentProvider: disposable,
        createFileSystemWatcher() { return {dispose() {}, onDidCreate: disposable, onDidChange: disposable, onDidDelete: disposable}; },
    };
    ['onDidSaveTextDocument','onDidCloseTextDocument','onDidOpenTextDocument','onDidChangeConfiguration','onDidChangeTextDocument','onDidChangeWorkspaceFolders'].forEach(name => {
        workspace[name] = callback => { listeners[name] = callback; return disposable(); };
    });
    const window = {
        visibleTextEditors: [],
        activeTextEditor: undefined,
        createOutputChannel() { return {appendLine(message) { logs.push(message); }, dispose() {}}; },
        createStatusBarItem() { return {show() {}, hide() {}, dispose() {}}; },
        createTreeView(_name, options) { return {title: 'TaskVision', provider: options.treeDataProvider, onDidExpandElement: disposable, onDidCollapseElement: disposable, dispose() {}}; },
        showInformationMessage(message) { messages.push(message); return Promise.resolve(); },
        showWarningMessage(message) { messages.push(message); return Promise.resolve(); },
        showErrorMessage(message) { messages.push(message); return Promise.resolve(); },
        showQuickPick(items) {
            const choice = (overrides.picks || []).shift();
            return Promise.resolve(items.find(item => item.value === choice || item.label === choice));
        },
        onDidChangeVisibleTextEditors: disposable,
        onDidChangeActiveTextEditor: disposable,
    };
    class HostEmitter {
        constructor() { this.emitter = new EventEmitter(); this.event = callback => { this.emitter.on('change', callback); return disposable(); }; }
        fire(value) { this.emitter.emit('change', value); }
        dispose() { this.emitter.removeAllListeners(); }
    }
    const vscode = {
        workspace, window,
        env: {appRoot: '/tmp/taskvision-host', language: 'en', clipboard: {writeText: async () => {}}},
        commands: {registerCommand(name, handler) { commands.set(name, handler); return disposable(); }, executeCommand() { return Promise.resolve(); }},
        ConfigurationTarget: {Global: 1, Workspace: 2, WorkspaceFolder: 3},
        StatusBarAlignment: {Left: 1},
        EventEmitter: HostEmitter,
        Uri: {file(fsPath) { return {fsPath, path: fsPath, scheme: 'file', toString() { return 'file://' + fsPath; }}; }, parse(value) { return {toString() {return value;}}; }},
        TreeItem: class {constructor(label) {this.label = label;}},
        ThemeIcon: class {constructor(id) {this.id = id;}},
        TreeItemCollapsibleState: {None: 0, Collapsed: 1, Expanded: 2}
    };
    if ('workspaceFolders' in overrides) workspace.workspaceFolders = overrides.workspaceFolders;
    return {vscode, context, commands, updates, messages, logs, listeners};
}

function withHost(host, action) {
    const load = Module._load;
    const interval = global.setInterval;
    const timers = [];
    global.setInterval = function () { const timer = interval.apply(this, arguments); timers.push(timer); return timer; };
    const root = path.resolve(__dirname, '../../out/legacy/src') + path.sep;
    const clear = () => Object.keys(require.cache).filter(key => key.startsWith(root)).forEach(key => delete require.cache[key]);
    clear();
    Module._load = function (request) { return request === 'vscode' ? host.vscode : load.apply(this, arguments); };
    let result;
    try { result = action(name => require(path.join(root, name + '.js'))); }
    catch (error) { Module._load = load; global.setInterval = interval; timers.forEach(clearInterval); clear(); throw error; }
    return Promise.resolve(result).finally(() => {
        host.context.subscriptions.slice().reverse().forEach(item => item.dispose());
        Module._load = load;
        global.setInterval = interval;
        timers.forEach(clearInterval);
        clear();
    });
}

module.exports = {createHost, withHost};
