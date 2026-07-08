var fs = require('fs');
var os = require('os');
var path = require('path');
var events = require('events');
var ripgrep = require('../src/ripgrep.js');

QUnit.test("ripgrep._parseAdditionalArgs handles quotes", function (assert) {
    var args = ripgrep._parseAdditionalArgs('--hidden --max-filesize "1 MB" --glob \'*.js\'');
    assert.deepEqual(args, ['--hidden', '--max-filesize', '1 MB', '--glob', '*.js']);
});

QUnit.test("ripgrep._buildArgs uses inline regex when no pattern file path is provided", function (assert) {
    var args = ripgrep._buildArgs({
        additional: '--hidden',
        multiline: false,
        regex: '(TODO)',
        unquotedRegex: '(TODO)',
        globs: ['!**/node_modules/**'],
        filename: 'sample.js'
    }, function () { });

    assert.ok(args.indexOf('-e') !== -1);
    assert.ok(args.indexOf('(TODO)') !== -1);
    assert.ok(args.indexOf('-f') === -1);
    assert.ok(args.indexOf('sample.js') !== -1);
});

QUnit.test("ripgrep._buildArgs uses pattern file when configured", function (assert) {
    var tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-rg-'));
    var patternFilePath = path.join(tempFolder, 'pattern.txt');

    var args = ripgrep._buildArgs({
        additional: '',
        multiline: true,
        regex: '(TODO)',
        unquotedRegex: '(TODO)',
        globs: [],
        patternFilePath: patternFilePath
    }, function () { });

    assert.ok(args.indexOf('-f') !== -1);
    assert.ok(args.indexOf(patternFilePath) !== -1);
    assert.ok(args.indexOf('-e') === -1);
    assert.ok(fs.existsSync(patternFilePath));

    if (fs.existsSync(patternFilePath)) {
        fs.unlinkSync(patternFilePath);
    }
    fs.rmdirSync(tempFolder);
});

QUnit.test("ripgrep.kill forwards SIGINT to active process", function (assert) {
    var done = assert.async();
    var childProcess = require('child_process');
    var originalSpawn = childProcess.spawn;
    var signalSent;

    var fakeProcess = new events.EventEmitter();
    fakeProcess.stdout = new events.EventEmitter();
    fakeProcess.stderr = new events.EventEmitter();
    fakeProcess.stdout.setEncoding = function () { };
    fakeProcess.stderr.setEncoding = function () { };
    fakeProcess.kill = function (signal) {
        signalSent = signal;
        this.emit('close', 130, 'SIGINT');
    };

    childProcess.spawn = function () {
        return fakeProcess;
    };

    ripgrep.search(process.cwd(), {
        rgPath: process.execPath,
        regex: '(TODO)',
        unquotedRegex: '(TODO)',
        additional: '',
        globs: []
    }).catch(function () {
        childProcess.spawn = originalSpawn;
        assert.equal(signalSent, 'SIGINT');
        done();
    });

    ripgrep.kill();
});

QUnit.test("ripgrep.search returns partial results when output exceeds maxBuffer", function (assert) {
    var done = assert.async();
    var childProcess = require('child_process');
    var originalSpawn = childProcess.spawn;

    var fakeProcess = new events.EventEmitter();
    fakeProcess.stdout = new events.EventEmitter();
    fakeProcess.stderr = new events.EventEmitter();
    fakeProcess.stdout.setEncoding = function () { };
    fakeProcess.stderr.setEncoding = function () { };
    var killSignal;
    fakeProcess.kill = function (signal) {
        killSignal = signal;
        // Emulate ripgrep stopping after being asked to stop.
        this.emit('close', null, 'SIGINT');
    };

    childProcess.spawn = function () {
        return fakeProcess;
    };

    // Build more than one KB of valid vimgrep output so the 1 KB buffer overflows.
    var line = 'src/file.js:1:1:// TODO something that needs doing\n';
    var bigChunk = '';
    while (bigChunk.length < 2 * 1024) {
        bigChunk += line;
    }

    ripgrep.search(process.cwd(), {
        rgPath: process.execPath,
        regex: '(TODO)',
        unquotedRegex: '(TODO)',
        additional: '',
        globs: [],
        maxBuffer: 1
    }).then(function (matches) {
        childProcess.spawn = originalSpawn;
        assert.strictEqual(matches.truncated, true, "results are flagged as truncated");
        assert.strictEqual(matches.maxBuffer, 1, "the buffer size is reported back to the caller");
        assert.ok(matches.length > 0, "partial matches are still returned instead of rejecting");
        assert.equal(killSignal, 'SIGINT', "the search process is stopped once the buffer is exceeded");
        done();
    }).catch(function (e) {
        childProcess.spawn = originalSpawn;
        assert.ok(false, "search should resolve with partial results, but rejected: " + (e && e.message));
        done();
    });

    fakeProcess.stdout.emit('data', bigChunk);
});
