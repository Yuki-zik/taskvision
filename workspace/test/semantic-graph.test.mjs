import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { createWorkspace } = await import(
  process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href
);

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-semantic-graph-'));
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  const workspace = createWorkspace(root);
  t.after(() => {
    workspace.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, snapshot: () => workspace.dispatch('snapshot') };
}

test('AST dependencies carry exact kinds, source lines and specifiers without literal false positives', (t) => {
  const lines = [
    '// CORE: Real entry point',
    "import { value } from './dep.js';",
    "import type { Shape } from './dep.js';",
    "import { type Shape, type Other } from './dep.js';",
    "import { type Shape, value as runtime } from './dep.js';",
    "import './dep.js';",
    "export { value } from './dep.js';",
    "export * from './dep.js';",
    "export type { Shape } from './dep.js';",
    "export { type Shape, type Other } from './dep.js';",
    "const common = require('./dep.js');",
    "const lazy = import('./dep.js');",
    "import alias = require('./dep.js');",
    "import type TypeAlias = require('./dep.js');",
    "type Imported = import('./dep.js').Shape;",
    'const fakeString = "import \'./dep.js\'";',
    'const fakeTemplate = `',
    "import './dep.js';",
    "require('./dep.js');",
    '// REVIEW: Fake annotation inside a template',
    '`;',
    "// import './dep.js';",
    "/* require('./dep.js'); */",
    "const fakeRegex = /require\\(' .\\/dep.js'\\)/;",
    "object.require('./dep.js');",
    "const unknown = import('./' + name);",
    "import external from 'external-package';",
    "import missing from './missing.js';",
    '// REUSE: Real final comment',
  ];
  const { snapshot } = fixture(t, {
    'src/main.ts': lines.join('\r\n'),
    'src/dep.ts': 'export const value = 1; export interface Shape {} export type Other = Shape;\n',
  });
  const snap = snapshot();
  const expected = [
    [2, 'runtime-import', 'import-declaration'],
    [3, 'type-import', 'import-declaration'],
    [4, 'type-import', 'import-declaration'],
    [5, 'runtime-import', 'import-declaration'],
    [6, 'runtime-import', 'import-declaration'],
    [7, 're-export', 'export-declaration'],
    [8, 're-export', 'export-declaration'],
    [9, 'type-import', 'export-declaration-type-only'],
    [10, 'type-import', 'export-declaration-type-only'],
    [11, 'require', 'require'],
    [12, 'dynamic-import', 'dynamic-import'],
    [13, 'require', 'import-equals'],
    [14, 'type-import', 'import-equals'],
    [15, 'type-import', 'import-type'],
  ].map(([line, kind, provenance]) => ({
    from: 'src/main.ts',
    to: 'src/dep.ts',
    kind,
    provenance: 'typescript-ast-' + provenance,
    line,
    specifier: './dep.js',
  }));
  assert.deepEqual(snap.edges, expected);
  assert.deepEqual(
    snap.annotations.map(({ summary, line }) => ({ summary, line })),
    [
      { summary: 'Real entry point', line: 1 },
      { summary: 'Real final comment', line: 29 },
    ],
  );
});

test('empty, default and mixed bindings stay runtime; type exports and import types stay type-only', (t) => {
  const { snapshot } = fixture(t, {
    'entry.ts': [
      "import {} from './dep';",
      "import value, { type Shape } from './dep';",
      "export {} from './dep';",
      "export { type Shape, value } from './dep';",
      "export type * from './dep';",
      "export type * as types from './dep';",
      'const lazy = import(`./dep`);',
      'const common = require(`./dep`);',
      "type Module = typeof import('./dep');",
      'const templated = `literal ${import("./dep")} end`;',
      "import {\n  value as multiline\n} from './dep';",
    ].join('\n'),
    'dep.ts': 'export default 1; export const value = 1; export interface Shape {}\n',
  });
  assert.deepEqual(
    snapshot().edges.map(({ kind, line, specifier }) => ({ kind, line, specifier })),
    [
      { kind: 'runtime-import', line: 1, specifier: './dep' },
      { kind: 'runtime-import', line: 2, specifier: './dep' },
      { kind: 're-export', line: 3, specifier: './dep' },
      { kind: 're-export', line: 4, specifier: './dep' },
      { kind: 'type-import', line: 5, specifier: './dep' },
      { kind: 'type-import', line: 6, specifier: './dep' },
      { kind: 'dynamic-import', line: 7, specifier: './dep' },
      { kind: 'require', line: 8, specifier: './dep' },
      { kind: 'type-import', line: 9, specifier: './dep' },
      { kind: 'dynamic-import', line: 10, specifier: './dep' },
      { kind: 'runtime-import', line: 11, specifier: './dep' },
    ],
  );
});

test('unsupported-language references disclose lexical provenance and actual source lines', (t) => {
  const { snapshot } = fixture(t, {
    'entry.vue': "// CORE: Lexical entry\nimport './dep.js';\n// import './dep.js'\n",
    'dep.ts': 'export const value = 1;\n',
  });
  assert.deepEqual(snapshot().edges, [
    {
      from: 'entry.vue',
      to: 'dep.ts',
      kind: 'lexical-import',
      provenance: 'lexical-static-import',
      line: 2,
      specifier: './dep.js',
    },
  ]);
});

test('cached evidence refreshes after metadata-restored edits and target deletion', (t) => {
  const { root, snapshot } = fixture(t, {
    'entry.ts': "import { value } from './dep.js';\n",
    'dep.ts': 'export const value = 1;\n',
  });
  const initial = snapshot();
  assert.equal(initial.edges[0].kind, 'runtime-import');
  const cached = snapshot();
  assert.equal(cached.stats.readFiles, 0);
  assert.deepEqual(cached.edges, initial.edges);
  const entry = path.join(root, 'entry.ts');
  const stat = fs.statSync(entry);
  fs.writeFileSync(entry, "\nimport type { Shape } from './dep.js';\n");
  fs.utimesSync(entry, stat.atime, stat.mtime);
  const edited = snapshot();
  assert.equal(edited.stats.readFiles, 1);
  assert.equal(edited.edges[0].kind, 'type-import');
  assert.equal(edited.edges[0].line, 2);
  fs.rmSync(path.join(root, 'dep.ts'));
  assert.deepEqual(snapshot().edges, []);
});

test('only resolved repository files become edges, retaining emitted extension mappings', (t) => {
  const { root, snapshot } = fixture(t, {
    'src/entry.ts': [
      "import './module.mjs';",
      "import './module.cjs';",
      "import './folder';",
      "import '../outside-link.js';",
      "import '../.env';",
      "import '../../escape.js';",
      "import '/absolute.js';",
      "import 'external-package';",
    ].join('\n'),
    'src/module.mts': 'export {};\n',
    'src/module.cts': 'export {};\n',
    'src/folder/index.ts': 'export {};\n',
    '.env': 'SECRET=not-source\n',
  });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-graph-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'outside.js'), 'export {};\n');
  fs.symlinkSync(path.join(outside, 'outside.js'), path.join(root, 'outside-link.js'));
  const snap = snapshot();
  assert.deepEqual(
    snap.edges.map(({ to, line }) => ({ to, line })),
    [
      { to: 'src/module.mts', line: 1 },
      { to: 'src/module.cts', line: 2 },
      { to: 'src/folder/index.ts', line: 3 },
    ],
  );
  assert.ok(
    !snap.files.some(({ path: relative }) => relative === '.env' || relative === 'outside-link.js'),
  );
});
