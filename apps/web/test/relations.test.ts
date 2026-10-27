import assert from 'node:assert/strict';
import test from 'node:test';
import type { Snapshot, SourceEdge, SourceFile } from '../src/domain';
import { buildGraph, EVIDENCE_LIMIT, type GraphOptions } from '../src/graph/model';
import { layoutGraph } from '../src/graph/layout';
import { matchingRoute, roundedRoute, routeMidpoint } from '../src/graph/routing';

const file = (path: string): SourceFile => ({
  path,
  language: 'typescript',
  lines: 100,
  tags: [],
  annotationCount: 0,
  symbols: [],
});
const from = 'apps/web/src/page.ts';
const to = 'packages/core/src/index.ts';
const relation = (kind: SourceEdge['kind'], line = 8): SourceEdge => ({
  from,
  to,
  kind,
  provenance: kind === 'lexical-import' ? 'lexical:python' : 'ast:typescript',
  line,
  specifier: '@project/core',
});
function graph(
  edges: SourceEdge[],
  expanded: string[] = [],
  options: Partial<GraphOptions> = {},
  extraFiles: string[] = [],
) {
  const snapshot: Snapshot = {
    project: {
      name: 'Relations',
      root: '/example',
      branch: 'main',
      head: 'abc',
      workspaceId: 'w',
      storePath: '',
      isGit: true,
    },
    revision: 1,
    files: [from, 'apps/web/src/other.ts', to, ...extraFiles].map(file),
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    edges,
    limits: { truncated: false, scannedFiles: 3, maxFiles: 100 },
  };
  return buildGraph(snapshot, {
    scope: '',
    expanded,
    filter: { query: '', tag: '', hotspots: false },
    focusId: null,
    relationMode: 'categories',
    ...options,
  });
}

const mixedRelations = () =>
  (
    [
      'runtime-import',
      'require',
      'import',
      'type-import',
      're-export',
      'dynamic-import',
      'lexical-import',
    ] as const
  ).map((kind, index) => relation(kind, index + 10));

test('top-level summary merges real directed endpoints and retains precise category and source-kind counts', () => {
  const originals = mixedRelations();
  const model = graph(originals, [], { relationMode: undefined });
  assert.equal(model.edges.length, 1);
  const edge = model.edges[0]!;
  assert.equal(edge.source, 'module:apps/web');
  assert.equal(edge.target, 'module:packages/core');
  assert.equal(edge.sourceHandle, `out:${edge.id}`);
  assert.equal(edge.targetHandle, `in:${edge.id}`);
  assert.equal(edge.data!.grouped, true);
  assert.equal(edge.data!.parallelCount, 1);
  assert.equal(edge.data!.count, 7);
  assert.deepEqual(edge.data!.kindCounts, {
    runtime: 3,
    type: 1,
    reexport: 1,
    dynamic: 1,
    lexical: 1,
  });
  assert.deepEqual(edge.data!.sourceKindCounts, {
    'runtime-import': 1,
    require: 1,
    import: 1,
    'type-import': 1,
    're-export': 1,
    'dynamic-import': 1,
    'lexical-import': 1,
  });
  assert.deepEqual(edge.data!.evidence, originals);
  assert.notEqual(edge.data!.evidence[0], originals[0]);
});

test('summary keeps reverse arrows separate and never invents internal or unresolved dependencies', () => {
  const model = graph(
    [
      ...mixedRelations(),
      { ...relation('type-import', 80), from: to, to: from },
      { ...relation('runtime-import'), to: 'apps/web/src/other.ts' },
      { ...relation('runtime-import'), to: 'missing/external.ts' },
    ],
    [],
    { relationMode: 'summary' },
  );
  assert.deepEqual(
    model.edges.map((edge) => [edge.source, edge.target, edge.data!.count]),
    [
      ['module:apps/web', 'module:packages/core', 7],
      ['module:packages/core', 'module:apps/web', 1],
    ],
  );
  assert.equal(new Set(model.edges.map((edge) => edge.id)).size, model.edges.length);
  assert.deepEqual(model.counts, {
    runtime: 3,
    type: 2,
    reexport: 1,
    dynamic: 1,
    lexical: 1,
  });
});

test('relation mode toggles preserve source evidence and relationship counters', () => {
  const originals = mixedRelations();
  const categories = graph(originals);
  const summary = graph(originals, [], { relationMode: 'summary' });
  assert.equal(categories.edges.length, 5);
  assert.equal(summary.edges.length, 1);
  assert.ok(categories.edges.every((edge) => !edge.data!.grouped));
  assert.deepEqual(summary.counts, categories.counts);
  assert.deepEqual(summary.counts, {
    runtime: 3,
    type: 1,
    reexport: 1,
    dynamic: 1,
    lexical: 1,
  });
  const byLine = (a: SourceEdge, b: SourceEdge) => a.line! - b.line!;
  assert.deepEqual(
    categories.edges.flatMap((edge) => edge.data!.evidence).sort(byLine),
    [...summary.edges[0]!.data!.evidence].sort(byLine),
  );
});

test('relation filters select real categories before summary grouping while counters remain independent', () => {
  const originals = mixedRelations();
  const all = graph(originals, [], { relationMode: 'summary' });
  for (const relationMode of ['summary', 'categories'] as const) {
    const type = graph(originals, [], { relationMode, relationKinds: ['type'] });
    assert.equal(type.edges.length, 1);
    assert.equal(type.edges[0]!.data!.count, 1);
    assert.deepEqual(type.edges[0]!.data!.evidence, [originals[3]]);
    assert.deepEqual(type.counts, all.counts);
    if (relationMode === 'categories') assert.equal(type.edges[0]!.data!.category, 'type');
    else assert.deepEqual(type.edges[0]!.data!.kindCounts, { type: 1 });

    const multi = graph(originals, [], { relationMode, relationKinds: ['type', 'dynamic'] });
    assert.equal(multi.edges.length, relationMode === 'summary' ? 1 : 2);
    assert.equal(
      multi.edges.reduce((count, edge) => count + edge.data!.count, 0),
      2,
    );
    assert.deepEqual(multi.counts, all.counts);
    const none = graph(originals, [], { relationMode, relationKinds: [] });
    assert.equal(none.edges.length, 0);
    assert.deepEqual(none.counts, all.counts);
  }
});

test('nested scopes default to categories and permit an explicit summary override', () => {
  const originals = mixedRelations().map((edge) => ({ ...edge, to: 'apps/web/src/other.ts' }));
  const categories = graph(originals, [], { scope: 'apps/web/src', relationMode: undefined });
  const summary = graph(originals, [], { scope: 'apps/web/src', relationMode: 'summary' });
  assert.equal(categories.edges.length, 5);
  assert.equal(summary.edges.length, 1);
  assert.equal(summary.edges[0]!.source, `file:${from}`);
  assert.equal(summary.edges[0]!.target, 'file:apps/web/src/other.ts');
});

test('summary evidence cap preserves every precise kind despite a dominant category and truthful totals', () => {
  const dominant = Array.from({ length: EVIDENCE_LIMIT + 17 }, (_, index) =>
    relation('runtime-import', index + 1),
  );
  const minority = mixedRelations().slice(1);
  const originals = [...dominant, ...minority];
  const data = graph(originals, [], { relationMode: 'summary' }).edges[0]!.data!;
  assert.equal(data.count, originals.length);
  assert.equal(data.evidence.length, EVIDENCE_LIMIT);
  assert.equal(data.count - data.evidence.length, originals.length - EVIDENCE_LIMIT);
  assert.equal(data.kindCounts?.runtime, dominant.length + 2);
  for (const item of minority) {
    assert.ok(data.evidence.some((edge) => edge.kind === item.kind));
  }
  assert.ok(
    data.evidence.every((edge) =>
      originals.some(
        (item) =>
          item.kind === edge.kind &&
          item.line === edge.line &&
          item.specifier === edge.specifier &&
          item.from === edge.from &&
          item.to === edge.to &&
          item.provenance === edge.provenance,
      ),
    ),
  );
});

test('summary polling updates evidence and new category counts without changing the layout signature', () => {
  const first = graph([relation('runtime-import')], [], { relationMode: 'summary' });
  const next = graph([relation('runtime-import'), relation('type-import', 91)], [], {
    relationMode: 'summary',
  });
  assert.equal(first.signature, next.signature);
  assert.equal(next.edges[0]!.data!.count, 2);
  assert.deepEqual(next.edges[0]!.data!.kindCounts, { runtime: 1, type: 1 });
  assert.equal(next.edges[0]!.data!.evidence[1]!.line, 91);
});

test('ELK summary routes use the neutral central ports rather than category offsets', async () => {
  const laid = await layoutGraph(graph(mixedRelations(), [], { relationMode: 'summary' }));
  assert.equal(laid.edges.length, 1);
  const edge = laid.edges[0]!;
  const source = laid.nodes.find((node) => node.id === edge.source)!;
  const target = laid.nodes.find((node) => node.id === edge.target)!;
  assert.equal(edge.sourceHandle, `out:${edge.id}`);
  assert.equal(edge.targetHandle, `in:${edge.id}`);
  assert.deepEqual(edge.data!.points?.[0], {
    x: source.position.x + source.width!,
    y: source.position.y + source.height! / 2,
  });
  assert.deepEqual(edge.data!.points?.at(-1), {
    x: target.position.x,
    y: target.position.y + target.height! / 2,
  });
});

test('groups identical endpoints by the five semantic categories and preserves dependency direction', () => {
  const model = graph(
    (
      [
        'runtime-import',
        'require',
        'import',
        'type-import',
        're-export',
        'dynamic-import',
        'lexical-import',
      ] as const
    ).map((kind) => relation(kind)),
  );
  assert.equal(model.edges.length, 5);
  const counts = Object.fromEntries(
    model.edges.map((edge) => [edge.data!.category, edge.data!.count]),
  );
  assert.deepEqual(counts, { runtime: 3, type: 1, reexport: 1, dynamic: 1, lexical: 1 });
  assert.ok(
    model.edges.every(
      (edge) => edge.source === 'module:apps/web' && edge.target === 'module:packages/core',
    ),
  );
  assert.equal(new Set(model.edges.map((edge) => edge.id)).size, 5);
  assert.equal(new Set(model.edges.map((edge) => edge.sourceHandle)).size, 5);
});

test('aggregated evidence retains original files, 1-based line, specifier, exact kind and provenance', () => {
  const first = relation('runtime-import', 23);
  const second = {
    ...relation('require', 51),
    from: 'apps/web/src/other.ts',
    specifier: '../../core',
  };
  const model = graph([first, second]);
  assert.equal(model.edges[0]!.data!.count, 2);
  assert.deepEqual(model.edges[0]!.data!.evidence, [first, second]);
  assert.notEqual(
    model.edges[0]!.data!.evidence[0],
    first,
    'evidence is a snapshot, not mutable shared input',
  );
});

test('legacy imports keep legacy kind and provenance without inventing source locations', () => {
  const legacy: SourceEdge = { from, to, kind: 'import', provenance: 'static' };
  const data = graph([legacy]).edges[0]!.data!;
  assert.equal(data.category, 'runtime');
  assert.deepEqual(data.evidence, [legacy]);
  assert.equal(data.evidence[0]!.line, undefined);
});

test('bounded evidence never caps the actual aggregated relation count', () => {
  const total = EVIDENCE_LIMIT + 17;
  const data = graph(
    Array.from({ length: total }, (_, index) => relation('type-import', index + 1)),
  ).edges[0]!.data!;
  assert.equal(data.count, total);
  assert.equal(data.evidence.length, EVIDENCE_LIMIT);
  assert.equal(data.evidence[0]!.line, 1);
  assert.equal(data.evidence.at(-1)!.line, EVIDENCE_LIMIT);
});

test('opposite dependency directions remain separate, and unresolved or internal module relations are not fabricated', () => {
  const model = graph([
    relation('dynamic-import'),
    { ...relation('dynamic-import'), from: to, to: from },
    { ...relation('type-import'), to: 'apps/web/src/other.ts' },
    { ...relation('runtime-import'), to: 'node_modules/external/index.ts' },
  ]);
  assert.equal(model.edges.length, 2);
  assert.deepEqual(
    model.edges.map((edge) => [edge.source, edge.target]),
    [
      ['module:apps/web', 'module:packages/core'],
      ['module:packages/core', 'module:apps/web'],
    ],
  );
});

test('expanding a module keeps original evidence and routes only the actual importing file', () => {
  const original = relation('re-export', 17);
  const edge = graph([original], ['apps/web']).edges[0]!;
  assert.equal(edge.source, `file:${from}`);
  assert.equal(edge.target, 'module:packages/core');
  assert.deepEqual(edge.data!.evidence, [original]);
});

test('polling a count or evidence change preserves the layout signature', () => {
  const first = graph([relation('runtime-import')]);
  const second = graph([relation('runtime-import'), relation('require', 19)]);
  assert.equal(first.signature, second.signature);
  assert.equal(second.edges[0]!.data!.count, 2);
  assert.equal(second.edges[0]!.data!.evidence[1]!.line, 19);
});

test('ELK fallback endpoints match the live per-edge handles and expire after an endpoint moves', async () => {
  const model = graph(
    (
      ['runtime-import', 'type-import', 're-export', 'dynamic-import', 'lexical-import'] as const
    ).map((kind) => relation(kind)),
  );
  const laid = await layoutGraph(model);
  for (const edge of laid.edges) {
    const source = laid.nodes.find((node) => node.id === edge.source)!;
    const target = laid.nodes.find((node) => node.id === edge.target)!;
    const sourcePort = source.data.wirePorts[edge.sourceHandle!]!;
    const targetPort = target.data.wirePorts[edge.targetHandle!]!;
    const start = {
      x: source.position.x + source.width!,
      y: source.position.y + sourcePort.y,
    };
    const end = { x: target.position.x, y: target.position.y + targetPort.y };
    assert.deepEqual(edge.data!.points?.[0], start);
    assert.deepEqual(edge.data!.points?.at(-1), end);
    assert.equal(matchingRoute(edge.data!.points, start, end), edge.data!.points);
    assert.equal(matchingRoute(edge.data!.points, { ...start, x: start.x + 30 }, end), undefined);
    assert.equal(matchingRoute(edge.data!.points, start, { ...end, y: end.y - 20 }), undefined);
  }
});

test('rounding an ELK fallback preserves endpoints and places the label on the actual route', () => {
  const points = [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 170, y: 90 },
  ];
  const path = roundedRoute(points);
  assert.ok(path.startsWith('M 10,10'));
  assert.ok(path.endsWith('L 170,90'));
  assert.ok(path.includes('Q 90,10'));
  assert.deepEqual(routeMidpoint(points), { x: 90, y: 50 });
  assert.equal(matchingRoute(undefined, points[0]!, points.at(-1)!), undefined);
});

test('neighbor focus preserves true type relation counts when type visibility is toggled off', () => {
  const shared = 'packages/shared/src/types.ts';
  const edges: SourceEdge[] = [
    relation('runtime-import', 4),
    { ...relation('type-import', 5), to: shared },
  ];
  const focused = {
    focusId: 'module:apps/web',
    relationMode: 'summary' as const,
  };
  const everything = graph(edges, [], { ...focused, relationKinds: ['runtime', 'type'] }, [shared]);
  const hiddenType = graph(edges, [], { ...focused, relationKinds: ['runtime'] }, [shared]);
  assert.equal(everything.counts?.type, 1);
  assert.equal(hiddenType.counts?.type, 1, 'filtering display never rewrites source truth');
  assert.deepEqual(
    hiddenType.edges.map((edge) => edge.data?.category),
    ['runtime'],
  );
  const grouped = graph(
    edges,
    [],
    { ...focused, relationMode: 'categories', relationKinds: ['runtime'] },
    [shared],
  );
  assert.equal(grouped.counts?.type, 1, 'also stable in per-category mode');
});
