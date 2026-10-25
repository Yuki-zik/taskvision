import type { OffsetRange } from './model';
export interface RangeContext {
  tagStart?: number;
  tagEnd?: number;
  matchStart?: number;
  matchEnd?: number;
  commentStart?: number;
  commentEnd?: number;
  lineStart?: number;
  lineEnd?: number;
  subTagStart?: number;
  subTagEnd?: number;
  matchIndices?: ([number, number] | undefined)[];
}
const CAPTURE_GROUP_PREFIX = 'capture-groups:';

const RANGE_TYPES = [
  'tag',
  'text',
  'tag-and-comment',
  'text-and-comment',
  'tag-and-subTag',
  'line',
  'whole-line',
  'none',
];

function normaliseRangeType(type?: string) {
  if (type === 'tag-and-subtag') {
    return 'tag-and-subTag';
  }
  return type;
}

function toNumber(value: unknown) {
  return typeof value === 'number' && !isNaN(value) ? value : undefined;
}

function pushRange(ranges: OffsetRange[], start: unknown, end: unknown) {
  const numericStart = toNumber(start);
  const numericEnd = toNumber(end);
  if (numericStart === undefined || numericEnd === undefined || numericEnd <= numericStart) {
    return;
  }
  ranges.push({ start: numericStart, end: numericEnd });
}

function mergeRanges(ranges: OffsetRange[]) {
  if (!ranges || ranges.length === 0) {
    return [];
  }

  const sorted = ranges
    .filter(function (range) {
      return (
        range &&
        typeof range.start === 'number' &&
        typeof range.end === 'number' &&
        range.end > range.start
      );
    })
    .sort(function (a, b) {
      return a.start - b.start || a.end - b.end;
    });

  if (sorted.length === 0) {
    return [];
  }

  const merged = [sorted[0]];
  sorted.slice(1).forEach(function (range) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  });

  return merged;
}

function resolveCaptureGroups(
  rangeType: string | undefined,
  context: RangeContext,
  ranges: OffsetRange[],
) {
  if (typeof rangeType !== 'string' || rangeType.indexOf(CAPTURE_GROUP_PREFIX) !== 0) {
    return false;
  }

  const groupSpec = rangeType.substring(rangeType.indexOf(':') + 1);
  if (!groupSpec) {
    // Empty spec (e.g. "capture-groups:") — fall back to the default range
    // handling instead of silently producing no highlight ranges.
    return false;
  }

  const indices = context.matchIndices || [];
  groupSpec
    .split(',')
    .map(function (part) {
      return parseInt(part, 10);
    })
    .forEach(function (groupIndex) {
      if (!isNaN(groupIndex) && indices[groupIndex] && indices[groupIndex].length === 2) {
        pushRange(ranges, indices[groupIndex][0], indices[groupIndex][1]);
      }
    });

  return true;
}

function resolveRangeOffsets(rangeType: string | undefined, context: RangeContext) {
  rangeType = normaliseRangeType(rangeType);

  const tagStart = toNumber(context.tagStart);
  const tagEnd = toNumber(context.tagEnd);
  const matchStart = toNumber(context.matchStart);
  let commentStart = toNumber(context.commentStart);
  let commentEnd = toNumber(context.commentEnd);
  let lineStart = toNumber(context.lineStart);
  let lineEnd = toNumber(context.lineEnd);
  const subTagStart = toNumber(context.subTagStart);
  const subTagEnd = toNumber(context.subTagEnd);

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

  const ranges: OffsetRange[] = [];

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
      pushRange(
        ranges,
        tagStart !== undefined ? tagStart : lineStart,
        commentEnd !== undefined ? commentEnd : lineEnd,
      );
      break;
    case 'tag':
    default:
      pushRange(ranges, tagStart, tagEnd);
      break;
  }

  return mergeRanges(ranges);
}

export { CAPTURE_GROUP_PREFIX, RANGE_TYPES, normaliseRangeType, resolveRangeOffsets };
