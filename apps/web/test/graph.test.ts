import assert from 'node:assert/strict';
import test from 'node:test';
import { canDecideProposal, type Annotation, type Snapshot, type SourceFile } from '../src/domain';
import { buildGraph, moduleForPath, type RoutePoint } from '../src/graph/model';
import { diffLines } from '../src/services/diff';
import { layoutGraph, retainPositions } from '../src/graph/layout';
import { ROOT_SCOPE, TEST_SCOPE } from '../src/graph/scopes';
import { projectEntrypoints } from '../src/services/entrypoints';

const file = (path: string): SourceFile => ({
  path,
  language: 'typescript',
  lines: 12,
  tags: [],
  annotationCount: 0,
  symbols: [],
});
function snapshot(): Snapshot {
  return {
    project: {
      name: 'Example',
      root: '/example',
      branch: 'main',
      head: 'abc',
      workspaceId: 'w',
      storePath: '',
      isGit: true,
    },
    revision: 1,
    files: ['apps/web/index.ts', 'apps/server/index.ts', 'packages/core/index.ts', 'README.md'].map(
      file,
    ),
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    edges: [
      {
        from: 'apps/web/index.ts',
        to: 'packages/core/index.ts',
        kind: 'import',
        provenance: 'static',
      },
    ],
    limits: { truncated: false, scannedFiles: 4, maxFiles: 100 },
  };
}
const filter = { query: '', tag: '' as const, hotspots: false };
test('architecture uses application/package boundaries and preserves aggregated dependency direction', () => {
  const graph = buildGraph(snapshot(), { scope: '', expanded: [], filter, focusId: null });
  assert.deepEqual(graph.nodes.map((node) => node.data.path).sort(), [
    'apps/server',
    'apps/web',
    'packages/core',
  ]);
  const edge = graph.edges.find((item) => item.source === 'module:apps/web');
  assert.equal(edge?.target, 'module:packages/core');
  assert.equal(moduleForPath('README.md'), ROOT_SCOPE);
  assert.equal(graph.infrastructureFiles, 1);
  assert.ok(graph.nodes.every((node) => !node.data.expanded));
});
test('infrastructure is counted and root files drill into a distinct scope', () => {
  const infrastructure = buildGraph(snapshot(), {
    scope: '',
    expanded: [],
    filter,
    focusId: null,
    infrastructure: true,
  });
  assert.deepEqual(
    infrastructure.nodes.map((node) => node.data.path),
    [ROOT_SCOPE],
  );
  const drilled = buildGraph(snapshot(), {
    scope: ROOT_SCOPE,
    expanded: [],
    filter,
    focusId: null,
    infrastructure: true,
  });
  assert.deepEqual(
    drilled.nodes.map((node) => node.data.path),
    ['README.md'],
  );
});
test('full project overview groups nested applications, shared packages, extension and tests without infrastructure clutter', async () => {
  const data = snapshot();
  data.files = [
    'apps/web/src/App.tsx',
    'apps/server/src/server.ts',
    'apps/mcp/src/server.ts',
    'apps/cli/src/index.ts',
    'packages/core/src/index.ts',
    'packages/shared/src/types.ts',
    'src/extension.ts',
    'test/extension.tests.js',
    'tests/e2e/workflows.spec.ts',
    'workspace/test/core.test.mjs',
    'apps/web/test/graph.test.ts',
    'README.md',
    'License.txt',
    'tsconfig.json',
    'scripts/build.mjs',
    'agent/tasks.md',
    'licenses/react-LICENSE',
    'apps/web/vite.config.ts',
  ].map(file);
  data.edges = [
    {
      from: 'apps/web/src/App.tsx',
      to: 'packages/shared/src/types.ts',
      kind: 'import',
      provenance: 'static',
    },
    {
      from: 'packages/core/src/index.ts',
      to: 'src/extension.ts',
      kind: 'import',
      provenance: 'static',
    },
  ];
  const graph = buildGraph(data, { scope: '', expanded: [], filter, focusId: null });
  assert.deepEqual(graph.nodes.map((node) => node.data.path).sort(), [
    TEST_SCOPE,
    'apps/cli',
    'apps/mcp',
    'apps/server',
    'apps/web',
    'packages/core',
    'packages/shared',
    'src',
  ]);
  assert.equal(graph.infrastructureFiles, 7);
  assert.equal(graph.nodes.find((node) => node.data.path === TEST_SCOPE)?.data.files, 4);
  assert.equal(graph.nodes.find((node) => node.data.path === 'apps/web')?.data.files, 1);
  assert.ok(graph.nodes.every((node) => node.width! * 0.8 >= 170));
  const laid = await layoutGraph(graph);
  const width = Math.max(...laid.nodes.map((node) => node.position.x + node.width!));
  const height = Math.max(...laid.nodes.map((node) => node.position.y + node.height!));
  assert.ok(width < 1000 && height < 800, `overview should remain compact, got ${width}×${height}`);
});
test('module expansion is bounded, exposes total count and never fabricates dependency edges', () => {
  const data = snapshot();
  data.files = Array.from({ length: 20 }, (_, index) => file(`src/part-${index}.ts`));
  data.edges = [];
  const graph = buildGraph(data, { scope: '', expanded: ['src'], filter, focusId: null });
  assert.equal(graph.nodes.filter((node) => node.data.kind === 'file').length, 4);
  assert.equal(graph.nodes.find((node) => node.data.path === 'src')?.data.files, 20);
  assert.equal(graph.nodes.find((node) => node.data.path === 'src')?.data.shownFiles, 4);
  assert.equal(graph.edges.length, 0);
  assert.equal(
    buildGraph(data, { scope: 'src', expanded: [], filter, focusId: null }).nodes.length,
    20,
  );
});
test('manual positions survive polling and added nodes are placed outside the remembered nodes', () => {
  const graph = buildGraph(snapshot(), { scope: '', expanded: [], filter, focusId: null });
  const first = graph.nodes[0]!;
  const remembered = new Map([[first.id, { x: 420, y: 260 }]]);
  const changed = graph.nodes.map((node) => ({ ...node, position: { x: 420, y: 260 } }));
  const retained = retainPositions(changed, remembered);
  assert.deepEqual(retained.find((node) => node.id === first.id)?.position, { x: 420, y: 260 });
  for (const node of retained.filter((node) => node.id !== first.id))
    assert.ok(node.position.y >= 260 + first.height! + 20);
});
test('expansion shows actual files and drilling does not leak unrelated modules', () => {
  const expanded = buildGraph(snapshot(), {
    scope: '',
    expanded: ['apps/web'],
    filter,
    focusId: null,
  });
  assert.ok(expanded.nodes.some((node) => node.id === 'file:apps/web/index.ts'));
  const drilled = buildGraph(snapshot(), {
    scope: 'apps/web',
    expanded: [],
    filter,
    focusId: null,
  });
  assert.deepEqual(
    drilled.nodes.map((node) => node.data.path),
    ['apps/web/index.ts'],
  );
});
test('search includes symbol names and empty filters leave no phantom nodes', () => {
  const data = snapshot();
  data.files[0]!.symbols = [{ name: 'Workbench', line: 3, kind: 'function' }];
  assert.equal(
    buildGraph(data, {
      scope: '',
      expanded: [],
      filter: { ...filter, query: 'Workbench' },
      focusId: null,
    }).nodes.length,
    1,
  );
  assert.equal(
    buildGraph(data, {
      scope: '',
      expanded: [],
      filter: { ...filter, query: 'nothing-matches' },
      focusId: null,
    }).nodes.length,
    0,
  );
});
test('neighbor focus is local and retains directed relations', () => {
  const graph = buildGraph(snapshot(), {
    scope: '',
    expanded: [],
    filter,
    focusId: 'module:apps/web',
  });
  assert.deepEqual(graph.nodes.map((node) => node.data.path).sort(), ['apps/web', 'packages/core']);
});
test('diff uses real before/after with correct line numbering', () => {
  assert.deepEqual(diffLines('one\ntwo\nthree', 'one\nchanged\nthree'), [
    { type: 'context', text: 'one', oldLine: 1, newLine: 1 },
    { type: 'remove', text: 'two', oldLine: 2 },
    { type: 'add', text: 'changed', newLine: 2 },
    { type: 'context', text: 'three', oldLine: 3, newLine: 3 },
  ]);
  assert.equal(diffLines(null, 'new')[0]?.type, 'add');
  assert.equal(diffLines('old', null)[0]?.type, 'remove');
});
test('ELK places modules and expanded files without overlaps and routes outside node interiors', async () => {
  const model = buildGraph(snapshot(), {
    scope: '',
    expanded: ['apps/web', 'packages/core'],
    filter,
    focusId: null,
  });
  const { nodes, edges } = await layoutGraph(model);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!,
        b = nodes[j]!;
      const overlap =
        a.position.x < b.position.x + b.width! &&
        a.position.x + a.width! > b.position.x &&
        a.position.y < b.position.y + b.height! &&
        a.position.y + a.height! > b.position.y;
      assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
    }
  for (const edge of edges) {
    const points = edge.data?.points;
    assert.ok(points && points.length >= 2, `missing orthogonal route for ${edge.id}`);
    for (let i = 1; i < points.length; i++) {
      const a: RoutePoint = points[i - 1]!,
        b: RoutePoint = points[i]!;
      assert.ok(a.x === b.x || a.y === b.y, 'route is orthogonal');
      for (const node of nodes.filter(
        (node) => node.id !== edge.source && node.id !== edge.target,
      )) {
        const left = node.position.x + 1,
          right = left + node.width! - 2,
          top = node.position.y + 1,
          bottom = top + node.height! - 2;
        const crosses: boolean =
          a.x === b.x
            ? a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
            : a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
        assert.equal(crosses, false, `${edge.id} crosses ${node.id}`);
      }
    }
  }
});
test('large-file diff stays bounded and preserves common prefix and suffix line numbers', () => {
  const before = Array.from({ length: 1200 }, (_, index) => `line ${index}`).join('\n');
  const after = before.replace('line 600\n', 'changed 600\n');
  const lines = diffLines(before, after);
  assert.equal(lines.filter((line) => line.type === 'remove').length, 1);
  assert.equal(lines.filter((line) => line.type === 'add').length, 1);
  assert.deepEqual(lines.at(-1), {
    type: 'context',
    text: 'line 1199',
    oldLine: 1200,
    newLine: 1200,
  });
});

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'note',
    tag: 'REVIEW',
    summary: 'Read the actual boundary',
    body: '',
    path: 'src/extension.ts',
    line: 1,
    endLine: 1,
    origin: 'source',
    author: 'source',
    status: 'needs-review',
    revision: 1,
    fileHash: 'hash',
    freshness: 'current',
    ...overrides,
  };
}
test('proposal decisions are limited to pending editable web knowledge', () => {
  assert.equal(canDecideProposal(annotation()), false);
  assert.equal(canDecideProposal(annotation({ origin: 'legacy', status: 'proposed' })), false);
  assert.equal(canDecideProposal(annotation({ origin: 'web', status: 'proposed' })), true);
  assert.equal(canDecideProposal(annotation({ origin: 'web', status: 'active' })), false);
});
test('project reading points prioritize diverse entrypoints and reuse instead of global intent', () => {
  const data = snapshot();
  data.annotations = [
    annotation({
      id: 'intent',
      tag: 'INTENT',
      path: '',
      summary: 'A global intent should stay out of entrypoints',
    }),
    annotation({ id: 'extension', tag: 'CORE', path: 'src/extension.ts', status: 'active' }),
    annotation({
      id: 'extension2',
      tag: 'REUSE',
      path: 'src/knowledgeWorkspace.ts',
      status: 'active',
    }),
    annotation({ id: 'core', tag: 'CORE', path: 'packages/core/src/index.ts', status: 'active' }),
    annotation({ id: 'reuse', tag: 'REUSE', path: 'apps/mcp/src/server.ts', status: 'active' }),
    annotation({
      id: 'shared',
      tag: 'CORE',
      path: 'packages/shared/src/types.ts',
      status: 'active',
    }),
  ];
  const entries = projectEntrypoints(data);
  assert.equal(entries.length, 4);
  assert.ok(entries.every((entry) => entry.path));
  assert.ok(entries.some((entry) => entry.tag === 'REUSE'));
  assert.equal(entries.filter((entry) => entry.path.startsWith('src/')).length, 1);
});
