/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

var taskMetaStore = require('./taskMetaStore.js');
var annotationParser = require('./annotationParser.js');

var STORE_VERSION = 1;
var STORE_FILE_NAME = 'context-index.json';
var cache = {};

function resetCache() {
    cache = {};
}

function getStorePath(rootPath, outputDir) {
    var folder = taskMetaStore.getOutputFolder(rootPath, outputDir);
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

function normaliseAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') {
        return undefined;
    }

    if (!anchor.file) {
        return undefined;
    }

    return {
        file: String(anchor.file),
        line: Number(anchor.line || 0),
        tag: anchor.tag ? String(anchor.tag) : ''
    };
}

function normaliseContextEntry(entry) {
    var context = entry && typeof entry === 'object' ? entry : {};
    var anchors = Array.isArray(context.anchors) ? context.anchors.map(normaliseAnchor).filter(Boolean) : [];

    return {
        kind: annotationParser.normaliseContextKind(context.kind) || undefined,
        title: context.title ? String(context.title) : '',
        summary: context.summary ? String(context.summary) : '',
        body: context.body ? String(context.body) : '',
        taskRefs: uniqueStrings(context.taskRefs),
        anchors: anchors,
        updatedBy: context.updatedBy ? String(context.updatedBy) : undefined,
        updatedAt: context.updatedAt ? String(context.updatedAt) : undefined,
        freshness: context.freshness ? String(context.freshness) : 'active'
    };
}

function createEmptyStore() {
    return {
        version: STORE_VERSION,
        contexts: {}
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
                Object.keys(parsed.contexts || {}).forEach(function (contextId) {
                    store.contexts[contextId] = normaliseContextEntry(parsed.contexts[contextId]);
                });
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

function getContext(rootPath, contextId, outputDir) {
    if (!rootPath || !contextId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    var entry = store.contexts[contextId];
    if (!entry) {
        return undefined;
    }

    var clone = JSON.parse(JSON.stringify(entry));
    clone.contextId = contextId;
    return clone;
}

function findContextByAnchor(rootPath, anchor, outputDir) {
    if (!rootPath || !anchor || !anchor.file) {
        return undefined;
    }

    var normalisedAnchor = normaliseAnchor(anchor);
    if (!normalisedAnchor) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    var contextId;

    Object.keys(store.contexts || {}).some(function (candidateId) {
        var entry = store.contexts[candidateId];
        var matched = (entry.anchors || []).some(function (candidateAnchor) {
            return candidateAnchor.file === normalisedAnchor.file &&
                candidateAnchor.line === normalisedAnchor.line &&
                candidateAnchor.tag === normalisedAnchor.tag;
        });

        if (matched) {
            contextId = candidateId;
        }

        return matched;
    });

    if (!contextId) {
        return undefined;
    }

    return getContext(rootPath, contextId, outputDir);
}

function listContexts(rootPath, outputDir) {
    var store = loadStore(rootPath, outputDir);
    return Object.keys(store.contexts || {}).sort().map(function (contextId) {
        return getContext(rootPath, contextId, outputDir);
    });
}

function mergeAnchors(existingAnchors, nextAnchors) {
    var merged = {};

    (existingAnchors || []).concat(nextAnchors || []).forEach(function (anchor) {
        var normalised = normaliseAnchor(anchor);
        if (!normalised) {
            return;
        }

        var key = [normalised.file, normalised.line, normalised.tag].join('|');
        merged[key] = normalised;
    });

    return Object.keys(merged).map(function (key) {
        return merged[key];
    }).sort(function (a, b) {
        if (a.file === b.file) {
            return a.line - b.line;
        }
        return a.file > b.file ? 1 : -1;
    });
}

function upsertContext(rootPath, contextId, patch, outputDir) {
    if (!rootPath || !contextId) {
        return undefined;
    }

    var store = loadStore(rootPath, outputDir);
    var current = normaliseContextEntry(store.contexts[contextId]);
    var next = normaliseContextEntry(current);
    var input = patch && typeof patch === 'object' ? patch : {};

    if (input.kind !== undefined) {
        next.kind = annotationParser.normaliseContextKind(input.kind) || next.kind;
    }
    if (input.title !== undefined) {
        next.title = String(input.title || '');
    }
    if (input.summary !== undefined) {
        next.summary = String(input.summary || '');
    }
    if (input.body !== undefined) {
        next.body = String(input.body || '');
    }
    if (input.taskRefs !== undefined) {
        next.taskRefs = input.replaceTaskRefs === true ? uniqueStrings(input.taskRefs) : uniqueStrings(next.taskRefs.concat(input.taskRefs));
    }
    if (input.anchors !== undefined) {
        next.anchors = input.replaceAnchors === true ? mergeAnchors([], input.anchors) : mergeAnchors(next.anchors, input.anchors);
    }
    if (input.updatedBy !== undefined) {
        next.updatedBy = input.updatedBy ? String(input.updatedBy) : undefined;
    }
    if (input.updatedAt !== undefined) {
        next.updatedAt = input.updatedAt ? String(input.updatedAt) : undefined;
    }
    if (input.freshness !== undefined) {
        next.freshness = input.freshness ? String(input.freshness) : 'active';
    }

    store.contexts[contextId] = next;
    return saveStore(rootPath, outputDir);
}

module.exports.STORE_VERSION = STORE_VERSION;
module.exports.STORE_FILE_NAME = STORE_FILE_NAME;
module.exports.getStorePath = getStorePath;
module.exports.getContext = getContext;
module.exports.findContextByAnchor = findContextByAnchor;
module.exports.listContexts = listContexts;
module.exports.upsertContext = upsertContext;
module.exports.resetCache = resetCache;
