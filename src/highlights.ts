import type {Logger, TagPlan, ThemeStyle, ThemedStyle, TextChannels, OffsetRange} from './model';
import {present, errorMessage} from './validation';
import * as vscode from 'vscode';
// INTENT: 保留四通道高亮与 Cursor 兼容行为；新增知识标签不重写渲染管线。 [tv:id=intent.highlight-compat]
import { shim } from 'regexp-match-indices';
shim();

import * as config from './config.js';
import * as utils from './utils.js';
import * as attributes from './attributes.js';
import * as icons from './icons.js';
import * as schemes from './schemes.js';
import * as rangeResolver from './rangeResolver.js';
import * as styleComposer from './styleComposer.js';
import * as highlightChannels from './highlightChannels.js';

const lanes: Record<string, vscode.OverviewRulerLane | undefined> = {
    none: undefined,
    left: 1,
    center: 2,
    right: 4,
    full: 7
};

let decorations: Record<string, vscode.TextEditorDecorationType[]> = {};
let highlightTimer: Record<string, ReturnType<typeof setTimeout>> = {};
let context: vscode.ExtensionContext;
let debug: Logger | undefined;

let decorationCache: Record<string, vscode.TextEditorDecorationType> = {};
let tagPlanCache: Record<string, TagPlan> = {};

function init(context_: vscode.ExtensionContext, debug_: Logger) {
    context = context_;
    debug = debug_;
    context.subscriptions.push({ dispose: function () {
        Object.keys(highlightTimer).forEach(function (key) { clearTimeout(highlightTimer[key]); });
        highlightTimer = {};
        clearCache();
    } });
}

function trace(text: string) {
    if (debug) {
        debug(text);
    }
}

function disposeDecoration(decoration: vscode.TextEditorDecorationType | undefined, disposed: Set<vscode.TextEditorDecorationType>) {
    if (decoration && !disposed.has(decoration)) {
        disposed.add(decoration);
        decoration.dispose();
    }
}

function clearCache() {
    const disposed = new Set<vscode.TextEditorDecorationType>();

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

function applyOpacity(colour: string | vscode.ThemeColor, opacity: number) {
    if (utils.isHexColour(colour)) {
        colour = utils.hexToRgba(String(colour), opacity < 1 ? opacity * 100 : opacity);
    } else if (utils.isRgbColour(colour)) {
        if (opacity !== 100) {
            colour = utils.setRgbAlpha(String(colour), opacity > 1 ? opacity / 100 : opacity);
        }
    }

    return colour;
}

function normalizeOpacitySetting(opacity: unknown) {
    return opacity === undefined || opacity === null || opacity === '' || opacity === 0 || opacity === '0' ? undefined : Number(opacity);
}

function getRulerColour(tag: string, defaultColour: string | vscode.ThemeColor) {
    let colour: string | vscode.ThemeColor | undefined = attributes.getRulerColour(tag);
    if (colour === undefined) {
        colour = defaultColour;
    }
    return colour;
}

function getRulerLane(tag: string) {
    let lane = attributes.getRulerLane(tag);
    if (lane === undefined) {
        lane = vscode.workspace.getConfiguration('taskvision.highlights').get<string | number>('overviewRulerLane');
    }
    return lane;
}

function getOpacity(tag: string) {
    let opacity = attributes.getOpacity(tag);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('opacity');
    }
    return normalizeOpacitySetting(opacity);
}

function getForegroundOpacity(tag: string) {
    let opacity = attributes.getAttribute(tag, 'foregroundOpacity', undefined);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('foregroundOpacity');
    }
    return normalizeOpacitySetting(opacity);
}

function getGlowOpacity(tag: string) {
    let opacity = attributes.getAttribute(tag, 'glowOpacity', undefined);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('glowOpacity');
    }
    return normalizeOpacitySetting(opacity);
}

function getGlassOpacity(tag: string) {
    let opacity = attributes.getAttribute(tag, 'glassOpacity', undefined);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('glassOpacity');
    }
    if (opacity === undefined) {
        opacity = getOpacity(tag);
    }
    return normalizeOpacitySetting(opacity);
}

function getGlassBorderOpacity(tag: string) {
    let opacity = attributes.getAttribute(tag, 'glassBorderOpacity', undefined);
    if (opacity === undefined) {
        opacity = vscode.workspace.getConfiguration('taskvision.highlights').get('glassBorderOpacity');
    }
    return normalizeOpacitySetting(opacity);
}

function getRulerOpacity(tag: string) {
    let opacity = attributes.getAttribute(tag, 'rulerOpacity', undefined);
    if (opacity === undefined) {
        opacity = getGlassOpacity(tag);
    }
    return opacity;
}

function getBorderRadius(tag: string) {
    let borderRadius = attributes.getBorderRadius(tag);
    if (borderRadius === undefined) {
        borderRadius = vscode.workspace.getConfiguration('taskvision.highlights').get<string>('borderRadius');
    }
    return borderRadius;
}

function getFontStyle(tag: string) {
    return attributes.getAttribute(tag, 'fontStyle', vscode.workspace.getConfiguration('taskvision.highlights').get<string>('fontStyle'));
}

function getFontWeight(tag: string) {
    return attributes.getAttribute(tag, 'fontWeight', vscode.workspace.getConfiguration('taskvision.highlights').get<string>('fontWeight'));
}

function getTextDecoration(tag: string) {
    return attributes.getAttribute(tag, 'textDecoration', vscode.workspace.getConfiguration('taskvision.highlights').get<string>('textDecoration'));
}

function showInGutter(tag: string) {
    return attributes.getAttribute(tag, 'gutterIcon', true);
}

function getRangeType(tag: string, channelAttribute: "colorType" | "glowType" | "glassType" | "fontType", defaultValue: string) {
    return rangeResolver.normaliseRangeType(attributes.getAttribute(tag, channelAttribute, defaultValue));
}

function getColorType(tag: string) {
    return getRangeType(tag, 'colorType', 'text');
}

function getGlowType(tag: string) {
    return getRangeType(tag, 'glowType', 'tag');
}

function getGlassType(tag: string) {
    return getRangeType(tag, 'glassType', 'tag');
}

function getFontType(tag: string) {
    return getRangeType(tag, 'fontType', 'tag');
}

function editorId(editor: vscode.TextEditor) {
    let id = '';
    if (editor.document) {
        id = JSON.stringify(editor.document.uri);
    }
    if (editor.viewColumn) {
        id += editor.viewColumn;
    }
    return id;
}

function resolveThemeColour(raw: string | undefined, fallbackThemeColorId: string) {
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

function resolveSchemeBaseColor(tag: string, foregroundColor: string | vscode.ThemeColor | undefined, backgroundColor: string | vscode.ThemeColor | undefined) {
    let iconColour = attributes.getAttribute(tag, 'iconColor', undefined, true);
    if (iconColour === undefined) {
        iconColour = attributes.getAttribute(tag, 'iconColour', undefined, true);
    }
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
        const upper = foregroundColor.toUpperCase();
        if (upper !== '#FFFFFF' && upper !== '#FFF' && upper !== '#000000' && upper !== '#000') {
            return foregroundColor;
        }
    }

    return undefined;
}

function hasHexAlpha(colour: unknown) {
    if (!colour || typeof colour !== 'string' || colour.indexOf('#') !== 0) {
        return false;
    }

    const hex = colour.substring(1).split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    return hex.length === 4 || hex.length === 8;
}

function createGlassBorder(colour: string | undefined, opacity: number) {
    if (colour === undefined) {
        return undefined;
    }
    return '1px solid ' + applyOpacity(colour, opacity);
}

function createAcrylicTextDecoration(colour?: string) {
    const accent = colour !== undefined ? colour : '#42A5F5';
    return 'underline; text-decoration-color: ' + applyOpacity(accent, 45) + '; text-decoration-thickness: 2px; text-underline-offset: 3px';
}

function resolveGlassAccentColor(tag: string, backgroundColor?: string) {
    let iconColour = attributes.getAttribute(tag, 'iconColor', undefined, true);
    if (iconColour === undefined) {
        iconColour = attributes.getAttribute(tag, 'iconColour', undefined, true);
    }
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

    return undefined;
}

function getTagPlan(tag: string) {
    if (tagPlanCache[tag]) {
        return tagPlanCache[tag];
    }

    const foregroundColour = attributes.getForeground(tag);
    const backgroundColour = attributes.getBackground(tag);

    const foregroundOpacity = getForegroundOpacity(tag);
    const glowOpacity = getGlowOpacity(tag);
    const glassOpacity = getGlassOpacity(tag);
    const glassBorderOpacity = getGlassBorderOpacity(tag);

    let lightForegroundColour = resolveThemeColour(foregroundColour, 'editor.foreground');
    let darkForegroundColour = resolveThemeColour(foregroundColour, 'editor.foreground');
    let lightBackgroundColour = resolveThemeColour(backgroundColour, 'editor.background');
    let darkBackgroundColour = resolveThemeColour(backgroundColour, 'editor.background');

    const schemeName = attributes.getScheme(tag);
    const hasGlass = schemeName === 'glass' || schemeName === 'neon+glass';
    const bgHasAlpha = hasHexAlpha(backgroundColour);
    const hasAlphaOnlyGlass = !hasGlass && bgHasAlpha;
    const finalGlassOpacity = glassOpacity !== undefined ? glassOpacity : ((hasGlass && !bgHasAlpha) ? 15 : undefined);

    if (lightBackgroundColour !== undefined) {
        if (finalGlassOpacity !== undefined) {
            lightBackgroundColour = applyOpacity(lightBackgroundColour, finalGlassOpacity);
        } else if (!bgHasAlpha) {
            lightBackgroundColour = undefined;
        }
    }
    if (darkBackgroundColour !== undefined) {
        if (finalGlassOpacity !== undefined) {
            darkBackgroundColour = applyOpacity(darkBackgroundColour, finalGlassOpacity);
        } else if (!bgHasAlpha) {
            darkBackgroundColour = undefined;
        }
    }

    if (lightForegroundColour === undefined && utils.isHexColour(lightBackgroundColour)) {
        lightForegroundColour = utils.complementaryColour(String(lightBackgroundColour));
    }
    if (darkForegroundColour === undefined && utils.isHexColour(darkBackgroundColour)) {
        darkForegroundColour = utils.complementaryColour(String(darkBackgroundColour));
    }

    const fontWeight = getFontWeight(tag);
    const fontStyle = getFontStyle(tag);
    let textDecoration = getTextDecoration(tag);

    const baseColor = resolveSchemeBaseColor(tag, foregroundColour, backgroundColour);
    if (hasGlass && textDecoration === undefined) {
        textDecoration = createAcrylicTextDecoration(baseColor);
    }
    const schemePreset = schemes.getPreset(schemeName, baseColor, baseColor, {
        glowOpacity: glowOpacity,
        glassOpacity: finalGlassOpacity,
        glassBorderOpacity: glassBorderOpacity
    });

    if (schemeName && foregroundColour === undefined) {
        lightForegroundColour = schemePreset.lightColor;
        darkForegroundColour = schemePreset.darkColor;
    }

    if (foregroundOpacity !== undefined) {
        if (lightForegroundColour !== undefined) {
            lightForegroundColour = applyOpacity(lightForegroundColour, foregroundOpacity);
        }
        if (darkForegroundColour !== undefined) {
            darkForegroundColour = applyOpacity(darkForegroundColour, foregroundOpacity);
        }
    }

    const channels = highlightChannels.buildChannels({
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

    if (hasAlphaOnlyGlass && glassBorderOpacity !== undefined) {
        const borderOpacity = glassBorderOpacity !== undefined ? glassBorderOpacity : 30;
        const glassAccentColor = resolveGlassAccentColor(tag, backgroundColour);
        const lightBorder = createGlassBorder(glassAccentColor, borderOpacity);
        const darkBorder = createGlassBorder(glassAccentColor, borderOpacity);

        if (lightBorder !== undefined) {
            channels.glass.style.light.border = lightBorder;
        }
        if (darkBorder !== undefined) {
            channels.glass.style.dark.border = darkBorder;
        }
    }

    let lane: string | number | undefined = getRulerLane(tag);
    if (isNaN(parseInt(String(lane), 10))) {
        lane = lane !== undefined ? lanes[String(lane).toLowerCase()] : undefined;
    }

    let rulerColour;
    if (lane !== undefined) {
        rulerColour = getRulerColour(tag, darkBackgroundColour ? darkBackgroundColour : 'editor.foreground');
        const rulerOpacity = getRulerOpacity(tag);

        if (utils.isThemeColour(rulerColour)) {
            rulerColour = new vscode.ThemeColor(String(rulerColour));
        } else if (rulerOpacity !== undefined) {
            rulerColour = applyOpacity(rulerColour || 'editor.foreground', Number(rulerOpacity));
        }
    }

    const icon = showInGutter(tag) ? icons.getIcon(context, tag, debug) : undefined;
    const meta: TagPlan['meta'] = {
        lane: lane === undefined ? undefined : Number(lane),
        rulerColour: rulerColour,
        gutterIconPath: icon && 'dark' in icon ? icon.dark : undefined
    };

    const plan: TagPlan = {
        tag: tag,
        channels: channels,
        meta: meta
    };

    tagPlanCache[tag] = plan;
    return plan;
}

function applyGlassTheme(target: ThemeStyle, source: ThemeStyle, borderRadius?: string) {
    if (source.backgroundColor !== undefined) {
        target.backgroundColor = source.backgroundColor;
    }
    if (source.border !== undefined) {
        target.border = source.border;
    }

    // Keep borderRadius co-located with the border/background it rounds instead of
    // leaving it on the decoration's base rule.
    if (borderRadius !== undefined && (target.border !== undefined || target.backgroundColor !== undefined)) {
        target.borderRadius = borderRadius;
    }

    // Cursor (and VS Code, see microsoft/vscode#175819 & wayou/vscode-todo-highlight#434)
    // paints a fallback gray box when a decoration carries a border or borderRadius
    // without an explicit, co-located backgroundColor. Guarantee a transparent
    // background in that case so the glass box stays see-through in every fork.
    if ((target.border !== undefined || target.borderRadius !== undefined) && target.backgroundColor === undefined) {
        target.backgroundColor = 'transparent';
    }
}

function buildGlassDecorationOptions(plan: TagPlan) {
    const glassChannel = plan.channels.glass;
    const lightStyle = glassChannel.style.light || {};
    const darkStyle = glassChannel.style.dark || {};
    const borderRadius = glassChannel.style.borderRadius;

    const options: vscode.DecorationRenderOptions & {light: ThemeStyle; dark: ThemeStyle} = {
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        isWholeLine: glassChannel.rangeType === 'whole-line',
        light: {},
        dark: {}
    };

    applyGlassTheme(options.light, lightStyle, borderRadius);
    applyGlassTheme(options.dark, darkStyle, borderRadius);

    return options;
}

function buildMetaDecorationOptions(plan: TagPlan) {
    const options: vscode.DecorationRenderOptions & {light: ThemeStyle; dark: ThemeStyle} = {
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

function buildTextDecorationOptions(style: ThemedStyle) {
    return {
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        isWholeLine: false,
        light: Object.assign({}, style.light),
        dark: Object.assign({}, style.dark)
    };
}

function getDecoration(cacheKey: string, factory: () => vscode.DecorationRenderOptions) {
    if (!decorationCache[cacheKey]) {
        decorationCache[cacheKey] = vscode.window.createTextEditorDecorationType(factory());
    }
    return decorationCache[cacheKey];
}

function getGlassDecoration(tag: string, plan: TagPlan) {
    return getDecoration('glass:' + tag, function () {
        return buildGlassDecorationOptions(plan);
    });
}

function getMetaDecoration(tag: string, plan: TagPlan) {
    return getDecoration('meta:' + tag, function () {
        return buildMetaDecorationOptions(plan);
    });
}

function getCachedTextDecoration(tag: string, styleHash: string, style: ThemedStyle) {
    return getDecoration('text:' + tag + ':' + styleHash, function () {
        return buildTextDecorationOptions(style);
    });
}

function getSubTagDecoration(tag: string, plan: TagPlan) {
    const style = styleComposer.composeTextStyle({
        color: plan.channels.color.enabled ? plan.channels.color.style : undefined,
        font: plan.channels.font.enabled ? plan.channels.font.style : undefined,
        glow: plan.channels.glow.enabled ? plan.channels.glow.style : undefined
    });

    const light = Object.assign({}, style.light);
    const dark = Object.assign({}, style.dark);

    if (plan.channels.glass.enabled) {
        if (plan.channels.glass.style.light && plan.channels.glass.style.light.backgroundColor !== undefined) {
            light.backgroundColor = plan.channels.glass.style.light.backgroundColor;
        }
        if (plan.channels.glass.style.dark && plan.channels.glass.style.dark.backgroundColor !== undefined) {
            dark.backgroundColor = plan.channels.glass.style.dark.backgroundColor;
        }
    }

    const styleHash = styleComposer.stableStyleHash({ light: light, dark: dark });

    return getDecoration('subtag:' + tag + ':' + styleHash, function () {
        return {
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            isWholeLine: false,
            light: light,
            dark: dark
        };
    });
}

function toRange(document: vscode.TextDocument, startOffset: number | undefined, endOffset: number | undefined) {
    if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset <= startOffset) {
        return undefined;
    }

    const start = document.positionAt(startOffset);
    const end = document.positionAt(endOffset);
    if (end.isBeforeOrEqual(start)) {
        return undefined;
    }

    return new vscode.Range(start, end);
}

function toDecorations(document: vscode.TextDocument, ranges: OffsetRange[]) {
    return ranges.map(function (range) {
        const r = toRange(document, range.start, range.end);
        return r ? { range: r } : undefined;
    }).filter(present);
}

function isCovered(rangeList: OffsetRange[], start: number, end: number) {
    return rangeList.some(function (range) {
        return range.start <= start && range.end >= end;
    });
}

function hasEffectiveTextStyle(style: ThemedStyle) {
    function hasThemeStyle(theme: ThemeStyle) {
        return theme && (
            theme.color !== undefined ||
            theme.fontWeight !== undefined ||
            theme.fontStyle !== undefined ||
            theme.textDecoration !== undefined
        );
    }

    return hasThemeStyle(style.light) || hasThemeStyle(style.dark);
}

function buildTextSegments(channelRanges: Record<string, OffsetRange[]>, channelStyles: TextChannels) {
    let boundaries: number[] = [];

    (['color', 'font', 'glow'] as const).forEach(function (kind) {
        (channelRanges[kind] || []).forEach(function (range) {
            boundaries.push(range.start);
            boundaries.push(range.end);
        });
    }); 

    boundaries = Array.from(new Set(boundaries)).sort(function (a, b) {
        return a - b;
    });

    const segments = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i];
        const end = boundaries[i + 1];
        if (end <= start) {
            continue;
        }

        const active = {
            color: isCovered(channelRanges.color || [], start, end),
            font: isCovered(channelRanges.font || [], start, end),
            glow: isCovered(channelRanges.glow || [], start, end)
        };

        if (!active.color && !active.font && !active.glow) {
            continue;
        }

        const style = styleComposer.composeTextStyle({
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

function channelUsesSubTag(plan: TagPlan) {
    return (['color', 'glow', 'glass', 'font'] as const).some(function (kind) {
        return plan.channels[kind].enabled && plan.channels[kind].rangeType === 'tag-and-subTag';
    });
}

function highlight(editor?: vscode.TextEditor) {
    trace('[TaskVision] highlight() called, editor: ' + (editor ? editor.document.fileName : 'null'));

    if (!editor) return;
    const activeEditor = editor;
    try {
        const documentGlassHighlights: Record<string, vscode.DecorationOptions[]> = {};
        const documentTextHighlights: Record<string, Record<string, vscode.DecorationOptions[]>> = {};
        const documentTextStyles: Record<string, Record<string, ThemedStyle>> = {};
        const documentMetaHighlights: Record<string, vscode.DecorationOptions[]> = {};
        const subTagHighlights: Record<string, vscode.DecorationOptions[]> = {};
        const customHighlight = config.customHighlight();

        if (!editor) {
            return;
        }

        const id = editorId(editor);

        if (decorations[id]) {
            decorations[id].forEach(function (decoration) {
                editor.setDecorations(decoration, []);
            });
        }
        decorations[id] = [];

        if (!vscode.workspace.getConfiguration('taskvision.highlights').get('enabled', true)) {
            return;
        }

        const text = editor.document.getText();
        const regex = utils.getRegexForEditorSearch(true);
        const subTagRegex = new RegExp(config.subTagRegex());
        const trackedTags = new Set<string>();

        let match;
        while ((match = regex.exec(text)) !== null) {
            let tag = match[0];
            let offsetStart = match.index;
            let offsetEnd = offsetStart + match[0].length;

            const extracted = utils.extractTag(match[0]);
            if (extracted.tag) {
                const lineForUpdate = editor.document.lineAt(editor.document.positionAt(match.index));
                utils.updateBeforeAndAfter(extracted, text.substring(offsetStart, editor.document.offsetAt(lineForUpdate.range.end)));
            }

            if (extracted.tag && extracted.tag.length > 0) {
                const tagGroup = config.tagGroup(extracted.tag);
                tag = tagGroup ? tagGroup : extracted.tag;
                offsetStart = match.index + (extracted.tagOffset || 0);
                offsetEnd = offsetStart + extracted.tag.length;
            } else {
                offsetStart += match[0].search(/\S|$/);
            }

            const plan = getTagPlan(tag);
            trackedTags.add(tag);

            const startPos = editor.document.positionAt(offsetStart);
            const line = editor.document.lineAt(startPos.line);
            const lineStartOffset = editor.document.offsetAt(new vscode.Position(startPos.line, 0));
            const lineEndOffset = editor.document.offsetAt(line.range.end);

            let commentEndOffset = lineEndOffset;
            const textFromTag = text.substring(offsetStart, lineEndOffset);
            const blockTerminators = ['*/', '-->', '}}'];
            let minIndex = -1;
            let terminatorLength = 0;

            blockTerminators.forEach(function (terminator) {
                const index = textFromTag.indexOf(terminator);
                if (index !== -1 && (minIndex === -1 || index < minIndex)) {
                    minIndex = index;
                    terminatorLength = terminator.length;
                }
            });

            if (minIndex !== -1) {
                commentEndOffset = offsetStart + minIndex + terminatorLength;
            }

            const commentStartOffset = match.index + (extracted.commentStart || 0);

            let subTagStartOffset;
            let subTagEndOffset;
            let subTag;

            const todoText = text.substring(offsetEnd, lineEndOffset);
            const subTagMatch = todoText.match(subTagRegex);
            if (subTagMatch !== null && subTagMatch.length > 1) {
                subTag = subTagMatch[1];
                const subTagOffset = todoText.indexOf(subTag);
                if (subTagOffset !== -1) {
                    subTagStartOffset = offsetEnd + subTagOffset;
                    subTagEndOffset = subTagStartOffset + subTag.length;

                    if (channelUsesSubTag(plan) && customHighlight[subTag] !== undefined) {
                        if (subTagHighlights[subTag] === undefined) {
                            subTagHighlights[subTag] = [];
                        }
                        const subTagRange = toRange(editor.document, subTagStartOffset, subTagEndOffset);
                        if (subTagRange) {
                            subTagHighlights[subTag].push({ range: subTagRange });
                        }
                    }
                }
            }

            const rangeContext = {
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
                const metaRange = toRange(editor.document, offsetStart, offsetEnd);
                if (metaRange) {
                    documentMetaHighlights[tag].push({ range: metaRange });
                }
            }

            if (plan.channels.glass.enabled) {
                const glassRanges = rangeResolver.resolveRangeOffsets(plan.channels.glass.rangeType, rangeContext);
                if (glassRanges.length > 0) {
                    if (documentGlassHighlights[tag] === undefined) {
                        documentGlassHighlights[tag] = [];
                    }
                    documentGlassHighlights[tag] = documentGlassHighlights[tag].concat(toDecorations(editor.document, glassRanges));
                }
            }

            const textChannelRanges = {
                color: plan.channels.color.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.color.rangeType, rangeContext) : [],
                font: plan.channels.font.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.font.rangeType, rangeContext) : [],
                glow: plan.channels.glow.enabled ? rangeResolver.resolveRangeOffsets(plan.channels.glow.rangeType, rangeContext) : []
            };

            const textSegments = buildTextSegments(textChannelRanges, {
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
                    const textRange = toRange(editor.document, segment.start, segment.end);
                    if (textRange) {
                        documentTextHighlights[tag][segment.styleHash].push({ range: textRange });
                        documentTextStyles[tag][segment.styleHash] = segment.style;
                    }
                });
            }
        }

        const applied = new Set<vscode.TextEditorDecorationType>();

        function applyDecoration(decoration: vscode.TextEditorDecorationType, ranges: vscode.DecorationOptions[]) {
            if (!decoration || !ranges || ranges.length === 0) {
                return;
            }

            if (!applied.has(decoration)) {
                applied.add(decoration);
                decorations[id].push(decoration);
            }

            activeEditor.setDecorations(decoration, ranges);
        }

        trackedTags.forEach(function (tag) {
            const plan = getTagPlan(tag);

            if (documentMetaHighlights[tag] && documentMetaHighlights[tag].length > 0) {
                applyDecoration(getMetaDecoration(tag, plan), documentMetaHighlights[tag]);
            }

            if (documentGlassHighlights[tag] && documentGlassHighlights[tag].length > 0 && plan.channels.glass.enabled) {
                applyDecoration(getGlassDecoration(tag, plan), documentGlassHighlights[tag]);
            }

            if (documentTextHighlights[tag]) {
                Object.keys(documentTextHighlights[tag]).forEach(function (styleHash) {
                    const style = documentTextStyles[tag][styleHash];
                    applyDecoration(
                        getCachedTextDecoration(tag, styleHash, style),
                        documentTextHighlights[tag][styleHash]
                    );
                });
            }
        });

        Object.keys(subTagHighlights).forEach(function (subTag) {
            const subPlan = getTagPlan(subTag);
            applyDecoration(getSubTagDecoration(subTag, subPlan), subTagHighlights[subTag]);
        });
    } catch (error) {
        console.error('[TaskVision] highlighting FAILED:', errorMessage(error), error instanceof Error ? error.stack : undefined);
        if (debug) {
            debug('highlighting failed: ' + error);
        }
    }
}

function triggerHighlight(editor?: vscode.TextEditor) {
    trace('[TaskVision] triggerHighlight() called, editor: ' + (editor ? editor.document.fileName : 'null'));
    if (editor) {
        const id = editorId(editor);

        if (highlightTimer[id]) {
            clearTimeout(highlightTimer[id]);
        }
        highlightTimer[id] = setTimeout(highlight, vscode.workspace.getConfiguration('taskvision.highlights').get('highlightDelay'), editor);
    }
}

export { init, triggerHighlight, clearCache, getTagPlan as _getTagPlan, buildTextSegments as _buildTextSegments, buildGlassDecorationOptions as _buildGlassDecorationOptions };
