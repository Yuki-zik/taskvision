const vm = require('vm');
const path = require('path');
const fs = require('fs');

const logFile = path.resolve(__dirname, 'repro_output.txt');
fs.writeFileSync(logFile, '');

function log(msg) {
    fs.appendFileSync(logFile, (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

// Mock VS Code API
const vscode = {
    workspace: {
        getConfiguration: (section) => ({
            get: (key, def) => {
                // If section is 'taskvision.highlights' it will enter here.
                if (key === 'customHighlight') return { "TODO": { "scheme": "neon+glass", "type": "whole-line" } };
                if (key === 'highlight') return 'whole-line';
                if (key === 'schemes') return {};
                if (key === 'opacity') return 50;
                if (key === 'overviewRulerLane') return 'none';
                if (key === 'borderRadius') return '0px';
                if (key === 'fontWeight') return 'normal';
                if (key === 'fontStyle') return 'normal';
                if (key === 'textDecoration') return '';
                if (key === 'icon') return false;
                return def;
            },
            inspect: () => ({ defaultValue: {} })
        })
    },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    window: {
        createTextEditorDecorationType: (options) => {
            log('[Mock] created decoration type with:');
            log(JSON.stringify(options, null, 2));
            return { dispose: () => { } };
        }
    }
};

const utils = {
    isHexColour: (c) => /^#/.test(c),
    isValidColour: (c) => true,
    hexToRgba: (hex, alpha) => `rgba(${hex},${alpha})`,
    complementaryColour: () => '#000000',
    getRegexForEditorSearch: () => /TODO/g,
    setRgbAlpha: (rgb, alpha) => rgb,
    extractTag: (t) => ({ tag: 'TODO', tagOffset: 0 }),
    updateBeforeAndAfter: () => { },
    isThemeColour: () => false
};

const sandbox = {
    require: (modulePath) => {
        if (modulePath === 'vscode') return vscode;
        if (modulePath === 'regexp-match-indices') return { shim: () => { } };
        return {};
    },
    module: { exports: {} },
    console: { log: log, error: log },
    process: process
};

vm.createContext(sandbox);

const loadFile = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

// 1. Config
sandbox.config = {
    customHighlight: () => ({ "TODO": { "scheme": "neon+glass", "type": "whole-line" } }),
    defaultHighlight: () => ({}),
    tags: () => ["TODO"],
    shouldUseColourScheme: () => false,
    backgroundColourScheme: () => [],
    foregroundColourScheme: () => [],
    tagGroup: () => undefined,
    subTagRegex: () => '.*',
    validationCodes: () => [],
    isRegexCaseSensitive: () => true
};

// 2. Attributes
const attributesSrc = loadFile('attributes.js');
const attributesContext = {
    module: { exports: {} },
    require: (p) => {
        if (p === './config.js') return sandbox.config;
        return {};
    },
    console: { log: log, error: log }
};
vm.createContext(attributesContext);
new vm.Script(attributesSrc).runInContext(attributesContext);
sandbox.attributes = attributesContext.module.exports;
sandbox.attributes.init(sandbox.config);

// 3. Schemes
const schemesSrc = loadFile('schemes.js');
const schemesContext = {
    module: { exports: {} },
    require: (p) => {
        if (p === './utils.js') return utils;
        return {};
    },
    console: { log: log, error: log },
    utils: utils
};
vm.createContext(schemesContext);
new vm.Script(schemesSrc).runInContext(schemesContext);
sandbox.schemes = schemesContext.module.exports;

// 4. Highlights
const highlightsSrc = loadFile('highlights.js');
const highlightsContext = {
    module: { exports: {} },
    require: (p) => {
        if (p === 'vscode') return vscode;
        if (p === 'regexp-match-indices') return { shim: () => { } };
        if (p === './config.js') return sandbox.config;
        if (p === './utils.js') return utils;
        if (p === './attributes.js') return sandbox.attributes;
        if (p === './icons.js') return { getIcon: () => ({ dark: 'icon.png' }) };
        if (p === './schemes.js') return sandbox.schemes;
        return {};
    },
    console: { log: log, error: log },
    process: process
};
vm.createContext(highlightsContext);
new vm.Script(highlightsSrc).runInContext(highlightsContext);
const highlights = highlightsContext.module.exports;

highlights.init({ subscriptions: [] }, true);

log('--- Testing getDecoration("TODO") ---');
try {
    const result = highlights.getDecoration("TODO");
    if (result.primary) log('Primary created.');
    if (result.secondary) log('Secondary created.');
} catch (e) {
    log('Error: ' + e.toString());
    log(e.stack);
}
