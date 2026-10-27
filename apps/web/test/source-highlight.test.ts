import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Annotation } from '../src/domain';
import manifest from '../../../package.json';
import { CodeSource } from '../src/components/CodeSource';
import { highlightSource, resolveHighlightStyle } from '../src/services/sourceHighlight';

test('TaskVision colors and TODO channels come from the actual extension defaults', () => {
  const properties = Object.assign(
    {},
    ...manifest.contributes.configuration.map((g) => g.properties),
  );
  const custom = properties['taskvision.highlights.customHighlight'].default;
  for (const tag of ['CORE', 'REUSE', 'INTENT', 'REVIEW']) {
    const plan = resolveHighlightStyle(tag, 'dark');
    assert.equal(plan.color.style.color, custom[tag].foreground);
    assert.equal(plan.color.scope, 'text');
    assert.equal(plan.font.style.fontWeight, 'bold');
    assert.equal(plan.font.scope, 'tag');
    assert.deepEqual(plan.glow.style, {});
    assert.deepEqual(plan.glass.style, {});
  }
  const todo = resolveHighlightStyle('TODO', 'dark');
  assert.equal(todo.color.style.color, custom.TODO.iconColour);
  assert.match(String(todo.glow.style.textShadow), /rgba\(66, 165, 245, 0.45\)/);
  assert.equal(todo.glass.style.backgroundColor, 'rgba(66, 165, 245, 0.15)');
});

test('grammar syntax survives decoration and tag words inside strings stay strings', async () => {
  const text =
    'const message = "CORE: <script>alert(1)</script>";\n// CORE: shared entry\nconst n = 42;';
  const result = await highlightSource(text, 'src/example.ts', 'dark');
  assert.equal(result.mode, 'textmate');
  assert.equal(result.language, 'typescript');
  assert.equal(
    result.lines.map((line) => line.tokens.map((t) => t.text).join('')).join('\n'),
    text,
  );
  assert.ok(result.lines[0].tokens.some((t) => t.text.includes('const') && t.style.color));
  assert.ok(result.lines[0].tokens.every((t) => !t.tag));
  const core = result.lines[1].tokens.find((t) => t.tag === 'CORE');
  assert.equal(core?.style.color, '#60A5FA');
  assert.equal(core?.style.fontWeight, 'bold');
  assert.ok(
    result.lines[1].tokens.some(
      (t) => t.text.includes('shared entry') && t.style.color === '#60A5FA',
    ),
  );
  assert.ok(result.lines[2].tokens.every((t) => !t.tag));
  assert.ok(new Set(result.lines.flatMap((l) => l.tokens.map((t) => t.style.color))).size >= 4);
});

test('multiline comments, embedded HTML, Python and Rust use real comment tokens', async () => {
  for (const [path, text] of [
    ['a.ts', '/*\n * REUSE: shared\n */\nconst s = `REUSE: string`;'],
    ['a.py', '# INTENT: purpose\ns = "INTENT: string"'],
    ['a.rs', '// REVIEW: inspect\nlet s = "REVIEW: string";'],
    ['a.html', '<!-- CORE: entry -->\n<div title="CORE: string">CORE</div>'],
    ['a.css', '/* TODO: style */\na { content: "TODO: string"; color: red; }'],
  ]) {
    const result = await highlightSource(text, path, 'light');
    assert.equal(result.mode, 'textmate', path);
    assert.ok(
      result.lines.some((l) => l.tokens.some((t) => t.tag)),
      path,
    );
    assert.ok(
      result.lines.at(-1)?.tokens.every((t) => !t.tag),
      path,
    );
  }
});

test('unknown grammar and long-line fallback preserve every character without inventing tags', async () => {
  for (const [path, text] of [
    ['unknown.unregistered', 'CORE: <img src=x onerror=alert(1)>\n\n'],
    ['a.json', '{ "CORE": "REUSE", "number": 42 }'],
    ['a.ts', `const text = "${'CORE '.repeat(5000)}";`],
  ]) {
    const result = await highlightSource(text, path, 'dark');
    assert.equal(result.lines.map((l) => l.tokens.map((t) => t.text).join('')).join('\n'), text);
    assert.ok(
      result.lines.every((l) => l.tokens.every((t) => !t.tag)),
      path,
    );
    if (path.endsWith('unregistered')) {
      assert.equal(result.mode, 'plain');
      assert.ok(result.reason);
    }
  }
});

test('comment boundaries and literal custom tag patterns cannot decorate executable source or strings', async () => {
  const text =
    '/* CORE: entry */ const s = "// REUSE: text"; const r = /TODO|INTENT/;\n// (a+)+: literal custom tag\n// COREFERENCE is a different word';
  const source = await highlightSource(text, 'a.ts', 'dark', {
    customHighlight: { '(a+)+': { foreground: '#123456', colorType: 'text' } },
  });
  assert.equal(source.mode, 'textmate');
  assert.ok(source.lines[0].tokens.some((t) => t.tag === 'CORE'));
  assert.ok(
    source.lines[0].tokens
      .filter((t) => /REUSE|TODO|INTENT/.test(t.text))
      .every((t) => !t.tag && t.style.color !== '#60A5FA'),
  );
  assert.ok(source.lines[1].tokens.some((t) => t.tag === '(a+)+' && t.style.color === '#123456'));
  assert.ok(source.lines[2].tokens.every((t) => !t.tag));
});

test('settings override channels, scopes, opacity and theme while denying CSS payloads', async () => {
  const settings = {
    customHighlight: {
      CORE: {
        foreground: '#123456',
        colorType: 'tag',
        glassType: 'whole-line',
        background: '#abcdef',
        glassOpacity: 30,
        fontStyle: 'italic',
        fontWeight: '600',
        fontType: 'text',
      },
      CUSTOM: { foreground: '#abcdef', colorType: 'text', scheme: 'neon' },
    },
  };
  const result = await highlightSource(
    '// CORE: shared\n// CUSTOM: extra\n"CUSTOM: string"',
    'a.js',
    'light',
    settings,
  );
  assert.equal(result.lines[0].style.backgroundColor, 'rgba(171, 205, 239, 0.3)');
  const tag = result.lines[0].tokens.find((t) => t.tag === 'CORE');
  assert.equal(tag?.style.color, '#123456');
  assert.ok(
    result.lines[0].tokens.some(
      (t) =>
        t.text.includes('shared') && t.style.fontStyle === 'italic' && t.style.color !== '#123456',
    ),
  );
  assert.ok(result.lines[1].tokens.some((t) => t.tag === 'CUSTOM'));
  assert.ok(result.lines[2].tokens.every((t) => !t.tag));
  const unsafe = resolveHighlightStyle('CORE', 'dark', {
    customHighlight: {
      CORE: {
        foreground: 'url(https://evil.invalid)',
        background: 'var(--remote)',
        fontWeight: 'bold; background: url(x)',
        borderRadius: 'url(x)',
        textDecoration: 'underline; color: red',
      },
    },
  });
  assert.equal(unsafe.color.style.color, '#60A5FA');
  assert.equal(unsafe.font.style.fontWeight, undefined);
  assert.equal(unsafe.font.style.textDecoration, undefined);
});

test('disabled decorations and theme changes retain syntax and source text', async () => {
  const text = '// CORE: entry\nconst n = 42;';
  const dark = await highlightSource(text, 'a.ts', 'dark', { enabled: false });
  const light = await highlightSource(text, 'a.ts', 'light');
  assert.ok(dark.lines.every((l) => l.tokens.every((t) => !t.tag)));
  assert.notEqual(dark.background, light.background);
  assert.notEqual(dark.foreground, light.foreground);
});

test('CRLF files retain syntax, annotation colors, blank lines and every source character', async () => {
  const text = '// CORE: entry\r\n\r\nconst answer = 42;\r\n';
  const source = await highlightSource(text, 'a.ts', 'dark');
  assert.equal(source.mode, 'textmate');
  assert.equal(source.lines.map((l) => l.tokens.map((t) => t.text).join('')).join('\n'), text);
  assert.ok(source.lines[0].tokens.some((t) => t.tag === 'CORE'));
  assert.ok(source.lines[2].tokens.some((t) => t.text === '42' && t.style.color));
});

test('concurrent language and theme requests can be reused without mixing results', async () => {
  const cases = [
    ['a.tsx', '// CORE: entry\nexport const A = () => <div>Hello</div>;'],
    ['a.jsx', '// REUSE: component\nexport const A = () => <div>Hello</div>;'],
    ['a.jsonc', '// INTENT: configuration\n{"answer":42}'],
    ['a.go', '// REVIEW: boundary\npackage main'],
    ['a.cpp', '// TODO: inspect\nint main() {return 0;}'],
  ];
  await Promise.all(
    cases.flatMap(([path, text]) =>
      (['light', 'dark'] as const).map(async (theme) => {
        const first = await highlightSource(text, path, theme);
        const second = await highlightSource(text, path, theme);
        assert.equal(first.mode, 'textmate', path);
        assert.deepEqual(second, first);
        assert.ok(
          first.lines[0].tokens.some((t) => t.tag),
          path,
        );
        assert.equal(first.lines.map((l) => l.tokens.map((t) => t.text).join('')).join('\n'), text);
      }),
    ),
  );
});

test('read-only source renders hostile markup as React text, with line and knowledge controls', () => {
  const annotation: Annotation = {
    id: 'core.entry',
    tag: 'CORE',
    summary: 'Entry point',
    body: '',
    path: 'a.ts',
    line: 2,
    endLine: 2,
    origin: 'source',
    author: '',
    status: 'active',
    revision: 1,
    fileHash: null,
    freshness: 'current',
  };
  const html = renderToStaticMarkup(
    createElement(CodeSource, {
      text: '<img src=x onerror=alert(1)>\n// CORE: entry',
      path: 'a.ts',
      selectedLine: 2,
      annotations: [annotation],
      theme: 'dark',
      onSelect: () => {},
      onKnowledge: () => {},
    }),
  );
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('selected-line'));
  assert.ok(html.includes('第 2 行'));
  assert.ok(html.includes('查看第 2 行知识'));
  assert.ok(html.includes('Entry point'));
  assert.ok(html.includes('TextMate'));
  assert.ok(html.includes('ThemeColor'));
});

test('light annotation body colors meet text contrast without changing dark palette', async () => {
  const tags = ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO'];
  const source = tags.map((tag) => '// ' + tag + ': clear original intent').join('\n');
  const light = await highlightSource(source, 'a.ts', 'light');
  const dark = await highlightSource(source, 'a.ts', 'dark');
  const contrast = (hex: string): number => {
    assert.match(hex, /^#[0-9A-F]{6}$/i);
    const channels = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 1.05 / (0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]! + 0.05);
  };
  for (const [index, tag] of tags.entries()) {
    const colored = light.lines[index]!.tokens.find((token) =>
      token.text.includes('clear original intent'),
    );
    assert.ok(colored?.style.color, tag);
    assert.ok(contrast(colored.style.color as string) >= 4.5, tag + ' legible');
    const original = resolveHighlightStyle(tag, 'dark').color.style.color;
    const darkToken = dark.lines[index]!.tokens.find((token) =>
      token.text.includes('clear original intent'),
    );
    assert.equal(darkToken?.style.color, original, tag + ' dark color unchanged');
  }
});
