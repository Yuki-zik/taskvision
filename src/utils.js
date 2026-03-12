var micromatch = require('micromatch');
var crypto = require('crypto');
var os = require('os');
var path = require('path');
var find = require('find');
var strftime = require('fast-strftime');
var commentPatterns = require('comment-patterns');

var colourNames = require('./colourNames.js');
var taskState = require('./taskState.js');
var themeColourNames = require('./themeColourNames.js');
var annotationParser = require('./annotationParser.js');

var config;

var envRegex = new RegExp("\\$\\{(.*?)\\}", "g");
var rgbRegex = new RegExp("^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*(\\d+(?:\\.\\d+)?))?\\)$", "gi");
var placeholderRegex = new RegExp("(\\$\\{.*\\})");

function init(configuration) {
    config = configuration;
}

function isHexColour(colour) {
    if (typeof (colour) !== 'string') {
        return false;
    }
    var withoutHash = colour.indexOf('#') === 0 ? colour.substring(1) : colour;
    var hex = withoutHash.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    return (typeof colour === "string") && hex.length === withoutHash.length && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) && !isNaN(parseInt(hex, 16));
}

function isRgbColour(colour) {
    return colour.match && colour.match(rgbRegex) !== null;
}

function isNamedColour(colour) {
    return colourNames.indexOf(colour.toLowerCase()) > -1;
}

function isThemeColour(colour) {
    return themeColourNames.indexOf(colour) > -1;
}

function hexToRgba(hex, opacity) {
    function toComponent(digits) {
        return (digits.length == 1) ? parseInt(digits + digits, 16) : parseInt(digits, 16);
    }

    if (hex !== undefined) {
        hex = hex.replace('#', '');

        var rgb = hex.substring(0, (hex.length == 3 || hex.length == 4) ? 3 : 6);

        var r = toComponent(rgb.substring(0, rgb.length / 3));
        var g = toComponent(rgb.substring(rgb.length / 3, 2 * rgb.length / 3));
        var b = toComponent(rgb.substring(2 * rgb.length / 3, 3 * rgb.length / 3));

        if (hex.length == 4 || hex.length == 8) {
            var extractedOpacity = parseInt(toComponent(hex.substring(3 * hex.length / 4, 4 * hex.length / 4)) * 100 / 255);
            if (opacity === undefined || opacity === 0) {
                opacity = extractedOpacity;
            }
        }

        return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity / 100 + ')';
    }

    return '#0F0';
}

function removeBlockComments(text, fileName) {
    var extension = path.extname(fileName);

    if (extension === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".js";
    }
    else if (extension === ".vue") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".html";
    }
    else if (extension === ".hs") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".cpp";
    }

    var commentPattern;
    try {
        commentPattern = commentPatterns(fileName);
    }
    catch (e) {
    }

    if (commentPattern && commentPattern.name === 'Markdown') {
        commentPattern = commentPatterns(".html");
        fileName = ".html";
    }

    if (commentPattern && commentPattern.multiLineComment && commentPattern.multiLineComment.length > 0) {
        commentPattern = commentPatterns.regex(fileName);
        if (commentPattern && commentPattern.regex) {
            var regex = commentPattern.regex;
            if (extension == ".hs") {
                var source = regex.source;
                var flags = regex.flags;
                while (source.indexOf("\\/\\*\\*") !== -1) {
                    source = source.replace("\\/\\*\\*", "{-");
                }
                while (source.indexOf("\\/\\*") !== -1) {
                    source = source.replace("\\/\\*", "{-");
                }
                while (source.indexOf("\\*\\/") !== -1) {
                    source = source.replace("\\*\\/", "-}");
                }
                regex = new RegExp(source, flags);
                commentPattern.regex = regex;
            }
            var commentMatch = commentPattern.regex.exec(text);
            if (commentMatch) {
                for (var i = commentPattern.cg.contentStart; i < commentMatch.length; ++i) {
                    if (commentMatch[i]) {
                        text = commentMatch[i];
                        break;
                    }
                }
            }
        }
    }

    return text;
}

function removeLineComments(text, fileName) {
    var result = text.trim();

    if (path.extname(fileName) === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName))) + ".js";
    }

    var commentPattern;
    try {
        commentPattern = commentPatterns(fileName);
    }
    catch (e) {
    }

    if (commentPattern && commentPattern.singleLineComment) {
        commentPattern.singleLineComment.map(function (comment) {
            if (result.indexOf(comment.start) === 0) {
                result = result.substr(comment.start.length);
            }
        });
    }

    return result;
}

function getTagRegex() {
    var tags = config.tags().slice().sort().reverse();
    tags = tags.map(function (tag) {
        // Normalise markdown checkbox variants:
        // [x], [ x ], [X] should all be treated as one token family.
        if (/^\[\s*x\s*\]$/i.test(tag)) {
            return "\\[\\s*[xX]\\s*\\]";
        }
        if (/^\[\s*\]$/.test(tag)) {
            return "\\[\\s*\\]";
        }
        tag = tag.replace(/\\/g, '\\\\\\');
        tag = tag.replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
        return tag;
    });
    tags = tags.join('|');
    return '(' + tags + ')';
}

function normaliseCheckboxTag(tag) {
    if (typeof tag !== "string") {
        return tag;
    }
    if (/^\[\s*x\s*\]$/i.test(tag)) {
        return "[x]";
    }
    if (/^\[\s*\]$/.test(tag)) {
        return "[ ]";
    }
    return tag;
}

function escapeTagForRegex(tag) {
    if (/^\[\s*x\s*\]$/i.test(tag)) {
        return "\\[\\s*[xX]\\s*\\]";
    }
    if (/^\[\s*\]$/.test(tag)) {
        return "\\[\\s*\\]";
    }

    return escapeLiteralForRegex(tag);
}

function escapeLiteralForRegex(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
}

function parseTagTail(rightOfTagText, flags) {
    var statusInfo = taskState.parseInlineStatus(rightOfTagText);
    var workingText = statusInfo ? statusInfo.remainder.trim() : rightOfTagText;
    var directiveInfo = annotationParser.parseDirectives(workingText);
    var subTag;
    var rightOfTag = directiveInfo.trimmedText;
    var subTagRegex = new RegExp(config.subTagRegex(), flags);
    var subTagMatch = subTagRegex.exec(rightOfTag);

    if (subTagMatch && subTagMatch.length > 1) {
        subTag = subTagMatch[1];
    }

    rightOfTag = rightOfTag.replace(subTagRegex, "");

    return {
        status: statusInfo ? statusInfo.status : undefined,
        hasExplicitStatus: statusInfo !== undefined,
        subTag: subTag,
        rightOfTag: rightOfTag,
        stableId: directiveInfo.stableId,
        contextKind: directiveInfo.contextKind,
        taskRefs: directiveInfo.taskRefs,
        reviewKind: directiveInfo.reviewKind,
        sessionId: directiveInfo.sessionId,
        annotationKind: directiveInfo.annotationKind,
        tvDirectives: directiveInfo.directives
    };
}

function extractTag(text, matchOffset) {
    var c = config.regex();
    var flags = c.caseSensitive ? '' : 'i';
    var tagMatch = null;
    var tagOffset;
    var originalTag;
    var before = text;
    var after = text;
    var subTag;
    var explicitStatusInfo;

    if (c.regex.indexOf("$TAGS") > -1) {
        var tagRegex = new RegExp(getTagRegex(), flags);
        tagMatch = tagRegex.exec(text);
        if (tagMatch) {
            tagOffset = tagMatch.index;
            var rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
            var tagTail = parseTagTail(rightOfTagText, flags);
            subTag = tagTail.subTag;
            var rightOfTag = tagTail.rightOfTag;
            if (rightOfTag.length === 0) {
                text = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                after = "";
                before = text;
            }
            else {
                before = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                text = rightOfTag;
                after = rightOfTag;
            }
            var matchedTag = normaliseCheckboxTag(tagMatch[0]);
            c.tags.forEach(function (tag) {
                if (originalTag !== undefined) return;
                var normalisedConfiguredTag = normaliseCheckboxTag(tag);
                if (config.isRegexCaseSensitive()) {
                    if (normalisedConfiguredTag === matchedTag) {
                        originalTag = tag;
                    }
                }
                else if (normalisedConfiguredTag.toLowerCase() === matchedTag.toLowerCase()) {
                    originalTag = tag;
                }
            });
            if (originalTag === undefined) {
                originalTag = matchedTag;
            }

            var derivedStatus = tagTail.status || taskState.defaultStatusForTag(originalTag);
            return {
                tag: tagMatch ? originalTag : "",
                withoutTag: text,
                before: before,
                after: after,
                tagOffset: tagOffset,
                commentStart: (function (str) {
                    var delimiters = ['//', '/*', '#', '<!--', ';', '--', '%', '"'];
                    var index = -1;
                    delimiters.forEach(function (d) {
                        var i = str.lastIndexOf(d);
                        if (i > index) index = i;
                    });
                    return index > -1 ? index : 0;
                })(before),
                subTag: subTag,
                status: derivedStatus,
                hasExplicitStatus: tagTail.hasExplicitStatus,
                inlineStatusToken: tagTail.hasExplicitStatus ? taskState.toInlineToken(derivedStatus) : undefined,
                sourceOfTruth: 'inline',
                stableId: tagTail.stableId,
                contextKind: tagTail.contextKind,
                taskRefs: tagTail.taskRefs,
                reviewKind: tagTail.reviewKind,
                sessionId: tagTail.sessionId,
                annotationKind: tagTail.annotationKind,
                tvDirectives: tagTail.tvDirectives
            };
        }
    }
    if (tagMatch === null && c.regex.trim() !== "") {
        var regex = new RegExp(c.regex, flags);
        var match = regex.exec(text);
        if (match === null) {
            match = new RegExp(escapeLiteralForRegex(c.regex), flags).exec(text);
        }
        if (match !== null) {
            tagMatch = true;
            originalTag = match[0];
            before = text.substring(0, text.indexOf(originalTag));
            after = text.substring(before.length + originalTag.length);
            tagOffset = match.index;
            explicitStatusInfo = taskState.parseInlineStatus(after);
            if (explicitStatusInfo) {
                text = explicitStatusInfo.remainder;
                after = explicitStatusInfo.remainder;
            }
            else {
                text = after;
            }

            var fallbackDirectiveInfo = annotationParser.parseDirectives(text, originalTag);
            text = fallbackDirectiveInfo.cleanedText;
            after = fallbackDirectiveInfo.cleanedText;

            return {
                tag: tagMatch ? originalTag : "",
                withoutTag: text,
                before: before,
                after: after,
                tagOffset: tagOffset,
                commentStart: (function (str) {
                    var delimiters = ['//', '/*', '#', '<!--', ';', '--', '%', '"'];
                    var index = -1;
                    delimiters.forEach(function (d) {
                        var i = str.lastIndexOf(d);
                        if (i > index) index = i;
                    });
                    return index > -1 ? index : 0;
                })(before),
                subTag: subTag,
                status: explicitStatusInfo ? explicitStatusInfo.status : taskState.defaultStatusForTag(originalTag),
                hasExplicitStatus: explicitStatusInfo !== undefined,
                inlineStatusToken: explicitStatusInfo ? taskState.toInlineToken(explicitStatusInfo.status) : undefined,
                sourceOfTruth: tagMatch ? 'inline' : undefined,
                stableId: fallbackDirectiveInfo.stableId,
                contextKind: fallbackDirectiveInfo.contextKind,
                taskRefs: fallbackDirectiveInfo.taskRefs,
                reviewKind: fallbackDirectiveInfo.reviewKind,
                sessionId: fallbackDirectiveInfo.sessionId,
                annotationKind: fallbackDirectiveInfo.annotationKind,
                tvDirectives: fallbackDirectiveInfo.directives
            };
        }
    }
    var fallbackStatus = tagMatch ? (explicitStatusInfo ? explicitStatusInfo.status : taskState.defaultStatusForTag(originalTag)) : undefined;
    return {
        tag: tagMatch ? originalTag : "",
        withoutTag: text,
        before: before,
        after: after,
        tagOffset: tagOffset,
        commentStart: (function (str) {
            var delimiters = ['//', '/*', '#', '<!--', ';', '--', '%', '"'];
            var index = -1;
            delimiters.forEach(function (d) {
                var i = str.lastIndexOf(d);
                if (i > index) index = i;
            });
            return index > -1 ? index : 0;
        })(before),
        subTag: subTag,
        status: fallbackStatus,
        hasExplicitStatus: explicitStatusInfo !== undefined,
        inlineStatusToken: explicitStatusInfo ? taskState.toInlineToken(explicitStatusInfo.status) : undefined,
        sourceOfTruth: tagMatch ? 'inline' : undefined
    };
}

function updateBeforeAndAfter(result, text, matchOffset) {
    var c = config.regex();
    var flags = c.caseSensitive ? '' : 'i';
    var tagMatch = null;

    var tagRegex = new RegExp(getTagRegex(), flags);
    tagMatch = tagRegex.exec(text);
    if (tagMatch) {
        result.tagOffset = tagMatch.index;
        var rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
        var tagTail = parseTagTail(rightOfTagText, flags);
        if (tagTail.subTag !== undefined) {
            result.subTag = tagTail.subTag;
        }
        var rightOfTag = tagTail.rightOfTag;
        if (rightOfTag.length === 0) {
            result.text = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
            result.after = "";
            result.before = text;
        }
        else {
            result.before = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
            result.text = rightOfTag;
            result.after = rightOfTag;
        }
        result.status = tagTail.status || taskState.defaultStatusForTag(result.tag || result.actualTag);
        result.hasExplicitStatus = tagTail.hasExplicitStatus;
        result.stableId = tagTail.stableId;
        result.contextKind = tagTail.contextKind;
        result.taskRefs = tagTail.taskRefs;
        result.reviewKind = tagTail.reviewKind;
        result.sessionId = tagTail.sessionId;
        result.annotationKind = tagTail.annotationKind;
    }

    return result;
}

function getRegexSource() {
    var regex = config.regex().regex;
    if (regex.indexOf("($TAGS)") > -1) {
        regex = regex.split("($TAGS)").join(getTagRegex());
    }

    return regex;
}

function getRegexForEditorSearch(global) {
    var flags = 'm';
    if (global) {
        flags += 'g';
    }
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }
    if (config.regex().multiLine === true) {
        flags += 's';
    }

    var source = getRegexSource();
    return RegExp(source, flags);
}

function getRegexForRipGrep() {
    var flags = 'gm';
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }

    return RegExp(getRegexSource(), flags);
}

function isIncluded(name, includes, excludes) {
    var posix_includes = includes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });
    var posix_excludes = excludes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });

    var included = posix_includes.length === 0 || micromatch.isMatch(name, posix_includes);
    if (included === true && micromatch.isMatch(name, posix_excludes)) {
        included = false;
    }
    return included;
}

function formatLabel(template, node, unexpectedPlaceholders) {
    var result = template;

    var tag = node.actualTag !== undefined ? String(node.actualTag).trim() : "";
    var subTag = node.subTag ? String(node.subTag).trim() : "";
    var filename = node.fsPath ? path.basename(node.fsPath) : "";
    var filepath = node.fsPath ? node.fsPath : "";
    var status = node.status ? String(node.status).trim() : "";
    var priority = node.priority ? String(node.priority).trim() : "";
    var note = node.note ? String(node.note).trim() : "";

    var formatLabelMap = {
        "line": node.line + 1,
        "column": node.column,
        "tag": tag,
        "tag:uppercase": tag.toUpperCase(),
        "tag:lowercase": tag.toLowerCase(),
        "tag:capitalize": tag.charAt(0).toUpperCase() + tag.slice(1),
        "subtag": subTag,
        "subtag:uppercase": subTag.toUpperCase(),
        "subtag:lowercase": subTag.toLowerCase(),
        "subtag:capitalize": (subTag === "") ? "" : subTag.charAt(0).toUpperCase() + subTag.slice(1),
        "before": node.before,
        "after": node.after,
        "afterorbefore": (node.after === "") ? node.before : node.after,
        "filename": filename,
        "filepath": filepath,
        "status": status,
        "priority": priority,
        "note": note
    }

    // prepare regex to substitude "${name}" with it's value from map
    var re = new RegExp("\\$\\{(" + Object.keys(formatLabelMap).join("|") + ")\\}", "gi");
    result = result.replace(re, function (matched) {
        return formatLabelMap[matched.slice(2, -1).toLowerCase()];
    });

    if (unexpectedPlaceholders) {
        var placeholderMatch = placeholderRegex.exec(result);
        if (placeholderMatch) {
            unexpectedPlaceholders.push(placeholderMatch[0]);
        }
    }

    return result;
}

function createTaskId(rootPath, fsPath, tag, text, subTag) {
    var relativePath = fsPath || '';
    if (rootPath && fsPath && fsPath.indexOf(rootPath) === 0) {
        relativePath = path.relative(rootPath, fsPath);
    }

    var digest = [
        String(relativePath).replace(/\\/g, '/'),
        String(normaliseCheckboxTag(tag || '')).trim().toLowerCase(),
        String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
        String(subTag || '').replace(/\s+/g, ' ').trim().toLowerCase()
    ].join('|');

    return crypto.createHash('sha1').update(digest).digest('hex');
}

function slugifyIdentifier(text, fallback) {
    var slug = String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    if (!slug) {
        slug = fallback || 'item';
    }

    return slug.substring(0, 24);
}

function createShortHash(parts) {
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex').substring(0, 6);
}

function createStableId(prefix, rootPath, fsPath, text, hint) {
    var relativePath = fsPath || '';
    if (rootPath && fsPath && fsPath.indexOf(rootPath) === 0) {
        relativePath = path.relative(rootPath, fsPath);
    }

    var slug = slugifyIdentifier(text || hint || path.basename(fsPath || '') || prefix, prefix);
    var hash = createShortHash([
        prefix,
        String(relativePath).replace(/\\/g, '/'),
        String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
        String(hint || '').replace(/\s+/g, ' ').trim().toLowerCase()
    ]);

    return prefix + '.' + slug + '.' + hash;
}

function createTaskStableId(rootPath, fsPath, tag, text, subTag) {
    return createStableId('task', rootPath, fsPath, text || tag, [
        normaliseCheckboxTag(tag || ''),
        subTag || ''
    ].join('|'));
}

function createContextStableId(rootPath, fsPath, text, contextKind, line) {
    return createStableId('ctx', rootPath, fsPath, text || contextKind || 'context', [
        contextKind || '',
        line || ''
    ].join('|'));
}

function findTagRangeInLine(lineText, tag, startIndex) {
    if (typeof lineText !== 'string' || typeof tag !== 'string') {
        return undefined;
    }

    var flags = config.isRegexCaseSensitive() ? 'g' : 'gi';
    var tagRegex = new RegExp(escapeTagForRegex(tag), flags);
    tagRegex.lastIndex = startIndex || 0;

    var match = tagRegex.exec(lineText);
    if (!match) {
        return undefined;
    }

    return {
        start: match.index,
        end: match.index + match[0].length,
        match: match[0]
    };
}

function replaceTaskStatusInLine(lineText, task, newStatus) {
    if (!task || !lineText) {
        return undefined;
    }

    var range = findTagRangeInLine(lineText, task.actualTag || task.tag || '', Math.max(0, (task.column || 1) - 1));
    if (!range) {
        return undefined;
    }

    var afterTag = lineText.slice(range.end);
    var statusInfo = taskState.parseInlineStatus(afterTag);
    var nextToken = taskState.toInlineToken(newStatus);

    if (statusInfo) {
        var statusStart = range.end + statusInfo.range.start;
        var statusEnd = range.end + statusInfo.range.end;
        return lineText.slice(0, statusStart) + nextToken + lineText.slice(statusEnd);
    }

    return lineText.slice(0, range.end) + ' ' + nextToken + lineText.slice(range.end);
}

function upsertTvDirectivesInLine(lineText, task, directives) {
    if (!task || !lineText) {
        return undefined;
    }

    var range = findTagRangeInLine(lineText, task.actualTag || task.tag || '', Math.max(0, (task.column || 1) - 1));
    if (!range) {
        return undefined;
    }

    var tokens = annotationParser.buildDirectiveTokens(directives);
    if (tokens.length === 0) {
        return lineText;
    }

    var afterTag = lineText.slice(range.end);
    var statusInfo = taskState.parseInlineStatus(afterTag);
    var head = lineText.slice(0, range.end);
    var tail = afterTag;

    if (statusInfo) {
        head += afterTag.slice(0, statusInfo.range.end);
        tail = afterTag.slice(statusInfo.range.end);
    }

    tail = annotationParser.removeDirectives(tail).replace(/\s{2,}/g, ' ');
    return head + ' ' + tokens.join(' ') + tail;
}

function getSingleLineCommentToken(fileName) {
    var normalisedFileName = fileName;

    if (path.extname(normalisedFileName) === '.jsonc') {
        normalisedFileName = path.join(path.dirname(normalisedFileName), path.basename(normalisedFileName, path.extname(normalisedFileName))) + '.js';
    }

    var commentPattern;
    try {
        commentPattern = commentPatterns(normalisedFileName);
    }
    catch (e) {
    }

    if (commentPattern && commentPattern.singleLineComment && commentPattern.singleLineComment.length > 0) {
        return commentPattern.singleLineComment[0].start;
    }

    if (path.extname(normalisedFileName) === '.html' || path.extname(normalisedFileName) === '.xml') {
        return '<!--';
    }

    if (path.extname(normalisedFileName) === '.hs' || path.extname(normalisedFileName) === '.sql') {
        return '--';
    }

    return '//';
}

function buildCommentLine(fileName, baseLineText, body) {
    var indentMatch = /^(\s*)/.exec(baseLineText || '');
    var indent = indentMatch ? indentMatch[1] : '';
    var token = getSingleLineCommentToken(fileName);
    var commentBody = String(body || '').trim();

    if (token === '<!--') {
        return indent + '<!-- ' + commentBody + ' -->';
    }

    return indent + token + ' ' + commentBody;
}

function buildAnnotationComment(fileName, baseLineText, tag, status, directives, text) {
    var parts = [tag];

    if (status) {
        parts.push(taskState.toInlineToken(status));
    }

    annotationParser.buildDirectiveTokens(directives).forEach(function (token) {
        parts.push(token);
    });

    if (text) {
        parts.push(String(text).trim());
    }

    return buildCommentLine(fileName, baseLineText, parts.join(' '));
}

function createFolderGlob(folderPath, rootPath, filter) {
    if (process.platform === 'win32') {
        var fp = folderPath.replace(/\\/g, '/');
        var rp = rootPath.replace(/\\/g, '/');

        if (fp.indexOf(rp) === 0) {
            fp = fp.substring(path.dirname(rp).length);
        }

        return ("**/" + fp + filter).replace(/\/\//g, '/');
    }

    return (folderPath + filter).replace(/\/\//g, '/');
}

function getSubmoduleExcludeGlobs(rootPath) {
    var submodules = find.fileSync('.git', rootPath);
    submodules = submodules.map(function (submodule) {
        return path.dirname(submodule);
    });
    submodules = submodules.filter(function (submodule) {
        return submodule != rootPath;
    });
    return submodules;
}

function isHidden(filename) {
    return path.basename(filename).indexOf('.') !== -1 && path.extname(filename) === "";
}

function expandTilde(filePath) {
    if (filePath && filePath[0] === '~') {
        filePath = path.join(os.homedir(), filePath.slice(1));
    }

    return filePath;
}

function replaceEnvironmentVariables(text) {
    text = text.replace(envRegex, function (match, name) {
        return process.env[name] ? process.env[name] : "";
    });

    return text;
}

function formatExportPath(template, dateTime) {
    var result = expandTilde(template);
    if (result) {
        result = strftime.strftime(result, dateTime);
    }
    return result;
}

function complementaryColour(colour) {
    var hex = colour.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    var digits = hex.length / 3;
    var red = parseInt(hex.substr(0, digits), 16);
    var green = parseInt(hex.substr(1 * digits, digits), 16);
    var blue = parseInt(hex.substr(2 * digits, digits), 16);
    var c = [red / 255, green / 255, blue / 255];
    for (var i = 0; i < c.length; ++i) {
        if (c[i] <= 0.03928) {
            c[i] = c[i] / 12.92;
        } else {
            c[i] = Math.pow((c[i] + 0.055) / 1.055, 2.4);
        }
    }
    var l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return l > 0.179 ? "#000000" : "#ffffff";
}

function isValidColour(colour) {
    if (colour) {
        if (isNamedColour(colour) || isThemeColour(colour) || isHexColour(colour) || isRgbColour(colour)) {
            return true;
        }
    }

    return false;
}

function setRgbAlpha(rgb, alpha) {
    rgbRegex.lastIndex = 0;
    var match = rgbRegex.exec(rgb);
    if (match !== null) {
        return "rgba(" + match[1] + "," + match[2] + "," + match[3] + "," + alpha + ")";
    }
    return rgb;
}

function isCodicon(icon) {
    return icon.trim().indexOf("$(") === 0;
}

function toGlobArray(globs) {
    if (globs === undefined) {
        return [];
    }
    if (typeof (globs) === 'string') {
        return globs.split(',');
    }
    return globs;
}

module.exports.init = init;
module.exports.isHexColour = isHexColour;
module.exports.isRgbColour = isRgbColour;
module.exports.isNamedColour = isNamedColour;
module.exports.isThemeColour = isThemeColour;
module.exports.hexToRgba = hexToRgba;
module.exports.removeBlockComments = removeBlockComments;
module.exports.removeLineComments = removeLineComments;
module.exports.extractTag = extractTag;
module.exports.updateBeforeAndAfter = updateBeforeAndAfter;
module.exports.getRegexSource = getRegexSource;
module.exports.getRegexForRipGrep = getRegexForRipGrep;
module.exports.getRegexForEditorSearch = getRegexForEditorSearch;
module.exports.isIncluded = isIncluded;
module.exports.formatLabel = formatLabel;
module.exports.createTaskId = createTaskId;
module.exports.createStableId = createStableId;
module.exports.createTaskStableId = createTaskStableId;
module.exports.createContextStableId = createContextStableId;
module.exports.findTagRangeInLine = findTagRangeInLine;
module.exports.replaceTaskStatusInLine = replaceTaskStatusInLine;
module.exports.upsertTvDirectivesInLine = upsertTvDirectivesInLine;
module.exports.buildCommentLine = buildCommentLine;
module.exports.buildAnnotationComment = buildAnnotationComment;
module.exports.getSingleLineCommentToken = getSingleLineCommentToken;
module.exports.createFolderGlob = createFolderGlob;
module.exports.getSubmoduleExcludeGlobs = getSubmoduleExcludeGlobs;
module.exports.isHidden = isHidden;
module.exports.expandTilde = expandTilde;
module.exports.replaceEnvironmentVariables = replaceEnvironmentVariables;
module.exports.formatExportPath = formatExportPath;
module.exports.complementaryColour = complementaryColour;
module.exports.isValidColour = isValidColour;
module.exports.setRgbAlpha = setRgbAlpha;
module.exports.isCodicon = isCodicon;
module.exports.toGlobArray = toGlobArray;
