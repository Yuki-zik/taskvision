var utils = require('../src/utils.js');
var taskState = require('../src/taskState.js');
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

    var open = utils.extractTag("// [ ] finish validation");
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

    var withoutExisting = utils.replaceTaskStatusInLine("// TODO: fix cache", {
        actualTag: "TODO",
        column: 4
    }, "blocked");

    assert.equal(withExisting, "// TODO [review] fix cache");
    assert.equal(withoutExisting, "// TODO [blocked]: fix cache");
});
