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

QUnit.test('package schema exposes per-channel opacity controls', function (assert) {
    var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    var props = pkg.contributes.configuration[1].properties;
    var customProps = props['taskvision.highlights.customHighlight'].additionalProperties.properties;
    var defaultProps = props['taskvision.highlights.defaultHighlight'].properties;

    ['foregroundOpacity', 'glowOpacity', 'glassOpacity', 'glassBorderOpacity'].forEach(function (key) {
        assert.ok(customProps[key] !== undefined, 'customHighlight has ' + key);
        assert.ok(defaultProps[key] !== undefined, 'defaultHighlight has ' + key);
    });

    assert.ok(props['taskvision.highlights.foregroundOpacity'] !== undefined);
    assert.ok(props['taskvision.highlights.glowOpacity'] !== undefined);
    assert.ok(props['taskvision.highlights.glassOpacity'] !== undefined);
    assert.ok(props['taskvision.highlights.glassBorderOpacity'] !== undefined);
    assert.ok(props['taskvision.highlights.opacity'] !== undefined);
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

QUnit.test('schemes.getPreset applies per-channel opacity controls independently', function (assert) {
    var preset = schemes.getPreset('neon+glass', '#112233', '#445566', {
        glowOpacity: 40,
        glassOpacity: 10,
        glassBorderOpacity: 25
    });

    assert.strictEqual(preset.glass.light.backgroundColor, 'rgba(17,34,51,0.1)');
    assert.strictEqual(preset.glass.dark.backgroundColor, 'rgba(68,85,102,0.1)');
    assert.strictEqual(preset.glass.light.border, '1px solid rgba(17,34,51,0.25)');
    assert.strictEqual(preset.glass.dark.border, '1px solid rgba(68,85,102,0.25)');
    assert.ok(preset.glow.light.textShadow.indexOf('rgba(17,34,51,0.4)') !== -1);
    assert.ok(preset.glow.dark.textShadow.indexOf('rgba(68,85,102,0.4)') !== -1);
});

QUnit.test('schemes.applyScheme does not force font weight or scope side effects', function (assert) {
    var options = { light: {}, dark: {}, isWholeLine: false };
    schemes.applyScheme(options, 'neon+glass', '#112233', '#445566');

    assert.strictEqual(options.isWholeLine, false);
    assert.strictEqual(options.light.fontWeight, undefined);
    assert.strictEqual(options.dark.fontWeight, undefined);
});
