var vscode = require('vscode');
require('regexp-match-indices').shim();

var config = require('./config.js');
var utils = require('./utils.js');
var attributes = require('./attributes.js');
var icons = require('./icons.js');
var schemes = require('./schemes.js');
var rangeResolver = require('./rangeResolver.js');
var styleComposer = require('./styleComposer.js');
var highlightChannels = require('./highlightChannels.js');

var lanes = {
    none: undefined,
    left: 1,
    center: 2,
    right: 4,
    full: 7
};

var decorations = {};
var highlightTimer = {};
var context;
var debug;

var decorationCache = {};
var tagPlanCache = {};

function init(context_, debug_) {
    context = context_;
    debug = debug_;
    context.subscriptions.push(decorations);
}

function trace(text) {
    if (debug) {
        debug(text);
    }
}

function disposeDecoration(decoration, disposed) {
    if (decoration && !disposed.has(decoration)) {
        disposed.add(decoration);
        decoration.dispose();
    }
}

function clearCache() {
    var disposed = new Set();

    Object.keys(decorationCache).forEach(function (key) {
        disposeDecoration(decorationCache[key], disposed);
    });
    decorationCache = {};
    tagPlanCache = {};

    Object.keys(decorations).forEach(function (editorKey) {
        if (decorations[editorKey]) {
            decorations[editorKey].forEach(function (decoration) {
                disposeDecoration(decoration, disposed);
            });
        }
    });

    decorations = {};
}

function applyOpacity(colour, opacity) {
    if (utils.isHexColour(colour)) {
        colour = utils.hexToRgba(colour, opacity < 1 ? opacity * 100 : opacity);
    } else if (utils.isRgbColour(colour)) {
        if (opacity !== 100) {
            colour = utils.setRgbAlpha(colour, opacity > 1 ? opacity / 100 : opacity);
        }
    }

    return colour;
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
        lane = vscode.workspace.getConfiguration('taskvision.highlights').get('overviewRulerLane');
    }
    return lane;
}

function getOpacity(tag) {
    var opacity = attributes.getOpacity(tag);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('opacity');
    }
    return opacity;
}

function getRulerOpacity(tag) {
    var opacity = attributes.getOpacity(tag);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('opacity');
    }
    return opacity;
}

function getBorderRadius(tag) {
    var borderRadius = attributes.getBorderRadius(tag);
    if (borderRadius === undefined) {
        borderRadius = vscode.workspace.getConfiguration('taskvision.highlights').get('borderRadius');
    }
    return borderRadius;
}

function getFontStyle(tag) {
    return attributes.getAttribute(tag, 'fontStyle', vscode.workspace.getConfiguration('taskvision.highlights').get('fontStyle'));
}

function getFontWeight(tag) {
    return attributes.getAttribute(tag, 'fontWeight', vscode.workspace.getConfiguration('taskvision.highlights').get('fontWeight'));
}

function getTextDecoration(tag) {
    return attributes.getAttribute(tag, 'textDecoration', vscode.workspace.getConfiguration('taskvision.highlights').get('textDecoration'));
}

function showInGutter(tag) {
    return attributes.getAttribute(tag, 'gutterIcon', true);
}

function getColorType(tag) {
    return rangeResolver.normaliseRangeType(attributes.getAttribute(tag, 'colorType', 'text'));
}

function getGlowType(tag) {
    return rangeResolver.normaliseRangeType(attributes.getAttribute(tag, 'glowType', 'tag'));
}

function getGlassType(tag) {
    return rangeResolver.normaliseRangeType(attributes.getAttribute(tag, 'glassType', 'whole-line'));
}

function getFontType(tag) {
    return rangeResolver.normaliseRangeType(attributes.getAttribute(tag, 'fontType', 'tag'));
}

function editorId(editor) {
    var id = '';
    if (editor.document) {
        id = JSON.stringify(editor.document.uri);
    }
    if (editor.viewColumn) {
        id += editor.viewColumn;
    }
    return id;
}

function resolveThemeColour(raw, fallbackThemeColorId) {
    if (raw === undefined) {
        return undefined;
    }

    if (typeof raw === 'string' && raw.match(/(foreground|background)/i)) {
        return new vscode.ThemeColor(raw);
    }

    if (!utils.isValidColour(raw)) {
        return new vscode.ThemeColor(fallbackThemeColorId);
    }

    return raw;
}

function resolveSchemeBaseColor(tag, foregroundColor, backgroundColor) {
    var iconColour = attributes.getIconColour(tag);
    if (iconColour && typeof iconColour === 'string' && iconColour.startsWith('#')) {
        if (iconColour.length === 9) {
            return iconColour.substring(0, 7);
        }
        if (iconColour.length === 5) {
            return iconColour.substring(0, 4);
        }
        return iconColour;
    }

    if (backgroundColor && typeof backgroundColor === 'string' && backgroundColor.startsWith('#')) {
        if (backgroundColor.length === 9) {
            return backgroundColor.substring(0, 7);
        }
        if (backgroundColor.length === 5) {
            return backgroundColor.substring(0, 4);
        }
        return backgroundColor;
    }

    if (foregroundColor && typeof foregroundColor === 'string' && foregroundColor.startsWith('#')) {
        var upper = foregroundColor.toUpperCase();
        if (upper !== '#FFFFFF' && upper !== '#FFF' && upper !== '#000000' && upper !== '#000') {
            return foregroundColor;
        }
    }

    return undefined;
}

function getTagPlan(tag) {
    if (tagPlanCache[tag]) {
        return tagPlanCache[tag];
    }

    var foregroundColour = attributes.getForeground(tag);
    var backgroundColour = attributes.getBackground(tag);

    var opacity = getOpacity(tag);

    var lightForegroundColour = resolveThemeColour(foregroundColour, 'editor.foreground');
    var darkForegroundColour = resolveThemeColour(foregroundColour, 'editor.foreground');
    var lightBackgroundColour = resolveThemeColour(backgroundColour, 'editor.background');
    var darkBackgroundColour = resolveThemeColour(backgroundColour, 'editor.background');

    var schemeName = attributes.getScheme(tag);
    var hasGlass = schemeName === 'glass' || schemeName === 'neon+glass';
    var defaultOpacity = hasGlass ? 15 : undefined;
    var finalOpacity = opacity !== undefined ? opacity : defaultOpacity;

    if (lightBackgroundColour !== undefined) {
        lightBackgroundColour = applyOpacity(lightBackgroundColour, finalOpacity);
    }
    if (darkBackgroundColour !== undefined) {
        darkBackgroundColour = applyOpacity(darkBackgroundColour, finalOpacity);
    }

    if (lightForegroundColour === undefined && utils.isHexColour(lightBackgroundColour)) {
        lightForegroundColour = utils.complementaryColour(lightBackgroundColour);
    }
    if (darkForegroundColour === undefined && utils.isHexColour(darkBackgroundColour)) {
        darkForegroundColour = utils.complementaryColour(darkBackgroundColour);
    }

    var fontWeight = getFontWeight(tag);
    var fontStyle = getFontStyle(tag);
    var textDecoration = getTextDecoration(tag);

    var baseColor = resolveSchemeBaseColor(tag, foregroundColour, backgroundColour);
    var schemePreset = schemes.getPreset(schemeName, baseColor, baseColor);

    if (schemeName && (foregroundColour === undefined || foregroundColour.toUpperCase() === '#FFFFFF' || foregroundColour.toUpperCase() === '#FFF')) {
        lightForegroundColour = schemePreset.lightColor;
        darkForegroundColour = schemePreset.darkColor;
    }

    var channels = highlightChannels.buildChannels({
        scheme: schemeName,
        colorType: getColorType(tag),
        glowType: getGlowType(tag),
        glassType: getGlassType(tag),
        fontType: getFontType(tag),
        lightForegroundColour: lightForegroundColour,
        darkForegroundColour: darkForegroundColour,
        lightBackgroundColour: lightBackgroundColour,
        darkBackgroundColour: darkBackgroundColour,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        textDecoration: textDecoration,
        borderRadius: getBorderRadius(tag),
        schemePreset: schemePreset
    });

    var lane = getRulerLane(tag);
    if (isNaN(parseInt(lane, 10))) {
        lane = lane !== undefined ? lanes[String(lane).toLowerCase()] : undefined;
    }

    var rulerColour;
    if (lane !== undefined) {
        rulerColour = getRulerColour(tag, darkBackgroundColour ? darkBackgroundColour : 'editor.foreground');
        var rulerOpacity = getRulerOpacity(tag);

        if (utils.isThemeColour(rulerColour)) {
            rulerColour = new vscode.ThemeColor(rulerColour);
        } else {
            rulerColour = applyOpacity(rulerColour, rulerOpacity);
        }
    }

    var meta = {
        lane: lane,
        rulerColour: rulerColour,
        gutterIconPath: showInGutter(tag) ? icons.getIcon(context, tag, debug).dark : undefined
    };

    var plan = {
        tag: tag,
        channels: channels,
        meta: meta
    };

    tagPlanCache[tag] = plan;
    return plan;
}

function buildGlassDecorationOptions(plan) {
    var glassChannel = plan.channels.glass;
    var lightStyle = glassChannel.style.light || {};
    var darkStyle = glassChannel.style.dark || {};

    var options = {
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        isWholeLine: glassChannel.rangeType === 'whole-line' || glassChannel.rangeType === 'line',
        borderRadius: glassChannel.style.borderRadius,
        light: {},
        dark: {}
    };

    if (lightStyle.backgroundColor !== undefined) {
        options.light.backgroundColor = lightStyle.backgroundColor;
    }
    if (darkStyle.backgroundColor !== undefined) {
        options.dark.backgroundColor = darkStyle.backgroundColor;
    }
    if (lightStyle.border !== undefined) {
        options.light.border = lightStyle.border;
    }
    if (darkStyle.border !== undefined) {
        options.dark.border = darkStyle.border;
    }

    return options;
}

function buildMetaDecorationOptions(plan) {
    var options = {
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        light: {},
        dark: {}
    };

    if (plan.meta.gutterIconPath) {
        options.gutterIconPath = plan.meta.gutterIconPath;
    }

    if (plan.meta.lane !== undefined) {
        options.overviewRulerLane = plan.meta.lane;
        options.overviewRulerColor = plan.meta.rulerColour;
    }

    return options;
}

function buildTextDecorationOptions(style) {
    return {
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        isWholeLine: false,
        light: Object.assign({}, style.light),
        dark: Object.assign({}, style.dark)
    };
}

function getDecoration(cacheKey, factory) {
    if (!decorationCache[cacheKey]) {
        decorationCache[cacheKey] = vscode.window.createTextEditorDecorationType(factory());
    }
    return decorationCache[cacheKey];
}

function getGlassDecoration(tag, plan) {
    return getDecoration('glass:' + tag, function () {
        return buildGlassDecorationOptions(plan);
    });
}

function getMetaDecoration(tag, plan) {
    return getDecoration('meta:' + tag, function () {
        return buildMetaDecorationOptions(plan);
    });
}

function getCachedTextDecoration(tag, styleHash, style) {
    return getDecoration('text:' + tag + ':' + styleHash, function () {
        return buildTextDecorationOptions(style);
    });
}

function getSubTagDecoration(tag, plan) {
    var style = styleComposer.composeTextStyle({
        color: plan.channels.color.enabled ? plan.channels.color.style : undefined,
        font: plan.channels.font.enabled ? plan.channels.font.style : undefined,
        glow: plan.channels.glow.enabled ? plan.channels.glow.style : undefined
    });

    var light = Object.assign({}, style.light);
    var dark = Object.assign({}, style.dark);

    if (plan.channels.glass.enabled) {
        if (plan.channels.glass.style.light && plan.channels.glass.style.light.backgroundColor !== undefined) {
            light.backgroundColor = plan.channels.glass.style.light.backgroundColor;
        }
        if (plan.channels.glass.style.dark && plan.channels.glass.style.dark.backgroundColor !== undefined) {
            dark.backgroundColor = plan.channels.glass.style.dark.backgroundColor;
        }
    }

    var styleHash = styleComposer.stableStyleHash({ light: light, dark: dark });

    return getDecoration('subtag:' + tag + ':' + styleHash, function () {
        return {
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            isWholeLine: false,
            light: light,
            dark: dark
        };
    });
}

function toRange(document, startOffset, endOffset) {
    if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset <= startOffset) {
        return undefined;
    }

    var start = document.positionAt(startOffset);
    var end = document.positionAt(endOffset);
    if (end.isBeforeOrEqual(start)) {
        return undefined;
    }

    return new vscode.Range(start, end);
}

function toDecorations(document, ranges) {
    return ranges.map(function (range) {
        var r = toRange(document, range.start, range.end);
        return r ? { range: r } : undefined;
    }).filter(Boolean);
}

function isCovered(rangeList, start, end) {
    return rangeList.some(function (range) {
        return range.start <= start && range.end >= end;
    });
}

function hasEffectiveTextStyle(style) {
    function hasThemeStyle(theme) {
        return theme && (
            theme.color !== undefined ||
            theme.fontWeight !== undefined ||
            theme.fontStyle !== undefined ||
            theme.textDecoration !== undefined
        );
    }

    return hasThemeStyle(style.light) || hasThemeStyle(style.dark);
}

function buildTextSegments(channelRanges, channelStyles) {
    var boundaries = [];

    ['color', 'font', 'glow'].forEach(function (kind) {
        (channelRanges[kind] || []).forEach(function (range) {
            boundaries.push(range.start);
            boundaries.push(range.end);
        });
    });

    boundaries = Array.from(new Set(boundaries)).sort(function (a, b) {
        return a - b;
    });

    var segments = [];

    for (var i = 0; i < boundaries.length - 1; i++) {
        var start = boundaries[i];
        var end = boundaries[i + 1];
        if (end <= start) {
            continue;
        }

        var active = {
            color: isCovered(channelRanges.color || [], start, end),
            font: isCovered(channelRanges.font || [], start, end),
            glow: isCovered(channelRanges.glow || [], start, end)
        };

        if (!active.color && !active.font && !active.glow) {
            continue;
        }

        var style = styleComposer.composeTextStyle({
            color: active.color ? channelStyles.color : undefined,
            font: active.font ? channelStyles.font : undefined,
            glow: active.glow ? channelStyles.glow : undefined
        });

        if (!hasEffectiveTextStyle(style)) {
            continue;
        }

        segments.push({
            start: start,
            end: end,
            style: style,
            styleHash: styleComposer.stableStyleHash(style)
        });
    }

    return segments;
}

function channelUsesSubTag(plan) {
    return ['color', 'glow', 'glass', 'font'].some(function (kind) {
        return plan.channels[kind].enabled && plan.channels[kind].rangeType === 'tag-and-subTag';
    });
}

function highlight(editor) {
    trace('[TaskVision] highlight() called, editor: ' + (editor ? editor.document.fileName : 'null'));

    try {
        var documentGlassHighlights = {};
        var documentTextHighlights = {};
        var documentTextStyles = {};
        var documentMetaHighlights = {};
        var subTagHighlights = {};
        var customHighlight = config.customHighlight();

        if (!editor) {
            return;
        }

        var id = editorId(editor);

        if (decorations[id]) {
            decorations[id].forEach(function (decoration) {
                editor.setDecorations(decoration, []);
            });
        }
        decorations[id] = [];

        if (!vscode.workspace.getConfiguration('taskvision.highlights').get('enabled', true)) {
            return;
        }

        var text = editor.document.getText();
        var regex = utils.getRegexForEditorSearch(true);
        var subTagRegex = new RegExp(config.subTagRegex());
        var trackedTags = new Set();

        var match;
        while ((match = regex.exec(text)) !== null) {
            var tag = match[0];
            var offsetStart = match.index;
            var offsetEnd = offsetStart + match[0].length;

            var extracted = utils.extractTag(match[0]);
            if (extracted.tag) {
                var lineForUpdate = editor.document.lineAt(editor.document.positionAt(match.index));
                utils.updateBeforeAndAfter(extracted, text.substring(offsetStart, editor.document.offsetAt(lineForUpdate.range.end)));
            }

            if (extracted.tag && extracted.tag.length > 0) {
                var tagGroup = config.tagGroup(extracted.tag);
                tag = tagGroup ? tagGroup : extracted.tag;
                offsetStart = match.index + extracted.tagOffset;
                offsetEnd = offsetStart + extracted.tag.length;
            } else {
                offsetStart += match[0].search(/\S|$/);
            }

            var plan = getTagPlan(tag);
            trackedTags.add(tag);

            var startPos = editor.document.positionAt(offsetStart);
            var endPos = editor.document.positionAt(offsetEnd);
            var fullEndPos = editor.document.positionAt(match.index + match[0].length);
            var line = editor.document.lineAt(startPos.line);
            var lineStartOffset = editor.document.offsetAt(new vscode.Position(startPos.line, 0));
            var lineEndOffset = editor.document.offsetAt(line.range.end);

            var commentEndOffset = lineEndOffset;
            var textFromTag = text.substring(offsetStart, lineEndOffset);
            var blockTerminators = ['*/', '-->', '}}'];
            var minIndex = -1;
            var terminatorLength = 0;

            blockTerminators.forEach(function (terminator) {
                var index = textFromTag.indexOf(terminator);
                if (index !== -1 && (minIndex === -1 || index < minIndex)) {
                    minIndex = index;
                    terminatorLength = terminator.length;
                }
            });

            if (minIndex !== -1) {
                commentEndOffset = offsetStart + minIndex + terminatorLength;
            }

            var commentStartOffset = match.index + (extracted.commentStart || 0);

            var subTagStartOffset;
            var subTagEndOffset;
            var subTag;

            var todoText = text.substring(offsetEnd, lineEndOffset);
            var subTagMatch = todoText.match(subTagRegex);
            if (subTagMatch !== null && subTagMatch.length > 1) {
                subTag = subTagMatch[1];
                var subTagOffset = todoText.indexOf(subTag);
                if (subTagOffset !== -1) {
                    subTagStartOffset = offsetEnd + subTagOffset;
                    subTagEndOffset = subTagStartOffset + subTag.length;

                    if (channelUsesSubTag(plan) && customHighlight[subTag] !== undefined) {
                        if (subTagHighlights[subTag] === undefined) {
                            subTagHighlights[subTag] = [];
                        }
                        var subTagRange = toRange(editor.document, subTagStartOffset, subTagEndOffset);
                        if (subTagRange) {
                            subTagHighlights[subTag].push({ range: subTagRange });
                        }
                    }
                }
            }

            var rangeContext = {
                tagStart: offsetStart,
                tagEnd: offsetEnd,
                matchStart: match.index,
                matchEnd: match.index + match[0].length,
                commentStart: commentStartOffset,
                commentEnd: commentEndOffset,
                lineStart: lineStartOffset,
                lineEnd: lineEndOffset,
                subTagStart: subTagStartOffset,
                subTagEnd: subTagEndOffset,
                matchIndices: match.indices
            };

            if (plan.meta.gutterIconPath || plan.meta.lane !== undefined) {
                if (documentMetaHighlights[tag] === undefined) {
                    documentMetaHighlights[tag] = [];
                }
                var metaRange = toRange(editor.document, offsetStart, offsetEnd);
                if (metaRange) {
                    documentMetaHighlights[tag].push({ range: metaRange });
                }
            }

            if (plan.channels.glass.enabled) {
                var glassRanges = rangeResolver.resolveRangeOffsets(plan.channels.glass.rangeType, rangeContext);
                if (glassRanges.length > 0) {
                    if (documentGlassHighlights[tag] === undefined) {
                        documentGlassHighlights[tag] = [];
                    }
                    documentGlassHighlights[tag] = documentGlassHighlights[tag].concat(toDecorations(editor.document, glassRanges));
                }
            }

            var textChannelRanges = {
                color: plan.channels.color.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.color.rangeType, rangeContext) : [],
                font: plan.channels.font.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.font.rangeType, rangeContext) : [],
                glow: plan.channels.glow.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.glow.rangeType, rangeContext) : []
            };

            var textSegments = buildTextSegments(textChannelRanges, {
                color: plan.channels.color.style,
                font: plan.channels.font.style,
                glow: plan.channels.glow.style
            });

            if (textSegments.length > 0) {
                if (documentTextHighlights[tag] === undefined) {
                    documentTextHighlights[tag] = {};
                }
                if (documentTextStyles[tag] === undefined) {
                    documentTextStyles[tag] = {};
                }

                textSegments.forEach(function (segment) {
                    if (documentTextHighlights[tag][segment.styleHash] === undefined) {
                        documentTextHighlights[tag][segment.styleHash] = [];
                    }
                    var textRange = toRange(editor.document, segment.start, segment.end);
                    if (textRange) {
                        documentTextHighlights[tag][segment.styleHash].push({ range: textRange });
                        documentTextStyles[tag][segment.styleHash] = segment.style;
                    }
                });
            }
        }

        var applied = new Set();

        function applyDecoration(decoration, ranges) {
            if (!decoration || !ranges || ranges.length === 0) {
                return;
            }

            if (!applied.has(decoration)) {
                applied.add(decoration);
                decorations[id].push(decoration);
            }

            editor.setDecorations(decoration, ranges);
        }

        trackedTags.forEach(function (tag) {
            var plan = getTagPlan(tag);

            if (documentMetaHighlights[tag] && documentMetaHighlights[tag].length > 0) {
                applyDecoration(getMetaDecoration(tag, plan), documentMetaHighlights[tag]);
            }

            if (documentGlassHighlights[tag] && documentGlassHighlights[tag].length > 0 && plan.channels.glass.enabled) {
                applyDecoration(getGlassDecoration(tag, plan), documentGlassHighlights[tag]);
            }

            if (documentTextHighlights[tag]) {
                Object.keys(documentTextHighlights[tag]).forEach(function (styleHash) {
                    var style = documentTextStyles[tag][styleHash];
                    applyDecoration(
                        getCachedTextDecoration(tag, styleHash, style),
                        documentTextHighlights[tag][styleHash]
                    );
                });
            }
        });

        Object.keys(subTagHighlights).forEach(function (subTag) {
            var subPlan = getTagPlan(subTag);
            applyDecoration(getSubTagDecoration(subTag, subPlan), subTagHighlights[subTag]);
        });
    } catch (error) {
        console.error('[TaskVision] highlighting FAILED:', error.message, error.stack);
        if (debug) {
            debug('highlighting failed: ' + error);
        }
    }
}

function triggerHighlight(editor) {
    trace('[TaskVision] triggerHighlight() called, editor: ' + (editor ? editor.document.fileName : 'null'));
    if (editor) {
        var id = editorId(editor);

        if (highlightTimer[id]) {
            clearTimeout(highlightTimer[id]);
        }
        highlightTimer[id] = setTimeout(highlight, vscode.workspace.getConfiguration('taskvision.highlights').highlightDelay, editor);
    }
}

module.exports.init = init;
module.exports.triggerHighlight = triggerHighlight;
module.exports.clearCache = clearCache;
module.exports._getTagPlan = getTagPlan;
module.exports._buildTextSegments = buildTextSegments;
