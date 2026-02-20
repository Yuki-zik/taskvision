var resolver = require('../src/rangeResolver.js');

QUnit.test('rangeResolver normalises legacy subtag scope token', function (assert) {
    assert.strictEqual(resolver.normaliseRangeType('tag-and-subtag'), 'tag-and-subTag');
    assert.strictEqual(resolver.normaliseRangeType('tag-and-subTag'), 'tag-and-subTag');
});

QUnit.test('rangeResolver handles tag/text/comment/line scopes', function (assert) {
    var context = {
        tagStart: 10,
        tagEnd: 14,
        matchStart: 7,
        commentStart: 7,
        commentEnd: 30,
        lineStart: 0,
        lineEnd: 40
    };

    assert.deepEqual(resolver.resolveRangeOffsets('tag', context), [{ start: 10, end: 14 }]);
    assert.deepEqual(resolver.resolveRangeOffsets('text', context), [{ start: 10, end: 30 }]);
    assert.deepEqual(resolver.resolveRangeOffsets('tag-and-comment', context), [{ start: 7, end: 30 }]);
    assert.deepEqual(resolver.resolveRangeOffsets('text-and-comment', context), [{ start: 7, end: 30 }]);
    assert.deepEqual(resolver.resolveRangeOffsets('whole-line', context), [{ start: 10, end: 30 }]);
    assert.deepEqual(resolver.resolveRangeOffsets('line', context), [{ start: 0, end: 40 }]);
});

QUnit.test('rangeResolver handles subTag and capture groups', function (assert) {
    var context = {
        tagStart: 10,
        tagEnd: 14,
        matchStart: 7,
        commentStart: 7,
        commentEnd: 30,
        lineStart: 0,
        lineEnd: 40,
        subTagStart: 20,
        subTagEnd: 24,
        matchIndices: [
            [7, 30],
            [10, 14],
            [20, 24]
        ]
    };

    assert.deepEqual(
        resolver.resolveRangeOffsets('tag-and-subTag', context),
        [
            { start: 10, end: 14 },
            { start: 20, end: 24 }
        ]
    );

    assert.deepEqual(
        resolver.resolveRangeOffsets('capture-groups:1,2', context),
        [
            { start: 10, end: 14 },
            { start: 20, end: 24 }
        ]
    );

    assert.deepEqual(resolver.resolveRangeOffsets('none', context), []);
});
