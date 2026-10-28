const fs = require('fs');
const {createHost, withHost} = require('./helpers/extensionHost');

function actionHost(overrides = {}) {
    const host = createHost(overrides);
    const executions = [], pickers = [];
    host.vscode.QuickPickItemKind = {Separator: -1};
    host.vscode.commands.executeCommand = async (command, ...args) => {
        executions.push({command, args});
        const handler = host.commands.get(command);
        return handler ? handler(...args) : 'executed:' + command;
    };
    host.vscode.window.showQuickPick = async (items, options) => {
        pickers.push({items, options});
        return host.selection && items.find(item => item.command === host.selection || item.query === host.selection);
    };
    return Object.assign(host, {executions, pickers});
}

QUnit.test('workspace bridge registers usable quick actions and native settings without side effects', async assert => {
    const host = actionHost();
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        assert.strictEqual(typeof host.commands.get('taskvision.quickActions'), 'function');
        assert.strictEqual(typeof host.commands.get('taskvision.configureAppearanceAndWorkspace'), 'function');
        assert.deepEqual(host.updates, []);
        assert.deepEqual(host.executions, []);
    });
});

QUnit.test('native settings command opens the scoped Settings UI without changing configuration', async assert => {
    const host = actionHost();
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        await host.commands.get('taskvision.configureAppearanceAndWorkspace')();
        assert.deepEqual(host.executions, [{command: 'workbench.action.openSettings', args: ['@ext:a-znk.taskvision']}]);
        assert.deepEqual(host.updates, [], 'opening settings does not apply defaults');
    });
});

QUnit.test('Quick Actions groups existing real commands and cancellation has no effects', async assert => {
    const host = actionHost();
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        await host.commands.get('taskvision.quickActions')();
        const picker = host.pickers[0];
        assert.strictEqual(picker.options.title, 'TaskVision: Quick Actions');
        assert.true(picker.options.matchOnDetail);
        assert.deepEqual(picker.items.filter(item => item.kind === -1).map(item => item.label), [
            'Workspace', 'Appearance and tags', 'Tasks', 'AI context and settings'
        ]);
        for (const name of ['openWorkspace', 'refresh', 'enableKnowledgeTags', 'setHighlightSchemeForAllTags', 'filter', 'filterByStatus', 'exportAiContext', 'copyMcpConfig', 'configureAppearanceAndWorkspace']) {
            assert.ok(picker.items.some(item => item.command === 'taskvision.' + name), name + ' available');
        }
        assert.deepEqual(host.executions, [], 'Escape dispatches nothing');
        assert.deepEqual(host.updates, [], 'browsing actions changes no settings');
    });
});

QUnit.test('Quick Actions dispatches every command once and returns its result', async assert => {
    const host = actionHost();
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        await host.commands.get('taskvision.quickActions')();
        const actions = host.pickers[0].items.filter(item => item.command && item.command !== 'workbench.action.openSettings');
        for (const action of actions) {
            host.commands.set(action.command, async () => 'result:' + action.command);
        }
        for (const action of actions) {
            host.selection = action.command;
            const result = await host.commands.get('taskvision.quickActions')();
            assert.strictEqual(result, 'result:' + action.command, action.command + ' awaited');
        }
        assert.deepEqual(host.executions.map(entry => entry.command), actions.map(item => item.command));
        assert.deepEqual(host.updates, []);
    });
});

QUnit.test('Quick Actions guides highlight channels, task tree and runtime into scoped native settings', async assert => {
    const host = actionHost();
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        for (const prefix of ['taskvision.highlights', 'taskvision.tree', 'taskvision.workspace']) {
            host.selection = '@ext:a-znk.taskvision ' + prefix;
            await host.commands.get('taskvision.quickActions')();
        }
        assert.deepEqual(host.executions, ['taskvision.highlights', 'taskvision.tree', 'taskvision.workspace'].map(prefix => ({
            command: 'workbench.action.openSettings', args: ['@ext:a-znk.taskvision ' + prefix]
        })));
        assert.ok(host.pickers[0].items.some(item => /color.*glow.*glass.*font/i.test(item.detail || '')), 'four independent channels explained');
        assert.deepEqual(host.updates, []);
    });
});

QUnit.test('Chinese Quick Actions and contributed labels are localized', async assert => {
    const host = actionHost();
    host.vscode.env.language = 'zh-cn';
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        await host.commands.get('taskvision.quickActions')();
        assert.strictEqual(host.pickers[0].options.title, 'TaskVision：快捷操作');
        assert.strictEqual(host.pickers[0].items.find(item => item.command === 'taskvision.openWorkspace').label, '$(type-hierarchy) 打开项目知识工作台');
    });
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    for (const locale of ['package.nls.json', 'package.nls.zh-cn.json']) {
        const labels = JSON.parse(fs.readFileSync(locale, 'utf8'));
        for (const name of ['quickActions', 'configureAppearanceAndWorkspace']) {
            const command = manifest.contributes.commands.find(item => item.command === 'taskvision.' + name);
            assert.ok(command && labels[command.title.slice(1, -1)], locale + ': ' + name);
        }
    }
});

QUnit.test('title bar keeps three practical navigation actions and all original menu commands', assert => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const title = manifest.contributes.menus['view/title'];
    const navigation = title.filter(item => /^navigation(?:@|$)/.test(item.group));
    assert.deepEqual(navigation.slice().sort((a, b) => a.group.localeCompare(b.group)).map(item => item.command), [
        'taskvision.openWorkspace', 'taskvision.refresh', 'taskvision.quickActions'
    ]);
    for (const name of ['exportTree', 'syncDataModel', 'exportAiContext', 'openAiStatusReport', 'addMissingTaskStatuses', 'setHighlightSchemeForAllTags', 'reveal', 'scanOpenFilesOnly', 'scanCurrentFileOnly', 'scanWorkspaceAndOpenFiles', 'scanWorkspaceOnly', 'showFlatView', 'showTagsOnlyView', 'showTreeView', 'groupByTag', 'ungroupByTag', 'groupBySubTag', 'ungroupBySubTag', 'filter', 'filterClear', 'filterByStatus', 'filterStatusClear', 'refresh', 'expand', 'collapse', 'openWorkspace', 'stopWorkspace', 'copyMcpConfig', 'enableKnowledgeTags']) {
        assert.strictEqual(title.filter(item => item.command === 'taskvision.' + name).length, 1, name + ' retained once');
    }
    assert.ok(title.some(item => item.command === 'taskvision.configureAppearanceAndWorkspace'), 'native settings discoverable in menu');
    const context = manifest.contributes.menus['view/item/context'];
    for (const name of ['setTaskStatus', 'setTaskPriority', 'editTaskNote', 'customizeAppearance', 'setScheme', 'filter', 'exportAiContext']) {
        assert.ok(context.some(item => item.command === 'taskvision.' + name), name + ' context menu preserved');
    }
});

QUnit.test('explicit enable-tags action preserves custom tags and all four highlight channels', async assert => {
    const custom = {CUSTOM: {colorType: 'text', glowType: 'tag', glassType: 'whole-line', fontType: 'tag', foreground: '#abcdef', scheme: 'neon+glass'}};
    const host = actionHost({settings: {
        'taskvision.general.tags': ['TODO', 'core', 'CUSTOM'],
        'taskvision.highlights.customHighlight': custom
    }});
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        host.selection = 'taskvision.enableKnowledgeTags';
        await host.commands.get('taskvision.quickActions')();
        assert.deepEqual(host.updates, [{section: 'taskvision.general', key: 'tags', value: ['TODO', 'core', 'CUSTOM', 'REUSE', 'INTENT', 'REVIEW'], target: 2}]);
        assert.deepEqual(host.vscode.workspace.getConfiguration('taskvision.highlights').get('customHighlight'), custom);
    });
});

QUnit.test('scheme action reuses the original picker and preserves custom per-channel scopes', async assert => {
    const custom = {CUSTOM: {colorType: 'text', glowType: 'tag', glassType: 'whole-line', fontType: 'none', foreground: '#abcdef', icon: 'tag'}};
    const host = actionHost({settings: {'taskvision.highlights.customHighlight': custom}});
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        load('commands/appearance').registerAppearanceCommands(host.context);
        const quickPick = host.vscode.window.showQuickPick;
        host.vscode.window.showQuickPick = (items, options) => options.title
            ? quickPick(items, options)
            : Promise.resolve(items.find(item => item.value === 'neon+glass'));
        host.selection = 'taskvision.setHighlightSchemeForAllTags';
        await host.commands.get('taskvision.quickActions')();
        await new Promise(resolve => setImmediate(resolve));
        const styles = host.vscode.workspace.getConfiguration('taskvision.highlights').get('customHighlight');
        assert.deepEqual(styles.CUSTOM, {...custom.CUSTOM, scheme: 'neon+glass'});
        assert.strictEqual(host.vscode.workspace.getConfiguration('taskvision.highlights').get('defaultHighlight').scheme, 'neon+glass');
    });
});
