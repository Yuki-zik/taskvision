/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

var taskState = require('./taskState.js');
var taskMetaStore = require('./taskMetaStore.js');

function ensureFolder(folderPath) {
    if (folderPath && fs.existsSync(folderPath) !== true) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function getOutputFolder(rootPath, outputDir) {
    return taskMetaStore.getOutputFolder(rootPath, outputDir);
}

function getOutputPaths(rootPath, outputDir) {
    var folder = getOutputFolder(rootPath, outputDir);
    return {
        folder: folder,
        markdown: path.join(folder, 'ai-context.md'),
        json: path.join(folder, 'ai-context.json'),
        report: path.join(folder, 'ai-status-report.md')
    };
}

function toRelativePath(rootPath, filePath) {
    if (!rootPath || !filePath) {
        return filePath || '';
    }

    var relative = path.relative(rootPath, filePath);
    if (!relative || relative.indexOf('..') === 0) {
        return filePath;
    }

    return relative;
}

function getSourceExcerpt(task) {
    if (!task || !task.fsPath || fs.existsSync(task.fsPath) !== true) {
        return '';
    }

    try {
        var lines = fs.readFileSync(task.fsPath, 'utf8').split(/\r?\n/);
        var start = Math.max(0, task.line - 1);
        var end = Math.min(lines.length - 1, task.line + 1);
        var excerpt = [];

        for (var lineIndex = start; lineIndex <= end; lineIndex++) {
            var marker = lineIndex === task.line ? '>' : ' ';
            excerpt.push(marker + ' ' + (lineIndex + 1) + ' | ' + lines[lineIndex]);
        }

        return excerpt.join('\n');
    }
    catch (e) {
        return '';
    }
}

function toSerializableTask(task, rootPath) {
    return {
        taskId: task.taskId,
        file: toRelativePath(rootPath, task.fsPath),
        line: task.line + 1,
        column: task.column,
        tag: task.actualTag || task.tag,
        status: task.status,
        priority: task.priority,
        note: task.note || '',
        text: task.after || task.label || '',
        subTag: task.subTag || '',
        sourceExcerpt: getSourceExcerpt(task)
    };
}

function compareTasks(a, b) {
    if (a.fsPath === b.fsPath) {
        if (a.line === b.line) {
            return a.column - b.column;
        }

        return a.line - b.line;
    }

    return a.fsPath > b.fsPath ? 1 : -1;
}

function renderRulesMarkdown() {
    var lines = [
        '## Task State Rules',
        '',
        '- Allowed states: `' + taskState.STATUSES.join('`, `') + '`',
        '- Allowed priorities: `' + taskState.PRIORITIES.join('`, `') + '`',
        '- Inline status format: `[status]` immediately after the tag',
        '- AI may only change inline status tokens in source comments',
        '- Prefer `review` over `done` when code changed but verification is incomplete',
        '- Do not change `blocked`, `paused`, or `wontdo` without a clear reason in the task body or follow-up report',
        '- Do not modify `.taskvision/tasks-meta.json` directly',
        ''
    ];

    lines.push('## Recommended Status Flows');
    lines.push('');
    Object.keys(taskState.RECOMMENDED_TRANSITIONS).forEach(function (fromState) {
        lines.push('- `' + fromState + '` -> `' + taskState.RECOMMENDED_TRANSITIONS[fromState].join('`, `') + '`');
    });
    lines.push('');

    return lines.join('\n');
}

function renderTaskMarkdown(task, rootPath) {
    var serialised = toSerializableTask(task, rootPath);
    var lines = [
        '### ' + serialised.file + ':' + serialised.line,
        '- Task ID: `' + serialised.taskId + '`',
        '- Tag: `' + serialised.tag + '`',
        '- Status: `' + serialised.status + '`',
        '- Priority: `' + serialised.priority + '`',
        '- Note: ' + (serialised.note || '(none)'),
        '- Text: ' + (serialised.text || '(empty)'),
        '- Sub tag: ' + (serialised.subTag || '(none)')
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

function buildMarkdown(rootPath, scope, tasks, generatedAt) {
    var lines = [
        '# TaskVision AI Context',
        '',
        '- Generated at: `' + generatedAt + '`',
        '- Workspace root: `' + rootPath + '`',
        '- Scope: `' + (scope || 'visible-tree') + '`',
        '',
        renderRulesMarkdown(),
        '## Tasks',
        ''
    ];

    if (!tasks || tasks.length === 0) {
        lines.push('No visible tasks were exported.');
        lines.push('');
        return lines.join('\n');
    }

    tasks.slice().sort(compareTasks).forEach(function (task) {
        lines.push(renderTaskMarkdown(task, rootPath));
    });

    return lines.join('\n');
}

function buildJson(rootPath, scope, tasks, generatedAt) {
    return {
        version: 1,
        generatedAt: generatedAt,
        workspaceRoot: rootPath,
        scope: scope || 'visible-tree',
        syntax: {
            inlineStatusFormat: '[status]'
        },
        allowedStatuses: taskState.STATUSES.slice(),
        allowedPriorities: taskState.PRIORITIES.slice(),
        tasks: (tasks || []).slice().sort(compareTasks).map(function (task) {
            return toSerializableTask(task, rootPath);
        })
    };
}

function writeContextFiles(rootPath, scope, tasks, generatedAt, outputDir) {
    var paths = getOutputPaths(rootPath, outputDir);
    ensureFolder(paths.folder);

    fs.writeFileSync(paths.markdown, buildMarkdown(rootPath, scope, tasks, generatedAt) + '\n');
    fs.writeFileSync(paths.json, JSON.stringify(buildJson(rootPath, scope, tasks, generatedAt), null, 2) + '\n');

    return paths;
}

function buildStatusReport(rootPath, tasks, generatedAt, outputDir) {
    var baseline = taskMetaStore.getExportBaseline(rootPath, outputDir);
    var currentTasks = {};
    var changes = [];

    (tasks || []).forEach(function (task) {
        currentTasks[task.taskId] = task;
    });

    Object.keys(baseline).forEach(function (taskId) {
        var entry = baseline[taskId];
        var currentTask = currentTasks[taskId];

        if (!currentTask) {
            changes.push({
                taskId: taskId,
                previousStatus: entry.lastExportedStatus,
                currentStatus: 'missing',
                exists: false,
                file: entry.file || '',
                line: entry.line || '',
                lastExportedAt: entry.lastExportedAt
            });
            return;
        }

        if (currentTask.status !== entry.lastExportedStatus) {
            changes.push({
                taskId: taskId,
                previousStatus: entry.lastExportedStatus,
                currentStatus: currentTask.status,
                exists: true,
                file: toRelativePath(rootPath, currentTask.fsPath),
                line: currentTask.line + 1,
                lastExportedAt: entry.lastExportedAt
            });
        }
    });

    var lines = [
        '# TaskVision AI Status Report',
        '',
        '- Generated at: `' + generatedAt + '`',
        '- Workspace root: `' + rootPath + '`',
        ''
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

function writeStatusReport(rootPath, tasks, generatedAt, outputDir) {
    if (!rootPath) {
        return undefined;
    }

    var baseline = taskMetaStore.getExportBaseline(rootPath, outputDir);
    if (Object.keys(baseline).length === 0) {
        return undefined;
    }

    var paths = getOutputPaths(rootPath, outputDir);
    ensureFolder(paths.folder);
    fs.writeFileSync(paths.report, buildStatusReport(rootPath, tasks, generatedAt, outputDir) + '\n');
    return paths.report;
}

module.exports.getOutputPaths = getOutputPaths;
module.exports.buildMarkdown = buildMarkdown;
module.exports.buildJson = buildJson;
module.exports.writeContextFiles = writeContextFiles;
module.exports.buildStatusReport = buildStatusReport;
module.exports.writeStatusReport = writeStatusReport;
