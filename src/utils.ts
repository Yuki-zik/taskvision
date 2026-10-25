import type {UtilityConfiguration, ExtractedTag, TreeNode} from './model';
import * as micromatch from 'micromatch';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as find from 'find';
import * as strftime from 'fast-strftime';
import commentPatterns from 'comment-patterns';

import colourNames from './colourNames.js';
import * as taskState from './taskState.js';
import themeColourNames from './themeColourNames.js';
import * as annotationParser from './annotationParser.js';

let config: UtilityConfiguration;

const envRegex = new RegExp("\\$\\{(.*?)\\}", "g");
const rgbRegex = new RegExp("^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*(\\d+(?:\\.\\d+)?))?\\)$", "i");
const placeholderRegex = new RegExp("(\\$\\{.*\\})");

function computeCommentStart(str: string) {
    const delimiters = ['//', '/*', '#', '<!--', ';', '--', '%', '"'];
    let index = -1;
    delimiters.forEach(function (d) {
        const i = str.lastIndexOf(d);
        if (i > index) index = i;
    });
    return index > -1 ? index : 0;
}

function init(configuration: UtilityConfiguration) {
    config = configuration;
}

function isHexColour(colour: unknown) {
    if (typeof (colour) !== 'string') {
        return false;
    }
    const withoutHash = colour.indexOf('#') === 0 ? colour.substring(1) : colour;
    const hex = withoutHash.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    return (typeof colour === "string") && hex.length === withoutHash.length && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) && !isNaN(parseInt(hex, 16));
}

function isRgbColour(colour: unknown) {
    return typeof colour === 'string' && colour.match(rgbRegex) !== null;
}

function isNamedColour(colour: string) {
    return colourNames.indexOf(colour.toLowerCase()) > -1;
}

function isThemeColour(colour: unknown) {
    return typeof colour === 'string' && themeColourNames.indexOf(colour) > -1;
}

function hexToRgba(hex: string | undefined, opacity?: number) {
    function toComponent(digits: string) {
        return (digits.length == 1) ? parseInt(digits + digits, 16) : parseInt(digits, 16);
    }

    if (hex !== undefined) {
        hex = hex.replace('#', '');

        const rgb = hex.substring(0, (hex.length == 3 || hex.length == 4) ? 3 : 6);

        const r = toComponent(rgb.substring(0, rgb.length / 3));
        const g = toComponent(rgb.substring(rgb.length / 3, 2 * rgb.length / 3));
        const b = toComponent(rgb.substring(2 * rgb.length / 3, 3 * rgb.length / 3));

        if (hex.length == 4 || hex.length == 8) {
            const extractedOpacity = Math.trunc(toComponent(hex.substring(3 * hex.length / 4, 4 * hex.length / 4)) * 100 / 255);
            if (opacity === undefined || opacity === 0) {
                opacity = extractedOpacity;
            }
        }

        return 'rgba(' + r + ',' + g + ',' + b + ',' + Number(opacity) / 100 + ')';
    }

    return '#0F0';
}

function removeBlockComments(text: string, fileName: string) {
    const extension = path.extname(fileName);

    if (extension === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".js";
    }
    else if (extension === ".vue") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".html";
    }
    else if (extension === ".hs") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".cpp";
    }

    let commentPattern;
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
            let regex = commentPattern.regex;
            if (extension == ".hs") {
                let source = regex.source;
                const flags = regex.flags;
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
            const commentMatch = commentPattern.regex.exec(text);
            if (commentMatch) {
                for (let i = commentPattern.cg.contentStart; i < commentMatch.length; ++i) {
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

function removeLineComments(text: string, fileName: string) {
    let result = text.trim();

    if (path.extname(fileName) === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName))) + ".js";
    }

    let commentPattern;
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
    let tags = config.tags().slice().sort().reverse();
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
    return '(' + tags.join('|') + ')';
}

function normaliseCheckboxTag(tag: string) {
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

function escapeTagForRegex(tag: string) {
    if (/^\[\s*x\s*\]$/i.test(tag)) {
        return "\\[\\s*[xX]\\s*\\]";
    }
    if (/^\[\s*\]$/.test(tag)) {
        return "\\[\\s*\\]";
    }

    return escapeLiteralForRegex(tag);
}

function escapeLiteralForRegex(text: string) {
    return String(text).replace(/\\/g, '\\\\').replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
}

function parseTagTail(rightOfTagText: string, flags: string) {
    const statusInfo = taskState.parseInlineStatus(rightOfTagText);
    const workingText = statusInfo ? statusInfo.remainder.trim() : rightOfTagText;
    const directiveInfo = annotationParser.parseDirectives(workingText);
    let subTag;
    let rightOfTag = directiveInfo.trimmedText;
    const subTagRegex = new RegExp(config.subTagRegex(), flags);
    const subTagMatch = subTagRegex.exec(rightOfTag);

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

function extractTag(text: string, matchOffset?: number): ExtractedTag {
    const c = config.regex();
    const flags = c.caseSensitive ? '' : 'i';
    let tagMatch: RegExpExecArray | boolean | null = null;
    let tagOffset;
    let originalTag: string | undefined;
    let before = text;
    let after = text;
    let subTag;
    let explicitStatusInfo;

    if (c.regex.indexOf("$TAGS") > -1) {
        const tagRegex = new RegExp(getTagRegex(), flags);
        tagMatch = tagRegex.exec(text);
        if (tagMatch) {
            tagOffset = tagMatch.index;
            const rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
            const tagTail = parseTagTail(rightOfTagText, flags);
            subTag = tagTail.subTag;
            const rightOfTag = tagTail.rightOfTag;
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
            const matchedTag = normaliseCheckboxTag(tagMatch[0]);
            c.tags.forEach(function (tag) {
                if (originalTag !== undefined) return;
                const normalisedConfiguredTag = normaliseCheckboxTag(tag);
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

            const derivedStatus = tagTail.status || taskState.defaultStatusForTag(originalTag);
            return {
                tag: tagMatch ? originalTag || "" : "",
                withoutTag: text,
                before: before,
                after: after,
                tagOffset: tagOffset,
                commentStart: computeCommentStart(before),
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
        const regex = new RegExp(c.regex, flags);
        let match = regex.exec(text);
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

            const fallbackDirectiveInfo = annotationParser.parseDirectives(text, originalTag);
            text = fallbackDirectiveInfo.cleanedText;
            after = fallbackDirectiveInfo.cleanedText;

            return {
                tag: tagMatch ? originalTag || "" : "",
                withoutTag: text,
                before: before,
                after: after,
                tagOffset: tagOffset,
                commentStart: computeCommentStart(before),
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
    const fallbackStatus = undefined;
    return {
        tag: tagMatch ? originalTag || "" : "",
        withoutTag: text,
        before: before,
        after: after,
        tagOffset: tagOffset,
        commentStart: computeCommentStart(before),
        subTag: subTag,
        status: fallbackStatus,
        hasExplicitStatus: explicitStatusInfo !== undefined,
        inlineStatusToken: undefined,
        sourceOfTruth: tagMatch ? 'inline' : undefined
    };
}

function updateBeforeAndAfter(result: ExtractedTag, text: string, matchOffset?: number) {
    const c = config.regex();
    const flags = c.caseSensitive ? '' : 'i';
    let tagMatch: RegExpExecArray | boolean | null = null;

    const tagRegex = new RegExp(getTagRegex(), flags);
    tagMatch = tagRegex.exec(text);
    if (tagMatch) {
        result.tagOffset = tagMatch.index;
        const rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
        const tagTail = parseTagTail(rightOfTagText, flags);
        if (tagTail.subTag !== undefined) {
            result.subTag = tagTail.subTag;
        }
        const rightOfTag = tagTail.rightOfTag;
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
    let regex = config.regex().regex;
    if (regex.indexOf("($TAGS)") > -1) {
        regex = regex.split("($TAGS)").join(getTagRegex());
    }

    return regex;
}

function getRegexForEditorSearch(global?: boolean) {
    let flags = 'm';
    if (global) {
        flags += 'g';
    }
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }
    if (config.regex().multiLine === true) {
        flags += 's';
    }

    const source = getRegexSource();
    return RegExp(source, flags);
}

function getRegexForRipGrep() {
    let flags = 'gm';
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }

    return RegExp(getRegexSource(), flags);
}

function isIncluded(name: string, includes: string[], excludes: string[]) {
    const posix_includes = includes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });
    const posix_excludes = excludes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });

    let included = posix_includes.length === 0 || micromatch.isMatch(name, posix_includes);
    if (included === true && micromatch.isMatch(name, posix_excludes)) {
        included = false;
    }
    return included;
}

function formatLabel(template: string, node: Partial<TreeNode>, unexpectedPlaceholders?: string[]) {
    let result = template;

    const tag = node.actualTag !== undefined ? String(node.actualTag).trim() : "";
    const subTag = node.subTag ? String(node.subTag).trim() : "";
    const filename = node.fsPath ? path.basename(node.fsPath) : "";
    const filepath = node.fsPath ? node.fsPath : "";
    const status = node.status ? String(node.status).trim() : "";
    const priority = node.priority ? String(node.priority).trim() : "";
    const note = node.note ? String(node.note).trim() : "";

    const formatLabelMap: Record<string, string | number | undefined> = {
        "line": (node.line ?? Number.NaN) + 1,
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
    const re = new RegExp("\\$\\{(" + Object.keys(formatLabelMap).join("|") + ")\\}", "gi");
    result = result.replace(re, function (matched) {
        return String(formatLabelMap[matched.slice(2, -1).toLowerCase()]);
    });

    if (unexpectedPlaceholders) {
        const placeholderMatch = placeholderRegex.exec(result);
        if (placeholderMatch) {
            unexpectedPlaceholders.push(placeholderMatch[0]);
        }
    }

    return result;
}

function toRootRelative(rootPath: string | undefined, fsPath: string | undefined) {
    if (rootPath && fsPath) {
        const relative = path.relative(rootPath, fsPath);
        if (relative === '' || (relative.indexOf('..') !== 0 && !path.isAbsolute(relative))) {
            return relative;
        }
    }
    return fsPath || '';
}

function createTaskId(rootPath: string | undefined, fsPath: string, tag?: string, text?: string, subTag?: string) {
    const relativePath = toRootRelative(rootPath, fsPath);

    const digest = [
        String(relativePath).replace(/\\/g, '/'),
        String(normaliseCheckboxTag(tag || '')).trim().toLowerCase(),
        String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
        String(subTag || '').replace(/\s+/g, ' ').trim().toLowerCase()
    ].join('|');

    return crypto.createHash('sha1').update(digest).digest('hex');
}

function slugifyIdentifier(text: string, fallback?: string) {
    let slug = String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    if (!slug) {
        slug = fallback || 'item';
    }

    return slug.substring(0, 24);
}

function createShortHash(parts: string[]) {
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex').substring(0, 6);
}

function createStableId(prefix: string, rootPath: string | undefined, fsPath: string | undefined, text?: string, hint?: string) {
    const relativePath = toRootRelative(rootPath, fsPath);

    const slug = slugifyIdentifier(text || hint || path.basename(fsPath || '') || prefix, prefix);
    const hash = createShortHash([
        prefix,
        String(relativePath).replace(/\\/g, '/'),
        String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
        String(hint || '').replace(/\s+/g, ' ').trim().toLowerCase()
    ]);

    return prefix + '.' + slug + '.' + hash;
}

function createTaskStableId(rootPath: string | undefined, fsPath: string, tag?: string, text?: string, subTag?: string) {
    return createStableId('task', rootPath, fsPath, text || tag, [
        normaliseCheckboxTag(tag || ''),
        subTag || ''
    ].join('|'));
}

function createContextStableId(rootPath: string | undefined, fsPath: string, text?: string, contextKind?: string, line?: number) {
    return createStableId('ctx', rootPath, fsPath, text || contextKind || 'context', [
        contextKind || '',
        line || ''
    ].join('|'));
}

function findTagRangeInLine(lineText: string, tag: string, startIndex?: number) {
    if (typeof lineText !== 'string' || typeof tag !== 'string') {
        return undefined;
    }

    const flags = config.isRegexCaseSensitive() ? 'g' : 'gi';
    const tagRegex = new RegExp(escapeTagForRegex(tag), flags);
    tagRegex.lastIndex = startIndex || 0;

    const match = tagRegex.exec(lineText);
    if (!match) {
        return undefined;
    }

    return {
        start: match.index,
        end: match.index + match[0].length,
        match: match[0]
    };
}

function replaceTaskStatusInLine(lineText: string, task: Partial<TreeNode>, newStatus: string) {
    if (!task || !lineText) {
        return undefined;
    }

    const range = findTagRangeInLine(lineText, task.actualTag || task.tag || '', Math.max(0, (task.column || 1) - 1));
    if (!range) {
        return undefined;
    }

    const afterTag = lineText.slice(range.end);
    const statusInfo = taskState.parseInlineStatus(afterTag);
    const nextToken = taskState.toInlineToken(newStatus);

    if (statusInfo) {
        const statusStart = range.end + statusInfo.range.start;
        const statusEnd = range.end + statusInfo.range.end;
        return lineText.slice(0, statusStart) + nextToken + lineText.slice(statusEnd);
    }

    return lineText.slice(0, range.end) + ' ' + nextToken + lineText.slice(range.end);
}

function upsertTvDirectivesInLine(lineText: string, task: Partial<TreeNode>, directives: annotationParser.DirectiveOptions) {
    if (!task || !lineText) {
        return undefined;
    }

    const range = findTagRangeInLine(lineText, task.actualTag || task.tag || '', Math.max(0, (task.column || 1) - 1));
    if (!range) {
        return undefined;
    }

    const tokens = annotationParser.buildDirectiveTokens(directives);
    if (tokens.length === 0) {
        return lineText;
    }

    const afterTag = lineText.slice(range.end);
    const statusInfo = taskState.parseInlineStatus(afterTag);
    let head = lineText.slice(0, range.end);
    let tail = afterTag;

    if (statusInfo) {
        head += afterTag.slice(0, statusInfo.range.end);
        tail = afterTag.slice(statusInfo.range.end);
    }

    tail = annotationParser.removeDirectives(tail).replace(/\s{2,}/g, ' ').trim();
    return head + (tail ? ' ' + tail : '') + ' ' + tokens.join(' ');
}

function getSingleLineCommentToken(fileName: string) {
    let normalisedFileName = fileName;

    if (path.extname(normalisedFileName) === '.jsonc') {
        normalisedFileName = path.join(path.dirname(normalisedFileName), path.basename(normalisedFileName, path.extname(normalisedFileName))) + '.js';
    }

    let commentPattern;
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

function buildCommentLine(fileName: string, baseLineText: string, body: string) {
    const indentMatch = /^(\s*)/.exec(baseLineText || '');
    const indent = indentMatch ? indentMatch[1] : '';
    const token = getSingleLineCommentToken(fileName);
    const commentBody = String(body || '').trim();

    if (token === '<!--') {
        return indent + '<!-- ' + commentBody + ' -->';
    }

    return indent + token + ' ' + commentBody;
}

function buildAnnotationComment(fileName: string, baseLineText: string, tag: string, status: string | undefined, directives: annotationParser.DirectiveOptions, text: string) {
    const parts = [tag];

    if (status) {
        parts.push(taskState.toInlineToken(status));
    }

    if (text) {
        parts.push(String(text).trim());
    }

    annotationParser.buildDirectiveTokens(directives).forEach(function (token) {
        parts.push(token);
    });

    return buildCommentLine(fileName, baseLineText, parts.join(' '));
}

function createFolderGlob(folderPath: string, rootPath: string, filter: string) {
    if (process.platform === 'win32') {
        const relative = path.win32.relative(rootPath, folderPath).replace(/\\/g, '/');
        const rootName = path.win32.basename(rootPath).replace(/\\/g, '/');
        let globPath = relative;

        if (rootName) {
            globPath = relative ? (rootName + '/' + relative) : rootName;
        }

        if (!globPath) {
            globPath = folderPath.replace(/\\/g, '/').replace(/^[A-Za-z]:\/?/, '');
        }

        return ("**/" + globPath + filter).replace(/\/\//g, '/');
    }

    return (folderPath + filter).replace(/\/\//g, '/');
}

function getSubmoduleExcludeGlobs(rootPath: string) {
    let submodules = find.fileSync('.git', rootPath);
    submodules = submodules.map(function (submodule) {
        return path.dirname(submodule);
    });
    submodules = submodules.filter(function (submodule) {
        return submodule != rootPath;
    });
    return submodules;
}

function isHidden(filename: string) {
    return path.basename(filename).indexOf('.') !== -1 && path.extname(filename) === "";
}

function expandTilde(filePath: string) {
    if (filePath && filePath[0] === '~') {
        filePath = path.join(os.homedir(), filePath.slice(1));
    }

    return filePath;
}

function replaceEnvironmentVariables(text: string) {
    text = text.replace(envRegex, function (_match, name: string) {
        return process.env[name] || "";
    });

    return text;
}

function formatExportPath(template: string, dateTime?: Date) {
    let result = expandTilde(template);
    if (result) {
        result = strftime.strftime(result, dateTime);
    }
    return result;
}

function complementaryColour(colour: string) {
    const hex = colour.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    const digits = hex.length / 3;
    const red = parseInt(hex.substr(0, digits), 16);
    const green = parseInt(hex.substr(1 * digits, digits), 16);
    const blue = parseInt(hex.substr(2 * digits, digits), 16);
    const c = [red / 255, green / 255, blue / 255];
    for (let i = 0; i < c.length; ++i) {
        if (c[i] <= 0.03928) {
            c[i] = c[i] / 12.92;
        } else {
            c[i] = Math.pow((c[i] + 0.055) / 1.055, 2.4);
        }
    }
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return l > 0.179 ? "#000000" : "#ffffff";
}

function isValidColour(colour: unknown) {
    if (typeof colour === 'string' && colour) {
        if (isNamedColour(colour) || isThemeColour(colour) || isHexColour(colour) || isRgbColour(colour)) {
            return true;
        }
    }

    return false;
}

function setRgbAlpha(rgb: string, alpha: number) {
    rgbRegex.lastIndex = 0;
    const match = rgbRegex.exec(rgb);
    if (match !== null) {
        return "rgba(" + match[1] + "," + match[2] + "," + match[3] + "," + alpha + ")";
    }
    return rgb;
}

function isCodicon(icon: string) {
    return icon.trim().indexOf("$(") === 0;
}

function toGlobArray(globs: unknown) {
    if (globs === undefined) {
        return [];
    }
    if (typeof (globs) === 'string') {
        return globs.split(',');
    }
    return Array.isArray(globs) ? globs.filter((value): value is string => typeof value === 'string') : [];
}

export { init, isHexColour, isRgbColour, isNamedColour, isThemeColour, hexToRgba, removeBlockComments, removeLineComments, extractTag, updateBeforeAndAfter, getRegexSource, getRegexForRipGrep, getRegexForEditorSearch, isIncluded, formatLabel, createTaskId, createStableId, createTaskStableId, createContextStableId, findTagRangeInLine, replaceTaskStatusInLine, upsertTvDirectivesInLine, buildCommentLine, buildAnnotationComment, getSingleLineCommentToken, createFolderGlob, getSubmoduleExcludeGlobs, isHidden, expandTilde, replaceEnvironmentVariables, formatExportPath, complementaryColour, isValidColour, setRgbAlpha, isCodicon, toGlobArray };
