var fs = require('fs');
var os = require('os');
var path = require('path');

var taskMetaStore = require('../src/taskMetaStore.js');
var contextStore = require('../src/contextStore.js');
var changeSessionStore = require('../src/changeSessionStore.js');

function makeTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-data-'));
}

function withInterruptedWrite(targetPath, action) {
    var originalWriteFileSync = fs.writeFileSync;
    var targetName = path.basename(targetPath);

    fs.writeFileSync = function (filePath, data, options) {
        var currentPath = String(filePath);
        var currentName = path.basename(currentPath);
        var isTargetWrite = currentPath === targetPath || currentName.indexOf(targetName + '.tmp-') === 0 || currentName.indexOf('.' + targetName + '.tmp-') === 0;

        if (isTargetWrite) {
            originalWriteFileSync.call(fs, filePath, '{"partial":', options);
            throw new Error('simulated interrupted write');
        }

        return originalWriteFileSync.apply(fs, arguments);
    };

    try {
        action();
    }
    finally {
        fs.writeFileSync = originalWriteFileSync;
    }
}

function ensureParentFolder(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function malformedBackupPath(filePath) {
    return filePath + '.invalid';
}

QUnit.test("taskMetaStore upgrades to v2 with stableIndex and contextRefs", function (assert) {
    var root = makeTempRoot();

    try {
        taskMetaStore.resetCache();
        taskMetaStore.ensureTaskStableId(root, 'legacy-task-1', 'task.auth-refresh.c3f12a', 'user', '2026-03-08T12:00:00Z');
        taskMetaStore.addTaskContextRefs(root, 'task.auth-refresh.c3f12a', ['ctx.auth-refresh.8a91de'], 'user', '2026-03-08T12:01:00Z');

        var store = JSON.parse(fs.readFileSync(taskMetaStore.getStorePath(root), 'utf8'));
        var meta = taskMetaStore.getTaskMetadata(root, 'task.auth-refresh.c3f12a', 'normal');

        assert.equal(store.version, 2);
        assert.equal(store.stableIndex['task.auth-refresh.c3f12a'], 'legacy-task-1');
        assert.deepEqual(meta.contextRefs, ['ctx.auth-refresh.8a91de']);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("taskMetaStore preserves existing sidecar when a write is interrupted", function (assert) {
    var root = makeTempRoot();

    try {
        taskMetaStore.resetCache();
        taskMetaStore.setTaskPriority(root, 'task-1', 'high', 'user', '2026-03-08T12:00:00Z');

        var storePath = taskMetaStore.getStorePath(root);
        var originalContent = fs.readFileSync(storePath, 'utf8');

        assert.throws(function () {
            withInterruptedWrite(storePath, function () {
                taskMetaStore.setTaskNote(root, 'task-1', 'Needs follow-up', 'user', '2026-03-08T12:01:00Z');
            });
        }, /simulated interrupted write/);

        assert.equal(fs.readFileSync(storePath, 'utf8'), originalContent);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("taskMetaStore drops unpersisted cache changes after a write is interrupted", function (assert) {
    var root = makeTempRoot();

    try {
        taskMetaStore.resetCache();
        taskMetaStore.setTaskPriority(root, 'task-1', 'high', 'user', '2026-03-08T12:00:00Z');

        var storePath = taskMetaStore.getStorePath(root);

        assert.throws(function () {
            withInterruptedWrite(storePath, function () {
                taskMetaStore.setTaskNote(root, 'task-1', 'This should not persist', 'user', '2026-03-08T12:01:00Z');
            });
        }, /simulated interrupted write/);

        taskMetaStore.setTaskPriority(root, 'task-2', 'low', 'user', '2026-03-08T12:02:00Z');

        var persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        assert.equal(persisted.tasks['task-1'].note, '');
        assert.equal(persisted.tasks['task-2'].priority, 'low');
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("contextStore persists context cards and anchor lookup", function (assert) {
    var root = makeTempRoot();

    try {
        contextStore.resetCache();
        contextStore.upsertContext(root, 'ctx.auth-refresh.8a91de', {
            kind: 'invariant',
            title: 'Refresh single-flight',
            summary: 'refresh requests must be reused',
            body: 'Only one refresh request may be in flight.',
            taskRefs: ['task.auth-refresh.c3f12a'],
            anchors: [{ file: 'src/auth.js', line: 42, tag: 'NOTE' }],
            replaceAnchors: true,
            replaceTaskRefs: true,
            updatedBy: 'user',
            updatedAt: '2026-03-08T12:00:00Z'
        });

        var found = contextStore.findContextByAnchor(root, {
            file: 'src/auth.js',
            line: 42,
            tag: 'NOTE'
        });

        assert.equal(found.contextId, 'ctx.auth-refresh.8a91de');
        assert.equal(found.kind, 'invariant');
        assert.deepEqual(found.taskRefs, ['task.auth-refresh.c3f12a']);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("contextStore preserves existing sidecar when a write is interrupted", function (assert) {
    var root = makeTempRoot();

    try {
        contextStore.resetCache();
        contextStore.upsertContext(root, 'ctx.auth-refresh.8a91de', {
            kind: 'invariant',
            title: 'Refresh single-flight',
            summary: 'refresh requests must be reused',
            anchors: [{ file: 'src/auth.js', line: 42, tag: 'NOTE' }]
        });

        var storePath = contextStore.getStorePath(root);
        var originalContent = fs.readFileSync(storePath, 'utf8');

        assert.throws(function () {
            withInterruptedWrite(storePath, function () {
                contextStore.upsertContext(root, 'ctx.auth-refresh.8a91de', {
                    title: 'Updated title'
                });
            });
        }, /simulated interrupted write/);

        assert.equal(fs.readFileSync(storePath, 'utf8'), originalContent);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("contextStore drops unpersisted cache changes after a write is interrupted", function (assert) {
    var root = makeTempRoot();

    try {
        contextStore.resetCache();
        contextStore.upsertContext(root, 'ctx.auth-refresh.8a91de', {
            kind: 'invariant',
            title: 'Refresh single-flight',
            summary: 'refresh requests must be reused',
            anchors: [{ file: 'src/auth.js', line: 42, tag: 'NOTE' }]
        });

        var storePath = contextStore.getStorePath(root);

        assert.throws(function () {
            withInterruptedWrite(storePath, function () {
                contextStore.upsertContext(root, 'ctx.auth-refresh.8a91de', {
                    title: 'This should not persist'
                });
            });
        }, /simulated interrupted write/);

        contextStore.upsertContext(root, 'ctx.next.001', {
            kind: 'constraint',
            title: 'Next context',
            summary: 'Next summary'
        });

        var persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        assert.equal(persisted.contexts['ctx.auth-refresh.8a91de'].title, 'Refresh single-flight');
        assert.equal(persisted.contexts['ctx.next.001'].title, 'Next context');
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("changeSessionStore syncs source annotations into session files", function (assert) {
    var root = makeTempRoot();

    try {
        changeSessionStore.resetCache();
        changeSessionStore.upsertSession(root, {
            sessionId: 'sess.20260308.codex.001',
            sessionType: 'review',
            actor: 'codex',
            status: 'open',
            createdAt: '2026-03-08T12:00:00Z',
            updatedAt: '2026-03-08T12:00:00Z',
            taskRefs: ['task.auth-refresh.c3f12a'],
            summary: 'Initial review',
            annotations: []
        });

        changeSessionStore.syncSessionAnnotations(root, 'sess.20260308.codex.001', {
            sessionType: 'review',
            actor: 'codex',
            status: 'open',
            createdAt: '2026-03-08T12:00:00Z',
            updatedAt: '2026-03-08T12:05:00Z',
            summary: 'Review annotations imported from source',
            taskRefs: ['task.auth-refresh.c3f12a']
        }, [{
            kind: 'verify',
            file: 'src/auth.js',
            line: 56,
            stableId: 'ctx.auth-refresh.verify.1a2b3c',
            sourceComment: true,
            reviewState: 'unread',
            text: 'Verify refresh retry flow'
        }]);

        var session = changeSessionStore.getSession(root, 'sess.20260308.codex.001');

        assert.equal(session.annotations.length, 1);
        assert.equal(session.annotations[0].annotationId, 'ann.001');
        assert.equal(session.annotations[0].kind, 'verify');
        assert.equal(session.summary, 'Review annotations imported from source');
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("changeSessionStore preserves existing sidecar when a write is interrupted", function (assert) {
    var root = makeTempRoot();

    try {
        changeSessionStore.resetCache();
        changeSessionStore.upsertSession(root, {
            sessionId: 'sess.20260308.codex.001',
            sessionType: 'review',
            actor: 'codex',
            status: 'open',
            createdAt: '2026-03-08T12:00:00Z',
            updatedAt: '2026-03-08T12:00:00Z',
            summary: 'Initial review'
        });

        var sessionPath = changeSessionStore.getSessionPath(root, 'sess.20260308.codex.001');
        var originalContent = fs.readFileSync(sessionPath, 'utf8');

        assert.throws(function () {
            withInterruptedWrite(sessionPath, function () {
                changeSessionStore.upsertSession(root, {
                    sessionId: 'sess.20260308.codex.001',
                    summary: 'Updated review'
                });
            });
        }, /simulated interrupted write/);

        assert.equal(fs.readFileSync(sessionPath, 'utf8'), originalContent);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("data stores preserve malformed sidecars before recovery writes", function (assert) {
    var root = makeTempRoot();
    var taskStorePath = taskMetaStore.getStorePath(root);
    var contextStorePath = contextStore.getStorePath(root);
    var sessionPath = changeSessionStore.getSessionPath(root, 'sess.20260429.codex.001');

    try {
        ensureParentFolder(taskStorePath);
        ensureParentFolder(contextStorePath);
        ensureParentFolder(sessionPath);

        fs.writeFileSync(taskStorePath, '{broken task metadata');
        fs.writeFileSync(contextStorePath, '{broken context index');
        fs.writeFileSync(sessionPath, '{broken session');

        taskMetaStore.resetCache();
        contextStore.resetCache();
        changeSessionStore.resetCache();

        taskMetaStore.setTaskNote(root, 'task-1', 'Recovered note', 'user', '2026-04-29T12:00:00Z');
        contextStore.upsertContext(root, 'ctx.recovered.001', {
            kind: 'constraint',
            title: 'Recovered context',
            summary: 'Recovered context summary',
            updatedBy: 'user',
            updatedAt: '2026-04-29T12:01:00Z'
        });
        changeSessionStore.upsertSession(root, {
            sessionId: 'sess.20260429.codex.001',
            sessionType: 'review',
            actor: 'codex',
            status: 'open',
            createdAt: '2026-04-29T12:02:00Z',
            updatedAt: '2026-04-29T12:02:00Z'
        });

        assert.equal(fs.readFileSync(malformedBackupPath(taskStorePath), 'utf8'), '{broken task metadata');
        assert.equal(fs.readFileSync(malformedBackupPath(contextStorePath), 'utf8'), '{broken context index');
        assert.equal(fs.readFileSync(malformedBackupPath(sessionPath), 'utf8'), '{broken session');

        assert.equal(JSON.parse(fs.readFileSync(taskStorePath, 'utf8')).tasks['task-1'].note, 'Recovered note');
        assert.equal(JSON.parse(fs.readFileSync(contextStorePath, 'utf8')).contexts['ctx.recovered.001'].title, 'Recovered context');
        assert.equal(JSON.parse(fs.readFileSync(sessionPath, 'utf8')).sessionId, 'sess.20260429.codex.001');
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test("contextStore keeps the previous JSON file when atomic replacement fails", function (assert) {
    var root = makeTempRoot();
    var originalRenameSync = fs.renameSync;
    var interceptedTempPath;

    try {
        contextStore.resetCache();
        contextStore.upsertContext(root, 'ctx.original.001', {
            kind: 'invariant',
            title: 'Original context',
            summary: 'Original summary',
            updatedBy: 'user',
            updatedAt: '2026-04-29T12:00:00Z'
        });

        var contextStorePath = contextStore.getStorePath(root);
        contextStore.resetCache();

        fs.renameSync = function (from, to) {
            if (to === contextStorePath) {
                interceptedTempPath = from;
                throw new Error('simulated rename failure');
            }

            return originalRenameSync.apply(fs, arguments);
        };

        assert.throws(function () {
            contextStore.upsertContext(root, 'ctx.next.001', {
                kind: 'constraint',
                title: 'Next context',
                summary: 'Next summary',
                updatedBy: 'user',
                updatedAt: '2026-04-29T12:01:00Z'
            });
        }, /simulated rename failure/);

        fs.renameSync = originalRenameSync;

        var persisted = JSON.parse(fs.readFileSync(contextStorePath, 'utf8'));
        assert.ok(persisted.contexts['ctx.original.001']);
        assert.notOk(persisted.contexts['ctx.next.001']);
        assert.ok(interceptedTempPath);
        assert.notOk(fs.existsSync(interceptedTempPath));
    }
    finally {
        fs.renameSync = originalRenameSync;
        fs.rmSync(root, { recursive: true, force: true });
    }
});
