var vm = require('vm');
var fs = require('fs');
var path = require('path');

// 1. Prepare Real Utils (initialized with Mock Config)
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

// 2. Prepare Other Mocks
var mockVscode = {
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
    Uri: { file: (path) => ({ fsPath: path }) },
    workspace: {
        getConfiguration: () => ({
            get: () => undefined
        })
    }
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
        // Mocking the specific logic we need for highlights.js -> getType(tag)
        if (attr === 'type') return 'whole-line';
        if (attr === 'icon') return 'check';
        if (attr === 'foreground') return 'blue';
        if (attr === 'background') return 'red';
        return undefined;
    },
    getIconColour: (tag) => undefined,
    getFontWeight: (tag) => undefined,
    getFontStyle: (tag) => undefined,
    // Add missing methods that highlights.js calls
    getRulerOpacity: (tag) => undefined, // highlights.js calls this? No, it calls getOpacity
    // Actually highlights.js calls getRulerOpacity which calls attributes.getOpacity
};
// Fix up missing attributes methods if necessary
mockAttributes.getIconColour = (tag) => undefined;


var mockIcons = {
    getIcon: (context, tag) => ({ dark: "path/to/icon", light: "path/to/icon" })
};

var realSchemes = require('./schemes.js');

// 3. VM Sandbox
var code = fs.readFileSync(path.join(__dirname, 'highlights.js'), 'utf8');

var sandbox = {
    require: function (name) {
        // console.log("Sandbox require: " + name);
        if (name === 'vscode') return mockVscode;
        if (name === './config.js') return mockConfig;
        if (name === './utils.js') return utils;
        if (name === './attributes.js') return mockAttributes;
        if (name === './icons.js') return mockIcons;
        if (name === './schemes.js') return realSchemes;

        // Fallback to real require
        try {
            return require(name);
        } catch (e) {
            // handle relative paths that vm might not resolve correctly relative to file
            if (name.startsWith('.')) {
                return require(path.join(__dirname, name));
            }
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

try {
    vm.runInContext(code, sandbox);
} catch (e) {
    console.error("VM Run Failed: ", e);
    process.exit(1);
}

var highlights = sandbox.module.exports;

// 4. Test Logic
console.log("--- TEST START ---");

// Init highlights
highlights.init({ subscriptions: [] }, console.log);

var tag = "TODO";
var decoration = highlights.getDecoration(tag);

getScheme: (tag) => "neon+glass",

    // ... (in test logic)
    console.log("Primary Light Color: ", decoration.primary.light && decoration.primary.light.color);
console.log("Primary Dark Color: ", decoration.primary.dark && decoration.primary.dark.color);
console.log("Primary IsWholeLine: ", decoration.primary.isWholeLine);

if ((decoration.primary.light && decoration.primary.light.color) || (decoration.primary.dark && decoration.primary.dark.color)) {
    if (decoration.primary.isWholeLine) {
        console.log("[FAIL] Primary has color AND isWholeLine.");
    } else {
        console.log("[PASS] Primary has color but isWholeLine is FALSE (unexpected for whole-line type?)");
    }
} else {
    console.log("[PASS] Primary is clean.");
}
