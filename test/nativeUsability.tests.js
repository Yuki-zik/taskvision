const fs = require('fs');
const {createHost, withHost} = require('./helpers/extensionHost');

QUnit.test('every native configuration title, description and validation message is translatable', assert => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const english = JSON.parse(fs.readFileSync('package.nls.json', 'utf8'));
    const chinese = JSON.parse(fs.readFileSync('package.nls.zh-cn.json', 'utf8'));
    const groups = manifest.contributes.configuration;
    assert.ok(groups.reduce((total, group) => total + Object.keys(group.properties).length, 0) >= 80);
    const referenced = new Set();
    function visit(value, parent = '') {
        if (Array.isArray(value)) return value.forEach(item => visit(item, parent));
        if (!value || typeof value !== 'object') return;
        for (const [key, current] of Object.entries(value)) {
            if (['title', 'description', 'markdownDescription', 'patternErrorMessage', 'deprecationMessage'].includes(key) && typeof current === 'string') {
                assert.ok(/^%[^%]+%$/.test(current), 'localized ' + parent + '.' + key + ': ' + current.slice(0, 80));
                if (current.startsWith('%')) referenced.add(current.slice(1, -1));
            } else if (current && typeof current === 'object') visit(current, parent + '.' + key);
        }
    }
    groups.forEach((group, index) => visit(group, 'group[' + index + ']'));
    for (const key of referenced) {
        assert.ok(english[key], 'English translation ' + key);
        assert.ok(chinese[key], 'Chinese translation ' + key);
    }
});

QUnit.test('native first-run guide is discoverable, localized, and never changes settings by browsing', async assert => {
    const host = createHost();
    host.vscode.QuickPickItemKind = {Separator: -1};
    const pickers = [];
    host.vscode.window.showQuickPick = async (items, options) => { pickers.push({items, options}); return undefined; };
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        assert.strictEqual(typeof host.commands.get('taskvision.gettingStarted'), 'function');
        await host.commands.get('taskvision.quickActions')();
        assert.ok(pickers[0].items.some(item => item.command === 'taskvision.gettingStarted'));
        await host.commands.get('taskvision.gettingStarted')();
        assert.ok(pickers[1].items.some(item => item.command === 'taskvision.openWorkspace'));
        assert.ok(pickers[1].items.some(item => item.command === 'taskvision.copyMcpConfig'));
        assert.deepEqual(host.updates, []);
    });
    const zh = createHost();
    zh.vscode.env.language = 'zh-cn';
    zh.vscode.QuickPickItemKind = {Separator: -1};
    const zhPickers = [];
    zh.vscode.window.showQuickPick = async (items, options) => { zhPickers.push({items, options}); return undefined; };
    await withHost(zh, async load => {
        load('knowledgeWorkspace').register(zh.vscode, zh.context);
        await zh.commands.get('taskvision.gettingStarted')();
        assert.ok(/入门/.test(zhPickers[0].options.title));
        assert.ok(zhPickers[0].items.some(item => /连接.*Agent/.test(item.label)));
        assert.deepEqual(zh.updates, []);
    });
});

QUnit.test('native tree status labels follow VS Code locale', async assert => {
    for (const [locale, scanLabel, emptyLabel] of [
        ['en', 'Scan mode: workspace and open files', 'Nothing found'],
        ['zh-cn', '扫描范围：工作区与已打开文件', '未找到匹配项']
    ]) {
        const host = createHost({settings: {'taskvision.tree.showCurrentScanMode': true}});
        host.vscode.env.language = locale;
        await withHost(host, load => {
            const provider = new (load('tree').TreeNodeProvider)(host.context, () => {}, () => {});
            const rows = provider.getChildren().filter(node => node.isStatusNode).map(node => node.label);
            assert.ok(rows.includes(scanLabel), locale + ': scan mode ' + rows.join(' | '));
            assert.ok(rows.some(row => row.includes(emptyLabel)), locale + ': empty state ' + rows.join(' | '));
            provider.dispose();
        });
    }
});

QUnit.test('first-run steps dispatch real actions without changing settings during navigation', async assert => {
    const host = createHost();
    host.vscode.QuickPickItemKind = {Separator: -1};
    const executed = [], chosen = ['taskvision.gettingStarted', 'taskvision.openWorkspace'];
    host.vscode.commands.executeCommand = async (command, ...args) => { executed.push({command, args}); return 'executed'; };
    host.vscode.window.showQuickPick = async items => { const pick = chosen.shift(); return items.find(item => item.command === pick); };
    await withHost(host, async load => {
        load('knowledgeWorkspace').register(host.vscode, host.context);
        assert.strictEqual(await host.commands.get('taskvision.quickActions')(), 'executed');
        assert.deepEqual(executed, [{command: 'taskvision.gettingStarted', args: []}], 'main menu enters guide without modifying settings');
        executed.length = 0;
        host.vscode.window.showQuickPick = async items => items.find(item => item.command === 'taskvision.copyMcpConfig');
        assert.strictEqual(await host.commands.get('taskvision.gettingStarted')(), 'executed');
        assert.deepEqual(executed, [{command: 'taskvision.copyMcpConfig', args: []}]);
        assert.deepEqual(host.updates, []);
    });
});

QUnit.test('Chinese native appearance picker keeps stable scheme identifiers', async assert => {
    const host = createHost({settings: {'taskvision.highlights.customHighlight': {CORE: {scheme: 'neon'}}}});
    host.vscode.env.language = 'zh-cn';
    const pickers = [];
    host.vscode.window.showQuickPick = async (items, options) => {
        pickers.push({items, options});
        return items.find(item => item.value === 'neon+glass');
    };
    await withHost(host, async load => {
        load('commands/appearance').registerAppearanceCommands(host.context);
        await host.commands.get('taskvision.setHighlightSchemeForAllTags')();
        assert.ok(pickers[0].items.some(item => /霓虹/.test(item.label)), 'Chinese preset labels');
        assert.ok(/全部标签/.test(pickers[0].options.placeHolder), 'Chinese prompt explains scope');
        assert.deepEqual(host.updates.map(item => item.key), ['customHighlight', 'defaultHighlight']);
        assert.strictEqual(host.updates[0].value.CORE.scheme, 'neon+glass', 'stored value remains stable');
    });
    const other = createHost();
    other.vscode.env.language = 'zh-cn';
    const menus = [];
    other.vscode.window.showQuickPick = async items => { menus.push(items); return undefined; };
    await withHost(other, async load => {
        load('commands/appearance').registerAppearanceCommands(other.context);
        other.commands.get('taskvision.customizeAppearance')({tag: 'CORE'});
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(menus[0].some(item => /辉光/.test(item.label)), 'Chinese appearance editor');
        assert.deepEqual(other.updates, [], 'cancel preserves custom highlights');
    });
});

QUnit.test('Chinese VS Code task status and priority menus explain stable tokens', async assert => {
    const host = createHost({settings: {'taskvision.tree.scanAtStartup': false}});
    host.vscode.env.language = 'zh-cn';
    const pickers = [];
    host.vscode.window.showQuickPick = async (items, options) => { pickers.push({items, options}); return undefined; };
    await withHost(host, async load => {
        const extension = load('extension');
        extension.activate(host.context);
        host.commands.get('taskvision.filterByStatus')();
        host.commands.get('taskvision.setTaskStatus')({type:'todo', tag:'TODO', actualTag:'TODO', status:'doing'});
        host.commands.get('taskvision.setTaskPriority')({type:'todo', tag:'TODO', actualTag:'TODO', taskId:'test.task', rootPath:'/tmp/taskvision-project', priority:'high'});
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(pickers.length, 3);
        assert.ok(/筛选/.test(pickers[0].options.placeHolder));
        assert.ok(pickers[0].items.some(item => item.value === 'blocked' && /阻塞/.test(item.detail)));
        assert.ok(/状态/.test(pickers[1].options.placeHolder));
        assert.ok(pickers[1].items.some(item => item.value === 'doing' && /进行中/.test(item.label)));
        assert.ok(/优先级/.test(pickers[2].options.placeHolder));
        assert.ok(pickers[2].items.some(item => item.value === 'high' && /重要/.test(item.detail)));
        assert.deepEqual(host.updates, [], 'no state changes on canceled native pickers');
        extension.deactivate();
    });
});
