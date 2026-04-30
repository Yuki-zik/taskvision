/* jshint esversion:6, node: true */
/* eslint-env node */

'use strict';

var fs = require('fs');
var path = require('path');

function ensureFolder(folderPath) {
    if (!folderPath) {
        return;
    }

    if (fs.existsSync(folderPath) !== true) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function createUniquePath(basePath) {
    if (fs.existsSync(basePath) !== true) {
        return basePath;
    }

    var index = 1;
    var candidate = basePath + '.' + index;
    while (fs.existsSync(candidate) === true) {
        index += 1;
        candidate = basePath + '.' + index;
    }

    return candidate;
}

function backupMalformedJson(filePath) {
    if (!filePath || fs.existsSync(filePath) !== true) {
        return undefined;
    }

    var backupPath = createUniquePath(filePath + '.invalid');
    fs.renameSync(filePath, backupPath);
    return backupPath;
}

function readJsonFile(filePath) {
    if (!filePath || fs.existsSync(filePath) !== true) {
        return undefined;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (e) {
        backupMalformedJson(filePath);
        return undefined;
    }
}

function createTempPath(filePath) {
    return path.join(
        path.dirname(filePath),
        '.' + path.basename(filePath) + '.tmp-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2)
    );
}

function writeJsonFile(filePath, value) {
    if (!filePath) {
        return undefined;
    }

    ensureFolder(path.dirname(filePath));
    var tempPath = createTempPath(filePath);

    try {
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n');
        fs.renameSync(tempPath, filePath);
    }
    catch (e) {
        if (fs.existsSync(tempPath) === true) {
            fs.unlinkSync(tempPath);
        }
        throw e;
    }

    return filePath;
}

module.exports.readJsonFile = readJsonFile;
module.exports.writeJsonFile = writeJsonFile;
module.exports.backupMalformedJson = backupMalformedJson;
