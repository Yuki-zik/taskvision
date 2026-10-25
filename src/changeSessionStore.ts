import { cloneJson } from './validation';
import type { ChangeSession, SessionAnnotation } from './model';
import { record, strings, present } from './validation';

import * as fs from 'fs';
import * as path from 'path';

import * as taskMetaStore from './taskMetaStore.js';
import * as annotationParser from './annotationParser.js';
import * as jsonStore from './jsonStore.js';

const STORE_VERSION = 1;
let cache: Record<string, ChangeSession | undefined> = {};

function resetCache() {
  cache = {};
}

function getSessionsFolder(rootPath: string | undefined, outputDir?: string) {
  const folder = taskMetaStore.getOutputFolder(rootPath, outputDir);
  if (!folder) {
    return undefined;
  }

  return path.join(folder, 'change-sessions');
}

function getSessionPath(
  rootPath: string | undefined,
  sessionId: string | undefined,
  outputDir?: string,
) {
  const folder = getSessionsFolder(rootPath, outputDir);
  if (!folder || !sessionId) {
    return undefined;
  }

  return path.join(folder, sessionId + '.json');
}

function normaliseAnnotation(annotation: unknown) {
  const value = record(annotation);
  return {
    annotationId: value.annotationId ? String(value.annotationId) : undefined,
    kind: annotationParser.normaliseReviewKind(value.kind) || 'followup',
    file: value.file ? String(value.file) : '',
    line: Number(value.line || 0),
    stableId: value.stableId ? String(value.stableId) : undefined,
    sourceComment: value.sourceComment !== false,
    reviewState: value.reviewState ? String(value.reviewState) : 'unread',
    text: value.text ? String(value.text) : '',
  };
}

function normaliseSession(session: unknown): ChangeSession {
  const value = record(session);
  return {
    version: STORE_VERSION,
    sessionId: value.sessionId ? String(value.sessionId) : '',
    sessionType: annotationParser.normaliseSessionType(value.sessionType) || 'review',
    actor: value.actor ? String(value.actor) : 'agent',
    status: value.status ? String(value.status) : 'open',
    createdAt: value.createdAt ? String(value.createdAt) : undefined,
    updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
    taskRefs: strings(value.taskRefs),
    summary: value.summary ? String(value.summary) : '',
    annotations: Array.isArray(value.annotations) ? value.annotations.map(normaliseAnnotation) : [],
  };
}

function loadSession(
  rootPath: string | undefined,
  sessionId: string | undefined,
  outputDir?: string,
) {
  if (!rootPath || !sessionId) {
    return undefined;
  }

  const sessionPath = getSessionPath(rootPath, sessionId, outputDir);
  if (!sessionPath) {
    return undefined;
  }
  if (cache[sessionPath]) {
    return cache[sessionPath];
  }

  let session;
  const parsed = jsonStore.readJsonFile(sessionPath);
  if (parsed) {
    session = normaliseSession(parsed);
  }

  cache[sessionPath] = session;
  return session;
}

function saveSession(rootPath: string | undefined, session: ChangeSession, outputDir?: string) {
  if (!rootPath || !session || !session.sessionId) {
    return undefined;
  }

  const sessionPath = getSessionPath(rootPath, session.sessionId, outputDir);
  if (!sessionPath) {
    return undefined;
  }

  const normalised = normaliseSession(session);
  jsonStore.writeJsonFile(sessionPath, normalised);
  cache[sessionPath] = normalised;
  return sessionPath;
}

function listSessions(rootPath: string | undefined, outputDir?: string) {
  const folder = getSessionsFolder(rootPath, outputDir);
  if (!folder || fs.existsSync(folder) !== true) {
    return [];
  }

  return fs
    .readdirSync(folder)
    .filter(function (entry) {
      return path.extname(entry) === '.json';
    })
    .map(function (entry) {
      return loadSession(rootPath, path.basename(entry, '.json'), outputDir);
    })
    .filter(present)
    .sort(function (a, b) {
      if (a.createdAt === b.createdAt) {
        return a.sessionId > b.sessionId ? 1 : -1;
      }
      return String(a.createdAt || '') > String(b.createdAt || '') ? 1 : -1;
    });
}

function getSession(
  rootPath: string | undefined,
  sessionId: string | undefined,
  outputDir?: string,
) {
  const session = loadSession(rootPath, sessionId, outputDir);
  return session ? cloneJson(session) : undefined;
}

function getDateStamp(now?: string | number | Date) {
  const date = now ? new Date(now) : new Date();
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function createSessionId(
  rootPath: string | undefined,
  actor?: string,
  outputDir?: string,
  now?: string | number | Date,
) {
  const dateStamp = getDateStamp(now);
  const actorSlug =
    String(actor || 'agent')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent';
  const prefix = 'sess.' + dateStamp + '.' + actorSlug + '.';
  const existing = listSessions(rootPath, outputDir).filter(function (session) {
    return session.sessionId.indexOf(prefix) === 0;
  }).length;

  return prefix + String(existing + 1).padStart(3, '0');
}

function nextAnnotationId(session: { annotations: Pick<SessionAnnotation, 'annotationId'>[] }) {
  let highest = 0;

  (session.annotations || []).forEach(function (annotation) {
    const match = /^ann\.(\d+)$/.exec(String(annotation.annotationId || ''));
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  });

  return 'ann.' + String(highest + 1).padStart(3, '0');
}

function createAnnotationSignature(annotation: SessionAnnotation) {
  return [
    annotation.kind,
    annotation.file,
    annotation.line,
    annotation.stableId,
    annotation.text,
  ].join('|');
}

function upsertSession(
  rootPath: string | undefined,
  session: Partial<ChangeSession>,
  outputDir?: string,
) {
  if (!rootPath || !session || !session.sessionId) {
    return undefined;
  }

  const existing = loadSession(rootPath, session.sessionId, outputDir);
  const merged = normaliseSession(existing || session);

  Object.keys(session || {}).forEach(function (key) {
    if (key === 'taskRefs') {
      merged.taskRefs = Array.from(new Set(merged.taskRefs.concat(session.taskRefs || [])));
    } else if (key === 'annotations') {
      merged.annotations = (session.annotations || []).map(normaliseAnnotation);
    } else if (session[key as keyof ChangeSession] !== undefined) {
      Object.assign(merged, { [key]: session[key as keyof ChangeSession] });
    }
  });

  return saveSession(rootPath, merged, outputDir);
}

function syncSessionAnnotations(
  rootPath: string | undefined,
  sessionId: string | undefined,
  sessionPatch: Partial<ChangeSession>,
  annotations: Partial<SessionAnnotation>[],
  outputDir?: string,
) {
  if (!rootPath || !sessionId) {
    return undefined;
  }

  const existing = normaliseSession(
    loadSession(rootPath, sessionId, outputDir) || {
      sessionId: sessionId,
    },
  );

  Object.keys(sessionPatch || {}).forEach(function (key) {
    if (
      sessionPatch[key as keyof ChangeSession] !== undefined &&
      key !== 'annotations' &&
      key !== 'taskRefs'
    ) {
      Object.assign(existing, { [key]: sessionPatch[key as keyof ChangeSession] });
    }
  });

  if (sessionPatch && sessionPatch.taskRefs) {
    existing.taskRefs = Array.from(new Set(existing.taskRefs.concat(sessionPatch.taskRefs)));
  }

  const preserved = (existing.annotations || []).filter(function (annotation) {
    return annotation.sourceComment === false;
  });
  const issuedAnnotations: Pick<SessionAnnotation, 'annotationId'>[] = preserved.slice();
  const seen: Record<string, boolean> = {};

  (annotations || []).map(normaliseAnnotation).forEach(function (annotation) {
    const signature = createAnnotationSignature(annotation);
    if (seen[signature]) {
      return;
    }
    seen[signature] = true;
    if (!annotation.annotationId) {
      annotation.annotationId = nextAnnotationId({
        annotations: issuedAnnotations,
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

function getOpenSessions(
  rootPath: string | undefined,
  outputDir: string | undefined,
  taskRefs: string[],
) {
  const filterTaskRefs = Array.isArray(taskRefs) ? taskRefs.filter(Boolean) : [];
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

export {
  STORE_VERSION,
  getSessionsFolder,
  getSessionPath,
  getSession,
  listSessions,
  createSessionId,
  upsertSession,
  syncSessionAnnotations,
  getOpenSessions,
  resetCache,
};
