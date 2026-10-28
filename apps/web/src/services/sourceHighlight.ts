import type { CSSProperties } from 'react';
import type { HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core';
import manifest from '../../../../package.json';
import { resolveRangeOffsets, type RangeContext } from '../../../../src/rangeResolver';

export type SourceTheme = 'dark' | 'light';
type HighlightRule = Record<string, unknown>;
export interface SourceHighlightSettings {
  enabled?: boolean;
  customHighlight?: Record<string, HighlightRule>;
  defaultHighlight?: HighlightRule;
  [key: string]: unknown;
}
export interface SourceToken {
  text: string;
  style: CSSProperties;
  tag?: string;
}
export interface SourceLine {
  text: string;
  tokens: SourceToken[];
  style: CSSProperties;
}
export interface HighlightedSource {
  language: string;
  mode: 'textmate' | 'plain';
  reason?: string;
  background: string;
  foreground: string;
  lines: SourceLine[];
}

// Build-time manifest import: the Web defaults follow the extension's actual rules.
const configuration = Object.assign(
  {},
  ...manifest.contributes.configuration.map((g) => g.properties),
) as Record<string, { default?: unknown }>;
const defaultRule = configuration['taskvision.highlights.defaultHighlight']
  .default as HighlightRule;
const customRules = configuration['taskvision.highlights.customHighlight'].default as Record<
  string,
  HighlightRule
>;
const languageLoaders: Record<string, () => Promise<{ default: LanguageRegistration[] }>> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
};
const extensions: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  pyi: 'python',
  json: 'json',
  jsonc: 'jsonc',
  rs: 'rust',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  svelte: 'svelte',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  sql: 'sql',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
};
// Concurrent loadLanguage/loadTheme mutates Shiki's registry. A shared core
// caused inconsistent first-pass grammar tokens under concurrent requests.
// Cache separate cores per language and theme to keep the result deterministic.
const loaded = new Map<string, Promise<HighlighterCore>>();
// Shiki's JS regex engine resolves embedded grammar dependencies lazily.
// Even separate cores can see a cold-registry race when multiple languages
// initialize in the same event-loop turn. Serialize ONLY initialization;
// later tokenization is synchronous and can use the cached cores freely.
let initializationTail: Promise<void> = Promise.resolve();
function highlighter(language: string, theme: SourceTheme): Promise<HighlighterCore> {
  const key = language + ':' + theme;
  const cached = loaded.get(key);
  if (cached) return cached;
  const pending = initializationTail
    .then(() => Promise.all([import('shiki/core'), import('shiki/engine/javascript')]))
    .then(async ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) => {
      const instance = await createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
      await instance.loadLanguage(languageLoaders[language]());
      await instance.loadTheme(
        theme === 'dark'
          ? import('shiki/themes/dark-plus.mjs')
          : import('shiki/themes/light-plus.mjs'),
      );
      // TextMate/Oniguruma can defer embedded token scopes until the first
      // codeToTokens pass. Pre-warm this isolated language/theme instance
      // before revealing user source so a cold comment is never silently
      // treated as executable syntax merely because grammar setup raced.
      const warmup =
        language === 'python' || language === 'shellscript' || language === 'yaml'
          ? '# CORE: warming comment scope\nvalue = 1'
          : language === 'html' ||
              language === 'vue' ||
              language === 'svelte' ||
              language === 'markdown'
            ? '<!-- CORE: warming comment scope -->\n<div>sample</div>'
            : language === 'cpp' || language === 'c'
              ? '// CORE: warming comment scope\nint main() {return 0;}\n#include <stdio.h>'
              : '// CORE: warming comment scope\nconst value = 1;';
      // Code scopes and embedded regex patterns may compile on first use.
      // Prime both comment and executable syntax before exposing real source.
      for (let pass = 0; pass < 2; pass++) {
        instance.codeToTokens(warmup, {
          lang: language,
          theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
          includeExplanation: 'tokenType',
          tokenizeMaxLineLength: 10000,
          tokenizeTimeLimit: 1500,
        });
      }
      return instance;
    })
    .catch((error: unknown) => {
      loaded.delete(key);
      throw error;
    });
  initializationTail = pending.then(
    () => undefined,
    () => undefined,
  );
  loaded.set(key, pending);
  return pending;
}

// Overrides are read-only configuration, never arbitrary CSS or HTML.
function color(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (
    /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+/-]+\)$/i.test(value) ||
    /^(?:transparent|black|white|red|orange|yellow|green|blue|indigo|violet|gray|grey|purple|pink|cyan|magenta)$/i.test(
      value,
    )
  )
    return value;
  return undefined;
}
/**
 * VS Code's built-in TaskVision tag colors are tuned for dark editors.
 * Preserve hue and exact dark palette; for a white source canvas only,
 * darken otherwise faint six-digit hex foregrounds to contrast >= 4.5:1.
 */
function readableLightForeground(value: string | undefined): string | undefined {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return value;
  const initial = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const contrast = (rgb: number[]): number => {
    const channels = rgb.map((n) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    return 1.05 / (luminance + 0.05);
  };
  if (contrast(initial) >= 4.5) return value;
  let adjusted = initial;
  for (let scale = 0.98; scale >= 0; scale -= 0.02) {
    adjusted = initial.map((n) => Math.round(n * scale));
    if (contrast(adjusted) >= 4.5) break;
  }
  return (
    '#' +
    adjusted
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function opacity(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1 ? n / 100 : n)) : fallback;
}
function alpha(value: string | undefined, amount: number): string | undefined {
  if (!value?.startsWith('#') || amount === 1) return value;
  const hex = value.slice(1);
  const full =
    hex.length < 5
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, ${amount})`;
}
function choice(value: unknown, allowed: string[]): string | undefined {
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
}
interface Channel {
  scope: string;
  style: CSSProperties;
}
type HighlightPlan = Record<'color' | 'glow' | 'glass' | 'font', Channel>;

export function resolveHighlightStyle(
  tag: string,
  theme: SourceTheme,
  settings?: SourceHighlightSettings,
): HighlightPlan {
  const rule: HighlightRule = {
    ...defaultRule,
    ...settings?.defaultHighlight,
    ...(Object.hasOwn(customRules, tag) ? customRules[tag] : {}),
    ...(settings?.customHighlight && Object.hasOwn(settings.customHighlight, tag)
      ? settings.customHighlight[tag]
      : {}),
  };
  const value = (key: string): unknown =>
    rule[key] ?? settings?.[key] ?? configuration[`taskvision.highlights.${key}`]?.default;
  const themed = (key: string): unknown => {
    const variants = rule[theme];
    return typeof variants === 'object' && variants !== null && key in variants
      ? (variants as HighlightRule)[key]
      : value(key);
  };
  const scheme = choice(value('scheme'), ['neon', 'glass', 'neon+glass']);
  const foreground = color(themed('foreground'));
  const background = color(themed('background'));
  // Same accent precedence as highlights.ts, including tag-specific icon color.
  const tagRule = { ...customRules[tag], ...settings?.customHighlight?.[tag] };
  const icon = color(tagRule.iconColor ?? tagRule.iconColour);
  const accent = icon ?? background ?? foreground ?? color(defaultRule.background);
  const glass = scheme === 'glass' || scheme === 'neon+glass';
  const glow = scheme === 'neon' || scheme === 'neon+glass';
  const scopes = [
    'tag',
    'text',
    'tag-and-comment',
    'text-and-comment',
    'tag-and-subTag',
    'line',
    'whole-line',
    'none',
  ];
  const channel = (key: string, fallback: string, style: CSSProperties): Channel => {
    const scope = choice(value(key), scopes) ?? fallback;
    return { scope, style: settings?.enabled === false || scope === 'none' ? {} : style };
  };
  const font: CSSProperties = {};
  const weight = themed('fontWeight');
  if (typeof weight === 'number' && Number.isFinite(weight) && weight >= 1 && weight <= 1000)
    font.fontWeight = weight;
  else if (typeof weight === 'string' && /^(?:normal|bold|bolder|lighter|[1-9]00)$/.test(weight))
    font.fontWeight = weight;
  const fontStyle = choice(themed('fontStyle'), ['normal', 'italic', 'oblique']);
  if (fontStyle) font.fontStyle = fontStyle;
  const decoration = choice(themed('textDecoration'), [
    'none',
    'underline',
    'line-through',
    'overline',
    'underline line-through',
  ]);
  if (decoration) font.textDecoration = decoration;
  const glassStyle: CSSProperties = {};
  const glassAlpha = opacity(value('glassOpacity') ?? value('opacity'), glass ? 0.15 : 1);
  if (background && (glass || /^(?:#[\da-f]{4}|#[\da-f]{8})$/i.test(background)))
    glassStyle.backgroundColor = glassAlpha === 1 ? background : alpha(background, glassAlpha);
  if (glass) {
    glassStyle.backgroundColor ??= alpha(accent, glassAlpha);
    if (value('glassBorderOpacity') !== undefined)
      glassStyle.boxShadow = `inset 0 0 0 1px ${alpha(accent, opacity(value('glassBorderOpacity'), 0.3))}`;
    const radius = value('borderRadius');
    glassStyle.borderRadius =
      typeof radius === 'string' && /^\d{1,2}(?:\.\d+)?(?:px|em|rem|%)$/.test(radius)
        ? radius
        : '6px';
    if (value('textDecoration') === undefined)
      Object.assign(font, {
        textDecorationLine: 'underline',
        textDecorationColor: alpha(accent, 0.45),
        textDecorationThickness: '2px',
        textUnderlineOffset: '3px',
      });
  }
  const shadow = alpha(accent, opacity(value('glowOpacity'), 0.45));
  return {
    color: channel('colorType', 'text', {
      color: alpha(
        theme === 'light'
          ? readableLightForeground(foreground ?? (scheme ? accent : undefined))
          : (foreground ?? (scheme ? accent : undefined)),
        opacity(value('foregroundOpacity'), 1),
      ),
    }),
    glow: channel(
      'glowType',
      'tag',
      glow && shadow
        ? { textShadow: [5, 10, 15, 20, 30].map((n) => `0 0 ${n}px ${shadow}`).join(', ') }
        : {},
    ),
    glass: channel('glassType', 'tag', glassStyle),
    font: channel('fontType', 'tag', font),
  };
}

export function plainSource(
  text: string,
  theme: SourceTheme,
  reason = '正在加载语法…',
): HighlightedSource {
  return {
    language: 'text',
    mode: 'plain',
    reason,
    background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
    foreground: theme === 'dark' ? '#d4d4d4' : '#000000',
    lines: text
      .split('\n')
      .map((line) => ({ text: line, tokens: [{ text: line, style: {} }], style: {} })),
  };
}
function syntaxStyle(token: ThemedToken): CSSProperties {
  return {
    color: token.color,
    ...(token.fontStyle && token.fontStyle > 0
      ? {
          fontStyle: token.fontStyle & 1 ? 'italic' : undefined,
          fontWeight: token.fontStyle & 2 ? 'bold' : undefined,
          textDecoration: token.fontStyle & 4 ? 'underline' : undefined,
        }
      : {}),
  };
}
interface Decoration {
  start: number;
  end: number;
  style: CSSProperties;
  tag?: string;
}
function decorateLine(
  text: string,
  tokens: ThemedToken[],
  theme: SourceTheme,
  settings?: SourceHighlightSettings,
): SourceLine {
  const line: SourceLine = { text, tokens: [], style: {} };
  const comments: { start: number; end: number }[] = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === 1) {
      const previous = comments.at(-1);
      if (previous?.end === offset) previous.end += token.content.length;
      else comments.push({ start: offset, end: offset + token.content.length });
    }
    offset += token.content.length;
  }
  const decorations: Decoration[] = [];
  const tags = [
    ...new Set([...Object.keys(customRules), ...Object.keys(settings?.customHighlight ?? {})]),
  ]
    .filter((tag) => tag.length > 0 && tag.length <= 64)
    .slice(0, 128)
    .sort((a, b) => b.length - a.length)
    .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (settings?.enabled !== false && tags.length) {
    const matcher = new RegExp(`(?<![\\w])(${tags.join('|')})(?![\\w])`, 'g');
    for (const comment of comments) {
      for (const match of text.slice(comment.start, comment.end).matchAll(matcher)) {
        const tagStart = comment.start + match.index;
        const tagEnd = tagStart + match[0].length;
        const context: RangeContext = {
          tagStart,
          tagEnd,
          commentStart: comment.start,
          commentEnd: comment.end,
          lineStart: 0,
          lineEnd: text.length,
        };
        const subTag = text.slice(tagEnd, comment.end).match(/^\s*\(([^)]+)\)/);
        if (subTag) {
          context.subTagStart = tagEnd + subTag[0].indexOf(subTag[1]);
          context.subTagEnd = context.subTagStart + subTag[1].length;
        }
        const plan = resolveHighlightStyle(match[0], theme, settings);
        decorations.push({ start: tagStart, end: tagEnd, style: {}, tag: match[0] });
        for (const channel of Object.values(plan)) {
          if (channel.scope === 'whole-line') Object.assign(line.style, channel.style);
          // Reuse the extension's selection semantics. Whole-line also fills the row.
          for (const range of resolveRangeOffsets(channel.scope, context))
            decorations.push({ ...range, style: channel.style });
        }
      }
    }
  }
  offset = 0;
  for (const token of tokens) {
    const end = offset + token.content.length;
    const boundaries = [
      ...new Set([
        offset,
        end,
        ...decorations.flatMap((d) => [d.start, d.end]).filter((n) => n > offset && n < end),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const finish = boundaries[i + 1];
      const active = decorations.filter((d) => d.start <= start && d.end >= finish);
      line.tokens.push({
        text: text.slice(start, finish),
        style: Object.assign(syntaxStyle(token), ...active.map((d) => d.style)),
        tag: active.find((d) => d.tag)?.tag,
      });
    }
    offset = end;
  }
  return line;
}

export async function highlightSource(
  text: string,
  path: string,
  theme: SourceTheme = 'dark',
  settings?: SourceHighlightSettings,
): Promise<HighlightedSource> {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  const language = extensions[extension];
  if (!language || !Object.hasOwn(languageLoaders, language))
    return plainSource(text, theme, '未提供此文件的语法，显示纯文本。');
  try {
    const instance = await highlighter(language, theme);
    const result = instance.codeToTokens(text, {
      lang: language,
      theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
      includeExplanation: 'tokenType',
      tokenizeMaxLineLength: 10000,
      tokenizeTimeLimit: 1500,
    });
    const sourceLines = text.split('\n');
    let hasPlainLines = false;
    // Do not silently drop CRs, empty lines or any text if a grammar omits content.
    const lines = sourceLines.map((line, i) => {
      const tokens = result.tokens[i] ?? [];
      const body = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (body.length > 10000 || tokens.map((t) => t.content).join('') !== body) {
        hasPlainLines = true;
        return { text: line, tokens: [{ text: line, style: {} }], style: {} };
      }
      const decorated = decorateLine(body, tokens, theme, settings);
      return line === body
        ? decorated
        : {
            ...decorated,
            text: line,
            tokens: [...decorated.tokens, { text: '\r', style: {} }],
          };
    });
    const fallback = plainSource('', theme);
    return {
      language,
      mode: 'textmate',
      background: result.bg ?? fallback.background,
      foreground: result.fg ?? fallback.foreground,
      reason: hasPlainLines ? '部分超长行或无法分词的行显示纯文本。' : undefined,
      lines,
    };
  } catch {
    return plainSource(text, theme, '语法加载失败，显示纯文本；源码仍可选择和跳转。');
  }
}
