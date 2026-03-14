var fs = require('fs');

QUnit.test('highlights uses gutterIcon attribute for gutter visibility', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf("getAttribute(tag, 'gutterIcon'") !== -1);
    assert.ok(source.indexOf("getAttribute(tag, 'icon'") === -1);
});

QUnit.test('highlights routes trace logs through debug function', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('function trace(text)') !== -1);
    assert.ok(source.indexOf('console.log(') === -1);
});

QUnit.test('highlights uses four independent scope keys', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('function getColorType(') !== -1);
    assert.ok(source.indexOf('function getGlowType(') !== -1);
    assert.ok(source.indexOf('function getGlassType(') !== -1);
    assert.ok(source.indexOf('function getFontType(') !== -1);
});

QUnit.test('highlights no longer uses comment decoration hack path', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('result.comment') === -1);
    assert.ok(source.indexOf('commentHighlights') === -1);
});

QUnit.test('highlights composes text channels with segment bucketing', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('buildTextSegments(') !== -1);
    assert.ok(source.indexOf('styleComposer.composeTextStyle') !== -1);
    assert.ok(source.indexOf('rangeResolver.resolveRangeOffsets') !== -1);
});

QUnit.test('highlights resolves per-channel opacity helpers before building schemes', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('function getForegroundOpacity(') !== -1);
    assert.ok(source.indexOf('function getGlowOpacity(') !== -1);
    assert.ok(source.indexOf('function getGlassOpacity(') !== -1);
    assert.ok(source.indexOf('function getGlassBorderOpacity(') !== -1);
    assert.ok(source.indexOf('glowOpacity: glowOpacity') !== -1);
    assert.ok(source.indexOf('glassOpacity: finalGlassOpacity') !== -1);
    assert.ok(source.indexOf('glassBorderOpacity: glassBorderOpacity') !== -1);
});
