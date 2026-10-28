const {createHost, withHost} = require('./helpers/extensionHost');
const path = require('path');
const os = require('os');
var fs = require('fs');

function readSource(file) {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

QUnit.test("extension resolves highlight updates to workspace first", async assert => {
    for (const folders of [undefined, [{uri:{scheme:'file',fsPath:'/tmp/project'}}]]) {
      const host = createHost({workspaceFolders: folders, picks: ['glass']});
      await withHost(host, async load => {
        load('commands/appearance').registerAppearanceCommands(host.context);
        host.commands.get('taskvision.setHighlightSchemeForAllTags')();
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(host.updates.length, 2);
        assert.ok(host.updates.every(update => update.target === (folders ? 2 : 1)), 'writes go to the active scope');
      });
    }
  });

QUnit.test("extension writes customHighlight updates using resolved target", async assert => {
    const host = createHost({picks: ['glass'], settings: {'taskvision.highlights.customHighlight': {TODO:{icon:'check'},CUSTOM:{scheme:'neon'}}}});
    await withHost(host, async load => {
      load('commands/appearance').registerAppearanceCommands(host.context);
      host.commands.get('taskvision.setScheme')({tag:'TODO'});
      await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(host.updates.length,1);
      assert.strictEqual(host.updates[0].target,host.vscode.ConfigurationTarget.Workspace);
      assert.deepEqual(host.updates[0].value,{TODO:{icon:'check',scheme:'glass'},CUSTOM:{scheme:'neon'}});
    });
  });

QUnit.test("extension exposes independent color/glow/glass/font scope controls", async assert => {
    for (const channel of ['color','glow','glass','font']) {
      for (const scope of ['whole-line','inherit']) {
        const host = createHost({picks:['scope','scope-'+channel,scope],settings:{'taskvision.highlights.customHighlight':{TODO:{colorType:'tag',glowType:'tag',glassType:'tag',fontType:'tag'}}}});
        await withHost(host, async load => {
          load('commands/appearance').registerAppearanceCommands(host.context);
          host.commands.get('taskvision.customizeAppearance')({tag:'TODO'});
          await new Promise(resolve => setImmediate(resolve));
          assert.strictEqual(host.updates.length,1,channel+' updates once');
          const expected={colorType:'tag',glowType:'tag',glassType:'tag',fontType:'tag'};
          if(scope==='inherit') delete expected[channel+'Type']; else expected[channel+'Type']=scope;
          assert.deepEqual(host.updates[0].value.TODO,expected,'only selected channel changes');
        });
      }
    }
  });

QUnit.test('extension refreshes when regex and global opacity settings change', function (assert) {
    var source = readSource('src/extension.ts');

    assert.ok(source.indexOf('if (e.affectsConfiguration("taskvision.regex.regex")) {\n                    return;\n                }') === -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.foregroundOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glowOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glassOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glassBorderOpacity")') !== -1);
});

QUnit.test("extension updates font appearance in a single customHighlight write", async assert => {
    const host = createHost({picks: ['font', '$(bold) Bold'], settings: {
        'taskvision.highlights.customHighlight': {TODO: {foreground: '#123456'}, CUSTOM: {scheme: 'glass'}}
    }});
    await withHost(host, async load => {
        load('commands/appearance').registerAppearanceCommands(host.context);
        host.commands.get('taskvision.customizeAppearance')({tag: 'TODO'});
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(host.updates.length, 1, 'font change is atomic');
        assert.strictEqual(host.updates[0].target, host.vscode.ConfigurationTarget.Workspace);
        assert.deepEqual(host.updates[0].value, {TODO: {foreground: '#123456', fontWeight: 'bold', fontStyle: 'normal'}, CUSTOM: {scheme: 'glass'}});
    });
});

QUnit.test("extension registers a command to set the highlight scheme for all tags", async assert => {
    const host = createHost({workspaceFolders: undefined, picks: ['neon+glass'], settings: {
        'taskvision.highlights.customHighlight': {TODO: {colorType: 'tag'}, CUSTOM: {icon: 'check'}},
        'taskvision.highlights.defaultHighlight': {foreground: '#ff0000'}
    }});
    await withHost(host, async load => {
        load('commands/appearance').registerAppearanceCommands(host.context);
        host.commands.get('taskvision.setHighlightSchemeForAllTags')();
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(host.updates.length, 2);
        assert.ok(host.updates.every(update => update.target === host.vscode.ConfigurationTarget.Global));
        assert.deepEqual(host.updates[0].value, {TODO: {colorType: 'tag', scheme: 'neon+glass'}, CUSTOM: {icon: 'check', scheme: 'neon+glass'}});
        assert.deepEqual(host.updates[1].value, {foreground: '#ff0000', scheme: 'neon+glass'});
    });
});

QUnit.test('package contributes the set-scheme-for-all-tags command in the view title overflow menu', function (assert) {
    var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    var command = packageJson.contributes.commands.find(function (candidate) {
        return candidate.command === 'taskvision.setHighlightSchemeForAllTags';
    });
    assert.ok(command, 'command is contributed');
    assert.strictEqual(command.title, '%taskvision.command.setHighlightSchemeForAllTags.title%', 'command title uses an NLS key');

    var titleMenu = packageJson.contributes.menus['view/title'].find(function (item) {
        return item.command === 'taskvision.setHighlightSchemeForAllTags';
    });
    assert.ok(titleMenu, 'command is added to the view/title menu');
    assert.ok(titleMenu.group.indexOf('navigation') === -1, 'command is placed in the overflow menu, not the navigation bar');
});

QUnit.test('extension source accepts built-in taskvision icons during validation', function (assert) {
    var source = readSource('src/icons.ts');

    assert.ok(source.indexOf("!octicons[icon] && icon !== 'taskvision' && icon !== 'taskvision-filled'") !== -1);
});

QUnit.test('package localizes contributed command titles', function (assert) {
    var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var english = JSON.parse(fs.readFileSync('package.nls.json', 'utf8'));
    var zhCn = JSON.parse(fs.readFileSync('package.nls.zh-cn.json', 'utf8'));
    var commandIds = [
        'taskvision.filterByStatus',
        'taskvision.filterStatusClear',
        'taskvision.exportAiContext',
        'taskvision.openAiStatusReport',
        'taskvision.syncDataModel',
        'taskvision.addContextAnnotation',
        'taskvision.startAgentSession',
        'taskvision.writeAgentAnnotations',
        'taskvision.addMissingTaskStatuses',
        'taskvision.setTaskStatus',
        'taskvision.setTaskPriority',
        'taskvision.editTaskNote',
        'taskvision.setHighlightSchemeForAllTags'
    ];

    commandIds.forEach(function (commandId) {
        var command = packageJson.contributes.commands.find(function (candidate) {
            return candidate.command === commandId;
        });
        var key = command.title.replace(/^%|%$/g, '');

        assert.ok(/^%taskvision\.command\..+\.title%$/.test(command.title), commandId + ' title uses an NLS key');
        assert.ok(english[key] !== undefined, key + ' exists in package.nls.json');
        assert.ok(zhCn[key] !== undefined, key + ' exists in package.nls.zh-cn.json');
    });
});

QUnit.test('buildCodiconNames fails instead of overwriting codicons with a minimal fallback', function (assert) {
    var source = readSource('buildCodiconNames.js');

    assert.ok(source.indexOf('process.exitCode = 1') !== -1);
    assert.ok(source.indexOf('writeMinimalFile') === -1);
});

QUnit.test('package contributes icons for AI context and status tree commands', function (assert) {
    var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var commands = packageJson.contributes.commands;

    function getCommand(commandId) {
        return commands.find(function (command) {
            return command.command === commandId;
        });
    }

    assert.ok(getCommand('taskvision.exportAiContext').icon);
    assert.ok(getCommand('taskvision.openAiStatusReport').icon);
    assert.ok(getCommand('taskvision.syncDataModel').icon);
    assert.ok(getCommand('taskvision.addContextAnnotation').icon);
    assert.ok(getCommand('taskvision.startAgentSession').icon);
    assert.ok(getCommand('taskvision.writeAgentAnnotations').icon);
    assert.ok(getCommand('taskvision.filterByStatus').icon);
    assert.ok(getCommand('taskvision.addMissingTaskStatuses').icon);
});

QUnit.test('package routes tree context menus by task/context/review node types', function (assert) {
    var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var itemMenus = packageJson.contributes.menus['view/item/context'];
    var titleMenus = packageJson.contributes.menus['view/title'];

    function hasMenu(commandId, whenClause) {
        return itemMenus.some(function (menu) {
            return menu.command === commandId && menu.when === whenClause;
        });
    }

    assert.ok(hasMenu('taskvision.setTaskStatus', 'view =~ /taskvision/ && viewItem == task'));
    assert.ok(hasMenu('taskvision.setTaskPriority', 'view =~ /taskvision/ && viewItem == task'));
    assert.ok(hasMenu('taskvision.editTaskNote', 'view =~ /taskvision/ && viewItem == task'));
    assert.ok(hasMenu('taskvision.addContextAnnotation', 'view =~ /taskvision/ && viewItem =~ /^(task|context|folder|file|tag)$/'));
    assert.ok(hasMenu('taskvision.startAgentSession', 'view =~ /taskvision/ && viewItem =~ /^(task|context|review|folder|file|tag)$/'));
    assert.ok(hasMenu('taskvision.writeAgentAnnotations', 'view =~ /taskvision/ && viewItem =~ /^(task|review)$/'));
    assert.ok(hasMenu('taskvision.syncDataModel', 'view =~ /taskvision/ && viewItem =~ /^(task|context|review|folder|file|tag)$/'));
    assert.ok(hasMenu('taskvision.exportAiContext', 'view =~ /taskvision/ && viewItem =~ /^(folder|file|tag|task|context|review)$/'));
    assert.ok(titleMenus.some(function (menu) {
        return menu.command === 'taskvision.syncDataModel';
    }));
});

QUnit.test('tree source differentiates task/context/review labels and context values', function (assert) {
    var source = readSource('src/tree.ts');

    assert.ok(source.indexOf('treeItem.contextValue = "task";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "context";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "review";') !== -1);
    assert.ok(source.indexOf('"[ctx:" + (node.contextKind || \'context\') + "] "') !== -1);
    assert.ok(source.indexOf('"[review:" + (node.reviewKind || \'note\') + "] "') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'note\');') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'warning\');') !== -1);
    assert.ok(source.includes('label: locale("Agent session: ", "Agent 会话：") + shortSessionId(sessions[roots[0]])'));
});

QUnit.test("extension applies on-demand stable ID tracking policy", async assert => {
    const host = createHost();
    await withHost(host, load => {
        const policy = load('annotationPolicy');
        const node = {type: 'todo', tag: 'TODO', actualTag: 'TODO', line: 1, column: 1, fsPath: '/tmp/project/a.ts', rootPath: '/tmp/project', label: 'work', after: 'work', priority: 'normal', status: 'todo', extraLines: []};
        assert.false(policy.shouldEnsureStableIdForNode(node, {}, {}, 'normal'), 'plain pending task remains without source ID');
        assert.true(policy.shouldEnsureStableIdForNode({...node, status: 'doing'}, {}, {}, 'normal'));
        assert.true(policy.shouldEnsureStableIdForNode({...node, note: 'reason'}, {}, {}, 'normal'));
        assert.true(policy.shouldEnsureStableIdForNode({...node, priority: 'high'}, {}, {}, 'normal'));
        assert.true(policy.shouldEnsureStableIdForNode(node, {forceStableIds: true}, {}, 'normal'));
        const stableId = policy.deriveStableIdForNode(node);
        assert.true(policy.shouldEnsureStableIdForNode(node, {}, {[stableId]: true}, 'normal'));
        assert.true(policy.shouldEnsureStableIdForNode({...node, annotationKind: 'context', contextKind: 'invariant'}, {}, {}, 'normal'));
        assert.false(policy.shouldEnsureStableIdForNode({...node, annotationKind: 'review'}, {}, {}, 'normal'));
        const other = {...node, fsPath: '/tmp/project/b.ts'};
        assert.deepEqual(policy.getSyncNodesForRoot('/tmp/project', [node, other], {scopeNodes: [node]}), [node]);
        assert.deepEqual(policy.getSyncNodesForRoot('/tmp/project', [node, other], {scopeNodesByRoot: {'/tmp/project': [other]}}), [other]);
    });
});

QUnit.test("extension limits forced stable IDs to the AI export scope", async assert => {
    const host=createHost();
    await withHost(host,load=>{
      const policy=load('annotationPolicy');
      const a={rootPath:'/tmp/a',fsPath:'/tmp/a/a.ts'}, b={rootPath:'/tmp/a',fsPath:'/tmp/a/b.ts'}, other={rootPath:'/tmp/b',fsPath:'/tmp/b/c.ts'};
      assert.deepEqual(policy.getSyncNodesForRoot('/tmp/a',[a,b,other]),[a,b]);
      assert.deepEqual(policy.getSyncNodesForRoot('/tmp/a',[a,b,other],{scopeNodes:[a,other]}),[a]);
      assert.deepEqual(policy.getSyncNodesForRoot('/tmp/a',[a,b],{scopeNodesByRoot:{'/tmp/a':[b]},scopeNodes:[a]}),[b]);
      assert.deepEqual(policy.getSyncNodesForRoot('/tmp/a',[a,b],{scopeNodes:[]}),[],'empty selected scope stays empty');
    });
  });

QUnit.test("extension writes AI status report before updating export baseline", async assert => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-export-order-'));
    const host = createHost();
    try {
        await withHost(host, load => {
            const taskStore = load('taskMetaStore');
            const ai = load('aiContext');
            const task = {taskId: 'old-id', stableId: 'task.work', fsPath: path.join(root, 'a.ts'), line: 0, column: 1, label: 'work', tag: 'TODO', status: 'todo', extraLines: []};
            taskStore.markTasksExported(root, [task], '2026-01-01');
            ai.exportContextWithBaseline(root, 'test', [{...task, status: 'doing'}], [{...task, status: 'doing'}], '2026-01-02');
            const report = fs.readFileSync(path.join(root, '.taskvision', 'ai-status-report.md'), 'utf8');
            assert.ok(report.includes('Previous status: `todo`'));
            assert.ok(report.includes('Current status: `doing`'));
            assert.strictEqual(taskStore.getExportBaseline(root)['old-id'].lastExportedStatus, 'doing');
        });
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

QUnit.test('extension registers commands even when ripgrep is unavailable', function (assert) {
    var source = readSource('src/extension.ts');
    var missingRipgrepIndex = source.indexOf("TaskVision: Failed to find vscode-ripgrep");
    var firstCommandIndex = source.indexOf("vscode.commands.registerCommand('taskvision.openUrl'");
    var missingRipgrepBlock = source.slice(missingRipgrepIndex, firstCommandIndex);

    assert.ok(missingRipgrepIndex !== -1, 'missing ripgrep warning exists');
    assert.ok(firstCommandIndex !== -1, 'commands are registered');
    assert.ok(missingRipgrepIndex < firstCommandIndex, 'warning still happens before command registration');
    assert.ok(missingRipgrepBlock.indexOf('return;') === -1, 'missing ripgrep warning does not abort command registration');
});
