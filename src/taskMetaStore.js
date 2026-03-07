/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

var STORE_VERSION = 1;
var STORE_FILE_NAME = 'tasks-meta.json';
var cache = {};

function resetCache() {
    cache = {};
}

function getOutputFolder(rootPath, outputDir) {
    var normalisedOutputDir = typeof outputDir === 'string' && outputDir.trim() !== '' ? outputDir.trim() : '.taskvision';

    if (path.isAbsolute(normalisedOutputDir)) {
        return path.normalize(normalisedOutputDir);
    }

    if (!rootPath) {
        return undefined;
    }

    return path.join(rootPath, normalisedOutputDir);
}

function getOutputRelativeGlob(rootPath, outputDir) {
    var outputFolder = getOutputFolder(rootPath, outputDir);
    if (!rootPath || !outputFolder) {
        return undefined;
    }

    var relative = path.relative(rootPath, outputFolder);
    if (!relative || relative.indexOf('..') === 0 || path.isAbsolute(relative)) {
        return undefined;
    }

    return relative.replace(/\\/g, '/') + '/**';
}

function isOutputPath(rootPath, filePath, outputDir) {
    if (!rootPath || !filePath) {
        return false;
    }

    var outputFolder = getOutputFolder(rootPath, outputDir);
    if (!outputFolder) {
        return false;
    }

    var relative = path.relative(outputFolder, filePath);
    return relative === '' || (relative.indexOf('..') !== 0 && path.isAbsolute(relative) === false);
}

function getStorePath(rootPath, outputDir) {
    var folder = getOutputFolder(rootPath, outputDir);
    if (!folder) {
        return undefined;
    }

    return path.join(folder, STORE_FILE_NAME);
}

function ensureFolder(folderPath) {
    if (!folderPath) {
        return;
    }

    if (fs.existsSync(folderPath) !== true) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function createEmptyStore() {
    return {
        version: STORE_VERSION,
        tasks: {}
    };
}

function loadStore(rootPath, outputDir) {
    if (!rootPath) {
        return createEmptyStore();
    }

    var key = getStorePath(rootPath, outputDir);
    if (cache[key]) {
        return cache[key];
    }

    var store = createEmptyStore();
    if (fs.existsSync(key) === true) {
        try {
            var parsed = JSON.parse(fs.readFileSync(key, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                store.version = parsed.version || STORE_VERSION;
                store.tasks = parsed.tasks || {};
            }
        }
        catch (e) {
            store = createEmptyStore();
        }
    }

    cache[key] = store;
    return store;
}

function saveStore(rootPath, outputDir) {
    if (!rootPath) {
        return undefined;
    }

    var storePath = getStorePath(rootPath, outputDir);
    var store = loadStore(rootPath, outputDir);

    ensureFolder(path.dirname(storePath));
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n');
    return storePath;
}

function getTaskEntry(rootPath, taskId, outputDir) {
    if (!rootPath || !taskId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    if (!store.tasks[taskId]) {
        return undefined;
    }

    return store.tasks[taskId];
}

function getTaskMetadata(rootPath, taskId, defaultPriority, outputDir) {
    var entry = getTaskEntry(rootPath, taskId, outputDir) || {};
    return {
        priority: entry.priority || defaultPriority || 'normal',
        note: entry.note || '',
        lastActor: entry.lastActor,
        updatedAt: entry.updatedAt,
        lastExportedStatus: entry.lastExportedStatus,
        lastExportedAt: entry.lastExportedAt
    };
}

function ensureTaskEntry(rootPath, taskId, outputDir) {
    if (!rootPath || !taskId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    if (!store.tasks[taskId]) {
        store.tasks[taskId] = {};
    }

    return store.tasks[taskId];
}

function updateTask(rootPath, taskId, patch, outputDir) {
    var entry = ensureTaskEntry(rootPath, taskId, outputDir);
    if (!entry) {
        return undefined;
    }

    Object.keys(patch || {}).forEach(function (key) {
        if (patch[key] === undefined) {
            delete entry[key];
        }
        else {
            entry[key] = patch[key];
        }
    });

    return saveStore(rootPath, outputDir);
}

function setTaskPriority(rootPath, taskId, priority, actor, updatedAt, outputDir) {
    return updateTask(rootPath, taskId, {
        priority: priority,
        lastActor: actor,
        updatedAt: updatedAt
    }, outputDir);
}

function setTaskNote(rootPath, taskId, note, actor, updatedAt, outputDir) {
    return updateTask(rootPath, taskId, {
        note: note,
        lastActor: actor,
        updatedAt: updatedAt
    }, outputDir);
}

function markTasksExported(rootPath, tasks, exportedAt, outputDir) {
    if (!rootPath) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    (tasks || []).forEach(function (task) {
        if (!task || !task.taskId) {
            return;
        }

        if (!store.tasks[task.taskId]) {
            store.tasks[task.taskId] = {};
        }

        store.tasks[task.taskId].lastExportedStatus = task.status;
        store.tasks[task.taskId].lastExportedAt = exportedAt;
        store.tasks[task.taskId].file = task.fsPath;
        store.tasks[task.taskId].line = task.line !== undefined ? task.line + 1 : undefined;
    });

    return saveStore(rootPath, outputDir);
}

function getExportBaseline(rootPath, outputDir) {
    var store = loadStore(rootPath, outputDir);
    var result = {};

    Object.keys(store.tasks || {}).forEach(function (taskId) {
        var entry = store.tasks[taskId];
        if (entry && entry.lastExportedStatus !== undefined) {
            result[taskId] = entry;
        }
    });

    return result;
}

module.exports.STORE_VERSION = STORE_VERSION;
module.exports.STORE_FILE_NAME = STORE_FILE_NAME;
module.exports.getOutputFolder = getOutputFolder;
module.exports.getOutputRelativeGlob = getOutputRelativeGlob;
module.exports.getStorePath = getStorePath;
module.exports.getTaskMetadata = getTaskMetadata;
module.exports.setTaskPriority = setTaskPriority;
module.exports.setTaskNote = setTaskNote;
module.exports.markTasksExported = markTasksExported;
module.exports.getExportBaseline = getExportBaseline;
module.exports.isOutputPath = isOutputPath;
module.exports.resetCache = resetCache;
