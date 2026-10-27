import assert from 'node:assert/strict';
import test from 'node:test';
import type { Snapshot, SourceEdge, SourceFile } from '../src/domain';
import { layoutGraph, retainPositions, type LaidOutGraph } from '../src/graph/layout';
import {
  buildGraph,
  RELATION_CATEGORIES,
  type GraphOptions,
  type KnowledgeNode,
  type RoutePoint,
} from '../src/graph/model';
import { nodeSize } from '../src/graph/presentation';

const options: GraphOptions = {
  scope: '',
  expanded: [],
  filter: { query: '', tag: '', hotspots: false },
  focusId: null,
};
const file = (path: string): SourceFile => ({
  path,
  language: 'typescript',
  lines: 12,
  tags: [],
  annotationCount: 0,
  symbols: [],
});
function snapshot(paths: string[], edges: SourceEdge[] = []): Snapshot {
  return {
    project: {
      name: 'Layout acceptance',
      root: '/layout-acceptance',
      branch: 'main',
      head: 'abc',
      workspaceId: 'layout',
      storePath: '',
      isGit: true,
    },
    revision: 1,
    files: paths.map(file),
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    edges,
    limits: { truncated: false, scannedFiles: paths.length, maxFiles: 100 },
  };
}
const relation = (
  from: string,
  to: string,
  kind: SourceEdge['kind'] = 'runtime-import',
): SourceEdge => ({
  from,
  to,
  kind,
  provenance: 'ast:typescript',
  line: 1,
});

function assertSeparated(nodes: KnowledgeNode[], gap = 56): void {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!,
        b = nodes[j]!;
      const xGap = Math.max(
        b.position.x - a.position.x - a.width!,
        a.position.x - b.position.x - b.width!,
      );
      const yGap = Math.max(
        b.position.y - a.position.y - a.height!,
        a.position.y - b.position.y - b.height!,
      );
      assert.ok(Math.max(xGap, yGap) >= gap, `${a.id} and ${b.id} need ${gap}px clearance`);
    }
}

function assertRoutes({ nodes, edges }: LaidOutGraph): void {
  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source)!;
    const target = nodes.find((node) => node.id === edge.target)!;
    const sourcePort = source.data.wirePorts[edge.sourceHandle!]!;
    const targetPort = target.data.wirePorts[edge.targetHandle!]!;
    const points = edge.data!.points;
    assert.ok(points && points.length >= 2, `missing route for ${edge.id}`);
    assert.deepEqual(points[0], {
      x: source.position.x + source.width!,
      y: source.position.y + sourcePort.y,
    });
    assert.deepEqual(points.at(-1), {
      x: target.position.x,
      y: target.position.y + targetPort.y,
    });
    for (let index = 1; index < points.length; index++) {
      const a: RoutePoint = points[index - 1]!,
        b: RoutePoint = points[index]!;
      assert.ok(a.x === b.x || a.y === b.y, `${edge.id} must be orthogonal`);
      for (const obstacle of nodes.filter(
        (node) => node.id !== source.id && node.id !== target.id,
      )) {
        // Touching the 20px clearance boundary is allowed, entering it is not.
        const left = obstacle.position.x - 20,
          right = obstacle.position.x + obstacle.width! + 20;
        const top = obstacle.position.y - 20,
          bottom = obstacle.position.y + obstacle.height! + 20;
        const crosses: boolean =
          a.x === b.x
            ? a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
            : a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
        assert.equal(crosses, false, `${edge.id} violates clearance around ${obstacle.id}`);
      }
    }
  }
}

test('model and ELK preserve the shared module/file geometry in both reading densities', async () => {
  const data = snapshot(['apps/web/index.ts', 'packages/core/index.ts']);
  for (const detailed of [false, true]) {
    const model = buildGraph(data, { ...options, expanded: ['apps/web'], detailed });
    assert.deepEqual(
      new Set(model.nodes.map((node) => node.data.kind)),
      new Set(['module', 'file']),
    );
    const laid = await layoutGraph(model);
    for (const node of [...model.nodes, ...laid.nodes]) {
      assert.deepEqual(
        { width: node.width, height: node.height },
        nodeSize(node.data.kind, detailed),
      );
      assert.ok(
        Object.values(node.data.wirePorts).every(
          (port) => port.y >= 16 && port.y <= node.height! - 16,
        ),
        'live ports stay inside the measured node',
      );
    }
  }
});

test('fan-out has deliberate same-layer and between-layer spacing with valid routes', async () => {
  const source = 'apps/frontend/index.ts';
  const targets = Array.from({ length: 7 }, (_, index) => `packages/service-${index}/index.ts`);
  const data = snapshot(
    [source, ...targets],
    targets.map((target) => relation(source, target)),
  );
  const model = buildGraph(data, options);
  const laid = await layoutGraph(model);
  assertSeparated(laid.nodes);
  const origin = laid.nodes.find((node) => node.id === 'module:apps/frontend')!;
  const leaves = laid.nodes.filter((node) => node.id !== origin.id);
  assert.equal(new Set(leaves.map((node) => node.position.x)).size, 1);
  for (const leaf of leaves) assert.ok(leaf.position.x - origin.position.x - origin.width! >= 112);
  assertRoutes(laid);
  assert.deepEqual(
    laid.nodes.map((node) => node.id),
    model.nodes.map((node) => node.id),
  );
  assert.deepEqual(
    (await layoutGraph(model)).nodes,
    laid.nodes,
    'identical input has stable placement',
  );
});

test('all five categories keep their live ports, source evidence and obstacle clearance', async () => {
  const from = 'apps/frontend/index.ts',
    to = 'packages/service/index.ts';
  const kinds = [
    'runtime-import',
    'type-import',
    're-export',
    'dynamic-import',
    'lexical-import',
  ] as const;
  const model = buildGraph(
    snapshot(
      [from, to, 'packages/other/index.ts'],
      [...kinds.map((kind) => relation(from, to, kind)), relation(from, 'packages/other/index.ts')],
    ),
    { ...options, relationMode: 'categories' },
  );
  assert.deepEqual(
    new Set(model.edges.map((edge) => edge.data!.category)),
    new Set(RELATION_CATEGORIES),
  );
  const laid = await layoutGraph(model);
  assertSeparated(laid.nodes);
  assertRoutes(laid);
  assert.deepEqual(
    laid.edges.map((edge) => {
      const { points: _points, ...data } = edge.data!;
      return { ...edge, data };
    }),
    model.edges,
  );
});

test('disconnected expanded modules stay separate without adding grouping edges', async () => {
  const model = buildGraph(snapshot(['apps/frontend/index.ts', 'packages/service/index.ts']), {
    ...options,
    expanded: ['apps/frontend', 'packages/service'],
  });
  const laid = await layoutGraph(model);
  assert.equal(laid.nodes.length, 4);
  assert.equal(laid.edges.length, 0);
  assertSeparated(laid.nodes, 64);
});

test('eight-module source topology stays within a readable overview without pinned positions', async () => {
  // Reduced fixture of the real checkout's 11 collapsed source relationships.
  const edges = [
    ...['apps/cli/src/index.ts', 'apps/mcp/src/server.ts', 'apps/server/src/server.ts'].flatMap(
      (entry) => [
        relation(entry, 'packages/core/src/index.ts'),
        relation(entry, 'packages/shared/src/schemas.ts'),
      ],
    ),
    relation('apps/web/src/domain.ts', 'packages/shared/src/types.ts', 're-export'),
    relation('apps/web/test/graph.test.ts', 'apps/web/src/domain.ts'),
    relation('apps/web/test/impact.test.ts', 'packages/core/src/scanner.ts'),
    relation('packages/core/src/coordinates.ts', 'packages/shared/src/types.ts', 'type-import'),
    relation('packages/core/src/scanner.ts', 'src/annotationParser.ts'),
  ];
  const data = snapshot([...new Set(edges.flatMap((edge) => [edge.from, edge.to]))], edges);
  const model = buildGraph(data, options);
  const laid = await layoutGraph(model);
  assert.equal(laid.nodes.length, 8);
  assert.equal(laid.edges.length, 11);
  const width = Math.max(...laid.nodes.map((node) => node.position.x + node.width!));
  const height = Math.max(...laid.nodes.map((node) => node.position.y + node.height!));
  // A larger honest information budget is explicit in the3.6 design contract.
  assert.ok(
    width <= 1280 && height <= 1100,
    `rich overview exceeds canvas budget: ${width}×${height}`,
  );
  assertSeparated(laid.nodes);
  assertRoutes(laid);
});

test('remembered manual positions survive polling while additions avoid their bounds', () => {
  const model = buildGraph(
    snapshot(['apps/frontend/index.ts', 'packages/service/index.ts', 'src/main.ts']),
    options,
  );
  const remembered = new Map(
    model.nodes.slice(0, 2).map((node, index) => [node.id, { x: 400, y: 200 + index * 240 }]),
  );
  const retained = retainPositions(
    model.nodes.map((node) => ({ ...node, position: { x: 400, y: 200 } })),
    remembered,
  );
  for (const [id, position] of remembered)
    assert.deepEqual(retained.find((node) => node.id === id)!.position, position);
  assert.deepEqual(
    retained.map((node) => node.id),
    model.nodes.map((node) => node.id),
  );
  assertSeparated(retained, 20);
});

test('empty source models produce no nodes or phantom edges', async () => {
  const laid = await layoutGraph(buildGraph(snapshot([]), options));
  assert.deepEqual(laid, { nodes: [], edges: [] });
});
