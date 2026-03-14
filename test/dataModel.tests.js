var fs = require('fs');
var os = require('os');
var path = require('path');

var taskMetaStore = require('../src/taskMetaStore.js');
var contextStore = require('../src/contextStore.js');
var changeSessionStore = require('../src/changeSessionStore.js');

function makeTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-data-'));
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
