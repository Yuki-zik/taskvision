var composer = require('../src/styleComposer.js');

QUnit.test('styleComposer composes font decoration with glow shadow', function (assert) {
    var decoration = composer.composeTextDecoration('underline', '0 0 4px #fff');
    assert.ok(decoration.indexOf('underline') !== -1);
    assert.ok(decoration.indexOf('text-shadow: 0 0 4px #fff;') !== -1);
});

QUnit.test('styleComposer replaces stale text-shadow from font channel', function (assert) {
    var decoration = composer.composeTextDecoration('underline; text-shadow: 0 0 1px #111;', '0 0 4px #fff');
    assert.ok(decoration.indexOf('0 0 1px #111') === -1);
    assert.ok(decoration.indexOf('text-shadow: 0 0 4px #fff;') !== -1);
});

QUnit.test('styleComposer composes light/dark text style without field override loss', function (assert) {
    var style = composer.composeTextStyle({
        color: {
            light: { color: '#123456' },
            dark: { color: '#abcdef' }
        },
        font: {
            light: { fontWeight: 'bold', fontStyle: 'italic', textDecoration: 'underline' },
            dark: { fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'line-through' }
        },
        glow: {
            light: { textShadow: '0 0 4px #123456' },
            dark: { textShadow: '0 0 4px #abcdef' }
        }
    });

    assert.strictEqual(style.light.color, '#123456');
    assert.strictEqual(style.dark.color, '#abcdef');
    assert.strictEqual(style.light.fontWeight, 'bold');
    assert.strictEqual(style.light.fontStyle, 'italic');
    assert.ok(style.light.textDecoration.indexOf('underline') !== -1);
    assert.ok(style.light.textDecoration.indexOf('text-shadow: 0 0 4px #123456;') !== -1);
    assert.ok(style.dark.textDecoration.indexOf('line-through') !== -1);
    assert.ok(style.dark.textDecoration.indexOf('text-shadow: 0 0 4px #abcdef;') !== -1);
});
