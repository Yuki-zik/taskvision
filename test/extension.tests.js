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
