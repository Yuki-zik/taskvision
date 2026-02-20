var CAPTURE_GROUP_PREFIX = 'capture-groups:';

var RANGE_TYPES = [
    'tag',
    'text',
    'tag-and-comment',
    'text-and-comment',
    'tag-and-subTag',
    'line',
    'whole-line',
    'none'
];

function normaliseRangeType(type) {
    if (type === 'tag-and-subtag') {
        return 'tag-and-subTag';
    }
    return type;
}

function toNumber(value) {
    return typeof value === 'number' && !isNaN(value) ? value : undefined;
}

function pushRange(ranges, start, end) {
    start = toNumber(start);
    end = toNumber(end);
    if (start === undefined || end === undefined || end <= start) {
        return;
    }
    ranges.push({ start: start, end: end });
}

function mergeRanges(ranges) {
    if (!ranges || ranges.length === 0) {
        return [];
    }

    var sorted = ranges
        .filter(function (range) {
            return range && typeof range.start === 'number' && typeof range.end === 'number' && range.end > range.start;
        })
        .sort(function (a, b) {
            return a.start - b.start || a.end - b.end;
        });

    if (sorted.length === 0) {
        return [];
    }

    var merged = [sorted[0]];
    sorted.slice(1).forEach(function (range) {
        var last = merged[merged.length - 1];
        if (range.start <= last.end) {
            last.end = Math.max(last.end, range.end);
        } else {
            merged.push({ start: range.start, end: range.end });
        }
    });

    return merged;
}

function resolveCaptureGroups(rangeType, context, ranges) {
    if (typeof rangeType !== 'string' || rangeType.indexOf(CAPTURE_GROUP_PREFIX) !== 0) {
        return false;
    }

    var groupSpec = rangeType.substring(rangeType.indexOf(':') + 1);
    if (!groupSpec) {
        return true;
    }

    var indices = context.matchIndices || [];
    groupSpec.split(',').map(function (part) {
        return parseInt(part, 10);
    }).forEach(function (groupIndex) {
        if (!isNaN(groupIndex) && indices[groupIndex] && indices[groupIndex].length === 2) {
            pushRange(ranges, indices[groupIndex][0], indices[groupIndex][1]);
        }
    });

    return true;
}

function resolveRangeOffsets(rangeType, context) {
    rangeType = normaliseRangeType(rangeType);

    var tagStart = toNumber(context.tagStart);
    var tagEnd = toNumber(context.tagEnd);
    var matchStart = toNumber(context.matchStart);
    var commentStart = toNumber(context.commentStart);
    var commentEnd = toNumber(context.commentEnd);
    var lineStart = toNumber(context.lineStart);
    var lineEnd = toNumber(context.lineEnd);
    var subTagStart = toNumber(context.subTagStart);
    var subTagEnd = toNumber(context.subTagEnd);

    if (commentStart === undefined) {
        commentStart = matchStart !== undefined ? matchStart : tagStart;
    }
    if (commentEnd === undefined) {
        commentEnd = lineEnd !== undefined ? lineEnd : tagEnd;
    }
    if (lineStart === undefined) {
        lineStart = matchStart !== undefined ? matchStart : tagStart;
    }
    if (lineEnd === undefined) {
        lineEnd = commentEnd;
    }

    var ranges = [];

    if (resolveCaptureGroups(rangeType, context, ranges)) {
        return mergeRanges(ranges);
    }

    switch (rangeType) {
        case 'none':
            break;
        case 'text-and-comment':
        case 'tag-and-comment':
            pushRange(ranges, tagStart, tagEnd);
            pushRange(ranges, commentStart, commentEnd);
            break;
        case 'text':
            pushRange(ranges, tagStart, commentEnd);
            break;
        case 'tag-and-subTag':
            pushRange(ranges, tagStart, tagEnd);
            pushRange(ranges, subTagStart, subTagEnd);
            break;
        case 'line':
            pushRange(ranges, lineStart, lineEnd);
            break;
        case 'whole-line':
            pushRange(ranges, lineStart, lineEnd);
            break;
        case 'tag':
        default:
            pushRange(ranges, tagStart, tagEnd);
            break;
    }

    return mergeRanges(ranges);
}

module.exports.CAPTURE_GROUP_PREFIX = CAPTURE_GROUP_PREFIX;
module.exports.RANGE_TYPES = RANGE_TYPES;
module.exports.normaliseRangeType = normaliseRangeType;
module.exports.resolveRangeOffsets = resolveRangeOffsets;
