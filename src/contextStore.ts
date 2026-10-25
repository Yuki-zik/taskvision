import { cloneJson } from './validation';
import type { Anchor, ContextCard, ContextPatch, ContextIndex } from './model';
import { record, strings, present } from './validation';

import * as path from 'path';

import * as taskMetaStore from './taskMetaStore.js';
import * as annotationParser from './annotationParser.js';
import * as jsonStore from './jsonStore.js';

const STORE_VERSION = 1;
const STORE_FILE_NAME = 'context-index.json';
let cache: Record<string, ContextIndex> = {};

function resetCache() {
  cache = {};
}

function getStorePath(rootPath: string | undefined, outputDir?: string) {
  const folder = taskMetaStore.getOutputFolder(rootPath, outputDir);
  if (!folder) {
    return undefined;
  }

  return path.join(folder, STORE_FILE_NAME);
}

function uniqueStrings(values: unknown) {
  return strings(values);
}

function normaliseAnchor(input: unknown) {
  const anchor = record(input);
  if (!anchor || typeof anchor !== 'object') {
    return undefined;
  }

  if (!anchor.file) {
    return undefined;
  }

  return {
    file: String(anchor.file),
    line: Number(anchor.line || 0),
    tag: anchor.tag ? String(anchor.tag) : '',
  };
}

function normaliseContextEntry(entry: unknown) {
  const context = record(entry);
  const anchors = Array.isArray(context.anchors)
    ? context.anchors.map(normaliseAnchor).filter(present)
    : [];

  return {
    kind: annotationParser.normaliseContextKind(context.kind) || undefined,
    title: context.title ? String(context.title) : '',
    summary: context.summary ? String(context.summary) : '',
    body: context.body ? String(context.body) : '',
    taskRefs: uniqueStrings(context.taskRefs),
    anchors: anchors,
    updatedBy: context.updatedBy ? String(context.updatedBy) : undefined,
    updatedAt: context.updatedAt ? String(context.updatedAt) : undefined,
    freshness: context.freshness ? String(context.freshness) : 'active',
  };
}

function createEmptyStore(): ContextIndex {
  return {
    version: STORE_VERSION,
    contexts: {},
  };
}

function loadStore(rootPath: string | undefined, outputDir?: string) {
  if (!rootPath) {
    return createEmptyStore();
  }

  const key = getStorePath(rootPath, outputDir);
  if (key && cache[key]) {
    return cache[key];
  }

  const store = createEmptyStore();
  const parsed = record(jsonStore.readJsonFile(key));
  if (parsed && typeof parsed === 'object') {
    store.version = Number(parsed.version) || STORE_VERSION;
    Object.keys(record(parsed.contexts)).forEach(function (contextId) {
      store.contexts[contextId] = normaliseContextEntry(record(parsed.contexts)[contextId]);
    });
  }

  if (!key) {
    return store;
  }

  cache[key] = store;
  return store;
}

function saveStore(rootPath: string | undefined, outputDir?: string) {
  if (!rootPath) {
    return undefined;
  }

  const storePath = getStorePath(rootPath, outputDir);
  if (!storePath) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);

  try {
    return jsonStore.writeJsonFile(storePath, store);
  } catch (e) {
    delete cache[storePath];
    throw e;
  }
}

function getContext(
  rootPath: string | undefined,
  contextId: string | undefined,
  outputDir?: string,
) {
  if (!rootPath || !contextId) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  const entry = store.contexts[contextId];
  if (!entry) {
    return undefined;
  }

  const clone: ContextCard = { ...cloneJson(entry), contextId };
  return clone;
}

function findContextByAnchor(
  rootPath: string | undefined,
  anchor: Partial<Anchor> | undefined,
  outputDir?: string,
) {
  if (!rootPath || !anchor || !anchor.file) {
    return undefined;
  }

  const normalisedAnchor = normaliseAnchor(anchor);
  if (!normalisedAnchor) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  let contextId: string | undefined;

  Object.keys(store.contexts || {}).some(function (candidateId) {
    const entry = store.contexts[candidateId];
    const matched = (entry.anchors || []).some(function (candidateAnchor) {
      return (
        candidateAnchor.file === normalisedAnchor.file &&
        candidateAnchor.line === normalisedAnchor.line &&
        candidateAnchor.tag === normalisedAnchor.tag
      );
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

function listContexts(rootPath: string | undefined, outputDir?: string) {
  const store = loadStore(rootPath, outputDir);
  return Object.keys(store.contexts || {})
    .sort()
    .map(function (contextId) {
      return getContext(rootPath, contextId, outputDir);
    })
    .filter(present);
}

function mergeAnchors(existingAnchors: Anchor[], nextAnchors: Anchor[]) {
  const merged: Record<string, Anchor> = {};

  (existingAnchors || []).concat(nextAnchors || []).forEach(function (anchor) {
    const normalised = normaliseAnchor(anchor);
    if (!normalised) {
      return;
    }

    const key = [normalised.file, normalised.line, normalised.tag].join('|');
    merged[key] = normalised;
  });

  return Object.keys(merged)
    .map(function (key) {
      return merged[key];
    })
    .sort(function (a, b) {
      if (a.file === b.file) {
        return a.line - b.line;
      }
      return a.file > b.file ? 1 : -1;
    });
}

function upsertContext(
  rootPath: string | undefined,
  contextId: string | undefined,
  patch: ContextPatch,
  outputDir?: string,
) {
  if (!rootPath || !contextId) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  const current = normaliseContextEntry(store.contexts[contextId]);
  const next = normaliseContextEntry(current);
  const input = patch && typeof patch === 'object' ? patch : {};

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
    next.taskRefs =
      input.replaceTaskRefs === true
        ? uniqueStrings(input.taskRefs)
        : uniqueStrings(next.taskRefs.concat(input.taskRefs));
  }
  if (input.anchors !== undefined) {
    next.anchors =
      input.replaceAnchors === true
        ? mergeAnchors([], input.anchors)
        : mergeAnchors(next.anchors, input.anchors);
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

export {
  STORE_VERSION,
  STORE_FILE_NAME,
  getStorePath,
  getContext,
  findContextByAnchor,
  listContexts,
  upsertContext,
  resetCache,
};
