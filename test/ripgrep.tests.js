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
