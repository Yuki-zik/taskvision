const fs = require('fs');
const vscode = {
    workspace: {
        getConfiguration: function (section) {
            return {
                get: function (key) {
                    if (section === 'taskvision.general') {
                        if (key === 'tags') return ["BLOCKER", "BUG", "FIXME", "HACK", "TODO", "[ ]", "[x]", "[ x]", "NOTE", "XXX"];
                    }
                    if (section === 'taskvision.regex') {
                        if (key === 'regex') return "(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)";
                        if (key === 'regexCaseSensitive') return true;
                        if (key === 'enableMultiLine') return false;
                        if (key === 'subTagRegex') return "";
                    }
                    if (section === 'taskvision.highlights') {
                        if (key === 'customHighlight') {
                            return {
                                "BLOCKER": { "icon": "issue-opened" },
                                "[ ]": { "icon": "issue-opened" },
                                "[x]": { "icon": "issue-closed" },
                                "[ x]": { "icon": "issue-closed" }
                            };
                        }
                        if (key === 'defaultHighlight') {
                            return { "icon": "tag" };
                        }
                    }
                    return undefined;
                }
            };
        }
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (moduleName) {
    if (moduleName === 'vscode') return vscode;
    return originalRequire.call(this, moduleName);
};

const utils = require('./src/utils.js');
const attributes = require('./src/attributes.js');
const config = require('./src/config.js');

// Init attributes with config
attributes.init(config);

var extracted = utils.extractTag("# [x] ", 0);
console.log("extractTag returned:", extracted.tag);

var icon = attributes.getIcon(extracted.tag);
console.log("getIcon returned:", icon);

