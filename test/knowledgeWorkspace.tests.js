'use strict';
var fs = require('fs');
var path = require('path');
var parser = require('../out/legacy/src/annotationParser.js');
var state = require('../out/legacy/src/taskState.js');

QUnit.test('knowledge tags use the existing semantic annotation model', function (assert) {
    [['CORE', 'context', 'entrypoint'], ['REUSE', 'context', 'reusable'], ['INTENT', 'context', 'constraint']].forEach(function (entry) {
        var parsed = parser.parseDirectives('Keep the original training loop', entry[0]);
        assert.strictEqual(parsed.annotationKind, entry[1], entry[0] + ' is context');
        assert.strictEqual(parsed.contextKind, entry[2], entry[0] + ' has a semantic kind');
        assert.strictEqual(state.defaultStatusForTag(entry[0]), 'idea', entry[0] + ' is not a pending task');
    });
    var review = parser.parseDirectives('Check negative rounding boundaries', 'REVIEW');
    assert.strictEqual(review.annotationKind, 'review');
    assert.strictEqual(review.reviewKind, 'verify');
    assert.strictEqual(state.defaultStatusForTag('REVIEW'), 'review');
});

QUnit.test('explicit directives override semantic defaults without losing stable IDs', function (assert) {
    var parsed = parser.parseDirectives('Training contract [tv:ctx=invariant] [tv:id=ctx.training]', 'CORE');
    assert.strictEqual(parsed.contextKind, 'invariant');
    assert.strictEqual(parsed.stableId, 'ctx.training');
    assert.strictEqual(parsed.trimmedText, 'Training contract');
    assert.strictEqual(parser.parseDirectives('ordinary task', 'TODO').annotationKind, 'task');
});

QUnit.test('knowledge tags and opt-in workspace commands are contributed', function (assert) {
    var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var settings = Object.assign.apply(Object, [{}].concat(pkg.contributes.configuration.map(function (x) { return x.properties; })));
    ['CORE', 'REUSE', 'INTENT', 'REVIEW'].forEach(function (tag) {
        assert.ok(settings['taskvision.general.tags'].default.indexOf(tag) >= 0, tag);
    });
    ['openWorkspace', 'stopWorkspace', 'copyMcpConfig', 'enableKnowledgeTags'].forEach(function (name) {
        assert.ok(pkg.contributes.commands.some(function (c) { return c.command === 'taskvision.' + name; }), name);
    });
    assert.strictEqual(settings['taskvision.workspace.nodePath'].scope, 'machine');
});

QUnit.test('workspace helpers keep MCP process arguments separate and validate runtime', function (assert) {
    var bridge = require('../out/legacy/src/knowledgeWorkspace.js');
    assert.ok(bridge.supportedNodeVersion('v22.22.0'));
    assert.ok(bridge.supportedNodeVersion('v24.1.0'));
    assert.notOk(bridge.supportedNodeVersion('v22.17.0'));
    assert.notOk(bridge.supportedNodeVersion('v20.19.0'));
    assert.notOk(bridge.supportedNodeVersion('bad-version'));
    var config = bridge.buildMcpConfig('/Applications/Node JS/node', '/tmp/project space', '/tmp/extension space');
    assert.strictEqual(config.mcpServers.taskvision.command, '/Applications/Node JS/node');
    assert.deepEqual(config.mcpServers.taskvision.args.slice(-2), ['--root', '/tmp/project space']);
    assert.ok(config.mcpServers.taskvision.args[0].indexOf(path.join('/tmp/extension space', 'workspace') + path.sep) === 0);
    assert.deepEqual(bridge.mergeKnowledgeTags(['TODO', 'core', 'CUSTOM']), ['TODO', 'core', 'CUSTOM', 'REUSE', 'INTENT', 'REVIEW']);
});

QUnit.test('workspace bridge registers without spawning and rejects an untrusted workspace', function (assert) {
    var done = assert.async();
    var bridge = require('../out/legacy/src/knowledgeWorkspace.js');
    var commands = {}, messages = [], calls = 0;
    var vscode = {
        env: { language: 'en' },
        commands: { registerCommand: function (name, handler) { commands[name] = handler; return { dispose: function () {} }; } },
        workspace: { isTrusted: false, workspaceFolders: [{ name: 'sample', uri: { scheme: 'file', fsPath: '/tmp/sample' } }] },
        window: { showWarningMessage: function (message) { messages.push(message); }, showErrorMessage: function (message) { messages.push(message); }, createOutputChannel: function () { return { appendLine: function () {}, dispose: function () {} }; } }
    };
    var context = { extensionPath: '/tmp/extension', subscriptions: [] };
    bridge.register(vscode, context, { spawn: function () { calls += 1; }, execFile: function () { calls += 1; } });
    assert.strictEqual(calls, 0, 'activation must not execute project code or start services');
    Promise.resolve(commands['taskvision.openWorkspace']()).then(function () {
        assert.strictEqual(calls, 0, 'trust rejection occurs before subprocess execution');
        assert.ok(messages.length > 0, 'user gets a trust explanation');
        done();
    }).catch(function (error) { assert.notOk(error, String(error)); done(); });
});

QUnit.test('extension disposal does not register an undefined optional output channel', function (assert) {
    var source = fs.readFileSync('src/extension.ts', 'utf8');
    assert.notOk(source.includes('context.subscriptions.push(outputChannel);'));
    assert.ok(source.includes('if (outputChannel) { outputChannel.dispose(); outputChannel = undefined; }'));
    var treeSource = fs.readFileSync('src/tree.ts', 'utf8');
    assert.ok(treeSource.includes('    dispose() {'));
    assert.ok(treeSource.includes('this._onDidChangeTreeData.dispose();'));
});
