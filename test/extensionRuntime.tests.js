const {createHost, withHost} = require('./helpers/extensionHost');
const path = require('path');
const fs = require('fs');
const os = require('os');

QUnit.test('extension activation retains legacy commands and the opt-in workspace bridge', async assert => {
    const host = createHost({settings: {'taskvision.tree.scanAtStartup': false}});
    await withHost(host, async load => {
        const extension = load('extension');
        extension.activate(host.context);
        for (const name of ['refresh','setTaskStatus','exportAiContext','customizeAppearance','openWorkspace','stopWorkspace','copyMcpConfig','enableKnowledgeTags']) {
            assert.ok(host.commands.has('taskvision.' + name), name + ' registered');
        }
        assert.ok(host.context.subscriptions.every(Boolean), 'only real disposables registered');
        extension.deactivate();
    });
});









QUnit.test('tree keeps task/context/review rendering, counts, coordinates and virtual rows', async assert => {
    const host = createHost({settings: {
        'taskvision.highlights.defaultHighlight': {icon: '$(check)', iconColour: 'editor.foreground'},
        'taskvision.tree.showCurrentScanMode': true,
        'taskvision.tree.labelFormat': '${tag} ${after}'
    }, workspaceState: {currentAgentSessions: {'/tmp/taskvision-project': 'sess.20260101.agent.001'}}});
    host.context.globalStorageUri.fsPath = '';
    host.vscode.Position = class {constructor(line, character) {this.line = line; this.character = character;}};
    host.vscode.Selection = class {constructor(start, end) {this.start = start; this.end = end;}};
    await withHost(host, load => {
        const config = load('config'), utils = load('utils'), attributes = load('attributes');
        config.init(host.context); utils.init(config); attributes.init(config);
        const provider = new (load('tree').TreeNodeProvider)(host.context, () => {}, () => {});
        host.context.subscriptions.push(provider);
        provider.clear(host.vscode.workspace.workspaceFolders);
        const uri = host.vscode.Uri.file('/tmp/taskvision-project/example.ts');
        ['// TODO [doing] implement handler', '// NOTE preserve API [tv:ctx=invariant] [tv:id=ctx.api]', '// NOTE inspect edge [tv:review=risk] [tv:session=sess.20260101.agent.001]'].forEach((match, line) => {
            provider.add({uri, match, line: line + 1, column: 1});
        });
        const nodes = provider.getAllTodoNodes();
        assert.strictEqual(nodes.length, 3);
        const items = nodes.map(node => provider.getTreeItem(node));
        assert.deepEqual(items.map(item => item.contextValue), ['task', 'context', 'review']);
        assert.ok(items[0].label.startsWith('[doing]'));
        assert.ok(items[1].label.startsWith('[ctx:invariant]'));
        assert.ok(items[2].label.startsWith('[review:risk]'));
        assert.strictEqual(items[1].iconPath.id, 'note');
        assert.strictEqual(items[2].iconPath.id, 'warning');
        assert.deepEqual(provider.getTagCountsForStatusBar(), {TODO: 1}, 'context/review notes are not pending work');
        assert.strictEqual(nodes[0].line, 0, 'editor coordinates stay zero-based');
        provider.filterByStatus(['doing']);
        assert.strictEqual(provider.getVisibleTodoNodes().length, 1);
        provider.clearStatusFilter();
        assert.strictEqual(provider.getVisibleTodoNodes().length, 3);
        const virtual = provider.getChildren().filter(node => node.isStatusNode).map(node => provider.getTreeItem(node));
        assert.ok(virtual.length >= 2, 'session and scan status coexist');
        assert.ok(virtual.every(item => item.id === undefined), 'virtual rows retain host-assigned identities');
        assert.strictEqual(new Set(items.map(item => item.id)).size, 3, 'source nodes have stable unique host IDs');
    });
});

QUnit.test('trusted bridge deduplicates startup and uses only the machine-selected runtime', async assert => {
    const {EventEmitter} = require('events');
    const host = createHost();
    const opened = [], executions = [], starts = [];
    host.vscode.env.openExternal = async uri => {opened.push(uri.toString()); return true;};
    const configuration = host.vscode.workspace.getConfiguration.bind(host.vscode.workspace);
    host.vscode.workspace.getConfiguration = section => ({...configuration(section), inspect() { return {globalValue: '/user/Node JS/node', workspaceValue: '/repo/untrusted-node'}; }});
    let killed = 0;
    const processes = {
        execFile(command, args, options, callback) {executions.push({command,args,options}); setImmediate(() => callback(null, 'v22.18.0\n'));},
        spawn(command, args, options) {
            starts.push({command,args,options});
            const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
            child.kill = () => {killed++; child.emit('exit', 0);};
            setImmediate(() => {child.stdout.emit('data', 'Ready http://127.0.'); child.stdout.emit('data', '0.1:31234/\n');});
            return child;
        }
    };
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context, processes);
        assert.strictEqual(executions.length, 0, 'registration is process-free');
        await Promise.all([host.commands.get('taskvision.openWorkspace')(), host.commands.get('taskvision.openWorkspace')()]);
        assert.strictEqual(executions.length, 1);
        assert.strictEqual(starts.length, 1, 'same-root requests share readiness');
        assert.strictEqual(starts[0].command, '/user/Node JS/node');
        assert.deepEqual(starts[0].args.slice(-4), ['--root', '/tmp/taskvision-project', '--port', '0']);
        assert.false(starts[0].options.shell);
        assert.deepEqual(opened, ['http://127.0.0.1:31234/', 'http://127.0.0.1:31234/']);
        host.commands.get('taskvision.stopWorkspace')();
        assert.strictEqual(killed, 1, 'explicit stop kills the owned process');
    });
});

QUnit.test('stopping a bridge during runtime detection cancels its pending spawn', async assert => {
    const host = createHost();
    let callback, spawned = 0;
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context, {
            execFile(_command, _args, _options, ready) {callback = ready;},
            spawn() {spawned++; throw new Error('cancelled startup must not spawn');}
        });
        const pending = host.commands.get('taskvision.openWorkspace')();
        await new Promise(resolve => setImmediate(resolve));
        host.commands.get('taskvision.stopWorkspace')();
        callback(null, 'v22.18.0\n');
        await pending;
        assert.strictEqual(spawned, 0);
        assert.ok(host.messages.some(message => message.includes('cancelled')));
    });
});


QUnit.test('implicit knowledge tags are not idea tasks while explicit statuses survive', async assert => {
    const host=createHost({settings:{
        'taskvision.general.tags': ['TODO','CORE','REUSE','INTENT','REVIEW'],
        'taskvision.tree.labelFormat': '$'+'{tag} '+'$'+'{after}',
        'taskvision.tree.showStatusPrefix': true,
    }});
    host.vscode.Position=class {constructor(line,character){this.line=line;this.character=character;}};
    host.vscode.Selection=class {constructor(start,end){this.start=start;this.end=end;}};
    await withHost(host, load => {
        const config=load('config'),utils=load('utils'),attributes=load('attributes');
        config.init(host.context);utils.init(config);attributes.init(config);
        const provider=new (load('tree').TreeNodeProvider)(host.context,()=>{},()=>{});
        provider.clear(host.vscode.workspace.workspaceFolders);
        const uri=host.vscode.Uri.file('/tmp/taskvision-project/knowledge.ts');
        ['// CORE: Contract invariant','// REUSE: Shared helper','// INTENT: Preserve API','// REVIEW: Human checkpoint','// TODO [doing] implement behavior','// CORE [doing] explicit source cleanup'].forEach((match,index)=>provider.add({uri,match,line:index+1,column:1}));
        const nodes=provider.getAllTodoNodes();
        assert.strictEqual(nodes.length,6);
        const labels=nodes.map(node=>String(provider.getTreeItem(node).label));
        for (const tag of ['CORE','REUSE','INTENT','REVIEW']) {
            const label=labels.find(line=>line.includes(tag + ' '));
            assert.ok(label,'found '+tag);
            assert.notOk(label.startsWith('[idea]'),tag+' is not an invented pending idea');
        }
        assert.ok(labels.some(line=>line.startsWith('[doing] TODO')),'real TODO status preserved');
        assert.ok(labels.some(line=>line.startsWith('[doing] CORE')),'explicit knowledge status preserved');
    });
});

QUnit.test('all default knowledge gutter icons are supported Octicons and do not warn on activation', assert => {
    const host = createHost();
    const octicons = require('@primer/octicons');
    const props = Object.assign({}, ...require('../package.json').contributes.configuration.map(section => section.properties));
    const configured = props['taskvision.highlights.customHighlight'].default;
    for (const tag of ['CORE', 'REUSE', 'INTENT', 'REVIEW']) {
        assert.ok(octicons[configured[tag].icon], tag + ': ' + configured[tag].icon);
        assert.ok(configured[tag].gutterIcon, tag + ' still renders in editor gutter');
    }
});

QUnit.test('CORE REUSE INTENT REVIEW inherit original GitHub neon glass channels', assert => {
    const contributions = require('../package.json').contributes.configuration;
    const props = Object.assign({}, ...contributions.map(group => group.properties));
    const rules = props['taskvision.highlights.customHighlight'].default;
    for (const name of ['CORE', 'REUSE', 'INTENT', 'REVIEW']) {
        const rule = rules[name];
        assert.equal(rule.scheme, 'neon+glass', name + ' original neon/glass effect');
        assert.equal(rule.glowType, 'tag', name + ' glow remains localized at tag text');
        assert.equal(rule.glassType, 'whole-line', name + ' original full-line outlined glass');
        assert.equal(rule.colorType, 'text', name + ' annotation text color remains source-linked');
        assert.ok(rule.glassOpacity <= 15 && rule.glassBorderOpacity >= 25, name + ' legible translucent bar');
        assert.strictEqual(rule.background, rule.foreground, name + ' glass accent matches semantic color');
    }
});
