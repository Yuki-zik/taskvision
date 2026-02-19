var Module = require('module');
var originalRequire = Module.prototype.require;
var path = require('path');

// Mock specific modules
var mockConfig = {
    init: () => { },
    isRegexCaseSensitive: () => true,
    customHighlight: () => ({
        "TODO": {
            type: "whole-line",
            icon: "check",
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
    tagGroup: () => undefined
};

var mockAttributes = {
    init: () => { }, // mock init
    getForeground: (tag) => "blue",
    getBackground: (tag) => "red",
    getOpacity: (tag) => 100,
    getRulerColour: (tag) => "blue",
    getRulerLane: (tag) => 4,
    getBorderRadius: (tag) => undefined,
    getScheme: (tag) => undefined,
    getIcon: (tag) => "check",
    getAttribute: (tag, attr) => {
        if (attr === 'type') return 'whole-line';
        if (attr === 'icon') return 'check';
        return undefined;
    }
    // We might need others dependent on what highlights.js calls.
    // highlights.js calls attributes.getForeground, getBackground, etc.
};

var mockIcons = {
    getIcon: (context, tag) => ({ dark: "path/to/icon", light: "path/to/icon" })
};

Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return {
            ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
            window: {
                createTextEditorDecorationType: (opts) => opts
            },
            DecorationRangeBehavior: {
                ClosedClosed: 1
            },
            OverviewRulerLane: {
                Left: 1, Center: 2, Right: 4, Full: 7
            },
            Uri: { file: (path) => ({ fsPath: path }) }
        };
    }
    if (request === './config.js' || request.endsWith('config.js')) {
        return mockConfig;
    }
    if (request === './icons.js' || request.endsWith('icons.js')) {
        return mockIcons;
    }
    // We can use the real attributes.js if we trust it, or mock it.
    // Real attributes.js is simple enough, but relies on config.
    // Since we mocked config, real attributes should work.

    // We also need to be careful about utils.js? 
    // utils.js requires 'micromatch', 'find'. existing node_modules should handle it.

    try {
        return originalRequire.apply(this, arguments);
    } catch (e) {
        // If it fails to find a module, maybe it is because we are running from src/
        // and it expects to find modules in node_modules/
        // If the error is 'Cannot find module', we might need to adjust paths or mock more.
        if (e.code === 'MODULE_NOT_FOUND' && !request.startsWith('.')) {
            // It's a package. Assuming it's installed.
        }
        throw e;
    }
};

var highlights = require('./highlights.js');
// Manually init attributes if we are using the real one
var attributes = require('./attributes.js');
attributes.init(mockConfig);

console.log("--- TEST START ---");

var tag = "TODO";
// We need to ensure highlights.init is called? highlights.init sets context.
// highlights.js:27 function init(context_, debug_)
var mockContext = { subscriptions: [] };
var mockDebug = console.log;

highlights.init(mockContext, mockDebug);

var decoration = highlights.getDecoration(tag);

console.log("Primary Decoration (Background):");
console.log(JSON.stringify(decoration.primary, null, 2));

console.log("\nSecondary Decoration (Foreground):");
console.log(JSON.stringify(decoration.secondary, null, 2));

if (decoration.primary && decoration.primary.isWholeLine && decoration.primary.light && decoration.primary.light.color) {
    console.log("\n[FAIL] Primary decoration has 'color' AND 'isWholeLine': true. This causes the whole line text to be colored.");
} else {
    // Also check if secondary exists and has color
    if (!decoration.secondary) {
        console.log("\n[FAIL] Secondary decoration MISSING. Text color will be lost.");
    } else if (!decoration.secondary.light || !decoration.secondary.light.color) {
        console.log("\n[FAIL] Secondary decoration MISSING color.");
    } else {
        console.log("\n[PASS] Primary decoration clean, secondary decoration has color.");
    }
}
