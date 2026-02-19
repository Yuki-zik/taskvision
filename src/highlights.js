var vscode = require('vscode');
var execWithIndices = require("regexp-match-indices").shim();

var config = require('./config.js');
var utils = require('./utils.js');
var attributes = require('./attributes.js');
var attributes = require('./attributes.js');
var icons = require('./icons.js');
var schemes = require('./schemes.js');

var captureGroupArgument = "capture-groups";

var lanes =
{
    "none": undefined,
    "left": 1,
    "center": 2,
    "right": 4,
    "full": 7
};

var decorations = {};
var highlightTimer = {};
var context;
var debug;

function init(context_, debug_) {
    context = context_;
    debug = debug_;
    context.subscriptions.push(decorations);
}

function applyOpacity(colour, opacity) {
    if (utils.isHexColour(colour)) {
        colour = utils.hexToRgba(colour, opacity < 1 ? opacity * 100 : opacity);
    }
    else if (utils.isRgbColour(colour)) {
        if (opacity !== 100) {
            colour = utils.setRgbAlpha(colour, opacity > 1 ? opacity / 100 : opacity);
        }
    }

    return colour;
}

var decorationCache = {};

function clearCache() {
    Object.keys(decorationCache).forEach(function (key) {
        decorationCache[key].dispose();
    });
    decorationCache = {};
    decorations = {};
}

function getDecoration(tag) {
    if (decorationCache[tag]) {
        return {
            primary: decorationCache[tag],
            secondary: decorationCache[tag + '_secondary']
        };
    }

    var foregroundColour = attributes.getForeground(tag);
    var backgroundColour = attributes.getBackground(tag);

    var opacity = getOpacity(tag);

    var lightForegroundColour = foregroundColour;
    var darkForegroundColour = foregroundColour;
    var lightBackgroundColour = backgroundColour;
    var darkBackgroundColour = backgroundColour;

    if (foregroundColour) {
        if (foregroundColour.match(/(foreground|background)/i)) {
            lightForegroundColour = new vscode.ThemeColor(foregroundColour);
            darkForegroundColour = new vscode.ThemeColor(foregroundColour);
        }
        else if (!utils.isValidColour(foregroundColour)) {
            lightForegroundColour = new vscode.ThemeColor('editor.foreground');
            darkForegroundColour = new vscode.ThemeColor('editor.foreground');
        }
    }

    if (backgroundColour) {
        if (backgroundColour.match(/(foreground|background)/i)) {
            lightBackgroundColour = new vscode.ThemeColor(backgroundColour);
            darkBackgroundColour = new vscode.ThemeColor(backgroundColour);
        }
        else if (!utils.isValidColour(backgroundColour)) {
            lightBackgroundColour = new vscode.ThemeColor('editor.background');
            darkBackgroundColour = new vscode.ThemeColor('editor.background');
        }

        lightBackgroundColour = applyOpacity(lightBackgroundColour, opacity);
        darkBackgroundColour = applyOpacity(darkBackgroundColour, opacity);
    }

    if (lightForegroundColour === undefined && utils.isHexColour(lightBackgroundColour)) {
        lightForegroundColour = utils.complementaryColour(lightBackgroundColour);
    }
    if (darkForegroundColour === undefined && utils.isHexColour(darkBackgroundColour)) {
        darkForegroundColour = utils.complementaryColour(darkBackgroundColour);
    }

    if (lightBackgroundColour === undefined && lightForegroundColour === undefined) {
        lightBackgroundColour = new vscode.ThemeColor('editor.foreground');
        lightForegroundColour = new vscode.ThemeColor('editor.background');
    }

    if (darkBackgroundColour === undefined && darkForegroundColour === undefined) {
        darkBackgroundColour = new vscode.ThemeColor('editor.foreground');
        darkForegroundColour = new vscode.ThemeColor('editor.background');
    }

    var lane = getRulerLane(tag);
    if (isNaN(parseInt(lane))) {
        lane = lanes[lane.toLowerCase()];
    }
    var fontWeight = getFontWeight(tag);
    var fontStyle = getFontStyle(tag);
    var textDecoration = getTextDecoration(tag);

    var decorationOptions = {
        borderRadius: getBorderRadius(tag),
        isWholeLine: getType(tag) === 'whole-line',
        gutterIconPath: showInGutter(tag) ? icons.getIcon(context, tag, debug).dark : undefined
    };

    if (lane !== undefined) {
        var rulerColour = getRulerColour(tag, darkBackgroundColour ? darkBackgroundColour : 'editor.foreground');
        var rulerOpacity = getRulerOpacity(tag);

        if (utils.isThemeColour(rulerColour)) {
            rulerColour = new vscode.ThemeColor(rulerColour);
        }
        else {
            rulerColour = applyOpacity(rulerColour, rulerOpacity);
        }

        decorationOptions.overviewRulerColor = rulerColour;
        decorationOptions.overviewRulerLane = lane;
    }

    decorationOptions.light = { backgroundColor: lightBackgroundColour, color: lightForegroundColour, fontWeight: fontWeight, fontStyle: fontStyle, textDecoration: textDecoration };
    decorationOptions.dark = { backgroundColor: darkBackgroundColour, color: darkForegroundColour, fontWeight: fontWeight, fontStyle: fontStyle, textDecoration: textDecoration };

    var scheme = attributes.getScheme(tag);
    if (scheme) {
        // Resolve the best base color for scheme effects.
        // Priority: iconColour > background (strip alpha) > foreground
        // This fixes the "all white" Glass bug where foreground is #FFFFFF.
        var resolveSchemeBaseColor = function (fgColor, bgColor) {
            // 1. Try iconColour first (most distinctive)
            var iconCol = attributes.getIconColour(tag);
            if (iconCol && typeof iconCol === 'string' && iconCol.startsWith('#')) {
                // Strip alpha if present (e.g. #42A5F566 -> #42A5F5)
                if (iconCol.length === 9) return iconCol.substring(0, 7);
                if (iconCol.length === 5) return iconCol.substring(0, 4);
                return iconCol;
            }
            // 2. Try background color (strip alpha)
            if (bgColor && typeof bgColor === 'string' && bgColor.startsWith('#')) {
                if (bgColor.length === 9) return bgColor.substring(0, 7);
                if (bgColor.length === 5) return bgColor.substring(0, 4);
                return bgColor;
            }
            // 3. Fallback to foreground if it's a hex and NOT pure white/black
            if (fgColor && typeof fgColor === 'string' && fgColor.startsWith('#')) {
                var upper = fgColor.toUpperCase();
                if (upper !== '#FFFFFF' && upper !== '#FFF' && upper !== '#000000' && upper !== '#000') {
                    return fgColor;
                }
            }
            return undefined; // Let scheme.js pick a default
        };

        var rawFg = attributes.getForeground(tag);
        var rawBg = attributes.getBackground(tag);
        var baseColor = resolveSchemeBaseColor(rawFg, rawBg);

        var type = getType(tag);
        var secondaryOptions = schemes.applyScheme(decorationOptions, scheme, baseColor, baseColor, type);
    }

    console.log('[TaskVision] getDecoration options for "' + tag + '":', JSON.stringify(decorationOptions, null, 2));

    var result = {
        primary: vscode.window.createTextEditorDecorationType(decorationOptions)
    };
    decorationCache[tag] = result.primary;

    if (secondaryOptions) {
        // Create secondary decoration type (e.g. for Neon text effect on top of Glass background)
        console.log('[TaskVision] Secondary options for "' + tag + '":', JSON.stringify(secondaryOptions, null, 2));
        result.secondary = vscode.window.createTextEditorDecorationType(secondaryOptions);
        decorationCache[tag + '_secondary'] = result.secondary;
    }

    return result;
}

function getRulerColour(tag, defaultColour) {
    var colour = attributes.getRulerColour(tag);
    if (colour === undefined) {
        colour = defaultColour;
    }
    return colour;
}

function getRulerLane(tag) {
    var lane = attributes.getRulerLane(tag);
    if (lane === undefined) {
        lane = vscode.workspace.getConfiguration('todo-tree.highlights').get('overviewRulerLane');
    }
    return lane;
}

function getOpacity(tag) {
    var opacity = attributes.getOpacity(tag);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('todo-tree.highlights').get('opacity');
    }
    return opacity;
}

function getRulerOpacity(tag) {
    var opacity = attributes.getOpacity(tag);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('todo-tree.highlights').get('opacity');
    }
    return opacity;
}

function getBorderRadius(tag) {
    var borderRadius = attributes.getBorderRadius(tag);
    if (borderRadius === undefined) {
        borderRadius = vscode.workspace.getConfiguration('todo-tree.highlights').get('borderRadius');
    }
    return borderRadius;
}

function getFontStyle(tag) {
    return attributes.getAttribute(tag, 'fontStyle', vscode.workspace.getConfiguration('todo-tree.highlights').get('fontStyle'));
}

function getFontWeight(tag) {
    return attributes.getAttribute(tag, 'fontWeight', vscode.workspace.getConfiguration('todo-tree.highlights').get('fontWeight'));
}

function getTextDecoration(tag) {
    return attributes.getAttribute(tag, 'textDecoration', vscode.workspace.getConfiguration('todo-tree.highlights').get('textDecoration'));
}

function showInGutter(tag) {
    return attributes.getAttribute(tag, 'icon', vscode.workspace.getConfiguration('todo-tree.highlights').get('icon'));
}

function getType(tag) {
    return attributes.getAttribute(tag, 'type', vscode.workspace.getConfiguration('todo-tree.highlights').get('highlight'));
}

function editorId(editor) {
    var id = "";
    if (editor.document) {
        id = JSON.stringify(editor.document.uri);
    }
    if (editor.viewColumn) {
        id += editor.viewColumn;
    }
    return id;
}

function highlight(editor) {
    console.log('[TaskVision] highlight() called, editor:', editor ? editor.document.fileName : 'null');
    try {
        function addDecoration(startPos, endPos) {
            var decoration = { range: new vscode.Range(startPos, endPos) };
            if (documentHighlights[tag] === undefined) {
                documentHighlights[tag] = [];
            }
            documentHighlights[tag].push(decoration);
        }

        var documentHighlights = {};
        var subTagHighlights = {};
        var customHighlight = config.customHighlight();

        if (editor) {
            var id = editorId(editor);

            if (decorations[id]) {
                decorations[id].forEach(function (decoration) {
                    editor.setDecorations(decoration, []);
                });
            }

            decorations[id] = [];

            if (vscode.workspace.getConfiguration('todo-tree.highlights').get('enabled', true)) {
                var text = editor.document.getText();
                var regex = utils.getRegexForEditorSearch(true);
                var subTagRegex = new RegExp(config.subTagRegex());

                console.log('[TaskVision] Highlighting file:', editor.document.fileName);
                console.log('[TaskVision] Regex:', regex.toString());
                console.log('[TaskVision] Highlights enabled: true');
                console.log('[TaskVision] customHighlight:', JSON.stringify(config.customHighlight()));
                console.log('[TaskVision] defaultHighlight:', JSON.stringify(config.defaultHighlight()));

                var matchCount = 0;
                var match;
                while ((match = regex.exec(text)) !== null) {
                    matchCount++;
                    var tag = match[0];
                    var offsetStart = match.index;
                    var offsetEnd = offsetStart + match[0].length;
                    var extracted = utils.extractTag(match[0]);
                    if (extracted.tag) {
                        var line = editor.document.lineAt(editor.document.positionAt(match.index));
                        utils.updateBeforeAndAfter(extracted, text.substring(offsetStart, editor.document.offsetAt(line.range.end)));
                    }
                    if (extracted.tag && extracted.tag.length > 0) {
                        var tagGroup = config.tagGroup(extracted.tag);
                        tag = tagGroup ? tagGroup : extracted.tag;
                        offsetStart = match.index + extracted.tagOffset;
                        offsetEnd = offsetStart + extracted.tag.length;
                    }
                    else {
                        offsetStart += match[0].search(/\S|$/);
                    }
                    var type = getType(tag);
                    console.log('[TaskVision] Match #' + matchCount + ': raw="' + match[0].substring(0, 50) + '" tag="' + tag + '" type="' + type + '"');
                    if (type !== 'none') {
                        var startPos = editor.document.positionAt(offsetStart);
                        var endPos = editor.document.positionAt(offsetEnd);
                        var fullEndPos = editor.document.positionAt(match.index + match[0].length);

                        if (type === 'text-and-comment') {
                            addDecoration(
                                editor.document.positionAt(match.index),
                                new vscode.Position(fullEndPos.line, editor.document.lineAt(fullEndPos.line).range.end.character));
                        }
                        else if (type === 'text') {
                            addDecoration(
                                startPos,
                                new vscode.Position(fullEndPos.line, editor.document.lineAt(fullEndPos.line).range.end.character));
                        }
                        else if (type !== undefined && type.indexOf(captureGroupArgument + ":") === 0) {
                            type.substring(type.indexOf(':') + 1).split(',').map(function (groupText) {
                                var group = parseInt(groupText);
                                if (match.indices && match.indices[group]) {
                                    addDecoration(
                                        editor.document.positionAt(match.indices[group][0]),
                                        editor.document.positionAt(match.indices[group][1]));
                                }
                            });
                        }
                        else if (type === 'tag-and-subTag' || type === 'tag-and-subtag') {
                            addDecoration(startPos, endPos);

                            var endOfLineOffset = editor.document.offsetAt(new vscode.Position(fullEndPos.line, editor.document.lineAt(fullEndPos.line).range.end.character));
                            var todoText = text.substring(offsetEnd, endOfLineOffset);
                            var subTagMatch = todoText.match(subTagRegex);
                            if (subTagMatch !== null && subTagMatch.length > 1) {
                                var subTag = subTagMatch[1];
                                if (customHighlight[subTag] !== undefined) {
                                    var subTagOffset = todoText.indexOf(subTag);
                                    if (subTagOffset !== -1) {
                                        var subTagStartPos = editor.document.positionAt(offsetEnd + subTagOffset);
                                        var subTagEndPos = editor.document.positionAt(offsetEnd + subTagOffset + subTagMatch[1].length);
                                        var subTagDecoration = { range: new vscode.Range(subTagStartPos, subTagEndPos) };
                                        if (subTagHighlights[subTag] === undefined) {
                                            subTagHighlights[subTag] = [];
                                        }
                                        subTagHighlights[subTag].push(subTagDecoration);
                                    }
                                }
                            }
                        }
                        else if (type === 'tag-and-comment') {
                            addDecoration(editor.document.positionAt(match.index), endPos);
                        }
                        else if (type === 'line' || type === 'whole-line') {
                            addDecoration(
                                new vscode.Position(fullEndPos.line, editor.document.lineAt(fullEndPos.line).range.end.character),
                                new vscode.Position(startPos.line, 0));
                        }
                        else {
                            addDecoration(startPos, endPos);
                        }
                    }
                }

                console.log('[TaskVision] Total matches: ' + matchCount);
                console.log('[TaskVision] Tags with decorations: ' + Object.keys(documentHighlights).join(', '));

                Object.keys(documentHighlights).forEach(function (tag) {
                    try {
                        var decorationResult = getDecoration(tag);
                        var locations = documentHighlights[tag];

                        if (decorationResult.primary) {
                            decorations[id].push(decorationResult.primary);
                            editor.setDecorations(decorationResult.primary, locations);
                        } else if (decorationResult && !decorationResult.primary && !decorationResult.secondary) {
                            // Compatibility: if getDecoration returned a single object directly (shouldn't happen with new code but safe fallback)
                            // However, we know getDecoration returns {primary: ...} now.
                            // If it somehow returned a raw object, handle it:
                            if (decorationResult.key) { // check for verify existence of VSCode decoration object property or similar? 
                                // Actually, checking if it has .dispose is safer, but simpler:
                                decorations[id].push(decorationResult);
                                editor.setDecorations(decorationResult, locations);
                            }
                        }

                        if (decorationResult.secondary) {
                            decorations[id].push(decorationResult.secondary);
                            editor.setDecorations(decorationResult.secondary, locations);
                        }
                        console.log('[TaskVision] Applied ' + locations.length + ' decorations for tag "' + tag + '"');
                    } catch (tagError) {
                        console.error('[TaskVision] getDecoration FAILED for tag "' + tag + '":', tagError.message, tagError.stack);
                    }
                });

                Object.keys(subTagHighlights).forEach(function (subTag) {
                    var decoration = getDecoration(subTag);
                    decorations[id].push(decoration);
                    editor.setDecorations(decoration, subTagHighlights[subTag]);
                });
            }
        }
    }
    catch (e) {
        console.error('[TaskVision] highlighting FAILED:', e.message, e.stack);
        if (debug) {
            debug("highlighting failed: " + e);
        }
    }
}

function triggerHighlight(editor) {
    console.log('[TaskVision] triggerHighlight() called, editor:', editor ? editor.document.fileName : 'null');
    if (editor) {
        var id = editorId(editor);

        if (highlightTimer[id]) {
            clearTimeout(highlightTimer[id]);
        }
        highlightTimer[id] = setTimeout(highlight, vscode.workspace.getConfiguration('todo-tree.highlights').highlightDelay, editor);
    }
}

module.exports.init = init;
module.exports.getDecoration = getDecoration;
module.exports.triggerHighlight = triggerHighlight;
module.exports.clearCache = clearCache;

