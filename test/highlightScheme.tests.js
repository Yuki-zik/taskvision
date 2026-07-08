var highlightScheme = require('../src/highlightScheme.js');

QUnit.test('applySchemeToAllTags sets scheme on every existing customHighlight entry and defaultHighlight', function (assert) {
    var customHighlight = {
        TODO: { scheme: 'glass', background: '#123456', colorType: 'text' },
        FIXME: { scheme: 'neon+glass', background: '#9C27B0', icon: 'flame' },
        NOTE: { background: '#00E5FF' }
    };
    var defaultHighlight = { background: '#5C6BC0', scheme: 'neon+glass', icon: 'tag' };

    var result = highlightScheme.applySchemeToAllTags(customHighlight, defaultHighlight, 'neon');

    assert.strictEqual(result.customHighlight.TODO.scheme, 'neon');
    assert.strictEqual(result.customHighlight.FIXME.scheme, 'neon');
    assert.strictEqual(result.customHighlight.NOTE.scheme, 'neon', 'entry without prior scheme still receives one');
    assert.strictEqual(result.defaultHighlight.scheme, 'neon');
});

QUnit.test('applySchemeToAllTags preserves non-scheme properties', function (assert) {
    var customHighlight = {
        TODO: { scheme: 'glass', background: '#123456', colorType: 'text', icon: 'check' }
    };
    var defaultHighlight = { background: '#5C6BC0', icon: 'tag', rulerLane: 'center' };

    var result = highlightScheme.applySchemeToAllTags(customHighlight, defaultHighlight, 'neon+glass');

    assert.strictEqual(result.customHighlight.TODO.background, '#123456');
    assert.strictEqual(result.customHighlight.TODO.colorType, 'text');
    assert.strictEqual(result.customHighlight.TODO.icon, 'check');
    assert.strictEqual(result.customHighlight.TODO.scheme, 'neon+glass');
    assert.strictEqual(result.defaultHighlight.background, '#5C6BC0');
    assert.strictEqual(result.defaultHighlight.icon, 'tag');
    assert.strictEqual(result.defaultHighlight.rulerLane, 'center');
});

QUnit.test('applySchemeToAllTags with none clears scheme from all entries and defaultHighlight', function (assert) {
    var customHighlight = {
        TODO: { scheme: 'glass', background: '#123456' },
        FIXME: { scheme: 'neon+glass', background: '#9C27B0' }
    };
    var defaultHighlight = { background: '#5C6BC0', scheme: 'neon+glass' };

    var result = highlightScheme.applySchemeToAllTags(customHighlight, defaultHighlight, 'none');

    assert.notOk('scheme' in result.customHighlight.TODO, 'TODO scheme removed');
    assert.notOk('scheme' in result.customHighlight.FIXME, 'FIXME scheme removed');
    assert.strictEqual(result.customHighlight.TODO.background, '#123456', 'other props preserved when clearing');
    assert.notOk('scheme' in result.defaultHighlight, 'defaultHighlight scheme removed');
    assert.strictEqual(result.defaultHighlight.background, '#5C6BC0');
});

QUnit.test('applySchemeToAllTags does not mutate its inputs', function (assert) {
    var customHighlight = { TODO: { scheme: 'glass', background: '#123456' } };
    var defaultHighlight = { scheme: 'neon+glass' };

    var result = highlightScheme.applySchemeToAllTags(customHighlight, defaultHighlight, 'neon');

    assert.strictEqual(customHighlight.TODO.scheme, 'glass', 'input customHighlight unchanged');
    assert.strictEqual(defaultHighlight.scheme, 'neon+glass', 'input defaultHighlight unchanged');
    assert.notStrictEqual(result.customHighlight, customHighlight, 'returns a new customHighlight object');
    assert.notStrictEqual(result.customHighlight.TODO, customHighlight.TODO, 'returns new nested entry objects');
});

QUnit.test('applySchemeToAllTags handles missing config safely', function (assert) {
    var result = highlightScheme.applySchemeToAllTags(undefined, undefined, 'neon');

    assert.deepEqual(result.customHighlight, {});
    assert.strictEqual(result.defaultHighlight.scheme, 'neon');
});
