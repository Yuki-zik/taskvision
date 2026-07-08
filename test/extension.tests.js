var fs = require('fs');

function readSource(file) {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

QUnit.test('extension resolves highlight updates to workspace first', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf('function resolveConfigTarget()') !== -1);
    assert.ok(source.indexOf('vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0') !== -1);
    assert.ok(source.indexOf('return vscode.ConfigurationTarget.Workspace;') !== -1);
    assert.ok(source.indexOf('return vscode.ConfigurationTarget.Global;') !== -1);
});

QUnit.test('extension writes customHighlight updates using resolved target', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf("currentConfig.update('customHighlight', updated, customHighlightTarget);") !== -1);
    assert.ok(source.indexOf("cfg.update('customHighlight', updated, customHighlightTarget);") !== -1);
});

QUnit.test('extension exposes independent color/glow/glass/font scope controls', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf("value: 'scope-color'") !== -1);
    assert.ok(source.indexOf("value: 'scope-glow'") !== -1);
    assert.ok(source.indexOf("value: 'scope-glass'") !== -1);
    assert.ok(source.indexOf("value: 'scope-font'") !== -1);
    assert.ok(source.indexOf("updateConfig('colorType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('glowType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('glassType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('fontType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
});

QUnit.test('extension refreshes when regex and global opacity settings change', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf('if (e.affectsConfiguration("taskvision.regex.regex")) {\n                    return;\n                }') === -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.foregroundOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glowOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glassOpacity")') !== -1);
    assert.ok(source.indexOf('e.affectsConfiguration("taskvision.highlights.glassBorderOpacity")') !== -1);
});

QUnit.test('extension updates font appearance in a single customHighlight write', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf('var updateConfigValues = function (values)') !== -1);
    assert.ok(source.indexOf("updateConfig('fontWeight', font.fontWeight);\n                                updateConfig('fontStyle', font.fontStyle);") === -1);
    assert.ok(source.indexOf('updateConfigValues({ fontWeight: font.fontWeight, fontStyle: font.fontStyle });') !== -1);
});

QUnit.test('extension source accepts built-in taskvision icons during validation', function (assert) {
    var source = readSource('src/icons.js');

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
        'taskvision.editTaskNote'
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
    var source = readSource('src/tree.js');

    assert.ok(source.indexOf('treeItem.contextValue = "task";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "context";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "review";') !== -1);
    assert.ok(source.indexOf('"[ctx:" + (node.contextKind || \'context\') + "] "') !== -1);
    assert.ok(source.indexOf('"[review:" + (node.reviewKind || \'note\') + "] "') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'note\');') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'warning\');') !== -1);
    assert.ok(source.indexOf('label: "Agent session: " + shortSessionId(sessions[roots[0]])') !== -1);
});

QUnit.test('extension applies on-demand stable ID tracking policy', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf('function shouldEnsureStableIdForNode(node, options, referencedStableIds)') !== -1);
    assert.ok(source.indexOf('if (ensureOptions.forceStableIds === true)') !== -1);
    assert.ok(source.indexOf('return status !== \'todo\' && status !== \'idea\';') !== -1);
    assert.ok(source.indexOf('var initialRootNodes = getSyncNodesForRoot(rootPath, syncOptions);') !== -1);
    assert.ok(source.indexOf('ensureStableIdsInSource(initialRootNodes, {\n                forceStableIds: syncOptions.forceStableIds === true\n            })') !== -1);
    assert.ok(source.indexOf('forceStableIds: true') !== -1);
});

QUnit.test('extension limits forced stable IDs to the AI export scope', function (assert) {
    var source = readSource('src/extension.js');

    assert.ok(source.indexOf('function getSyncNodesForRoot(rootPath, syncOptions)') !== -1);
    assert.ok(source.indexOf('Array.isArray(options.scopeNodes)') !== -1);
    assert.ok(source.indexOf('scopeNodesByRoot: grouped') !== -1);
    assert.ok(source.indexOf('var rootNodes = getSyncNodesForRoot(rootPath, syncOptions);') !== -1);
});

QUnit.test('extension writes AI status report before updating export baseline', function (assert) {
    var source = readSource('src/extension.js');
    var exportStart = source.indexOf('function exportAiContext(node)');
    var markIndex = source.indexOf('taskMetaStore.markTasksExported', exportStart);
    var reportIndex = source.indexOf('aiContext.writeStatusReport', exportStart);

    assert.ok(exportStart !== -1, 'exportAiContext exists');
    assert.ok(reportIndex !== -1, 'export writes status report');
    assert.ok(markIndex !== -1, 'export marks tasks exported');
    assert.ok(reportIndex < markIndex, 'status report is written before baseline is updated');
});

QUnit.test('extension registers commands even when ripgrep is unavailable', function (assert) {
    var source = readSource('src/extension.js');
    var missingRipgrepIndex = source.indexOf("TaskVision: Failed to find vscode-ripgrep");
    var firstCommandIndex = source.indexOf("vscode.commands.registerCommand('taskvision.openUrl'");
    var missingRipgrepBlock = source.slice(missingRipgrepIndex, firstCommandIndex);

    assert.ok(missingRipgrepIndex !== -1, 'missing ripgrep warning exists');
    assert.ok(firstCommandIndex !== -1, 'commands are registered');
    assert.ok(missingRipgrepIndex < firstCommandIndex, 'warning still happens before command registration');
    assert.ok(missingRipgrepBlock.indexOf('return;') === -1, 'missing ripgrep warning does not abort command registration');
});
