import type { TaskEntry, TaskPatch, TaskStore, TreeNode } from './model';
import { record, strings } from './validation';
// REVIEW: 旧 store 存在进程内缓存；外部协作写入不得直接覆盖此 sidecar。 [tv:id=review.legacy-store]

import * as path from 'path';
import * as jsonStore from './jsonStore.js';

const STORE_VERSION = 2;
const STORE_FILE_NAME = 'tasks-meta.json';
let cache: Record<string, TaskStore> = {};

function resetCache() {
  cache = {};
}

function isWindowsAbsolutePath(filePath: string) {
  return /^[A-Za-z]:[\\/]/.test(filePath) || /^\\\\/.test(filePath);
}

function isOutsideRoot(relativePath: string) {
  return (
    relativePath === '..' ||
    relativePath.indexOf('..' + path.sep) === 0 ||
    path.isAbsolute(relativePath)
  );
}

function getOutputFolder(rootPath: string | undefined, outputDir?: string) {
  const normalisedOutputDir =
    typeof outputDir === 'string' && outputDir.trim() !== '' ? outputDir.trim() : '.taskvision';

  if (path.isAbsolute(normalisedOutputDir) || isWindowsAbsolutePath(normalisedOutputDir)) {
    return undefined;
  }

  if (!rootPath) {
    return undefined;
  }

  const outputFolder = path.resolve(rootPath, normalisedOutputDir);
  const relative = path.relative(rootPath, outputFolder);

  if (isOutsideRoot(relative)) {
    return undefined;
  }

  return outputFolder;
}

function getOutputRelativeGlob(rootPath: string | undefined, outputDir?: string) {
  const outputFolder = getOutputFolder(rootPath, outputDir);
  if (!rootPath || !outputFolder) {
    return undefined;
  }

  const relative = path.relative(rootPath, outputFolder);
  if (!relative || isOutsideRoot(relative)) {
    return undefined;
  }

  return relative.replace(/\\/g, '/') + '/**';
}

function isOutputPath(
  rootPath: string | undefined,
  filePath: string | undefined,
  outputDir?: string,
) {
  if (!rootPath || !filePath) {
    return false;
  }

  const outputFolder = getOutputFolder(rootPath, outputDir);
  if (!outputFolder) {
    return false;
  }

  const relative = path.relative(outputFolder, filePath);
  return relative === '' || isOutsideRoot(relative) === false;
}

function getStorePath(rootPath: string | undefined, outputDir?: string) {
  const folder = getOutputFolder(rootPath, outputDir);
  if (!folder) {
    return undefined;
  }

  return path.join(folder, STORE_FILE_NAME);
}

function uniqueStrings(values: unknown) {
  return strings(values);
}

function normaliseTaskEntry(entry: unknown) {
  const value = record(entry);
  return {
    stableId: value.stableId ? String(value.stableId) : undefined,
    priority: value.priority ? String(value.priority) : undefined,
    note: value.note ? String(value.note) : '',
    acceptanceCriteria: uniqueStrings(value.acceptanceCriteria),
    nonGoals: uniqueStrings(value.nonGoals),
    contextRefs: uniqueStrings(value.contextRefs),
    lastActor: value.lastActor ? String(value.lastActor) : undefined,
    updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
    lastExportedStatus: value.lastExportedStatus ? String(value.lastExportedStatus) : undefined,
    lastExportedAt: value.lastExportedAt ? String(value.lastExportedAt) : undefined,
    file: value.file ? String(value.file) : undefined,
    line: value.line !== undefined ? Number(value.line) : undefined,
  };
}

function createEmptyStore(): TaskStore {
  return {
    version: STORE_VERSION,
    tasks: {},
    stableIndex: {},
  };
}

function rebuildStableIndex(store: TaskStore) {
  const stableIndex: Record<string, string> = {};

  Object.keys(store.tasks || {}).forEach(function (taskId) {
    const entry = normaliseTaskEntry(store.tasks[taskId]);
    store.tasks[taskId] = entry;

    if (entry.stableId) {
      stableIndex[entry.stableId] = taskId;
    }
  });

  store.stableIndex = stableIndex;
  store.version = STORE_VERSION;
}

function loadStore(rootPath: string | undefined, outputDir?: string) {
  if (!rootPath) {
    return createEmptyStore();
  }

  const key = getStorePath(rootPath, outputDir);
  if (!key) {
    return createEmptyStore();
  }
  if (cache[key]) {
    return cache[key];
  }

  const store = createEmptyStore();
  const parsed = record(jsonStore.readJsonFile(key));
  if (parsed && typeof parsed === 'object') {
    store.version = Number(parsed.version) || STORE_VERSION;
    Object.keys(record(parsed.tasks)).forEach(function (taskId) {
      store.tasks[taskId] = normaliseTaskEntry(record(parsed.tasks)[taskId]);
    });
    // Rebuilt below from normalized records, including v1 sidecars.
  }

  rebuildStableIndex(store);
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

  rebuildStableIndex(store);
  try {
    return jsonStore.writeJsonFile(storePath, store);
  } catch (e) {
    delete cache[storePath];
    throw e;
  }
}

function resolveLegacyTaskId(store: TaskStore, taskIdOrStableId?: string) {
  if (!store || !taskIdOrStableId) {
    return undefined;
  }

  if (store.tasks[taskIdOrStableId]) {
    return taskIdOrStableId;
  }

  if (store.stableIndex[taskIdOrStableId]) {
    return store.stableIndex[taskIdOrStableId];
  }

  return undefined;
}

function getTaskEntry(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  outputDir?: string,
) {
  if (!rootPath || !taskIdOrStableId) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  const legacyTaskId = resolveLegacyTaskId(store, taskIdOrStableId);
  if (!legacyTaskId) {
    return undefined;
  }

  return store.tasks[legacyTaskId];
}

function getLegacyTaskId(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  outputDir?: string,
) {
  const store = loadStore(rootPath, outputDir);
  return resolveLegacyTaskId(store, taskIdOrStableId);
}

function getTaskMetadata(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  defaultPriority?: string,
  outputDir?: string,
) {
  const entry = normaliseTaskEntry(getTaskEntry(rootPath, taskIdOrStableId, outputDir));
  return {
    stableId: entry.stableId,
    priority: entry.priority || defaultPriority || 'normal',
    note: entry.note || '',
    acceptanceCriteria: uniqueStrings(entry.acceptanceCriteria),
    nonGoals: uniqueStrings(entry.nonGoals),
    contextRefs: uniqueStrings(entry.contextRefs),
    lastActor: entry.lastActor,
    updatedAt: entry.updatedAt,
    lastExportedStatus: entry.lastExportedStatus,
    lastExportedAt: entry.lastExportedAt,
  };
}

function ensureTaskEntry(
  rootPath: string | undefined,
  taskId: string | undefined,
  outputDir?: string,
) {
  if (!rootPath || !taskId) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  if (!store.tasks[taskId]) {
    store.tasks[taskId] = normaliseTaskEntry({});
  }

  return store.tasks[taskId];
}

function updateTask(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  patch: TaskPatch,
  outputDir?: string,
) {
  if (!rootPath || !taskIdOrStableId) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  const legacyTaskId = resolveLegacyTaskId(store, taskIdOrStableId) || taskIdOrStableId;
  const entry = ensureTaskEntry(rootPath, legacyTaskId, outputDir);
  const next = normaliseTaskEntry(entry);
  const input = patch && typeof patch === 'object' ? patch : {};

  if (input.stableId !== undefined) {
    next.stableId = input.stableId ? String(input.stableId) : undefined;
  }
  if (input.priority !== undefined) {
    next.priority = input.priority ? String(input.priority) : undefined;
  }
  if (input.note !== undefined) {
    next.note = String(input.note || '');
  }
  if (input.acceptanceCriteria !== undefined) {
    next.acceptanceCriteria = uniqueStrings(input.acceptanceCriteria);
  }
  if (input.nonGoals !== undefined) {
    next.nonGoals = uniqueStrings(input.nonGoals);
  }
  if (input.contextRefs !== undefined) {
    next.contextRefs =
      input.replaceContextRefs === true
        ? uniqueStrings(input.contextRefs)
        : uniqueStrings(next.contextRefs.concat(input.contextRefs));
  }
  if (input.lastActor !== undefined) {
    next.lastActor = input.lastActor ? String(input.lastActor) : undefined;
  }
  if (input.updatedAt !== undefined) {
    next.updatedAt = input.updatedAt ? String(input.updatedAt) : undefined;
  }
  if (input.lastExportedStatus !== undefined) {
    next.lastExportedStatus = input.lastExportedStatus
      ? String(input.lastExportedStatus)
      : undefined;
  }
  if (input.lastExportedAt !== undefined) {
    next.lastExportedAt = input.lastExportedAt ? String(input.lastExportedAt) : undefined;
  }
  if (input.file !== undefined) {
    next.file = input.file ? String(input.file) : undefined;
  }
  if (input.line !== undefined) {
    next.line = input.line !== undefined ? Number(input.line) : undefined;
  }

  store.tasks[legacyTaskId] = next;
  return saveStore(rootPath, outputDir);
}

function ensureTaskStableId(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  stableId: string | undefined,
  actor?: string,
  updatedAt?: string,
  outputDir?: string,
) {
  const metadata = getTaskMetadata(rootPath, taskIdOrStableId, undefined, outputDir);
  if (metadata.stableId) {
    return metadata.stableId;
  }

  if (!stableId) {
    return undefined;
  }

  updateTask(
    rootPath,
    taskIdOrStableId,
    {
      stableId: stableId,
      lastActor: actor,
      updatedAt: updatedAt,
    },
    outputDir,
  );

  return stableId;
}

function setTaskPriority(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  priority: string | undefined,
  actor?: string,
  updatedAt?: string,
  outputDir?: string,
) {
  return updateTask(
    rootPath,
    taskIdOrStableId,
    {
      priority: priority,
      lastActor: actor,
      updatedAt: updatedAt,
    },
    outputDir,
  );
}

function setTaskNote(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  note: string | undefined,
  actor?: string,
  updatedAt?: string,
  outputDir?: string,
) {
  return updateTask(
    rootPath,
    taskIdOrStableId,
    {
      note: note,
      lastActor: actor,
      updatedAt: updatedAt,
    },
    outputDir,
  );
}

function addTaskContextRefs(
  rootPath: string | undefined,
  taskIdOrStableId: string | undefined,
  contextRefs: string[] | undefined,
  actor?: string,
  updatedAt?: string,
  outputDir?: string,
) {
  return updateTask(
    rootPath,
    taskIdOrStableId,
    {
      contextRefs: contextRefs,
      lastActor: actor,
      updatedAt: updatedAt,
    },
    outputDir,
  );
}

function markTasksExported(
  rootPath: string | undefined,
  tasks: TreeNode[],
  exportedAt: string,
  outputDir?: string,
) {
  if (!rootPath) {
    return undefined;
  }

  const store = loadStore(rootPath, outputDir);
  (tasks || []).forEach(function (task) {
    if (!task || !task.taskId) {
      return;
    }

    if (!store.tasks[task.taskId]) {
      store.tasks[task.taskId] = normaliseTaskEntry({});
    }

    if (task.stableId) {
      store.tasks[task.taskId].stableId = task.stableId;
    }
    store.tasks[task.taskId].lastExportedStatus = task.status;
    store.tasks[task.taskId].lastExportedAt = exportedAt;
    store.tasks[task.taskId].file = task.fsPath;
    store.tasks[task.taskId].line = task.line !== undefined ? task.line + 1 : undefined;
  });

  return saveStore(rootPath, outputDir);
}

function getExportBaseline(rootPath: string | undefined, outputDir?: string) {
  const store = loadStore(rootPath, outputDir);
  const result: Record<string, TaskEntry> = {};

  Object.keys(store.tasks || {}).forEach(function (taskId) {
    const entry = store.tasks[taskId];
    if (entry && entry.lastExportedStatus !== undefined) {
      result[taskId] = entry;
    }
  });

  return result;
}

export {
  STORE_VERSION,
  STORE_FILE_NAME,
  getOutputFolder,
  getOutputRelativeGlob,
  getStorePath,
  getTaskMetadata,
  getTaskEntry,
  getLegacyTaskId,
  ensureTaskStableId,
  updateTask,
  setTaskPriority,
  setTaskNote,
  addTaskContextRefs,
  markTasksExported,
  getExportBaseline,
  isOutputPath,
  resetCache,
};
