/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

var STORE_VERSION = 2;
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

function uniqueStrings(values) {
    return Array.from(new Set((values || []).map(function (value) {
        return String(value || '').trim();
    }).filter(Boolean)));
}

function normaliseTaskEntry(entry) {
    var value = entry && typeof entry === 'object' ? entry : {};
    return {
        stableId: value.stableId ? String(value.stableId) : undefined,
        priority: value.priority ? String(value.priority) : undefined,
        note: value.note ? String(value.note) : '',
        acceptanceCriteria: uniqueStrings(value.acceptanceCriteria),
        nonGoals: uniqueStrings(value.nonGoals),
        contextRefs: uniqueStrings(value.contextRefs),
        lastActor: value.lastActor ? String(value.lastActor) : undefined,
        updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
        lastExportedStatus: value.lastExportedStatus ? String(value.lastExportedStatus) : undefined,
        lastExportedAt: value.lastExportedAt ? String(value.lastExportedAt) : undefined,
        file: value.file ? String(value.file) : undefined,
        line: value.line !== undefined ? Number(value.line) : undefined
    };
}

function createEmptyStore() {
    return {
        version: STORE_VERSION,
        tasks: {},
        stableIndex: {}
    };
}

function rebuildStableIndex(store) {
    var stableIndex = {};

    Object.keys(store.tasks || {}).forEach(function (taskId) {
        var entry = normaliseTaskEntry(store.tasks[taskId]);
        store.tasks[taskId] = entry;

        if (entry.stableId) {
            stableIndex[entry.stableId] = taskId;
        }
    });

    store.stableIndex = stableIndex;
    store.version = STORE_VERSION;
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
                Object.keys(parsed.tasks || {}).forEach(function (taskId) {
                    store.tasks[taskId] = normaliseTaskEntry(parsed.tasks[taskId]);
                });
                store.stableIndex = parsed.stableIndex || {};
            }
        }
        catch (e) {
            store = createEmptyStore();
        }
    }

    rebuildStableIndex(store);
    cache[key] = store;
    return store;
}

function saveStore(rootPath, outputDir) {
    if (!rootPath) {
        return undefined;
    }

    var storePath = getStorePath(rootPath, outputDir);
    var store = loadStore(rootPath, outputDir);

    rebuildStableIndex(store);
    ensureFolder(path.dirname(storePath));
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n');
    return storePath;
}

function resolveLegacyTaskId(store, taskIdOrStableId) {
    if (!store || !taskIdOrStableId) {
        return undefined;
    }

    if (store.tasks[taskIdOrStableId]) {
        return taskIdOrStableId;
    }

    if (store.stableIndex[taskIdOrStableId]) {
        return store.stableIndex[taskIdOrStableId];
    }

    return undefined;
}

function getTaskEntry(rootPath, taskIdOrStableId, outputDir) {
    if (!rootPath || !taskIdOrStableId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    var legacyTaskId = resolveLegacyTaskId(store, taskIdOrStableId);
    if (!legacyTaskId) {
        return undefined;
    }

    return store.tasks[legacyTaskId];
}

function getLegacyTaskId(rootPath, taskIdOrStableId, outputDir) {
    var store = loadStore(rootPath, outputDir);
    return resolveLegacyTaskId(store, taskIdOrStableId);
}

function getTaskMetadata(rootPath, taskIdOrStableId, defaultPriority, outputDir) {
    var entry = getTaskEntry(rootPath, taskIdOrStableId, outputDir) || {};
    return {
        stableId: entry.stableId,
        priority: entry.priority || defaultPriority || 'normal',
        note: entry.note || '',
        acceptanceCriteria: uniqueStrings(entry.acceptanceCriteria),
        nonGoals: uniqueStrings(entry.nonGoals),
        contextRefs: uniqueStrings(entry.contextRefs),
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
        store.tasks[taskId] = normaliseTaskEntry({});
    }

    return store.tasks[taskId];
}

function updateTask(rootPath, taskIdOrStableId, patch, outputDir) {
    if (!rootPath || !taskIdOrStableId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    var legacyTaskId = resolveLegacyTaskId(store, taskIdOrStableId) || taskIdOrStableId;
    var entry = ensureTaskEntry(rootPath, legacyTaskId, outputDir);
    var next = normaliseTaskEntry(entry);
    var input = patch && typeof patch === 'object' ? patch : {};

    if (input.stableId !== undefined) {
        next.stableId = input.stableId ? String(input.stableId) : undefined;
    }
    if (input.priority !== undefined) {
        next.priority = input.priority ? String(input.priority) : undefined;
    }
    if (input.note !== undefined) {
        next.note = String(input.note || '');
    }
    if (input.acceptanceCriteria !== undefined) {
        next.acceptanceCriteria = uniqueStrings(input.acceptanceCriteria);
    }
    if (input.nonGoals !== undefined) {
        next.nonGoals = uniqueStrings(input.nonGoals);
    }
    if (input.contextRefs !== undefined) {
        next.contextRefs = input.replaceContextRefs === true ? uniqueStrings(input.contextRefs) : uniqueStrings(next.contextRefs.concat(input.contextRefs));
    }
    if (input.lastActor !== undefined) {
        next.lastActor = input.lastActor ? String(input.lastActor) : undefined;
    }
    if (input.updatedAt !== undefined) {
        next.updatedAt = input.updatedAt ? String(input.updatedAt) : undefined;
    }
    if (input.lastExportedStatus !== undefined) {
        next.lastExportedStatus = input.lastExportedStatus ? String(input.lastExportedStatus) : undefined;
    }
    if (input.lastExportedAt !== undefined) {
        next.lastExportedAt = input.lastExportedAt ? String(input.lastExportedAt) : undefined;
    }
    if (input.file !== undefined) {
        next.file = input.file ? String(input.file) : undefined;
    }
    if (input.line !== undefined) {
        next.line = input.line !== undefined ? Number(input.line) : undefined;
    }

    store.tasks[legacyTaskId] = next;
    return saveStore(rootPath, outputDir);
}

function ensureTaskStableId(rootPath, taskIdOrStableId, stableId, actor, updatedAt, outputDir) {
    var metadata = getTaskMetadata(rootPath, taskIdOrStableId, undefined, outputDir);
    if (metadata.stableId) {
        return metadata.stableId;
    }

    if (!stableId) {
        return undefined;
    }

    updateTask(rootPath, taskIdOrStableId, {
        stableId: stableId,
        lastActor: actor,
        updatedAt: updatedAt
    }, outputDir);

    return stableId;
}

function setTaskPriority(rootPath, taskIdOrStableId, priority, actor, updatedAt, outputDir) {
    return updateTask(rootPath, taskIdOrStableId, {
        priority: priority,
        lastActor: actor,
        updatedAt: updatedAt
    }, outputDir);
}

function setTaskNote(rootPath, taskIdOrStableId, note, actor, updatedAt, outputDir) {
    return updateTask(rootPath, taskIdOrStableId, {
        note: note,
        lastActor: actor,
        updatedAt: updatedAt
    }, outputDir);
}

function addTaskContextRefs(rootPath, taskIdOrStableId, contextRefs, actor, updatedAt, outputDir) {
    return updateTask(rootPath, taskIdOrStableId, {
        contextRefs: contextRefs,
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
            store.tasks[task.taskId] = normaliseTaskEntry({});
        }

        if (task.stableId) {
            store.tasks[task.taskId].stableId = task.stableId;
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
module.exports.getTaskEntry = getTaskEntry;
module.exports.getLegacyTaskId = getLegacyTaskId;
module.exports.ensureTaskStableId = ensureTaskStableId;
module.exports.updateTask = updateTask;
module.exports.setTaskPriority = setTaskPriority;
module.exports.setTaskNote = setTaskNote;
module.exports.addTaskContextRefs = addTaskContextRefs;
module.exports.markTasksExported = markTasksExported;
module.exports.getExportBaseline = getExportBaseline;
module.exports.isOutputPath = isOutputPath;
module.exports.resetCache = resetCache;
