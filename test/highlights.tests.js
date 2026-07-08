var fs = require('fs');
var Module = require('module');

function FakePosition(line, character) {
    this.line = line;
    this.character = character;
}

FakePosition.prototype.isBeforeOrEqual = function (other) {
    return this.line < other.line || (this.line === other.line && this.character <= other.character);
};

function FakeRange(start, end) {
    this.start = start;
    this.end = end;
}

function FakeDocument(text) {
    this._text = text;
    this._lines = text.split('\n');
    this.fileName = '/tmp/taskvision-highlight-test.js';
    this.uri = {
        scheme: 'file',
        fsPath: this.fileName,
        toString: function () {
            return 'file:///tmp/taskvision-highlight-test.js';
        }
    };
}

FakeDocument.prototype.getText = function () {
    return this._text;
};

FakeDocument.prototype.positionAt = function (offset) {
    var remaining = offset;
    for (var i = 0; i < this._lines.length; i++) {
        if (remaining <= this._lines[i].length) {
            return new FakePosition(i, remaining);
        }
        remaining -= this._lines[i].length + 1;
    }
    return new FakePosition(this._lines.length - 1, this._lines[this._lines.length - 1].length);
};

FakeDocument.prototype.offsetAt = function (position) {
    var offset = 0;
    for (var i = 0; i < position.line; i++) {
        offset += this._lines[i].length + 1;
    }
    return offset + position.character;
};

FakeDocument.prototype.lineAt = function (positionOrLine) {
    var line = typeof positionOrLine === 'number' ? positionOrLine : positionOrLine.line;
    var text = this._lines[line];
    return {
        text: text,
        range: {
            start: new FakePosition(line, 0),
            end: new FakePosition(line, text.length)
        }
    };
};

function createFakeVscode(configOverrides, capturedDecorations) {
    return {
        ThemeColor: function ThemeColor(id) {
            this.id = id;
        },
        Position: FakePosition,
        Range: FakeRange,
        DecorationRangeBehavior: {
            ClosedClosed: 1
        },
        workspace: {
            getConfiguration: function (section) {
                var values = configOverrides[section] || {};
                return Object.assign({
                    get: function (key, fallback) {
                        return values[key] !== undefined ? values[key] : fallback;
                    }
                }, values);
            }
        },
        window: {
            createTextEditorDecorationType: function (options) {
                var decoration = {
                    options: options,
                    id: capturedDecorations.length,
                    dispose: function () { }
                };
                capturedDecorations.push({
                    options: options,
                    ranges: []
                });
                return decoration;
            }
        }
    };
}

function clearHighlightModules(modules) {
    modules.forEach(function (modulePath) {
        delete require.cache[modulePath];
    });
}

function withHighlightPlan(configOverrides, action) {
    var originalLoad = Module._load;
    var capturedDecorations = [];
    var modules = [
        '../src/config.js',
        '../src/attributes.js',
        '../src/highlights.js'
    ].map(function (modulePath) {
        return require.resolve(modulePath);
    });

    clearHighlightModules(modules);

    Module._load = function (request) {
        if (request === 'vscode') {
            return createFakeVscode(configOverrides, capturedDecorations);
        }
        return originalLoad.apply(this, arguments);
    };

    try {
        var config = require('../src/config.js');
        var attributes = require('../src/attributes.js');
        var highlights = require('../src/highlights.js');
        config.init({
            workspaceState: {
                get: function (_key, fallback) {
                    return fallback;
                }
            }
        });
        attributes.init(config);
        highlights.init({
            subscriptions: [],
            globalStorageUri: { fsPath: '' },
            asAbsolutePath: function (resourcePath) {
                return resourcePath;
            }
        }, function () { });
        action(highlights);
    }
    finally {
        Module._load = originalLoad;
        clearHighlightModules(modules);
    }
}

function withHighlightRuntime(configOverrides, text, action) {
    var originalLoad = Module._load;
    var originalSetTimeout = global.setTimeout;
    var capturedDecorations = [];
    var modules = [
        '../src/config.js',
        '../src/attributes.js',
        '../src/utils.js',
        '../src/highlights.js'
    ].map(function (modulePath) {
        return require.resolve(modulePath);
    });

    clearHighlightModules(modules);

    Module._load = function (request) {
        if (request === 'vscode') {
            return createFakeVscode(configOverrides, capturedDecorations);
        }
        return originalLoad.apply(this, arguments);
    };
    global.setTimeout = function (callback, _delay) {
        var args = Array.prototype.slice.call(arguments, 2);
        callback.apply(undefined, args);
        return 1;
    };

    try {
        var config = require('../src/config.js');
        var attributes = require('../src/attributes.js');
        var utils = require('../src/utils.js');
        var highlights = require('../src/highlights.js');
        config.init({
            workspaceState: {
                get: function (_key, fallback) {
                    return fallback;
                }
            }
        });
        attributes.init(config);
        utils.init(config);
        highlights.init({
            subscriptions: [],
            globalStorageUri: { fsPath: '' },
            asAbsolutePath: function (resourcePath) {
                return resourcePath;
            }
        }, function () { });

        var editor = {
            document: new FakeDocument(text),
            viewColumn: 1,
            setDecorations: function (decoration, ranges) {
                capturedDecorations[decoration.id].ranges = ranges;
            }
        };

        highlights.triggerHighlight(editor);
        action(capturedDecorations);
    }
    finally {
        Module._load = originalLoad;
        global.setTimeout = originalSetTimeout;
        clearHighlightModules(modules);
    }
}

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

QUnit.test('highlights resolves channel scopes independently of legacy type', function (assert) {
    var source = fs.readFileSync('src/highlights.js', 'utf8');
    assert.ok(source.indexOf('function getRangeType(') !== -1);
    assert.ok(source.indexOf("attributes.getAttribute(tag, channelAttribute, defaultValue)") !== -1);
    assert.ok(source.indexOf("attributes.getAttribute(tag, 'type'") === -1);
    assert.ok(source.indexOf("getRangeType(tag, 'colorType', 'text')") !== -1);
    assert.ok(source.indexOf("getRangeType(tag, 'glowType', 'tag')") !== -1);
    assert.ok(source.indexOf("getRangeType(tag, 'glassType', 'tag')") !== -1);
    assert.ok(source.indexOf("getRangeType(tag, 'fontType', 'tag')") !== -1);
});

QUnit.test('highlights uses explicit channel scopes even when legacy type is present', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    type: 'none',
                    colorType: 'text',
                    glowType: 'tag',
                    glassType: 'whole-line',
                    fontType: 'tag',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.color.rangeType, 'text');
        assert.equal(plan.channels.glow.rangeType, 'tag');
        assert.equal(plan.channels.glass.rangeType, 'whole-line');
        assert.equal(plan.channels.font.rangeType, 'tag');
    });
});

QUnit.test('highlights keeps 2.0 channel defaults when only legacy type is configured', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    type: 'tag',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    fontWeight: 'bold'
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.color.rangeType, 'text');
        assert.equal(plan.channels.glow.rangeType, 'tag');
        assert.equal(plan.channels.glass.rangeType, 'tag');
        assert.equal(plan.channels.font.rangeType, 'tag');
    });
});

QUnit.test('highlights renders glass fill from 8 digit hex backgrounds', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    type: 'whole-line',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.glass.style.light.backgroundColor, '#42A5F566');
        assert.equal(plan.channels.glass.enabled, true);
    });
});

QUnit.test('highlights preserves explicit white foreground with glass schemes', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5'
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.color.style.light.color, '#FFFFFF');
        assert.equal(plan.channels.color.style.dark.color, '#FFFFFF');
    });
});

QUnit.test('highlights treats null and zero opacity settings as unset', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5'
                }
            },
            defaultHighlight: {},
            foregroundOpacity: 0,
            glowOpacity: 0,
            glassOpacity: 0,
            glassBorderOpacity: 0,
            opacity: 0,
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.color.style.light.color, '#FFFFFF');
        assert.equal(plan.channels.glow.enabled, true);
        assert.ok(plan.channels.glow.style.light.textShadow.indexOf('rgba(66,165,245,0.45)') !== -1);
        assert.equal(plan.channels.glass.enabled, true);
        assert.equal(plan.channels.glass.style.light.backgroundColor, '#42A5F566');
    });
});

QUnit.test('highlights applies explicit glassOpacity over 8 digit hex defaults', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    glassOpacity: 40
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.channels.glass.style.light.backgroundColor, 'rgba(66,165,245,0.4)');
    });
});

QUnit.test('highlights renders glass fill from alpha-only legacy backgrounds', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                BLOCKER: {
                    foreground: '#FFFFFF',
                    background: '#FF174466',
                    gutterIcon: false
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['BLOCKER'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('BLOCKER');
        assert.equal(plan.channels.glass.style.light.backgroundColor, '#FF174466');
        assert.equal(plan.channels.glass.enabled, true);
    });
});

QUnit.test('highlights keeps ruler colour valid when opacity is not configured', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    rulerColour: '#42A5F5'
                }
            },
            defaultHighlight: {
                rulerLane: 'center'
            },
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.equal(plan.meta.rulerColour, '#42A5F5');
    });
});

QUnit.test('highlights applies visible text and glass decorations for legacy type settings', function (assert) {
    withHighlightRuntime({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    type: 'tag',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    fontWeight: 'bold'
                }
            },
            defaultHighlight: {},
            enabled: true,
            highlightDelay: 0,
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
            regexCaseSensitive: true,
            subTagRegex: '',
            enableMultiLine: false
        }
    }, '// TODO [todo] fix cache\n', function (decorations) {
        var textDecoration = decorations.find(function (decoration) {
            return decoration.options.light && decoration.options.light.color !== undefined;
        });

        var glassDecoration = decorations.find(function (decoration) {
            return decoration.options.light && decoration.options.light.backgroundColor !== undefined;
        });

        assert.ok(glassDecoration, 'glass fill decoration should be created for alpha background');
        assert.equal(glassDecoration.options.light.backgroundColor, '#42A5F566');
        assert.ok(glassDecoration.ranges.length > 0, 'glass fill should be applied to a range');

        assert.ok(textDecoration, 'text decoration should be created');
        assert.equal(textDecoration.options.light.color, '#FFFFFF');
        assert.ok(textDecoration.options.light.textDecoration.indexOf('text-shadow') !== -1);
        assert.ok(textDecoration.options.light.textDecoration.indexOf('text-decoration-color: rgba(66,165,245,0.45)') !== -1);
        assert.ok(textDecoration.ranges.length > 0, 'text decoration should be applied to a range');
    });
});

QUnit.test('highlights applies explicit glowOpacity when glow is desired', function (assert) {
    withHighlightPlan({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    glowOpacity: 40
                }
            },
            defaultHighlight: {},
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regexCaseSensitive: true
        }
    }, function (highlights) {
        var plan = highlights._getTagPlan('TODO');
        assert.ok(plan.channels.glow.enabled);
        assert.ok(plan.channels.glow.style.light.textShadow.indexOf('rgba(66,165,245,0.4)') !== -1);
    });
});

QUnit.test('highlights only uses full-width glass for explicit whole-line scope', function (assert) {
    withHighlightRuntime({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    glassType: 'whole-line',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    glassBorderOpacity: 30
                }
            },
            defaultHighlight: {},
            enabled: true,
            highlightDelay: 0,
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
            regexCaseSensitive: true,
            subTagRegex: '',
            enableMultiLine: false
        }
    }, '// TODO [todo] fix cache\n', function (decorations) {
        var glassDecoration = decorations.find(function (decoration) {
            return decoration.options.light && decoration.options.light.border !== undefined;
        });

        assert.ok(glassDecoration, 'glass decoration should be created');
        assert.equal(glassDecoration.options.isWholeLine, true);
    });
});

QUnit.test('highlights supports explicit line glass without full-width editor fill', function (assert) {
    withHighlightRuntime({
        'taskvision.highlights': {
            customHighlight: {
                TODO: {
                    glassType: 'line',
                    foreground: '#FFFFFF',
                    background: '#42A5F566',
                    scheme: 'neon+glass',
                    gutterIcon: false,
                    iconColour: '#42A5F5',
                    glassBorderOpacity: 30
                }
            },
            defaultHighlight: {},
            enabled: true,
            highlightDelay: 0,
            useColourScheme: false
        },
        'taskvision.general': {
            tags: ['TODO'],
            tagGroups: {}
        },
        'taskvision.regex': {
            regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
            regexCaseSensitive: true,
            subTagRegex: '',
            enableMultiLine: false
        }
    }, '// TODO [todo] fix cache\n', function (decorations) {
        var glassDecoration = decorations.find(function (decoration) {
            return decoration.options.light && decoration.options.light.border !== undefined;
        });

        assert.ok(glassDecoration, 'glass decoration should be created');
        assert.equal(glassDecoration.options.isWholeLine, false);
        assert.equal(glassDecoration.ranges[0].range.start.character, 0);
        assert.equal(glassDecoration.ranges[0].range.end.character, 24);
    });
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
