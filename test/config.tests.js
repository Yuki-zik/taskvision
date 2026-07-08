var fs = require('fs');
var os = require('os');
var path = require('path');
var Module = require('module');

function withMockedVscode(appRoot, configuredRipgrep, action) {
    var originalLoad = Module._load;
    var configPath = require.resolve('../src/config.js');

    delete require.cache[configPath];
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                env: {
                    appRoot: appRoot
                },
                workspace: {
                    getConfiguration: function (section) {
                        if (section === 'taskvision.ripgrep') {
                            return {
                                ripgrep: configuredRipgrep || ''
                            };
                        }
                        return {
                            get: function (_key, fallback) {
                                return fallback;
                            }
                        };
                    }
                }
            };
        }
        return originalLoad.apply(this, arguments);
    };

    try {
        action(require('../src/config.js'));
    }
    finally {
        Module._load = originalLoad;
        delete require.cache[configPath];
    }
}

function makeExecutable(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');
    fs.chmodSync(filePath, 0o755);
}

function platformFolderName() {
    var arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    if (process.platform === 'win32') {
        return 'win32-' + arch;
    }
    if (process.platform === 'darwin') {
        return 'darwin-' + arch;
    }
    return 'linux-' + arch;
}

QUnit.test('config.ripgrepPath locates VS Code ripgrep-universal binaries', function (assert) {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-vscode-rg-'));
    var exeName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    var rgPath = path.join(root, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', platformFolderName(), exeName);

    try {
        makeExecutable(rgPath);
        withMockedVscode(root, '', function (config) {
            assert.equal(config.ripgrepPath(), rgPath);
        });
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test('config.ripgrepPath falls back to rg on PATH', function (assert) {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-vscode-rg-'));
    var bin = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-path-rg-'));
    var exeName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    var rgPath = path.join(bin, exeName);
    var originalPath = process.env.PATH;

    try {
        makeExecutable(rgPath);
        process.env.PATH = bin;
        withMockedVscode(root, '', function (config) {
            assert.equal(config.ripgrepPath(), rgPath);
        });
    }
    finally {
        process.env.PATH = originalPath;
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(bin, { recursive: true, force: true });
    }
});
