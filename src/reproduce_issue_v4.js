const vm = require('vm');
const path = require('path');
const fs = require('fs');

// Mock VS Code API
const vscode = {
    workspace: {
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'customHighlight') return { "TODO": { scheme: "neon+glass", type: "whole-line" } };
                if (key === 'highlight') return 'whole-line';
                return def;
            },
            inspect: () => ({ defaultValue: {} })
        })
    },
    DecorationRangeBehavior: { ClosedClosed: 1 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    window: {
        createTextEditorDecorationType: (options) => {
            console.log('[Mock] created decoration type with:', JSON.stringify(options, null, 2));
            return { dispose: () => { } };
        }
    }
};

// Mock utils
const utils = {
    isHexColour: (c) => /^#/.test(c),
    isValidColour: (c) => true,
    hexToRgba: (hex, alpha) => `rgba(${hex},${alpha})`,
    complementaryColour: () => '#000000',
    getRegexForEditorSearch: () => /TODO/g,
    setRgbAlpha: (rgb, alpha) => rgb
};

// Create a context for execution
const sandbox = {
    require: (modulePath) => {
        if (modulePath === 'vscode') return vscode;
        if (modulePath === 'regexp-match-indices') return { shim: () => { } };
        if (modulePath === './utils.js') return utils;
        if (modulePath === './config.js') return {
            customHighlight: () => ({ "TODO": { scheme: "neon+glass", type: "whole-line" } }),
            defaultHighlight: () => ({}),
            tags: () => ["TODO"],
            shouldUseColourScheme: () => false,
            backgroundColourScheme: () => [],
            foregroundColourScheme: () => [],
            tagGroup: () => undefined,
            subTagRegex: () => '.*'
        };

        // Handle local modules by reading file content
        if (modulePath.startsWith('./')) {
            const fullPath = path.join(__dirname, modulePath);
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const moduleContext = {
                module: { exports: {} },
                require: sandbox.require,
                console: sandbox.console
            };
            vm.createContext(moduleContext);
            const script = new vm.Script(fileContent);
            script.runInContext(moduleContext);
            // If the module exports an init function, we might need to call it?
            // attributes.js has init(config)
            if (modulePath === './attributes.js') {
                moduleContext.module.exports.init(sandbox.require('./config.js'));
            }
            return moduleContext.module.exports;
        }
        return {};
    },
    module: { exports: {} },
    console: console,
    __dirname: __dirname,
    process: process
};

vm.createContext(sandbox);

// Helper to run a module in sandbox
function runModule(moduleName) {
    const src = fs.readFileSync(path.join(__dirname, moduleName), 'utf8');
    const script = new vm.Script(src);
    script.runInContext(sandbox);
    return sandbox.module.exports;
}

console.log('--- Loading highlights.js in sandbox ---');
const highlights = runModule('highlights.js');
highlights.init({ subscriptions: [] }, true);

console.log('--- Testing getDecoration("TODO") ---');
try {
    const result = highlights.getDecoration("TODO");
    // The createTextEditorDecorationType mock logs the options
} catch (e) {
    console.error('Error:', e);
}
