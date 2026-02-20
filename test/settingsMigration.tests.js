var settingsMigration = require('../src/settingsMigration.js');

function createStore() {
    return {
        global: {},
        workspace: {},
        folders: {}
    };
}

function getScopedStore(store, namespace, scopeKey) {
    if (scopeKey) {
        if (!store.folders[scopeKey]) {
            store.folders[scopeKey] = {};
        }
        if (!store.folders[scopeKey][namespace]) {
            store.folders[scopeKey][namespace] = {};
        }
        return store.folders[scopeKey][namespace];
    }

    if (!store.global[namespace]) {
        store.global[namespace] = {};
    }
    if (!store.workspace[namespace]) {
        store.workspace[namespace] = {};
    }
}

function createMockVscode(store) {
    var workspaceFolders = [
        { uri: { fsPath: '/workspace-a' } },
        { uri: { fsPath: '/workspace-b' } }
    ];

    return {
        ConfigurationTarget: {
            Global: 1,
            Workspace: 2,
            WorkspaceFolder: 3
        },
        workspace: {
            workspaceFolders: workspaceFolders,
            getConfiguration: function (namespace, scope) {
                var scopeKey = scope && scope.fsPath;
                getScopedStore(store, namespace, scopeKey);

                return {
                    inspect: function (settingPath) {
                        var globalValue = store.global[namespace] ? store.global[namespace][settingPath] : undefined;
                        var workspaceValue = store.workspace[namespace] ? store.workspace[namespace][settingPath] : undefined;
                        var workspaceFolderValue = undefined;
                        if (scopeKey && store.folders[scopeKey] && store.folders[scopeKey][namespace]) {
                            workspaceFolderValue = store.folders[scopeKey][namespace][settingPath];
                        }

                        return {
                            globalValue: globalValue,
                            workspaceValue: workspaceValue,
                            workspaceFolderValue: workspaceFolderValue
                        };
                    },
                    update: function (settingPath, value, target) {
                        if (target === 1) {
                            if (!store.global[namespace]) {
                                store.global[namespace] = {};
                            }
                            store.global[namespace][settingPath] = value;
                        }
                        else if (target === 2) {
                            if (!store.workspace[namespace]) {
                                store.workspace[namespace] = {};
                            }
                            store.workspace[namespace][settingPath] = value;
                        }
                        else if (target === 3 && scopeKey) {
                            if (!store.folders[scopeKey]) {
                                store.folders[scopeKey] = {};
                            }
                            if (!store.folders[scopeKey][namespace]) {
                                store.folders[scopeKey][namespace] = {};
                            }
                            store.folders[scopeKey][namespace][settingPath] = value;
                        }
                        return Promise.resolve();
                    }
                };
            }
        }
    };
}

function createMockContext() {
    var globalStateValues = {};

    return {
        globalState: {
            get: function (key, defaultValue) {
                return Object.prototype.hasOwnProperty.call(globalStateValues, key) ? globalStateValues[key] : defaultValue;
            },
            update: function (key, value) {
                globalStateValues[key] = value;
                return Promise.resolve();
            }
        },
        _state: globalStateValues
    };
}

QUnit.test("settingsMigration migrates legacy settings and sets migration version", async function (assert) {
    var store = createStore();
    var legacy = settingsMigration.LEGACY_NAMESPACE;
    var modern = settingsMigration.CURRENT_NAMESPACE;
    var setting = settingsMigration.SETTING_PATHS[0];

    store.global[legacy] = {};
    store.global[legacy][setting] = true;
    store.workspace[legacy] = {};
    store.workspace[legacy][setting] = false;
    store.folders['/workspace-a'] = {};
    store.folders['/workspace-a'][legacy] = {};
    store.folders['/workspace-a'][legacy][setting] = true;

    var vscode = createMockVscode(store);
    var context = createMockContext();

    var result = await settingsMigration.migrateLegacySettings(vscode, context, function () { });

    assert.ok(result.migrated);
    assert.equal(context._state.migratedVersion, settingsMigration.MIGRATION_VERSION);
    assert.equal(store.global[modern][setting], true);
    assert.equal(store.workspace[modern][setting], false);
    assert.equal(store.folders['/workspace-a'][modern][setting], true);
});

QUnit.test("settingsMigration does not overwrite new namespace values", async function (assert) {
    var store = createStore();
    var legacy = settingsMigration.LEGACY_NAMESPACE;
    var modern = settingsMigration.CURRENT_NAMESPACE;
    var setting = settingsMigration.SETTING_PATHS[1];

    store.global[legacy] = {};
    store.global[legacy][setting] = 123;
    store.global[modern] = {};
    store.global[modern][setting] = 999;

    var vscode = createMockVscode(store);
    var context = createMockContext();

    await settingsMigration.migrateLegacySettings(vscode, context, function () { });

    assert.equal(store.global[modern][setting], 999);
});

QUnit.test("settingsMigration is idempotent after migration version is set", async function (assert) {
    var store = createStore();
    var vscode = createMockVscode(store);
    var context = createMockContext();
    context._state.migratedVersion = settingsMigration.MIGRATION_VERSION;

    var result = await settingsMigration.migrateLegacySettings(vscode, context, function () { });
    assert.notOk(result.migrated);
    assert.equal(result.updates, 0);
});
