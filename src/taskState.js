/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var STATUSES = [
    'todo',
    'doing',
    'blocked',
    'paused',
    'review',
    'done',
    'wontdo',
    'idea'
];

var PRIORITIES = [
    'critical',
    'high',
    'normal',
    'low',
    'trivial'
];

var STATUS_DETAILS = {
    todo: {
        icon: 'circle-large-outline',
        description: 'Pending work that should be addressed'
    },
    doing: {
        icon: 'sync',
        description: 'Work that is actively being handled'
    },
    blocked: {
        icon: 'debug-pause',
        description: 'Work that cannot continue until a dependency is resolved'
    },
    paused: {
        icon: 'clock',
        description: 'Work intentionally deferred for later'
    },
    review: {
        icon: 'beaker',
        description: 'Implemented or investigated, awaiting confirmation'
    },
    done: {
        icon: 'pass',
        description: 'Completed work'
    },
    wontdo: {
        icon: 'circle-slash',
        description: 'Explicitly decided not to do'
    },
    idea: {
        icon: 'lightbulb',
        description: 'Observation or idea that is not yet committed work'
    }
};

var PRIORITY_DETAILS = {
    critical: 'Release blocker or urgent production issue',
    high: 'Important work that should be handled soon',
    normal: 'Default priority',
    low: 'Useful but non-urgent work',
    trivial: 'Nice-to-have or cleanup'
};

var RECOMMENDED_TRANSITIONS = {
    todo: ['doing', 'blocked', 'paused', 'review', 'done', 'wontdo'],
    doing: ['review', 'blocked', 'paused', 'done'],
    blocked: ['todo', 'doing', 'paused', 'wontdo'],
    paused: ['todo', 'doing', 'wontdo'],
    review: ['done', 'todo', 'doing', 'blocked'],
    done: ['review'],
    wontdo: ['todo', 'idea'],
    idea: ['todo', 'paused', 'wontdo']
};

var INLINE_STATUS_REGEX = /^(\s*)\[([a-z][a-z-]*)\](.*)$/i;

function normaliseStatus(status) {
    if (typeof status !== 'string') {
        return undefined;
    }

    var normalised = status.trim().toLowerCase();
    if (STATUSES.indexOf(normalised) === -1) {
        return undefined;
    }

    return normalised;
}

function normalisePriority(priority, fallback) {
    if (typeof priority !== 'string') {
        return fallback;
    }

    var normalised = priority.trim().toLowerCase();
    if (PRIORITIES.indexOf(normalised) === -1) {
        return fallback;
    }

    return normalised;
}

function parseInlineStatus(text) {
    if (typeof text !== 'string') {
        return undefined;
    }

    var match = INLINE_STATUS_REGEX.exec(text);
    if (!match) {
        return undefined;
    }

    var status = normaliseStatus(match[2]);
    if (!status) {
        return undefined;
    }

    return {
        status: status,
        rawToken: '[' + match[2] + ']',
        token: '[' + status + ']',
        leadingWhitespace: match[1],
        remainder: match[3],
        range: {
            start: match[1].length,
            end: match[1].length + ('[' + match[2] + ']').length
        }
    };
}

function defaultStatusForTag(tag) {
    if (typeof tag !== 'string') {
        return 'todo';
    }

    if (/^\[\s*x\s*\]$/i.test(tag)) {
        return 'done';
    }

    if (/^\[\s*\]$/i.test(tag)) {
        return 'todo';
    }

    if (/^(note|idea)$/i.test(tag.trim())) {
        return 'idea';
    }

    return 'todo';
}

function toInlineToken(status) {
    return '[' + normaliseStatus(status || 'todo') + ']';
}

function getStatusDetails(status) {
    var normalised = normaliseStatus(status || 'todo') || 'todo';
    return STATUS_DETAILS[normalised];
}

function getPriorityDescription(priority) {
    return PRIORITY_DETAILS[normalisePriority(priority, 'normal') || 'normal'];
}

function canTransition(fromStatus, toStatus) {
    var from = normaliseStatus(fromStatus);
    var to = normaliseStatus(toStatus);
    if (!from || !to) {
        return false;
    }

    if (from === to) {
        return true;
    }

    return (RECOMMENDED_TRANSITIONS[from] || []).indexOf(to) !== -1;
}

module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.STATUS_DETAILS = STATUS_DETAILS;
module.exports.RECOMMENDED_TRANSITIONS = RECOMMENDED_TRANSITIONS;
module.exports.parseInlineStatus = parseInlineStatus;
module.exports.normaliseStatus = normaliseStatus;
module.exports.normalisePriority = normalisePriority;
module.exports.defaultStatusForTag = defaultStatusForTag;
module.exports.toInlineToken = toInlineToken;
module.exports.getStatusDetails = getStatusDetails;
module.exports.getPriorityDescription = getPriorityDescription;
module.exports.canTransition = canTransition;
