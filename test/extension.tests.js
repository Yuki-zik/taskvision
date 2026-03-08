var fs = require('fs');

QUnit.test('extension resolves highlight updates to workspace first', function (assert) {
    var source = fs.readFileSync('src/extension.js', 'utf8');

    assert.ok(source.indexOf('function resolveConfigTarget()') !== -1);
    assert.ok(source.indexOf('vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0') !== -1);
    assert.ok(source.indexOf('return vscode.ConfigurationTarget.Workspace;') !== -1);
    assert.ok(source.indexOf('return vscode.ConfigurationTarget.Global;') !== -1);
});

QUnit.test('extension writes customHighlight updates using resolved target', function (assert) {
    var source = fs.readFileSync('src/extension.js', 'utf8');

    assert.ok(source.indexOf("currentConfig.update('customHighlight', updated, customHighlightTarget);") !== -1);
    assert.ok(source.indexOf("cfg.update('customHighlight', updated, customHighlightTarget);") !== -1);
});

QUnit.test('extension exposes independent color/glow/glass/font scope controls', function (assert) {
    var source = fs.readFileSync('src/extension.js', 'utf8');

    assert.ok(source.indexOf("value: 'scope-color'") !== -1);
    assert.ok(source.indexOf("value: 'scope-glow'") !== -1);
    assert.ok(source.indexOf("value: 'scope-glass'") !== -1);
    assert.ok(source.indexOf("value: 'scope-font'") !== -1);
    assert.ok(source.indexOf("updateConfig('colorType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('glowType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('glassType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
    assert.ok(source.indexOf("updateConfig('fontType', scopeValue.value === 'inherit' ? undefined : scopeValue.value);") !== -1);
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
    var source = fs.readFileSync('src/tree.js', 'utf8');

    assert.ok(source.indexOf('treeItem.contextValue = "task";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "context";') !== -1);
    assert.ok(source.indexOf('treeItem.contextValue = "review";') !== -1);
    assert.ok(source.indexOf('"[ctx:" + (node.contextKind || \'context\') + "] "') !== -1);
    assert.ok(source.indexOf('"[review:" + (node.reviewKind || \'note\') + "] "') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'note\');') !== -1);
    assert.ok(source.indexOf('return new vscode.ThemeIcon(\'warning\');') !== -1);
    assert.ok(source.indexOf('label: "Agent session: " + shortSessionId(sessions[roots[0]])') !== -1);
});
