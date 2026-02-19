var vm = require('vm');
var fs = require('fs');
var path = require('path');

// 1. Prepare Real Utils
var mockConfig = {
    init: () => { },
    isRegexCaseSensitive: () => true,
    customHighlight: () => ({
        "TODO": {
            type: "whole-line",
            foreground: "blue",
            background: "red"
        }
    }),
    defaultHighlight: () => ({}),
    shouldUseColourScheme: () => false,
    backgroundColourScheme: () => [],
    foregroundColourScheme: () => [],
    tags: () => ["TODO"],
    regex: () => ({ regex: "(// TODO)" }),
    subTagRegex: () => "^:(.*)",
    tagGroup: () => undefined,
    shouldShowIconsInsteadOfTagsInStatusBar: () => false,
    scanMode: () => 'workspace'
};

var utils = require('./utils.js');
utils.init(mockConfig);

// 2. Prepare Mocks
var mockVscode = {
    ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
    window: {
        createTextEditorDecorationType: (opts) => opts
    },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
    Uri: { file: (path) => ({ fsPath: path }) },
    workspace: { getConfiguration: () => ({ get: () => undefined }) }
};

var mockAttributes = {
    getForeground: (tag) => "blue",
    getBackground: (tag) => "red",
    getOpacity: (tag) => 100,
    getRulerColour: (tag) => "blue",
    getRulerLane: (tag) => 4,
    getBorderRadius: (tag) => undefined,
    getScheme: (tag) => "neon",
    getIcon: (tag) => "check",
    getAttribute: (tag, attr) => {
        if (attr === 'type') return 'whole-line';
        if (attr === 'icon') return 'check';
        if (attr === 'foreground') return 'blue';
        if (attr === 'background') return 'red';
        return undefined;
    },
    getIconColour: (tag) => undefined,
    getFontWeight: (tag) => undefined,
    getFontStyle: (tag) => undefined,
    getRulerOpacity: (tag) => undefined
};

var mockIcons = {
    getIcon: (context, tag) => ({ dark: "path/to/icon", light: "path/to/icon" })
};

// 3. Load functions via VM
var highlightsCode = fs.readFileSync(path.join(__dirname, 'highlights.js'), 'utf8');
var schemesCode = fs.readFileSync(path.join(__dirname, 'schemes.js'), 'utf8');

// Inject logging into schemes.js
// We want to see where options.light.color is assigned.
// We'll replace "options.light.color =" with a log and assignment.
schemesCode = schemesCode.replace(/options\.light\.color\s*=/g, 'console.log("ASSIGNING options.light.color!"); options.light.color =');
schemesCode = schemesCode.replace(/options\.dark\.color\s*=/g, 'console.log("ASSIGNING options.dark.color!"); options.dark.color =');

// Also log entry
schemesCode = schemesCode.replace(/function applyScheme\(options,/g, 'function applyScheme(options,');
// We can't easily inject at start of function without parsing, but we can append to console logs if we matched signatures.
// Let's just trust the assignment logs.

var sandbox = {
    require: function (name) {
        if (name === 'vscode') return mockVscode;
        if (name === './config.js') return mockConfig;
        if (name === './utils.js') return utils;
        if (name === './attributes.js') return mockAttributes;
        if (name === './icons.js') return mockIcons;
        if (name === './schemes.js') return sandbox.schemesExports; // Return the vm-loaded schemes

        try {
            return require(name);
        } catch (e) {
            if (name.startsWith('.')) return require(path.join(__dirname, name));
            throw e;
        }
    },
    console: console,
    module: { exports: {} },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
};
sandbox.exports = sandbox.module.exports;

vm.createContext(sandbox);

// Run schemes.js first
try {
    vm.runInContext(schemesCode, sandbox);
    sandbox.schemesExports = sandbox.module.exports;
} catch (e) {
    console.error("Schemes VM Run Failed: ", e);
}

// Run highlights.js
sandbox.module.exports = {}; // reset
try {
    vm.runInContext(highlightsCode, sandbox);
} catch (e) {
    console.error("Highlights VM Run Failed: ", e);
}

var highlights = sandbox.module.exports;

// 4. Test Logic
console.log("--- TEST START ---");
highlights.init({ subscriptions: [] }, console.log);

var tag = "TODO"; // whole-line, neon scheme (from mockAttributes)
var decoration = highlights.getDecoration(tag);

console.log("Primary Light Color: ", decoration.primary.light && decoration.primary.light.color);

if ((decoration.primary.light && decoration.primary.light.color)) {
    console.log("[FAIL] Primary has color.");
} else {
    console.log("[PASS] Primary is clean.");
}
