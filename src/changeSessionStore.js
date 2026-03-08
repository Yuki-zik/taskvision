/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

var taskMetaStore = require('./taskMetaStore.js');
var annotationParser = require('./annotationParser.js');

var STORE_VERSION = 1;
var cache = {};

function resetCache() {
    cache = {};
}

function ensureFolder(folderPath) {
    if (!folderPath) {
        return;
    }

    if (fs.existsSync(folderPath) !== true) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function getSessionsFolder(rootPath, outputDir) {
    var folder = taskMetaStore.getOutputFolder(rootPath, outputDir);
    if (!folder) {
        return undefined;
    }

    return path.join(folder, 'change-sessions');
}

function getSessionPath(rootPath, sessionId, outputDir) {
    var folder = getSessionsFolder(rootPath, outputDir);
    if (!folder || !sessionId) {
        return undefined;
    }

    return path.join(folder, sessionId + '.json');
}

function normaliseAnnotation(annotation) {
    var value = annotation && typeof annotation === 'object' ? annotation : {};
    return {
        annotationId: value.annotationId ? String(value.annotationId) : undefined,
        kind: annotationParser.normaliseReviewKind(value.kind) || 'followup',
        file: value.file ? String(value.file) : '',
        line: Number(value.line || 0),
        stableId: value.stableId ? String(value.stableId) : undefined,
        sourceComment: value.sourceComment !== false,
        reviewState: value.reviewState ? String(value.reviewState) : 'unread',
        text: value.text ? String(value.text) : ''
    };
}

function normaliseSession(session) {
    var value = session && typeof session === 'object' ? session : {};
    return {
        version: STORE_VERSION,
        sessionId: value.sessionId ? String(value.sessionId) : undefined,
        sessionType: annotationParser.normaliseSessionType(value.sessionType) || 'review',
        actor: value.actor ? String(value.actor) : 'agent',
        status: value.status ? String(value.status) : 'open',
        createdAt: value.createdAt ? String(value.createdAt) : undefined,
        updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
        taskRefs: Array.from(new Set((value.taskRefs || []).map(function (taskRef) {
            return String(taskRef || '').trim();
        }).filter(Boolean))),
        summary: value.summary ? String(value.summary) : '',
        annotations: Array.isArray(value.annotations) ? value.annotations.map(normaliseAnnotation) : []
    };
}

function loadSession(rootPath, sessionId, outputDir) {
    if (!rootPath || !sessionId) {
        return undefined;
    }

    var sessionPath = getSessionPath(rootPath, sessionId, outputDir);
    if (cache[sessionPath]) {
        return cache[sessionPath];
    }

    var session;
    if (fs.existsSync(sessionPath) === true) {
        try {
            session = normaliseSession(JSON.parse(fs.readFileSync(sessionPath, 'utf8')));
        }
        catch (e) {
            session = undefined;
        }
    }

    cache[sessionPath] = session;
    return session;
}

function saveSession(rootPath, session, outputDir) {
    if (!rootPath || !session || !session.sessionId) {
        return undefined;
    }

    var sessionPath = getSessionPath(rootPath, session.sessionId, outputDir);
    var normalised = normaliseSession(session);
    ensureFolder(path.dirname(sessionPath));
    fs.writeFileSync(sessionPath, JSON.stringify(normalised, null, 2) + '\n');
    cache[sessionPath] = normalised;
    return sessionPath;
}

function listSessions(rootPath, outputDir) {
    var folder = getSessionsFolder(rootPath, outputDir);
    if (!folder || fs.existsSync(folder) !== true) {
        return [];
    }

    return fs.readdirSync(folder).filter(function (entry) {
        return path.extname(entry) === '.json';
    }).map(function (entry) {
        return loadSession(rootPath, path.basename(entry, '.json'), outputDir);
    }).filter(Boolean).sort(function (a, b) {
        if (a.createdAt === b.createdAt) {
            return a.sessionId > b.sessionId ? 1 : -1;
        }
        return String(a.createdAt || '') > String(b.createdAt || '') ? 1 : -1;
    });
}

function getSession(rootPath, sessionId, outputDir) {
    var session = loadSession(rootPath, sessionId, outputDir);
    return session ? JSON.parse(JSON.stringify(session)) : undefined;
}

function getDateStamp(now) {
    var date = now ? new Date(now) : new Date();
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('');
}

function createSessionId(rootPath, actor, outputDir, now) {
    var dateStamp = getDateStamp(now);
    var actorSlug = String(actor || 'agent').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
    var prefix = 'sess.' + dateStamp + '.' + actorSlug + '.';
    var existing = listSessions(rootPath, outputDir).filter(function (session) {
        return session.sessionId.indexOf(prefix) === 0;
    }).length;

    return prefix + String(existing + 1).padStart(3, '0');
}

function nextAnnotationId(session) {
    var highest = 0;

    (session.annotations || []).forEach(function (annotation) {
        var match = /^ann\.(\d+)$/.exec(String(annotation.annotationId || ''));
        if (match) {
            highest = Math.max(highest, Number(match[1]));
        }
    });

    return 'ann.' + String(highest + 1).padStart(3, '0');
}

function createAnnotationSignature(annotation) {
    return [
        annotation.kind,
        annotation.file,
        annotation.line,
        annotation.stableId,
        annotation.text
    ].join('|');
}

function upsertSession(rootPath, session, outputDir) {
    if (!rootPath || !session || !session.sessionId) {
        return undefined;
    }

    var existing = loadSession(rootPath, session.sessionId, outputDir);
    var merged = normaliseSession(existing || session);

    Object.keys(session || {}).forEach(function (key) {
        if (key === 'taskRefs') {
            merged.taskRefs = Array.from(new Set(merged.taskRefs.concat(session.taskRefs || [])));
        }
        else if (key === 'annotations') {
            merged.annotations = (session.annotations || []).map(normaliseAnnotation);
        }
        else if (session[key] !== undefined) {
            merged[key] = session[key];
        }
    });

    return saveSession(rootPath, merged, outputDir);
}

function syncSessionAnnotations(rootPath, sessionId, sessionPatch, annotations, outputDir) {
    if (!rootPath || !sessionId) {
        return undefined;
    }

    var existing = normaliseSession(loadSession(rootPath, sessionId, outputDir) || {
        sessionId: sessionId
    });

    Object.keys(sessionPatch || {}).forEach(function (key) {
        if (sessionPatch[key] !== undefined && key !== 'annotations' && key !== 'taskRefs') {
            existing[key] = sessionPatch[key];
        }
    });

    if (sessionPatch && sessionPatch.taskRefs) {
        existing.taskRefs = Array.from(new Set(existing.taskRefs.concat(sessionPatch.taskRefs)));
    }

    var preserved = (existing.annotations || []).filter(function (annotation) {
        return annotation.sourceComment === false;
    });
    var issuedAnnotations = preserved.slice();
    var seen = {};

    (annotations || []).map(normaliseAnnotation).forEach(function (annotation) {
        var signature = createAnnotationSignature(annotation);
        if (seen[signature]) {
            return;
        }
        seen[signature] = true;
        if (!annotation.annotationId) {
            annotation.annotationId = nextAnnotationId({
                annotations: issuedAnnotations
            });
        }
        issuedAnnotations.push({ annotationId: annotation.annotationId });
        preserved.push(annotation);
    });

    existing.annotations = preserved;
    existing.updatedAt = (sessionPatch && sessionPatch.updatedAt) || existing.updatedAt;
    if (!existing.createdAt) {
        existing.createdAt = existing.updatedAt;
    }

    return saveSession(rootPath, existing, outputDir);
}

function getOpenSessions(rootPath, outputDir, taskRefs) {
    var filterTaskRefs = Array.isArray(taskRefs) ? taskRefs.filter(Boolean) : [];
    return listSessions(rootPath, outputDir).filter(function (session) {
        if (session.status !== 'open') {
            return false;
        }

        if (session.sessionType !== 'planning' && session.sessionType !== 'review') {
            return false;
        }

        if (filterTaskRefs.length === 0) {
            return true;
        }

        return (session.taskRefs || []).some(function (taskRef) {
            return filterTaskRefs.indexOf(taskRef) !== -1;
        });
    });
}

module.exports.STORE_VERSION = STORE_VERSION;
module.exports.getSessionsFolder = getSessionsFolder;
module.exports.getSessionPath = getSessionPath;
module.exports.getSession = getSession;
module.exports.listSessions = listSessions;
module.exports.createSessionId = createSessionId;
module.exports.upsertSession = upsertSession;
module.exports.syncSessionAnnotations = syncSessionAnnotations;
module.exports.getOpenSessions = getOpenSessions;
module.exports.resetCache = resetCache;
