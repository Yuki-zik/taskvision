import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SourceIndex } from '../../../packages/core/src/scanner';
import type { Snapshot, SourceEdge, SourceFile } from '../src/domain';
import {
  analyzeImpact,
  IMPACT_MODES,
  type ImpactAnalysis,
  type ImpactMode,
} from '../src/graph/impact';
import { buildGraph, type GraphOptions, type KnowledgeEdge } from '../src/graph/model';

const nodes = (...ids: string[]) => ids.map((id) => ({ id }));
const edge = (id: string, source: string, target: string) => ({ id, source, target });
const chainNodes = nodes('A', 'B', 'C', 'disconnected');
const chainEdges = [edge('A→B', 'A', 'B'), edge('B→C', 'B', 'C')];
const entries = (analysis: ImpactAnalysis) => [...analysis.depths];

test('reverse impact on A→B→C reaches B then A and leaves the disconnected node unselected', () => {
  const result = analyzeImpact(chainNodes, chainEdges, 'C', 'impact');
  assert.equal(result.focusId, 'C');
  assert.equal(result.mode, 'impact');
  assert.deepEqual(result.affected, new Set(['A', 'B', 'C']));
  assert.deepEqual(entries(result), [
    ['C', 0],
    ['B', 1],
    ['A', 2],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→B', 'B→C']));
  assert.equal(result.directCount, 1);
  assert.equal(result.indirectCount, 1);
  assert.equal(result.disconnectedCount, 1);
});

test('direct dependencies follow outgoing imports and stop after one hop', () => {
  const result = analyzeImpact(chainNodes, chainEdges, 'A', 'dependencies');
  assert.deepEqual(result.affected, new Set(['A', 'B']));
  assert.deepEqual(entries(result), [
    ['A', 0],
    ['B', 1],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→B']));
  assert.equal(result.directCount, 1);
  assert.equal(result.indirectCount, 0);
  assert.equal(result.disconnectedCount, 2);
});

test('direct dependents follow incoming imports without following their dependencies', () => {
  const result = analyzeImpact(chainNodes, chainEdges, 'B', 'dependents');
  assert.deepEqual(result.affected, new Set(['A', 'B']));
  assert.deepEqual(entries(result), [
    ['B', 0],
    ['A', 1],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→B']));
  assert.equal(result.directCount, 1);
  assert.equal(result.indirectCount, 0);
});

test('neighborhood includes both directions at one hop and excludes edges between neighbors', () => {
  const edges = [...chainEdges, edge('A→C', 'A', 'C'), edge('C→far', 'C', 'far')];
  const result = analyzeImpact([...chainNodes, ...nodes('far')], edges, 'B', 'neighborhood');
  assert.deepEqual(entries(result), [
    ['B', 0],
    ['A', 1],
    ['C', 1],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→B', 'B→C']));
  assert.equal(result.directCount, 2);
  assert.equal(result.indirectCount, 0);
  assert.equal(result.disconnectedCount, 2);
});

test('cycles and self imports do not count the root or highlight a returning traversal', () => {
  const edges = [edge('A→B', 'A', 'B'), edge('B→A', 'B', 'A'), edge('A→A', 'A', 'A')];
  const result = analyzeImpact(nodes('A', 'B'), edges, 'A', 'impact');
  assert.deepEqual(entries(result), [
    ['A', 0],
    ['B', 1],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['B→A']));
  assert.equal(result.directCount, 1);
  assert.equal(result.indirectCount, 0);
  assert.equal(result.disconnectedCount, 0);
});

test('parallel categories retain every shortest-path edge ID and keep reverse arrows distinct', () => {
  const edges: KnowledgeEdge[] = [
    {
      ...edge('runtime:A→B', 'A', 'B'),
      data: { category: 'runtime', count: 1, evidence: [], parallelCount: 2 },
    },
    {
      ...edge('type:A→B', 'A', 'B'),
      data: { category: 'type', count: 1, evidence: [], parallelCount: 2 },
    },
    {
      ...edge('reexport:B→A', 'B', 'A'),
      data: { category: 'reexport', count: 1, evidence: [], parallelCount: 1 },
    },
  ];
  const before = structuredClone(edges);
  const result = analyzeImpact(nodes('A', 'B'), edges, 'B', 'impact');
  assert.deepEqual(result.edgeIds, new Set(['runtime:A→B', 'type:A→B']));
  assert.equal(result.directCount, 1);
  assert.deepEqual(edges, before, 'reverse traversal must never reverse or mutate original edges');
  assert.deepEqual(
    analyzeImpact(nodes('A', 'B'), edges, 'B', 'neighborhood').edgeIds,
    new Set(edges.map((item) => item.id)),
  );
});

test('diamond impact retains all equally short paths but excludes same-depth and longer routes', () => {
  const edges = [
    edge('A→B', 'A', 'B'),
    edge('A→C', 'A', 'C'),
    edge('B→root', 'B', 'root'),
    edge('C→root', 'C', 'root'),
    edge('B→C', 'B', 'C'),
    edge('root→A', 'root', 'A'),
    edge('A→D', 'A', 'D'),
    edge('D→B', 'D', 'B'),
  ];
  const result = analyzeImpact(nodes('root', 'A', 'B', 'C', 'D'), edges, 'root', 'impact');
  assert.deepEqual(entries(result), [
    ['root', 0],
    ['B', 1],
    ['C', 1],
    ['A', 2],
    ['D', 2],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→B', 'A→C', 'B→root', 'C→root', 'D→B']));
  assert.equal(result.directCount, 2);
  assert.equal(result.indirectCount, 2);
});

test('shortcuts win even when a longer path appears earlier in input', () => {
  const edges = [...chainEdges, edge('A→C', 'A', 'C')];
  const result = analyzeImpact(chainNodes, edges, 'C', 'impact');
  assert.deepEqual(entries(result), [
    ['C', 0],
    ['A', 1],
    ['B', 1],
  ]);
  assert.deepEqual(result.edgeIds, new Set(['A→C', 'B→C']));
  assert.equal(result.indirectCount, 0);
});

test('absent category edges cannot be reconstructed into impact paths', () => {
  const result = analyzeImpact(chainNodes, chainEdges.slice(0, 1), 'C', 'impact');
  assert.deepEqual(entries(result), [['C', 0]]);
  assert.deepEqual(result.edgeIds, new Set());
  assert.equal(result.directCount, 0);
  assert.equal(result.indirectCount, 0);
  assert.equal(result.disconnectedCount, 3);
});

test('dangling endpoints cannot bridge visible nodes through an omitted node', () => {
  const edges = [
    edge('A→hidden', 'A', 'hidden'),
    edge('hidden→C', 'hidden', 'C'),
    edge('outside→hidden', 'outside', 'hidden'),
  ];
  const result = analyzeImpact(nodes('A', 'C'), edges, 'C', 'impact');
  assert.deepEqual(entries(result), [['C', 0]]);
  assert.deepEqual(result.edgeIds, new Set());
  const all = analyzeImpact(nodes('A', 'C'), edges);
  assert.deepEqual(all.affected, new Set(['A', 'C']));
  assert.deepEqual(all.edgeIds, new Set());
});

test('all mode shows the passed graph without assigning fictional impact depths or counts', () => {
  const result = analyzeImpact(chainNodes, chainEdges, undefined, 'all');
  assert.equal(result.focusId, null);
  assert.deepEqual(result.affected, new Set(chainNodes.map((node) => node.id)));
  assert.deepEqual(result.edgeIds, new Set(chainEdges.map((item) => item.id)));
  assert.deepEqual(entries(result), []);
  assert.equal(result.directCount, 0);
  assert.equal(result.indirectCount, 0);
  assert.equal(result.disconnectedCount, 0);
  const focused = analyzeImpact(chainNodes, chainEdges, 'B', 'all');
  assert.equal(focused.focusId, 'B');
  assert.deepEqual(entries(focused), [['B', 0]]);
  assert.deepEqual(focused.affected, result.affected);
  assert.deepEqual(focused.edgeIds, result.edgeIds);
});

test('missing or stale focus selects nothing in a focused lens and never creates phantom nodes', () => {
  for (const mode of IMPACT_MODES.filter((value) => value !== 'all')) {
    for (const focus of [null, undefined, 'missing']) {
      const result = analyzeImpact(chainNodes, chainEdges, focus, mode);
      assert.equal(result.focusId, null);
      assert.deepEqual(result.affected, new Set());
      assert.deepEqual(entries(result), []);
      assert.deepEqual(result.edgeIds, new Set());
      assert.equal(result.disconnectedCount, chainNodes.length);
    }
  }
  assert.equal(analyzeImpact([], [], 'missing', 'impact').disconnectedCount, 0);
});

test('results have deterministic iteration order under reordered graph input and never mutate input', () => {
  for (const mode of IMPACT_MODES satisfies readonly ImpactMode[]) {
    const before = structuredClone({ nodes: chainNodes, edges: chainEdges });
    const expected = analyzeImpact(chainNodes, chainEdges, 'B', mode);
    const actual = analyzeImpact([...chainNodes].reverse(), [...chainEdges].reverse(), 'B', mode);
    assert.deepEqual([...actual.affected], [...expected.affected]);
    assert.deepEqual([...actual.edgeIds], [...expected.edgeIds]);
    assert.deepEqual(entries(actual), entries(expected));
    assert.deepEqual({ nodes: chainNodes, edges: chainEdges }, before);
  }
});

const file = (path: string): SourceFile => ({
  path,
  language: 'typescript',
  lines: 12,
  tags: [],
  annotationCount: 0,
  symbols: [],
});
const sourceEdge = (from: string, to: string, kind: SourceEdge['kind']): SourceEdge => ({
  from,
  to,
  kind,
  provenance: 'ast:typescript',
  line: 1,
  specifier: to,
});
function moduleGraph(options: Partial<GraphOptions> = {}) {
  const snapshot: Snapshot = {
    project: {
      name: 'Impact',
      root: '/example',
      branch: 'main',
      head: 'abc',
      workspaceId: 'w',
      storePath: '',
      isGit: true,
    },
    revision: 1,
    files: [
      'apps/web/src/page.ts',
      'apps/web/src/types.ts',
      'apps/server/src/index.ts',
      'packages/core/src/index.ts',
      'packages/shared/src/types.ts',
    ].map(file),
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    edges: [
      sourceEdge('apps/web/src/page.ts', 'packages/core/src/index.ts', 'runtime-import'),
      sourceEdge('apps/web/src/types.ts', 'packages/core/src/index.ts', 'type-import'),
      sourceEdge('packages/core/src/index.ts', 'packages/shared/src/types.ts', 'type-import'),
      sourceEdge('packages/shared/src/types.ts', 'packages/core/src/index.ts', 're-export'),
      sourceEdge('apps/web/src/page.ts', 'apps/web/src/types.ts', 'type-import'),
    ],
    limits: { truncated: false, scannedFiles: 5, maxFiles: 100 },
  };
  return buildGraph(snapshot, {
    scope: '',
    expanded: [],
    filter: { query: '', tag: '', hotspots: false },
    focusId: null,
    ...options,
  });
}

test('model integration uses collapsed endpoints and selected categories in both display modes', () => {
  for (const relationMode of ['summary', 'categories'] as const) {
    const graph = moduleGraph({ relationMode });
    const result = analyzeImpact(graph.nodes, graph.edges, 'module:packages/shared', 'impact');
    assert.deepEqual(entries(result), [
      ['module:packages/shared', 0],
      ['module:packages/core', 1],
      ['module:apps/web', 2],
    ]);
    assert.equal(result.directCount, 1);
    assert.equal(result.indirectCount, 1);
    assert.equal(result.disconnectedCount, 1);
    const selectedEdges = graph.edges.filter((item) => result.edgeIds.has(item.id));
    assert.ok(selectedEdges.every((item) => item.target !== 'module:apps/web'));
    assert.ok(selectedEdges.every((item) => item.source !== 'module:packages/shared'));
    assert.equal(selectedEdges.length, relationMode === 'summary' ? 2 : 3);

    const filtered = moduleGraph({ relationMode, relationKinds: ['runtime'] });
    const filteredResult = analyzeImpact(
      filtered.nodes,
      filtered.edges,
      'module:packages/shared',
      'impact',
    );
    assert.deepEqual(entries(filteredResult), [['module:packages/shared', 0]]);
    assert.equal(filteredResult.directCount + filteredResult.indirectCount, 0);
    assert.equal(filteredResult.disconnectedCount, 3);
  }
});

test('a deep cycle is bounded by passed nodes and traversed without recursive stack growth', () => {
  const size = 12000;
  const manyNodes = Array.from({ length: size }, (_, index) => ({ id: String(index) }));
  const manyEdges = manyNodes.map((node, index) =>
    edge(`e${index}`, node.id, String((index + 1) % size)),
  );
  const result = analyzeImpact(manyNodes, manyEdges, '0', 'impact');
  assert.equal(result.affected.size, size);
  assert.equal(result.depths.get('1'), size - 1);
  assert.equal(result.edgeIds.size, size - 1);
  assert.equal(result.directCount, 1);
  assert.equal(result.indirectCount, size - 2);
  assert.equal(result.disconnectedCount, 0);
});

test('real TypeScript imports survive scanning, module collapsing and relation filtering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-impact-'));
  try {
    const sources = {
      'apps/web/index.ts': "import { run } from '../../packages/core/index';\nexport { run };\n",
      'apps/web/types.ts':
        "import type { Config } from '../../packages/core/index';\nexport type PageConfig = Config;\n",
      'apps/server/index.ts': 'export const isolated = true;\n',
      'packages/core/index.ts':
        "import type { Config } from '../shared/types';\nexport type { Config } from '../shared/types';\nexport const run = (config: Config) => config.name;\n",
      'packages/shared/types.ts': 'export interface Config { name: string }\n',
    };
    for (const [relative, content] of Object.entries(sources)) {
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    }
    const project: Snapshot['project'] = {
      name: 'Scanned impact',
      root,
      branch: '',
      head: '',
      workspaceId: 'impact-test',
      storePath: '',
      isGit: false,
    };
    const scanned = new SourceIndex(project, 100).scan();
    assert.equal(scanned.files.length, 5);
    assert.ok(scanned.edges.some((item) => item.kind === 'runtime-import'));
    assert.ok(scanned.edges.some((item) => item.kind === 'type-import'));
    assert.ok(
      scanned.edges.every((item) => item.provenance.startsWith('typescript-ast-') && item.line),
    );
    const snapshot: Snapshot = {
      project,
      revision: 1,
      files: scanned.files,
      edges: scanned.edges,
      limits: scanned.limits,
      annotations: [],
      tasks: [],
      claims: [],
      reviews: [],
    };
    for (const relationMode of ['summary', 'categories'] as const) {
      const options: GraphOptions = {
        scope: '',
        expanded: [],
        filter: { query: '', tag: '', hotspots: false },
        focusId: null,
        relationMode,
      };
      const graph = buildGraph(snapshot, options);
      const result = analyzeImpact(graph.nodes, graph.edges, 'module:packages/shared', 'impact');
      assert.deepEqual(entries(result), [
        ['module:packages/shared', 0],
        ['module:packages/core', 1],
        ['module:apps/web', 2],
      ]);
      assert.equal(result.directCount, 1);
      assert.equal(result.indirectCount, 1);
      assert.equal(result.disconnectedCount, 1);
      assert.deepEqual(result.edgeIds, new Set(graph.edges.map((item) => item.id)));

      const runtime = buildGraph(snapshot, { ...options, relationKinds: ['runtime'] });
      const filtered = analyzeImpact(
        runtime.nodes,
        runtime.edges,
        'module:packages/shared',
        'impact',
      );
      assert.deepEqual(entries(filtered), [['module:packages/shared', 0]]);
      assert.equal(filtered.edgeIds.size, 0);
      assert.equal(filtered.disconnectedCount, 3);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('expanded module source representatives remain one impact target with stable outside counts', () => {
  // A imports file c1 in Core. Expanding Core changes the graphical target from
  // module:Core to file:c1, yet A must stay a direct reverse dependent of Core.
  const shown = nodes('module:Core', 'file:c1', 'module:A', 'module:D', 'unrelated');
  const links = [edge('A→c1', 'module:A', 'file:c1'), edge('D→A', 'module:D', 'module:A')];
  const withoutSeeds = analyzeImpact(shown, links, 'module:Core', 'impact');
  assert.equal(
    withoutSeeds.directCount,
    0,
    'demonstrate lost relation without expanded representatives',
  );
  const actual = analyzeImpact(shown, links, 'module:Core', 'impact', ['file:c1']);
  assert.deepEqual(entries(actual), [
    ['file:c1', 0],
    ['module:Core', 0],
    ['module:A', 1],
    ['module:D', 2],
  ]);
  assert.equal(actual.directCount, 1);
  assert.equal(actual.indirectCount, 1);
  assert.deepEqual(actual.edgeIds, new Set(['A→c1', 'D→A']));
  assert.equal(actual.disconnectedCount, 1);
});
