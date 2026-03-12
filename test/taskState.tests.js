var utils = require('../src/utils.js');
var taskState = require('../src/taskState.js');
var annotationParser = require('../src/annotationParser.js');
var stubs = require('./stubs.js');

QUnit.test("taskState.parseInlineStatus recognises valid inline states", function (assert) {
    var parsed = taskState.parseInlineStatus(" [Blocked] wait for API");

    assert.equal(parsed.status, "blocked");
    assert.equal(parsed.token, "[blocked]");
    assert.equal(parsed.remainder, " wait for API");
});

QUnit.test("utils.extractTag strips explicit inline status before body text", function (assert) {
    var testConfig = stubs.getTestConfig();
    testConfig.tagList = ["TODO", "NOTE", "IDEA", "[ ]", "[x]"];
    utils.init(testConfig);

    var result = utils.extractTag("// TODO [blocked] wait for API schema");

    assert.equal(result.tag, "TODO");
    assert.equal(result.status, "blocked");
    assert.equal(result.withoutTag, "wait for API schema");
    assert.ok(result.hasExplicitStatus);
});

QUnit.test("utils.extractTag maps checkbox tags to default statuses", function (assert) {
    var testConfig = stubs.getTestConfig();
    testConfig.tagList = ["[ ]", "[x]"];
    utils.init(testConfig);

    var open = utils.extractTag("// [ ] [todo] finish validation");
    var done = utils.extractTag("// [x] shipped");

    assert.equal(open.status, "todo");
    assert.equal(done.status, "done");
});

QUnit.test("utils.createTaskId stays stable across inline status changes", function (assert) {
    var first = utils.createTaskId('/workspace', '/workspace/src/cache.js', 'TODO', 'fix cache invalidation', 'backend');
    var second = utils.createTaskId('/workspace', '/workspace/src/cache.js', 'TODO', 'fix cache invalidation', 'backend');

    assert.equal(first, second);
});

QUnit.test("utils.replaceTaskStatusInLine replaces or inserts inline status token", function (assert) {
    var testConfig = stubs.getTestConfig();
    utils.init(testConfig);

    var withExisting = utils.replaceTaskStatusInLine("// TODO [todo] fix cache", {
        actualTag: "TODO",
        column: 4
    }, "review");

    var withoutExisting = utils.replaceTaskStatusInLine("// TODO [todo]: fix cache", {
        actualTag: "TODO",
        column: 4
    }, "blocked");

    assert.equal(withExisting, "// TODO [review] fix cache");
    assert.equal(withoutExisting, "// TODO [blocked]: fix cache");
});

QUnit.test("utils.extractTag parses TaskVision directives", function (assert) {
    var testConfig = stubs.getTestConfig();
    testConfig.tagList = ["TODO", "NOTE"];
    utils.init(testConfig);

    var task = utils.extractTag("// TODO [todo] [tv:id=task.auth-refresh.c3f12a] fix refresh");
    var context = utils.extractTag("// NOTE [idea] [tv:id=ctx.auth-refresh.8a91de] [tv:ctx=invariant] refresh must stay single-flight");
    var review = utils.extractTag("// NOTE [review] [tv:session=sess.20260308.codex.001] [tv:task=task.auth-refresh.c3f12a] [tv:review=verify] verify retry flow");

    assert.equal(task.stableId, "task.auth-refresh.c3f12a");
    assert.equal(task.annotationKind, "task");
    assert.equal(context.contextKind, "invariant");
    assert.equal(context.annotationKind, "context");
    assert.deepEqual(review.taskRefs, ["task.auth-refresh.c3f12a"]);
    assert.equal(review.reviewKind, "verify");
    assert.equal(review.annotationKind, "review");
});

QUnit.test("utils.upsertTvDirectivesInLine inserts TaskVision directives after status", function (assert) {
    var testConfig = stubs.getTestConfig();
    testConfig.tagList = ["TODO"];
    utils.init(testConfig);

    var updated = utils.upsertTvDirectivesInLine("// TODO [todo] fix cache", {
        actualTag: "TODO",
        column: 4
    }, {
        stableId: "task.cache.123abc"
    });

    assert.equal(updated, "// TODO [todo] [tv:id=task.cache.123abc] fix cache");
});

QUnit.test("annotationParser builds directive tokens in stable order", function (assert) {
    assert.deepEqual(annotationParser.buildDirectiveTokens({
        stableId: "ctx.auth-refresh.8a91de",
        contextKind: "invariant",
        taskRefs: ["task.auth-refresh.c3f12a"],
        sessionId: "sess.20260308.codex.001"
    }), [
        "[tv:id=ctx.auth-refresh.8a91de]",
        "[tv:ctx=invariant]",
        "[tv:task=task.auth-refresh.c3f12a]",
        "[tv:session=sess.20260308.codex.001]"
    ]);
});
