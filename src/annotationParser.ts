export type AnnotationKind = 'task' | 'context' | 'review';
export interface DirectiveOptions {
  stableId?: string;
  contextKind?: string;
  taskRefs?: string[];
  reviewKind?: string;
  sessionId?: string;
}

const DIRECTIVE_REGEX = /\[\s*tv:([a-z-]+)\s*=\s*([^\]]+?)\s*\]/gi;

const CONTEXT_KINDS = [
  'must-read',
  'constraint',
  'invariant',
  'business-rule',
  'pitfall',
  'do-not-touch',
  'entrypoint',
  'reusable',
  'example',
  'decision',
  'terminology',
];

const REVIEW_KINDS = ['changed', 'why', 'risk', 'verify', 'blocked', 'followup'];

const SESSION_TYPES = ['planning', 'review', 'implementation'];

function normaliseList(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map(function (entry) {
            return String(entry || '').trim();
          })
          .filter(Boolean),
      ),
    );
  }

  if (typeof value !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map(function (entry) {
          return entry.trim();
        })
        .filter(Boolean),
    ),
  );
}

function normaliseContextKind(kind: unknown) {
  if (typeof kind !== 'string') {
    return undefined;
  }

  const normalised = kind.trim().toLowerCase();
  return CONTEXT_KINDS.indexOf(normalised) !== -1 ? normalised : undefined;
}

function normaliseReviewKind(kind: unknown) {
  if (typeof kind !== 'string') {
    return undefined;
  }

  const normalised = kind.trim().toLowerCase();
  return REVIEW_KINDS.indexOf(normalised) !== -1 ? normalised : undefined;
}

function normaliseSessionType(sessionType: unknown) {
  if (typeof sessionType !== 'string') {
    return undefined;
  }

  const normalised = sessionType.trim().toLowerCase();
  return SESSION_TYPES.indexOf(normalised) !== -1 ? normalised : undefined;
}

function removeDirectives(text: unknown) {
  if (typeof text !== 'string') {
    return '';
  }

  const replaced = text.replace(DIRECTIVE_REGEX, '');
  return replaced === text ? text : replaced.replace(/\s{2,}/g, ' ');
}

function classifyAnnotation(tag?: string, parsed?: DirectiveOptions): AnnotationKind {
  if (parsed && parsed.contextKind) {
    return 'context';
  }

  if (parsed && parsed.reviewKind) {
    return 'review';
  }

  if (
    parsed &&
    parsed.sessionId &&
    String(tag || '')
      .trim()
      .toUpperCase() === 'NOTE'
  ) {
    return 'review';
  }

  return 'task';
}

function parseDirectives(text: unknown, tag?: string) {
  const parsed: DirectiveOptions = {
    stableId: undefined,
    contextKind: undefined,
    taskRefs: [],
    reviewKind: undefined,
    sessionId: undefined,
  };
  const rawTokens: string[] = [];

  let cleaned =
    typeof text === 'string'
      ? text.replace(DIRECTIVE_REGEX, function (match, key, value) {
          const normalisedKey = String(key || '')
            .trim()
            .toLowerCase();
          const trimmedValue = String(value || '').trim();
          rawTokens.push(match);

          if (normalisedKey === 'id' && trimmedValue) {
            parsed.stableId = trimmedValue;
          } else if (normalisedKey === 'ctx') {
            parsed.contextKind = normaliseContextKind(trimmedValue);
          } else if (normalisedKey === 'task') {
            parsed.taskRefs = normaliseList(trimmedValue);
          } else if (normalisedKey === 'review') {
            parsed.reviewKind = normaliseReviewKind(trimmedValue);
          } else if (normalisedKey === 'session' && trimmedValue) {
            parsed.sessionId = trimmedValue;
          }

          return '';
        })
      : '';

  // CORE: Keep human-facing tags compatible with the existing task/context/review protocol.
  if (!parsed.contextKind && !parsed.reviewKind) {
    const semanticTag = String(tag || '')
      .trim()
      .toUpperCase();
    const defaults: Record<string, string> = {
      CORE: 'entrypoint',
      REUSE: 'reusable',
      INTENT: 'constraint',
    };
    if (Object.prototype.hasOwnProperty.call(defaults, semanticTag)) {
      parsed.contextKind = defaults[semanticTag];
    } else if (semanticTag === 'REVIEW') {
      parsed.reviewKind = 'verify';
    }
  }

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
    annotationKind: classifyAnnotation(tag, parsed),
  };
}

function buildDirectiveTokens(options?: DirectiveOptions) {
  const directives = options || {};
  const tokens = [];

  if (directives.contextKind) {
    tokens.push('[tv:ctx=' + directives.contextKind + ']');
  }
  if (directives.reviewKind) {
    tokens.push('[tv:review=' + directives.reviewKind + ']');
  }

  const taskRefs = normaliseList(directives.taskRefs);
  if (taskRefs.length > 0) {
    tokens.push('[tv:task=' + taskRefs.join(',') + ']');
  }

  if (directives.sessionId) {
    tokens.push('[tv:session=' + directives.sessionId + ']');
  }
  if (directives.stableId) {
    tokens.push('[tv:id=' + directives.stableId + ']');
  }

  return tokens;
}

export {
  CONTEXT_KINDS,
  REVIEW_KINDS,
  SESSION_TYPES,
  parseDirectives,
  removeDirectives,
  buildDirectiveTokens,
  classifyAnnotation,
  normaliseContextKind,
  normaliseReviewKind,
  normaliseSessionType,
};
