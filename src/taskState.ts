export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'trivial';
export type TaskStatus =
  'todo' | 'doing' | 'blocked' | 'paused' | 'review' | 'done' | 'wontdo' | 'idea';

const STATUSES = ['todo', 'doing', 'blocked', 'paused', 'review', 'done', 'wontdo', 'idea'];

const PRIORITIES = ['critical', 'high', 'normal', 'low', 'trivial'];

const STATUS_DETAILS: Record<string, { icon: string; description: string }> = {
  todo: {
    icon: 'circle-large-outline',
    description: 'Pending work that should be addressed',
  },
  doing: {
    icon: 'sync',
    description: 'Work that is actively being handled',
  },
  blocked: {
    icon: 'debug-pause',
    description: 'Work that cannot continue until a dependency is resolved',
  },
  paused: {
    icon: 'clock',
    description: 'Work intentionally deferred for later',
  },
  review: {
    icon: 'beaker',
    description: 'Implemented or investigated, awaiting confirmation',
  },
  done: {
    icon: 'pass',
    description: 'Completed work',
  },
  wontdo: {
    icon: 'circle-slash',
    description: 'Explicitly decided not to do',
  },
  idea: {
    icon: 'lightbulb',
    description: 'Observation or idea that is not yet committed work',
  },
};

const PRIORITY_DETAILS: Record<string, string> = {
  critical: 'Release blocker or urgent production issue',
  high: 'Important work that should be handled soon',
  normal: 'Default priority',
  low: 'Useful but non-urgent work',
  trivial: 'Nice-to-have or cleanup',
};

const RECOMMENDED_TRANSITIONS: Record<string, string[]> = {
  todo: ['doing', 'blocked', 'paused', 'review', 'done', 'wontdo'],
  doing: ['review', 'blocked', 'paused', 'done'],
  blocked: ['todo', 'doing', 'paused', 'wontdo'],
  paused: ['todo', 'doing', 'wontdo'],
  review: ['done', 'todo', 'doing', 'blocked'],
  done: ['review'],
  wontdo: ['todo', 'idea'],
  idea: ['todo', 'paused', 'wontdo'],
};

const INLINE_STATUS_REGEX = /^(\s*)\[([a-z][a-z-]*)\](.*)$/i;

function normaliseStatus(status: unknown): TaskStatus | undefined {
  if (typeof status !== 'string') {
    return undefined;
  }

  const normalised = status.trim().toLowerCase();
  if (STATUSES.indexOf(normalised) === -1) {
    return undefined;
  }

  return normalised as TaskStatus;
}

function normalisePriority(priority: unknown, fallback?: string) {
  if (typeof priority !== 'string') {
    return fallback;
  }

  const normalised = priority.trim().toLowerCase();
  if (PRIORITIES.indexOf(normalised) === -1) {
    return fallback;
  }

  return normalised as TaskPriority;
}

function parseInlineStatus(text: unknown) {
  if (typeof text !== 'string') {
    return undefined;
  }

  const match = INLINE_STATUS_REGEX.exec(text);
  if (!match) {
    return undefined;
  }

  const status = normaliseStatus(match[2]);
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
      end: match[1].length + ('[' + match[2] + ']').length,
    },
  };
}

function defaultStatusForTag(tag: unknown) {
  if (typeof tag !== 'string') {
    return 'todo';
  }

  if (/^\[\s*x\s*\]$/i.test(tag)) {
    return 'done';
  }

  if (/^\[\s*\]$/i.test(tag)) {
    return 'todo';
  }

  if (/^(note|idea|core|reuse|intent)$/i.test(tag.trim())) {
    return 'idea';
  }

  if (/^review$/i.test(tag.trim())) {
    return 'review';
  }

  return 'todo';
}

function toInlineToken(status?: string) {
  return '[' + normaliseStatus(status || 'todo') + ']';
}

function getStatusDetails(status?: string) {
  const normalised = normaliseStatus(status || 'todo') || 'todo';
  return STATUS_DETAILS[normalised];
}

function getPriorityDescription(priority?: string) {
  return PRIORITY_DETAILS[normalisePriority(priority, 'normal') || 'normal'];
}

function canTransition(fromStatus: unknown, toStatus: unknown) {
  const from = normaliseStatus(fromStatus);
  const to = normaliseStatus(toStatus);
  if (!from || !to) {
    return false;
  }

  if (from === to) {
    return true;
  }

  return (RECOMMENDED_TRANSITIONS[from] || []).indexOf(to) !== -1;
}

export {
  STATUSES,
  PRIORITIES,
  STATUS_DETAILS,
  RECOMMENDED_TRANSITIONS,
  parseInlineStatus,
  normaliseStatus,
  normalisePriority,
  defaultStatusForTag,
  toInlineToken,
  getStatusDetails,
  getPriorityDescription,
  canTransition,
};
