var fs = require('fs');
var schemes = require('../src/schemes.js');

QUnit.test('package schema allows neon+glass for highlight schemes', function (assert) {
    var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var props = pkg.contributes.configuration[1].properties;
    var customEnum = props['taskvision.highlights.customHighlight'].additionalProperties.properties.scheme.enum;
    var defaultEnum = props['taskvision.highlights.defaultHighlight'].properties.scheme.enum;

    assert.ok(customEnum.indexOf('neon+glass') !== -1);
    assert.ok(defaultEnum.indexOf('neon+glass') !== -1);
});

QUnit.test('package schema exposes four independent channel scopes', function (assert) {
    var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var props = pkg.contributes.configuration[1].properties;
    var customProps = props['taskvision.highlights.customHighlight'].additionalProperties.properties;
    var defaultProps = props['taskvision.highlights.defaultHighlight'].properties;

    ['colorType', 'glowType', 'glassType', 'fontType'].forEach(function (key) {
        assert.ok(customProps[key] !== undefined, 'customHighlight has ' + key);
        assert.ok(defaultProps[key] !== undefined, 'defaultHighlight has ' + key);
    });
});

QUnit.test('package defaults use decoupled four-channel semantics for key tags', function (assert) {
    var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var props = pkg.contributes.configuration[1].properties;
    var defaults = props['taskvision.highlights.customHighlight'].default;
    var keys = ['TODO', 'FIXME', 'XXX', 'NOTE', '[ ]', '[x]', '[ x]'];

    keys.forEach(function (key) {
        assert.strictEqual(defaults[key].scheme, 'neon+glass', key + ' uses neon+glass');
        assert.strictEqual(defaults[key].colorType, 'text', key + ' colorType is text');
        assert.strictEqual(defaults[key].glowType, 'tag', key + ' glowType is tag');
        assert.strictEqual(defaults[key].glassType, 'whole-line', key + ' glassType is whole-line');
        assert.strictEqual(defaults[key].fontType, 'tag', key + ' fontType is tag');
    });
});

QUnit.test('schemes.getPreset keeps glow and glass as independent style presets', function (assert) {
    var neon = schemes.getPreset('neon', '#112233', '#445566');
    assert.ok(neon.glow);
    assert.notOk(neon.glass);

    var glass = schemes.getPreset('glass', '#112233', '#445566');
    assert.ok(glass.glass);
    assert.notOk(glass.glow);

    var both = schemes.getPreset('neon+glass', '#112233', '#445566');
    assert.ok(both.glow);
    assert.ok(both.glass);
});

QUnit.test('schemes.applyScheme does not force font weight or scope side effects', function (assert) {
    var options = { light: {}, dark: {}, isWholeLine: false };
    schemes.applyScheme(options, 'neon+glass', '#112233', '#445566');

    assert.strictEqual(options.isWholeLine, false);
    assert.strictEqual(options.light.fontWeight, undefined);
    assert.strictEqual(options.dark.fontWeight, undefined);
});
