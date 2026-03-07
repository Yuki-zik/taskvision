var fs = require('fs');
var os = require('os');
var path = require('path');

var aiContext = require('../src/aiContext.js');
var taskMetaStore = require('../src/taskMetaStore.js');

function makeTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-ai-'));
}

QUnit.test("taskMetaStore persists priority and note sidecar fields", function (assert) {
    var root = makeTempRoot();

    try {
        taskMetaStore.resetCache();
        taskMetaStore.setTaskPriority(root, 'task-1', 'high', 'user', '2026-03-07T12:00:00Z');
        taskMetaStore.setTaskNote(root, 'task-1', 'Needs API review', 'user', '2026-03-07T12:01:00Z');

        var meta = taskMetaStore.getTaskMetadata(root, 'task-1', 'normal');
        assert.equal(meta.priority, 'high');
        assert.equal(meta.note, 'Needs API review');
        assert.equal(meta.lastActor, 'user');
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("taskMetaStore identifies generated output folders", function (assert) {
    var root = makeTempRoot();
    var generatedFile = path.join(root, '.taskvision', 'ai-context.md');
    var regularFile = path.join(root, 'src', 'cache.js');

    try {
        assert.equal(taskMetaStore.getOutputRelativeGlob(root, '.taskvision'), '.taskvision/**');
        assert.ok(taskMetaStore.isOutputPath(root, generatedFile, '.taskvision'));
        assert.notOk(taskMetaStore.isOutputPath(root, regularFile, '.taskvision'));
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("aiContext writes markdown/json files and reports status changes", function (assert) {
    var root = makeTempRoot();
    var sourceFile = path.join(root, 'src', 'cache.js');
    var generatedAt = '2026-03-07T12:34:56Z';

    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, [
        'const before = true;',
        '// TODO [todo] fix cache invalidation',
        'const after = false;'
    ].join('\n'));

    var exportedTasks = [{
        taskId: 'task-1',
        fsPath: sourceFile,
        line: 1,
        column: 4,
        actualTag: 'TODO',
        status: 'todo',
        priority: 'normal',
        note: '',
        after: 'fix cache invalidation'
    }];

    try {
        taskMetaStore.resetCache();
        var paths = aiContext.writeContextFiles(root, 'visible-tree', exportedTasks, generatedAt);
        taskMetaStore.markTasksExported(root, exportedTasks, generatedAt);

        assert.ok(fs.existsSync(paths.markdown));
        assert.ok(fs.existsSync(paths.json));

        var markdown = fs.readFileSync(paths.markdown, 'utf8');
        var json = JSON.parse(fs.readFileSync(paths.json, 'utf8'));

        assert.ok(markdown.indexOf('Allowed states: `todo`, `doing`, `blocked`, `paused`, `review`, `done`, `wontdo`, `idea`') !== -1);
        assert.equal(json.tasks[0].file, path.join('src', 'cache.js'));
        assert.ok(json.tasks[0].sourceExcerpt.indexOf('> 2 | // TODO [todo] fix cache invalidation') !== -1);

        exportedTasks[0].status = 'review';
        var reportPath = aiContext.writeStatusReport(root, exportedTasks, '2026-03-07T13:00:00Z');
        var report = fs.readFileSync(reportPath, 'utf8');

        assert.ok(report.indexOf('Previous status: `todo`') !== -1);
        assert.ok(report.indexOf('Current status: `review`') !== -1);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
