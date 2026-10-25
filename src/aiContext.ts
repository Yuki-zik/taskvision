import type { TodoNode, TaskEntry, ContextCard, ChangeSession } from './model';
import { strings } from './validation';
// CORE: 旧 Markdown／JSON 交接包导出入口；与新 MCP 工作台保持兼容。 [tv:id=core.context-export]

import * as fs from 'fs';
import * as path from 'path';

import * as taskState from './taskState.js';
import * as taskMetaStore from './taskMetaStore.js';
import * as contextStore from './contextStore.js';
import * as changeSessionStore from './changeSessionStore.js';
import * as jsonStore from './jsonStore.js';

function ensureFolder(folderPath: string) {
  if (folderPath && fs.existsSync(folderPath) !== true) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function getOutputFolder(rootPath: string, outputDir?: string) {
  return taskMetaStore.getOutputFolder(rootPath, outputDir);
}

function getOutputPaths(rootPath: string, outputDir?: string) {
  const folder = getOutputFolder(rootPath, outputDir);
  if (!folder) throw new Error('AI context output must stay inside the workspace');
  return {
    folder: folder,
    markdown: path.join(folder, 'ai-context.md'),
    json: path.join(folder, 'ai-context.json'),
    report: path.join(folder, 'ai-status-report.md'),
  };
}

function toRelativePath(rootPath: string, filePath?: string) {
  if (!rootPath || !filePath) {
    return filePath || '';
  }

  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.indexOf('..') === 0 || path.isAbsolute(relative)) {
    return filePath;
  }

  return relative.replace(/\\/g, '/');
}

function normaliseComparablePath(filePath: string) {
  if (!filePath) {
    return '';
  }

  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function getSourceExcerpt(task: TodoNode) {
  if (!task || !task.fsPath || fs.existsSync(task.fsPath) !== true) {
    return '';
  }

  try {
    const lines = fs.readFileSync(task.fsPath, 'utf8').split(/\r?\n/);
    const start = Math.max(0, task.line - 1);
    const end = Math.min(lines.length - 1, task.line + 1);
    const excerpt = [];

    for (let lineIndex = start; lineIndex <= end; lineIndex++) {
      const marker = lineIndex === task.line ? '>' : ' ';
      excerpt.push(marker + ' ' + (lineIndex + 1) + ' | ' + lines[lineIndex]);
    }

    return excerpt.join('\n');
  } catch (e) {
    return '';
  }
}

function compareNodes(a: TodoNode, b: TodoNode) {
  if (a.fsPath === b.fsPath) {
    if (a.line === b.line) {
      return a.column - b.column;
    }

    return a.line - b.line;
  }

  return a.fsPath > b.fsPath ? 1 : -1;
}

function isTaskNode(node: TodoNode) {
  return !node || (node.annotationKind !== 'context' && node.annotationKind !== 'review');
}

function uniqueStrings(values: unknown) {
  return strings(values);
}

function toSerializableTask(task: TodoNode, rootPath: string, outputDir?: string) {
  const metadata: Partial<TaskEntry> =
    task && task.taskId
      ? taskMetaStore.getTaskMetadata(rootPath, task.taskId, task.priority, outputDir)
      : {};
  return {
    taskId: task.taskId,
    stableId: task.stableId || metadata.stableId,
    file: toRelativePath(rootPath, task.fsPath),
    line: task.line + 1,
    column: task.column,
    tag: task.actualTag || task.tag,
    status: task.status,
    priority: task.priority,
    note: task.note || '',
    text: task.after || task.label || '',
    subTag: task.subTag || '',
    contextRefs: uniqueStrings((task.contextRefs || []).concat(metadata.contextRefs || [])),
    sourceExcerpt: getSourceExcerpt(task),
  };
}

function toSerializableContext(context: ContextCard) {
  return {
    contextId: context.contextId,
    kind: context.kind,
    title: context.title,
    summary: context.summary,
    body: context.body,
    taskRefs: uniqueStrings(context.taskRefs),
    anchors: (context.anchors || []).map(function (anchor) {
      return {
        file: anchor.file,
        line: anchor.line,
        tag: anchor.tag,
      };
    }),
    updatedBy: context.updatedBy,
    updatedAt: context.updatedAt,
    freshness: context.freshness,
  };
}

function toSerializableSession(session: ChangeSession) {
  return {
    sessionId: session.sessionId,
    sessionType: session.sessionType,
    actor: session.actor,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    summary: session.summary,
    taskRefs: uniqueStrings(session.taskRefs),
    annotations: (session.annotations || []).map(function (annotation) {
      return {
        annotationId: annotation.annotationId,
        kind: annotation.kind,
        file: annotation.file,
        line: annotation.line,
        stableId: annotation.stableId,
        sourceComment: annotation.sourceComment !== false,
        reviewState: annotation.reviewState,
        text: annotation.text,
      };
    }),
  };
}

function collectRelevantContexts(rootPath: string, nodes: TodoNode[], outputDir?: string) {
  const explicitContextIds: Record<string, boolean> = {};
  const taskStableIds: Record<string, boolean> = {};
  const files: Record<string, boolean> = {};

  (nodes || []).forEach(function (node) {
    if (!node || !node.fsPath) {
      return;
    }

    files[normaliseComparablePath(toRelativePath(rootPath, node.fsPath))] = true;

    if (node.annotationKind === 'context' && node.stableId) {
      explicitContextIds[node.stableId] = true;
    }
    if (isTaskNode(node) && node.stableId) {
      taskStableIds[node.stableId] = true;
    }
  });

  return contextStore.listContexts(rootPath, outputDir).filter(function (context) {
    if (explicitContextIds[context.contextId]) {
      return true;
    }

    if (
      (context.taskRefs || []).some(function (taskRef) {
        return taskStableIds[taskRef] === true;
      })
    ) {
      return true;
    }

    return (context.anchors || []).some(function (anchor) {
      return files[normaliseComparablePath(anchor.file)] === true;
    });
  });
}

function collectOpenSessions(rootPath: string, nodes: TodoNode[], outputDir?: string) {
  const explicitSessionIds: Record<string, boolean> = {};
  const taskStableIds = uniqueStrings(
    (nodes || [])
      .filter(function (node) {
        return isTaskNode(node) && node.stableId;
      })
      .map(function (node) {
        return node.stableId;
      }),
  );

  (nodes || []).forEach(function (node) {
    if (node && node.sessionId) {
      explicitSessionIds[node.sessionId] = true;
    }
  });

  // Fetch all open sessions and apply the combined filter here so that
  // sessions referenced explicitly by sessionId are not pre-filtered away
  // by the taskRef intersection inside getOpenSessions.
  return changeSessionStore.getOpenSessions(rootPath, outputDir, []).filter(function (session) {
    return (
      explicitSessionIds[session.sessionId] === true ||
      taskStableIds.length === 0 ||
      (session.taskRefs || []).some(function (taskRef) {
        return taskStableIds.indexOf(taskRef) !== -1;
      })
    );
  });
}

function buildReadOrder() {
  return [
    {
      step: 1,
      type: 'contexts',
      contextKinds: ['must-read', 'constraint', 'invariant', 'decision'],
      description: 'Read direct task-linked high-signal contexts first.',
    },
    {
      step: 2,
      type: 'tasks',
      description: 'Read task definitions and current statuses.',
    },
    {
      step: 3,
      type: 'sessions',
      sessionTypes: ['planning', 'review'],
      status: 'open',
      description: 'Review open planning and review session summaries.',
    },
    {
      step: 4,
      type: 'contexts',
      remaining: true,
      description: 'Use remaining context cards only as needed.',
    },
  ];
}

function renderRulesMarkdown() {
  const lines = [
    '## Task State Rules',
    '',
    '- Allowed states: `' + taskState.STATUSES.join('`, `') + '`',
    '- Allowed priorities: `' + taskState.PRIORITIES.join('`, `') + '`',
    '- Inline status format: `[status]` immediately after the tag',
    '- TaskVision directives: `[tv:key=value]`',
    '- AI may only change inline status tokens or TaskVision directives in source comments',
    '- Prefer `review` over `done` when code changed but verification is incomplete',
    '- Do not change `blocked`, `paused`, or `wontdo` without a clear reason in the task body or follow-up report',
    '- Do not modify `.taskvision/tasks-meta.json` directly',
    '',
  ];

  lines.push('## Recommended Status Flows');
  lines.push('');
  Object.keys(taskState.RECOMMENDED_TRANSITIONS).forEach(function (fromState) {
    lines.push(
      '- `' +
        fromState +
        '` -> `' +
        taskState.RECOMMENDED_TRANSITIONS[fromState].join('`, `') +
        '`',
    );
  });
  lines.push('');

  return lines.join('\n');
}

function renderTaskMarkdown(task: TodoNode, rootPath: string, outputDir?: string) {
  const serialised = toSerializableTask(task, rootPath, outputDir);
  const lines = [
    '### ' + serialised.file + ':' + serialised.line,
    '- Legacy task ID: `' + serialised.taskId + '`',
    '- Stable ID: `' + serialised.stableId + '`',
    '- Tag: `' + serialised.tag + '`',
    '- Status: `' + serialised.status + '`',
    '- Priority: `' + serialised.priority + '`',
    '- Note: ' + (serialised.note || '(none)'),
    '- Text: ' + (serialised.text || '(empty)'),
    '- Sub tag: ' + (serialised.subTag || '(none)'),
    '- Context refs: ' +
      (serialised.contextRefs.length > 0
        ? serialised.contextRefs
            .map(function (value) {
              return '`' + value + '`';
            })
            .join(', ')
        : '(none)'),
  ];

  if (serialised.sourceExcerpt) {
    lines.push('- Source excerpt:');
    lines.push('');
    lines.push('```text');
    lines.push(serialised.sourceExcerpt);
    lines.push('```');
  }

  lines.push('');
  return lines.join('\n');
}

function renderContextMarkdown(context: ContextCard) {
  const lines = [
    '### ' + context.contextId,
    '- Kind: `' + (context.kind || '') + '`',
    '- Title: ' + (context.title || '(untitled)'),
    '- Summary: ' + (context.summary || '(none)'),
    '- Task refs: ' +
      ((context.taskRefs || []).length > 0
        ? context.taskRefs
            .map(function (taskRef) {
              return '`' + taskRef + '`';
            })
            .join(', ')
        : '(none)'),
    '- Anchors: ' +
      ((context.anchors || []).length > 0
        ? context.anchors
            .map(function (anchor) {
              return '`' + anchor.file + ':' + anchor.line + '`';
            })
            .join(', ')
        : '(none)'),
  ];

  if (context.body) {
    lines.push('- Body:');
    lines.push('');
    lines.push('```text');
    lines.push(context.body);
    lines.push('```');
  }

  lines.push('');
  return lines.join('\n');
}

function renderSessionMarkdown(session: Omit<ChangeSession, 'version'>) {
  const lines = [
    '### ' + session.sessionId,
    '- Type: `' + session.sessionType + '`',
    '- Actor: `' + session.actor + '`',
    '- Status: `' + session.status + '`',
    '- Summary: ' + (session.summary || '(none)'),
    '- Task refs: ' +
      ((session.taskRefs || []).length > 0
        ? session.taskRefs
            .map(function (taskRef) {
              return '`' + taskRef + '`';
            })
            .join(', ')
        : '(none)'),
  ];

  if (session.annotations && session.annotations.length > 0) {
    lines.push('- Annotations:');
    session.annotations.forEach(function (annotation) {
      lines.push(
        '  - `' +
          annotation.kind +
          '` ' +
          annotation.file +
          ':' +
          annotation.line +
          ' - ' +
          annotation.text,
      );
    });
  }

  lines.push('');
  return lines.join('\n');
}

function buildMarkdown(
  rootPath: string,
  scope: string,
  nodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  const taskNodes = (nodes || []).filter(isTaskNode).slice().sort(compareNodes);
  const contexts = collectRelevantContexts(rootPath, nodes, outputDir).map(toSerializableContext);
  const openSessions = collectOpenSessions(rootPath, nodes, outputDir).map(toSerializableSession);
  const lines = [
    '# TaskVision AI Context',
    '',
    '- Generated at: `' + generatedAt + '`',
    '- Workspace root: `' + rootPath + '`',
    '- Scope: `' + (scope || 'visible-tree') + '`',
    '',
    renderRulesMarkdown(),
    '## Read Order',
    '',
  ];

  buildReadOrder().forEach(function (step) {
    lines.push(step.step + '. ' + step.description);
  });
  lines.push('');

  lines.push('## Tasks');
  lines.push('');

  if (taskNodes.length === 0) {
    lines.push('No visible tasks were exported.');
    lines.push('');
  } else {
    taskNodes.forEach(function (task) {
      lines.push(renderTaskMarkdown(task, rootPath, outputDir));
    });
  }

  lines.push('## Context Cards');
  lines.push('');
  if (contexts.length === 0) {
    lines.push('No related context cards were found.');
    lines.push('');
  } else {
    contexts.forEach(function (context) {
      lines.push(renderContextMarkdown(context));
    });
  }

  lines.push('## Open Sessions');
  lines.push('');
  if (openSessions.length === 0) {
    lines.push('No open planning or review sessions were found.');
    lines.push('');
  } else {
    openSessions.forEach(function (session) {
      lines.push(renderSessionMarkdown(session));
    });
  }

  return lines.join('\n');
}

function buildJson(
  rootPath: string,
  scope: string,
  nodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  const taskNodes = (nodes || []).filter(isTaskNode).slice().sort(compareNodes);
  const contexts = collectRelevantContexts(rootPath, nodes, outputDir).map(toSerializableContext);
  const openSessions = collectOpenSessions(rootPath, nodes, outputDir).map(toSerializableSession);

  return {
    version: 2,
    generatedAt: generatedAt,
    workspaceRoot: rootPath,
    scope: scope || 'visible-tree',
    syntax: {
      inlineStatusFormat: '[status]',
      directiveFormat: '[tv:key=value]',
    },
    allowedStatuses: taskState.STATUSES.slice(),
    allowedPriorities: taskState.PRIORITIES.slice(),
    tasks: taskNodes.map(function (task) {
      return toSerializableTask(task, rootPath, outputDir);
    }),
    contexts: contexts,
    openSessions: openSessions,
    readOrder: buildReadOrder(),
  };
}

function writeContextFiles(
  rootPath: string,
  scope: string,
  nodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  const paths = getOutputPaths(rootPath, outputDir);
  ensureFolder(paths.folder);

  // Writes routed through jsonStore for atomic temp+rename (avoids half-written handoff files).
  jsonStore.writeTextFile(
    paths.markdown,
    buildMarkdown(rootPath, scope, nodes, generatedAt, outputDir) + '\n',
  );
  jsonStore.writeJsonFile(paths.json, buildJson(rootPath, scope, nodes, generatedAt, outputDir));

  return paths;
}

function buildStatusReport(
  rootPath: string,
  nodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  const baseline = taskMetaStore.getExportBaseline(rootPath, outputDir);
  const currentTasks: Record<string, TodoNode> = {};
  const changes: {
    taskId: string;
    stableId?: string;
    previousStatus?: string;
    currentStatus?: string;
    exists: boolean;
    file: string;
    line: number | string;
    lastExportedAt?: string;
  }[] = [];

  (nodes || []).filter(isTaskNode).forEach(function (task) {
    if (task.taskId) currentTasks[task.taskId] = task;
  });

  Object.keys(baseline).forEach(function (taskId) {
    const entry = baseline[taskId];
    const currentTask = currentTasks[taskId];

    if (!currentTask) {
      changes.push({
        taskId: taskId,
        stableId: entry.stableId,
        previousStatus: entry.lastExportedStatus,
        currentStatus: 'missing',
        exists: false,
        file: entry.file || '',
        line: entry.line || '',
        lastExportedAt: entry.lastExportedAt,
      });
      return;
    }

    if (currentTask.status !== entry.lastExportedStatus) {
      changes.push({
        taskId: taskId,
        stableId: currentTask.stableId,
        previousStatus: entry.lastExportedStatus,
        currentStatus: currentTask.status,
        exists: true,
        file: toRelativePath(rootPath, currentTask.fsPath),
        line: currentTask.line + 1,
        lastExportedAt: entry.lastExportedAt,
      });
    }
  });

  const lines = [
    '# TaskVision AI Status Report',
    '',
    '- Generated at: `' + generatedAt + '`',
    '- Workspace root: `' + rootPath + '`',
    '',
  ];

  if (changes.length === 0) {
    lines.push('No status changes detected since the last AI context export.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Status Changes');
  lines.push('');
  changes.forEach(function (change) {
    lines.push('### `' + change.taskId + '`');
    if (change.stableId) {
      lines.push('- Stable ID: `' + change.stableId + '`');
    }
    lines.push('- File: `' + change.file + '`');
    lines.push('- Line: `' + change.line + '`');
    lines.push('- Previous status: `' + change.previousStatus + '`');
    lines.push('- Current status: `' + change.currentStatus + '`');
    lines.push('- Exists in current scan: `' + change.exists + '`');
    lines.push('- Last exported at: `' + (change.lastExportedAt || '') + '`');
    lines.push('');
  });

  return lines.join('\n');
}

function writeStatusReport(
  rootPath: string,
  nodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  if (!rootPath) {
    return undefined;
  }

  const baseline = taskMetaStore.getExportBaseline(rootPath, outputDir);
  if (Object.keys(baseline).length === 0) {
    return undefined;
  }

  const paths = getOutputPaths(rootPath, outputDir);
  ensureFolder(paths.folder);
  jsonStore.writeTextFile(
    paths.report,
    buildStatusReport(rootPath, nodes, generatedAt, outputDir) + '\n',
  );
  return paths.report;
}

export {
  getOutputPaths,
  buildMarkdown,
  buildJson,
  writeContextFiles,
  buildStatusReport,
  writeStatusReport,
};

/** Write the report against the previous export before advancing its baseline. */
export function exportContextWithBaseline(
  rootPath: string,
  scope: string,
  nodes: TodoNode[],
  allNodes: TodoNode[],
  generatedAt: string,
  outputDir?: string,
) {
  const paths = writeContextFiles(rootPath, scope, nodes, generatedAt, outputDir);
  writeStatusReport(rootPath, allNodes, generatedAt, outputDir);
  taskMetaStore.markTasksExported(rootPath, nodes.filter(isTaskNode), generatedAt, outputDir);
  return paths;
}
