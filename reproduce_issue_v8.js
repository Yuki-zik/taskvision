const Module = require('module');
const originalRequire = Module.prototype.require;

const mockConfigVals = {
    'taskvision.general': {
        tags: ['TODO', '[x]'],
        tagGroups: {},
        schemes: ['file']
    },
    'taskvision.tree': {},
    'taskvision.regex': {
        regex: '(TODO|\\[x\\])',
        regexCaseSensitive: true,
        enableMultiLine: false,
        subTagRegex: '^\\s*:?\\s*(@[a-zA-Z0-9_+-]+)'
    },
    'taskvision.highlights': {
        enabled: true,
        useColourScheme: false,
        defaultHighlight: {},
        customHighlight: {
            'TODO': {
                type: 'text',
                color: 'red'
            }
        }
    }
};

const vscodeMock = {
    workspace: {
        getConfiguration: (section) => {
            const vals = mockConfigVals[section] || {};
            return {
                get: (key, def) => {
                    if (vals[key] !== undefined) return vals[key];
                    return def;
                },
                ...vals
            };
        }
    },
    ThemeColor: class ThemeColor {
        constructor(id) { this.id = id; }
    },
    DecorationRangeBehavior: { ClosedClosed: 0 },
    window: {
        createTextEditorDecorationType: (opts) => opts
    },
    Position: class Position {
        constructor(line, char) { this.line = line; this.character = char; }
        isBeforeOrEqual(other) { return this.line < other.line || (this.line === other.line && this.character <= other.character); }
    },
    Range: class Range {
        constructor(start, end) { this.start = start; this.end = end; }
    }
};

Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};

const debug = console.log;

const highlights = require('./src/highlights.js');
const config = require('./src/config.js');
const utils = require('./src/utils.js');
const attributes = require('./src/attributes.js');

config.init({ workspaceState: { get: (k, d) => d } });
utils.init(config);
attributes.init(config);
highlights.init({ subscriptions: [] }, debug);

try {
    console.log("Calling _getTagPlan...");
    highlights._getTagPlan('TODO');
    console.log("Done calling _getTagPlan.");
} catch (e) {
    console.log("CAUGHT IN GETTAGPLAN:");
    console.log(e.stack);
}
