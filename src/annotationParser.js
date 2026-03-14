/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var DIRECTIVE_REGEX = /\[\s*tv:([a-z-]+)\s*=\s*([^\]]+?)\s*\]/gi;

var CONTEXT_KINDS = [
    'must-read',
    'constraint',
    'invariant',
    'business-rule',
    'pitfall',
    'do-not-touch',
    'entrypoint',
    'example',
    'decision',
    'terminology'
];

var REVIEW_KINDS = [
    'changed',
    'why',
    'risk',
    'verify',
    'blocked',
    'followup'
];

var SESSION_TYPES = [
    'planning',
    'review',
    'implementation'
];

function normaliseList(value) {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map(function (entry) {
            return String(entry || '').trim();
        }).filter(Boolean)));
    }

    if (typeof value !== 'string') {
        return [];
    }

    return Array.from(new Set(value.split(',').map(function (entry) {
        return entry.trim();
    }).filter(Boolean)));
}

function normaliseContextKind(kind) {
    if (typeof kind !== 'string') {
        return undefined;
    }

    var normalised = kind.trim().toLowerCase();
    return CONTEXT_KINDS.indexOf(normalised) !== -1 ? normalised : undefined;
}

function normaliseReviewKind(kind) {
    if (typeof kind !== 'string') {
        return undefined;
    }

    var normalised = kind.trim().toLowerCase();
    return REVIEW_KINDS.indexOf(normalised) !== -1 ? normalised : undefined;
}

function normaliseSessionType(sessionType) {
    if (typeof sessionType !== 'string') {
        return undefined;
    }

    var normalised = sessionType.trim().toLowerCase();
    return SESSION_TYPES.indexOf(normalised) !== -1 ? normalised : undefined;
}

function removeDirectives(text) {
    if (typeof text !== 'string') {
        return '';
    }

    var replaced = text.replace(DIRECTIVE_REGEX, '');
    return replaced === text ? text : replaced.replace(/\s{2,}/g, ' ');
}

function classifyAnnotation(tag, parsed) {
    if (parsed && parsed.contextKind) {
        return 'context';
    }

    if (parsed && parsed.reviewKind) {
        return 'review';
    }

    if (parsed && parsed.sessionId && String(tag || '').trim().toUpperCase() === 'NOTE') {
        return 'review';
    }

    return 'task';
}

function parseDirectives(text, tag) {
    var parsed = {
        stableId: undefined,
        contextKind: undefined,
        taskRefs: [],
        reviewKind: undefined,
        sessionId: undefined
    };
    var rawTokens = [];

    var cleaned = typeof text === 'string' ? text.replace(DIRECTIVE_REGEX, function (match, key, value) {
        var normalisedKey = String(key || '').trim().toLowerCase();
        var trimmedValue = String(value || '').trim();
        rawTokens.push(match);

        if (normalisedKey === 'id' && trimmedValue) {
            parsed.stableId = trimmedValue;
        }
        else if (normalisedKey === 'ctx') {
            parsed.contextKind = normaliseContextKind(trimmedValue);
        }
        else if (normalisedKey === 'task') {
            parsed.taskRefs = normaliseList(trimmedValue);
        }
        else if (normalisedKey === 'review') {
            parsed.reviewKind = normaliseReviewKind(trimmedValue);
        }
        else if (normalisedKey === 'session' && trimmedValue) {
            parsed.sessionId = trimmedValue;
        }

        return '';
    }) : '';

    if (rawTokens.length > 0) {
        cleaned = cleaned.replace(/\s{2,}/g, ' ');
    }

    return {
        rawTokens: rawTokens,
        cleanedText: cleaned,
        trimmedText: cleaned.trim(),
        stableId: parsed.stableId,
        contextKind: parsed.contextKind,
        taskRefs: parsed.taskRefs,
        reviewKind: parsed.reviewKind,
        sessionId: parsed.sessionId,
        directives: parsed,
        annotationKind: classifyAnnotation(tag, parsed)
    };
}

function buildDirectiveTokens(options) {
    var directives = options || {};
    var tokens = [];

    if (directives.stableId) {
        tokens.push('[tv:id=' + directives.stableId + ']');
    }
    if (directives.contextKind) {
        tokens.push('[tv:ctx=' + directives.contextKind + ']');
    }

    var taskRefs = normaliseList(directives.taskRefs);
    if (taskRefs.length > 0) {
        tokens.push('[tv:task=' + taskRefs.join(',') + ']');
    }

    if (directives.reviewKind) {
        tokens.push('[tv:review=' + directives.reviewKind + ']');
    }
    if (directives.sessionId) {
        tokens.push('[tv:session=' + directives.sessionId + ']');
    }

    return tokens;
}

module.exports.CONTEXT_KINDS = CONTEXT_KINDS;
module.exports.REVIEW_KINDS = REVIEW_KINDS;
module.exports.SESSION_TYPES = SESSION_TYPES;
module.exports.parseDirectives = parseDirectives;
module.exports.removeDirectives = removeDirectives;
module.exports.buildDirectiveTokens = buildDirectiveTokens;
module.exports.classifyAnnotation = classifyAnnotation;
module.exports.normaliseContextKind = normaliseContextKind;
module.exports.normaliseReviewKind = normaliseReviewKind;
module.exports.normaliseSessionType = normaliseSessionType;
