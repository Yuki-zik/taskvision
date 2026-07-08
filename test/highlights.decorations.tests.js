var Module = require('module');

// highlights.js pulls in vscode-dependent modules (config.js, icons.js) but only
// touches the vscode API inside functions. Stub 'vscode' just long enough to require
// the module, then restore the original require so other test files are unaffected.
function loadHighlightsWithVscodeStub() {
    var vscodeStub = {
        DecorationRangeBehavior: { ClosedClosed: 0, ClosedOpen: 1, OpenClosed: 2, OpenOpen: 3 },
        OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
        ThemeColor: function (id) { this.id = id; },
        Range: function () { },
        Position: function () { },
        Uri: { file: function (p) { return { fsPath: p }; } },
        window: { createTextEditorDecorationType: function (options) { return options; } },
        workspace: { getConfiguration: function () { return { get: function () { return undefined; } }; } }
    };

    var originalRequire = Module.prototype.require;
    Module.prototype.require = function (name) {
        if (name === 'vscode') { return vscodeStub; }
        return originalRequire.apply(this, arguments);
    };

    try {
        delete require.cache[require.resolve('../src/highlights.js')];
        return require('../src/highlights.js');
    } finally {
        Module.prototype.require = originalRequire;
    }
}

var highlights = loadHighlightsWithVscodeStub();

function glassPlan(style, rangeType) {
    return {
        tag: 'TODO',
        channels: {
            glass: {
                kind: 'glass',
                enabled: true,
                rangeType: rangeType || 'whole-line',
                style: style
            }
        }
    };
}

QUnit.test('glass decoration exposes an internal builder', function (assert) {
    assert.strictEqual(typeof highlights._buildGlassDecorationOptions, 'function');
});

QUnit.test('glass decoration co-locates borderRadius and preserves the translucent background', function (assert) {
    var opts = highlights._buildGlassDecorationOptions(glassPlan({
        light: { backgroundColor: 'rgba(92,107,192,0.15)', border: '1px solid rgba(92,107,192,0.6)' },
        dark: { backgroundColor: 'rgba(92,107,192,0.15)', border: '1px solid rgba(92,107,192,0.6)' },
        borderRadius: '6px'
    }, 'whole-line'));

    // The base CSS rule must NOT carry borderRadius: Cursor paints it gray when the
    // base rule has border-radius without a co-located background (microsoft/vscode#175819).
    assert.strictEqual(opts.borderRadius, undefined, 'no top-level borderRadius');

    assert.strictEqual(opts.light.borderRadius, '6px', 'borderRadius co-located in light');
    assert.strictEqual(opts.dark.borderRadius, '6px', 'borderRadius co-located in dark');

    assert.strictEqual(opts.light.backgroundColor, 'rgba(92,107,192,0.15)', 'light background preserved');
    assert.strictEqual(opts.dark.backgroundColor, 'rgba(92,107,192,0.15)', 'dark background preserved');
    assert.strictEqual(opts.light.border, '1px solid rgba(92,107,192,0.6)', 'light border preserved');
    assert.strictEqual(opts.dark.border, '1px solid rgba(92,107,192,0.6)', 'dark border preserved');

    assert.strictEqual(opts.isWholeLine, true, 'whole-line range renders whole line');
});

QUnit.test('glass decoration injects a transparent background for border-only configs', function (assert) {
    var opts = highlights._buildGlassDecorationOptions(glassPlan({
        light: { border: '1px solid #ffffff' },
        dark: { border: '1px solid #000000' },
        borderRadius: '6px'
    }, 'tag'));

    assert.strictEqual(opts.borderRadius, undefined, 'no top-level borderRadius');
    assert.strictEqual(opts.light.backgroundColor, 'transparent', 'transparent injected for border-only light');
    assert.strictEqual(opts.dark.backgroundColor, 'transparent', 'transparent injected for border-only dark');
    assert.strictEqual(opts.light.borderRadius, '6px', 'borderRadius co-located with border (light)');
    assert.strictEqual(opts.dark.borderRadius, '6px', 'borderRadius co-located with border (dark)');
    assert.strictEqual(opts.isWholeLine, false, 'tag range is not whole line');
});

QUnit.test('no glass theme carries a border or borderRadius without an explicit background', function (assert) {
    var styles = [
        {
            light: { backgroundColor: 'rgba(1,2,3,0.15)', border: '1px solid rgba(1,2,3,0.6)' },
            dark: { backgroundColor: 'rgba(1,2,3,0.15)', border: '1px solid rgba(1,2,3,0.6)' },
            borderRadius: '6px'
        },
        {
            light: { border: '1px solid #abcdef' },
            dark: { border: '1px solid #abcdef' },
            borderRadius: '6px'
        },
        {
            light: { border: '1px solid #abcdef' },
            dark: { border: '1px solid #abcdef' }
        }
    ];

    styles.forEach(function (style, index) {
        var opts = highlights._buildGlassDecorationOptions(glassPlan(style, 'whole-line'));
        ['light', 'dark'].forEach(function (theme) {
            var themed = opts[theme];
            if (themed.border !== undefined || themed.borderRadius !== undefined) {
                assert.strictEqual(typeof themed.backgroundColor, 'string',
                    'style #' + index + ' ' + theme + ' with border/radius declares an explicit background');
            }
        });
    });
});

QUnit.test('glass decoration leaves background-only configs untouched', function (assert) {
    var opts = highlights._buildGlassDecorationOptions(glassPlan({
        light: { backgroundColor: 'rgba(1,2,3,0.15)' },
        dark: { backgroundColor: 'rgba(1,2,3,0.15)' }
    }, 'text'));

    assert.strictEqual(opts.light.backgroundColor, 'rgba(1,2,3,0.15)', 'background preserved');
    assert.strictEqual(opts.light.border, undefined, 'no border fabricated');
    assert.strictEqual(opts.light.borderRadius, undefined, 'no borderRadius fabricated');
    assert.strictEqual(opts.dark.backgroundColor, 'rgba(1,2,3,0.15)', 'dark background preserved');
});
