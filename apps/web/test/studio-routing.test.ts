import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmartEdge, pathfindingAStarNoDiagonal } from '@tisoap/react-flow-smart-edge';
import { Position } from '@xyflow/react';
import type { Snapshot, SourceEdge } from '../src/domain';
import { layoutGraph, reorderPortsByGeometry } from '../src/graph/layout';
import {
  buildGraph,
  type KnowledgeNode,
  type RelationMode,
  type RoutePoint,
} from '../src/graph/model';
import {
  cubicPoint,
  displayRoute,
  matchingRoute,
  separatedCable,
  simplifyRoute,
} from '../src/graph/routing';

function fixture() {
  const paths = [
    'apps/z-top/a.ts',
    'apps/a-bottom/a.ts',
    'packages/core/a.ts',
    'packages/z-provider/a.ts',
    'packages/a-provider/a.ts',
  ];
  const edges: SourceEdge[] = [
    {
      from: paths[0]!,
      to: paths[2]!,
      kind: 'runtime-import',
      provenance: 'ast:typescript',
      line: 1,
    },
    {
      from: paths[1]!,
      to: paths[2]!,
      kind: 'runtime-import',
      provenance: 'ast:typescript',
      line: 1,
    },
    {
      from: paths[2]!,
      to: paths[3]!,
      kind: 'runtime-import',
      provenance: 'ast:typescript',
      line: 1,
    },
    {
      from: paths[2]!,
      to: paths[4]!,
      kind: 'runtime-import',
      provenance: 'ast:typescript',
      line: 1,
    },
    ...(['type-import', 're-export', 'dynamic-import'] as const).map((kind) => ({
      from: paths[0]!,
      to: paths[2]!,
      kind,
      provenance: 'ast:typescript' as const,
      line: 2,
    })),
  ];
  return fixtureGraph(paths, edges);
}

function fixtureGraph(
  paths: string[],
  edges: SourceEdge[],
  relationMode: RelationMode = 'categories',
) {
  const snapshot: Snapshot = {
    project: {
      name: 'Studio routing',
      root: '/studio',
      branch: '',
      head: '',
      workspaceId: 'studio',
      storePath: '',
      isGit: false,
    },
    revision: 1,
    files: paths.map((path) => ({
      path,
      language: 'typescript',
      lines: 5,
      tags: [],
      annotationCount: 0,
      symbols: [],
    })),
    edges,
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    limits: { truncated: false, scannedFiles: paths.length, maxFiles: 100 },
  };
  return buildGraph(snapshot, {
    scope: '',
    expanded: [],
    filter: { query: '', tag: '', hotspots: false },
    focusId: null,
    relationMode,
  });
}

function assertSpatialOrder(nodes: KnowledgeNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes)
    for (const side of ['in', 'out'] as const) {
      const ports = Object.values(node.data.wirePorts)
        .filter((port) => port.side === side)
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < ports.length; i++) {
        const a = byId.get(ports[i - 1]!.counterpart)!;
        const b = byId.get(ports[i]!.counterpart)!;
        assert.ok(
          a.position.y + (a.measured?.height ?? a.height!) / 2 <=
            b.position.y + (b.measured?.height ?? b.height!) / 2,
        );
        if (ports.length <= 8) assert.ok(ports[i]!.y - ports[i - 1]!.y >= 18);
      }
      assert.ok(
        ports.every(
          (port) => port.y >= 24 && port.y <= (node.measured?.height ?? node.height!) - 24,
        ),
      );
    }
}

test('physical input and output order follow neighbor center Y, preserve IDs and metadata, and use measured sizes', () => {
  const model = fixture();
  const nodes = model.nodes.map((node) => ({
    ...node,
    height: 196,
    width: 304,
    measured: node.id.includes('core') ? { width: 328, height: 248 } : undefined,
    position: {
      x: node.id.includes('core') ? 600 : node.id.includes('provider') ? 1200 : 0,
      y: node.id.includes('z-') ? 0 : node.id.includes('core') ? 200 : 500,
    },
  }));
  const before = JSON.stringify(nodes);
  const ordered = reorderPortsByGeometry(nodes, model.edges);
  assertSpatialOrder(ordered);
  assert.equal(JSON.stringify(nodes), before, 'does not mutate model or retained positions');
  for (const node of ordered) {
    const original = nodes.find((item) => item.id === node.id)!;
    assert.deepEqual(
      Object.keys(node.data.wirePorts).sort(),
      Object.keys(original.data.wirePorts).sort(),
    );
    for (const port of Object.values(node.data.wirePorts)) {
      const { y: _y, spacing: _spacing, crowded: _crowded, ...metadata } = port;
      const {
        y: _oldY,
        spacing: _oldSpacing,
        crowded: _oldCrowded,
        ...expected
      } = original.data.wirePorts[port.id]!;
      assert.deepEqual(metadata, expected);
    }
  }
  assert.deepEqual(
    reorderPortsByGeometry([...nodes].reverse(), [...model.edges].reverse()).sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    [...ordered].sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test('ELK returns spatially ordered live ports and routes at the final positions', async () => {
  const model = fixture();
  const laid = await layoutGraph(model);
  assertSpatialOrder(laid.nodes);
  for (const edge of laid.edges) {
    const source = laid.nodes.find((node) => node.id === edge.source)!;
    const target = laid.nodes.find((node) => node.id === edge.target)!;
    const start = {
      x: source.position.x + source.width!,
      y: source.position.y + source.data.wirePorts[edge.sourceHandle!]!.y,
    };
    const end = {
      x: target.position.x,
      y: target.position.y + target.data.wirePorts[edge.targetHandle!]!.y,
    };
    assert.deepEqual(edge.data!.points?.[0], start);
    assert.deepEqual(edge.data!.points?.at(-1), end);
    assert.equal(matchingRoute(edge.data!.points, { ...start, y: start.y + 30 }, end), undefined);
  }
});

test('clear fan lead is one monotonic cubic with horizontal endpoints and a sloped middle tangent', () => {
  const wire = separatedCable(
    { source: { x: 0, y: 20 }, target: { x: 340, y: 210 }, sourceId: 'a', targetId: 'b' },
    [],
  );
  assert.ok(wire);
  assert.equal((wire.path.match(/ C /g) ?? []).length, 1);
  const [a, b] = wire.segments;
  assert.equal(a[1].y, a[0].y);
  assert.equal(b[2].y, b[3].y);
  assert.ok(a[3].y > a[2].y, 'middle tangent is not flattened');
  assert.deepEqual(a[3], b[0]);
  assert.ok(Math.abs(a[3].y - a[2].y - (b[1].y - b[0].y)) < 1e-6);
  for (const segment of wire.segments) {
    let previous = segment[0];
    for (let step = 1; step <= 100; step++) {
      const point = cubicPoint(segment, step / 100);
      assert.ok(point.x >= previous.x && point.y >= previous.y);
      previous = point;
    }
  }
});

test('parallel wires with different physical sockets stay separate through the last and first 60px', () => {
  const wires = [0, 1, 2, 3].map((laneIndex) =>
    separatedCable(
      {
        source: { x: 0, y: 20 + laneIndex * 18 },
        target: { x: 360, y: 90 + laneIndex * 18 },
        sourceId: 'a',
        targetId: 'b',
        laneIndex,
        laneCount: 4,
      },
      [],
    )!,
  );
  for (let i = 1; i < wires.length; i++)
    for (let step = 0; step <= 100; step++) {
      const segmentIndex = step <= 50 ? 0 : 1;
      const t = step <= 50 ? step / 50 : (step - 50) / 50;
      const lower = cubicPoint(wires[i]!.segments[segmentIndex], t);
      const upper = cubicPoint(wires[i - 1]!.segments[segmentIndex], t);
      assert.ok(lower.y > upper.y, 'no sibling braid, including endpoint leads');
    }
});

test('thin blocker between old sample steps is rejected and non-finite drag coordinates never produce invalid SVG', () => {
  assert.equal(
    separatedCable(
      {
        source: { x: 0, y: 0 },
        target: { x: 1000, y: 0 },
        sourceId: 'a',
        targetId: 'b',
        padding: 0,
      },
      [{ id: 'thin', position: { x: 143.1, y: -1 }, width: 0.01, height: 2 }],
    ),
    undefined,
  );
  assert.equal(
    separatedCable(
      { source: { x: 0, y: NaN }, target: { x: 300, y: 20 }, sourceId: 'a', targetId: 'b' },
      [],
    ),
    undefined,
  );
  assert.equal(
    displayRoute(
      [
        { x: NaN, y: 0 },
        { x: 20, y: 20 },
      ],
      'flow',
    ).path,
    '',
  );
});

test('grid cleanup removes duplicates, exact retracing and collinear noise without shortcutting obstacle detours', () => {
  const points = [
    [0, 0],
    [20, 0],
    [16, 0],
    [16, 0],
    [40, 0],
    [40, -40],
    [80, -40],
    [80, 0],
    [120, 0],
  ];
  assert.deepEqual(simplifyRoute(points), [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: -40 },
    { x: 80, y: -40 },
    { x: 80, y: 0 },
    { x: 120, y: 0 },
  ]);
  assert.equal((displayRoute(points, 'orthogonal').path.match(/ L /g) ?? []).length, 5);
  const direct = displayRoute(points, 'direct');
  assert.equal(
    (direct.path.match(/ L /g) ?? []).length,
    1,
    'literal straight style ignores routing detours',
  );
  assert.deepEqual(direct.center, { x: 60, y: 0 });
});

test('flow rounds are bounded and tangent to their adjacent leads; safety boxes prevent cutting into nodes', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  const displayed = displayRoute(points, 'flow', 1000);
  const values = [
    ...displayed.path.matchAll(
      /C ([\d.e+-]+),([\d.e+-]+) ([\d.e+-]+),([\d.e+-]+) ([\d.e+-]+),([\d.e+-]+)/g,
    ),
  ];
  assert.equal(values.length, 2);
  assert.equal(Number(values[0]![2]), 0, 'departure control stays on incoming lead');
  assert.equal(Number(values[0]![3]), 100, 'arrival control stays on outgoing lead');
  const blocker = { id: 'blocker', position: { x: 70, y: 10 }, width: 20, height: 20 };
  const safe = displayRoute(points, 'flow', 1000, [blocker]);
  assert.notEqual(
    safe.path,
    displayed.path,
    'rounding is reduced when its hull would hit a blocker',
  );
  assertSafePath(safe.path, blocker);
});

test('actual SmartEdge raw points display as a finite obstacle-safe path after a target drag', () => {
  const nodes = [
    {
      id: 'a',
      position: { x: 0, y: 0 },
      width: 140,
      height: 120,
      measured: { width: 140, height: 120 },
      data: {},
    },
    {
      id: 'b',
      position: { x: 700, y: 20 },
      width: 140,
      height: 120,
      measured: { width: 140, height: 120 },
      data: {},
    },
    {
      id: 'blocker',
      position: { x: 330, y: -20 },
      width: 180,
      height: 180,
      measured: { width: 180, height: 180 },
      data: {},
    },
  ];
  for (const y of [60, 155]) {
    const result = getSmartEdge({
      nodes,
      sourceX: 140,
      sourceY: 60,
      targetX: 700,
      targetY: y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      options: { nodePadding: 13, gridRatio: 8, generatePath: pathfindingAStarNoDiagonal },
    });
    assert.ok(!(result instanceof Error));
    const displayed = displayRoute(result.points, 'flow', 36, nodes);
    assertSafePath(displayed.path, nodes[2]!);
    // SmartEdge excludes handle points; the renderer must stitch live handles.
    const stitched = [{ x: 140, y: 60 }, ...result.points, { x: 700, y }];
    assertSafePath(displayRoute(stitched, 'flow', 36, nodes).path, nodes[2]!);
    assert.ok(displayed.path.length > 0 && !/NaN|Infinity/.test(displayed.path));
    const cleaned = simplifyRoute(result.points);
    assert.deepEqual(cleaned[0], { x: result.points[0]![0], y: result.points[0]![1] });
    assert.deepEqual(cleaned.at(-1), { x: result.points.at(-1)![0], y: result.points.at(-1)![1] });
  }
});

function assertSafePath(
  path: string,
  box: { position: { x: number; y: number }; width: number; height: number },
) {
  const commands = [...path.matchAll(/([MLC]) ([^MLC]+)/g)];
  let previous = { x: 0, y: 0 };
  for (const command of commands) {
    const values = command[2]!.trim().split(/[ ,]+/).map(Number);
    const end = { x: values.at(-2)!, y: values.at(-1)! };
    if (command[1] !== 'M')
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        const point =
          command[1] === 'C'
            ? cubicPoint(
                [previous, { x: values[0]!, y: values[1]! }, { x: values[2]!, y: values[3]! }, end],
                t,
              )
            : {
                x: previous.x + (end.x - previous.x) * t,
                y: previous.y + (end.y - previous.y) * t,
              };
        assert.ok(
          !(
            point.x > box.position.x &&
            point.x < box.position.x + box.width &&
            point.y > box.position.y &&
            point.y < box.position.y + box.height
          ),
          'displayed geometry avoids node interior',
        );
      }
    previous = end;
  }
}

test('reverse-name physical fan-in and fan-out do not intersect in the first or last 60px', () => {
  const model = fixture();
  const nodes = reorderPortsByGeometry(
    model.nodes.map((node) => ({
      ...node,
      width: 304,
      height: 196,
      position: {
        x: node.id.includes('core') ? 600 : node.id.includes('provider') ? 1200 : 0,
        y: node.id.includes('z-') ? 0 : node.id.includes('core') ? 200 : 500,
      },
    })),
    model.edges,
  );
  const paths = model.edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source)!;
    const target = nodes.find((node) => node.id === edge.target)!;
    const cable = separatedCable(
      {
        source: {
          x: source.position.x + source.width!,
          y: source.position.y + source.data.wirePorts[edge.sourceHandle!]!.y,
        },
        target: {
          x: target.position.x,
          y: target.position.y + target.data.wirePorts[edge.targetHandle!]!.y,
        },
        sourceId: source.id,
        targetId: target.id,
      },
      [],
    );
    assert.ok(cable);
    return { edge, cable };
  });
  function yAtX(cable: NonNullable<ReturnType<typeof separatedCable>>, x: number): number {
    const segment = cable.segments[x <= cable.center.x ? 0 : 1];
    let lo = 0,
      hi = 1;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (cubicPoint(segment, mid).x < x) lo = mid;
      else hi = mid;
    }
    return cubicPoint(segment, (lo + hi) / 2).y;
  }
  for (const node of nodes)
    for (const side of ['in', 'out'] as const) {
      const siblings = paths
        .filter(({ edge }) => (side === 'in' ? edge.target === node.id : edge.source === node.id))
        .sort((a, b) =>
          side === 'in'
            ? a.cable.segments[1][3].y - b.cable.segments[1][3].y
            : a.cable.segments[0][0].y - b.cable.segments[0][0].y,
        );
      for (let i = 1; i < siblings.length; i++)
        for (let distance = 0; distance <= 60; distance += 2) {
          const x =
            side === 'in' ? node.position.x - distance : node.position.x + node.width! + distance;
          assert.ok(
            yAtX(siblings[i]!.cable, x) > yAtX(siblings[i - 1]!.cable, x),
            'siblings stay ordered near sockets',
          );
        }
    }
});

test('bounded refinement never leaves stale ELK sockets when cross-layer neighbor order changes again', async () => {
  // Mixed-layer routing can prefer a different local order than distant
  // neighbor centers. Keep slots distinct and only retain matching routes.
  const paths = Array.from({ length: 12 }, (_, index) => `packages/n${index}/a.ts`);
  let state = 10;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const sample: Snapshot = {
    project: {
      name: 'Mixed layers',
      root: '/layers',
      branch: '',
      head: '',
      workspaceId: 'layers',
      storePath: '',
      isGit: false,
    },
    revision: 1,
    files: paths.map((path) => ({
      path,
      language: 'typescript',
      lines: 5,
      tags: [],
      annotationCount: 0,
      symbols: [],
    })),
    edges: [],
    annotations: [],
    tasks: [],
    claims: [],
    reviews: [],
    limits: { truncated: false, scannedFiles: 12, maxFiles: 100 },
  };
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      if (random() < 0.22)
        sample.edges.push({
          from: paths[i]!,
          to: paths[j]!,
          kind: 'runtime-import',
          provenance: 'ast:typescript',
          line: 1,
        });
  const graph = buildGraph(sample, {
    scope: '',
    expanded: [],
    filter: { query: '', tag: '', hotspots: false },
    focusId: null,
  });
  const laid = await layoutGraph(graph);
  for (const node of laid.nodes)
    for (const side of ['in', 'out'] as const) {
      const ports = Object.values(node.data.wirePorts)
        .filter((port) => port.side === side)
        .sort((a, b) => a.y - b.y);
      assert.equal(new Set(ports.map((port) => port.id)).size, ports.length);
      assert.ok(ports.every((port) => port.y >= 24 && port.y <= node.height! - 24));
      if (ports.length <= 8)
        for (let index = 1; index < ports.length; index++)
          assert.ok(ports[index]!.y - ports[index - 1]!.y >= 18);
    }
  assert.equal(laid.edges.length, graph.edges.length);
  assert.ok(
    laid.edges.some((edge) => edge.data?.points),
    'unaffected ELK routes survive',
  );
  for (const edge of laid.edges) {
    if (!edge.data?.points) continue;
    const source = laid.nodes.find((node) => node.id === edge.source)!;
    const target = laid.nodes.find((node) => node.id === edge.target)!;
    assert.deepEqual(edge.data.points[0], {
      x: source.position.x + source.width!,
      y: source.position.y + source.data.wirePorts[edge.sourceHandle!]!.y,
    });
    assert.deepEqual(edge.data.points.at(-1), {
      x: target.position.x,
      y: target.position.y + target.data.wirePorts[edge.targetHandle!]!.y,
    });
  }
});

function repositoryFanFixture() {
  const relation = (from: string, to: string): SourceEdge => ({
    from,
    to,
    kind: 'runtime-import',
    provenance: 'ast:typescript',
    line: 1,
  });
  const edges = [
    ...['apps/cli/src/index.ts', 'apps/mcp/src/server.ts', 'apps/server/src/server.ts'].flatMap(
      (from) => [
        relation(from, 'packages/core/src/index.ts'),
        relation(from, 'packages/shared/src/types.ts'),
      ],
    ),
    relation('apps/web/src/domain.ts', 'packages/shared/src/types.ts'),
    relation('apps/web/test/graph.test.ts', 'apps/web/src/domain.ts'),
    relation('apps/web/test/impact.test.ts', 'packages/core/src/scanner.ts'),
    relation('packages/core/src/coordinates.ts', 'packages/shared/src/types.ts'),
    relation('packages/core/src/scanner.ts', 'src/annotationParser.ts'),
  ];
  return fixtureGraph(
    [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))],
    edges,
    'summary',
  );
}

function exactRejectedFan() {
  const model = repositoryFanFixture();
  const positions: Record<string, RoutePoint> = {
    'module:@tests': { x: 24, y: 33 },
    'module:apps/cli': { x: 24, y: 285 },
    'module:apps/mcp': { x: 24, y: 537 },
    'module:apps/server': { x: 24, y: 789 },
    'module:apps/web': { x: 440, y: 24 },
    'module:packages/core': { x: 440, y: 410 },
    'module:packages/shared': { x: 856, y: 401 },
    'module:src': { x: 856, y: 653 },
  };
  const nodes = model.nodes.map((node) => ({
    ...node,
    position: positions[node.id]!,
    data: {
      ...node.data,
      wirePorts: Object.fromEntries(
        Object.values(node.data.wirePorts).map((port) => {
          let y = port.y;
          if (node.id === 'module:apps/mcp')
            y = port.counterpart === 'module:packages/shared' ? 89 : 107;
          if (node.id === 'module:packages/core' && port.counterpart === 'module:apps/mcp') y = 107;
          if (node.id === 'module:packages/shared' && port.counterpart === 'module:apps/mcp')
            y = 116;
          return [port.id, { ...port, y }];
        }),
      ),
    },
  }));
  const edges = model.edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data!,
      points:
        edge.source !== 'module:apps/mcp'
          ? undefined
          : edge.target === 'module:packages/core'
            ? [
                { x: 328, y: 644 },
                { x: 348, y: 644 },
                { x: 348, y: 517 },
                { x: 440, y: 517 },
              ]
            : [
                { x: 328, y: 626 },
                { x: 788, y: 626 },
                { x: 788, y: 517 },
                { x: 856, y: 517 },
              ],
    },
  }));
  return { ...model, nodes, edges };
}

test('exact rejected MCP fan uses local routed departure instead of near-equal distant provider centers', () => {
  const model = exactRejectedFan();
  const mcp = model.nodes.find((node) => node.id === 'module:apps/mcp')!;
  const order = (nodes: KnowledgeNode[]) =>
    Object.values(nodes.find((node) => node.id === mcp.id)!.data.wirePorts)
      .sort((a, b) => a.y - b.y)
      .map((port) => port.counterpart);
  assert.deepEqual(order(model.nodes), ['module:packages/shared', 'module:packages/core']);
  const reordered = reorderPortsByGeometry(model.nodes, model.edges);
  assert.deepEqual(order(reordered), ['module:packages/core', 'module:packages/shared']);
  const stale = model.edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data!,
      points: edge.data?.points?.map((point) => ({ ...point, y: point.y + 30 })),
    },
  }));
  assert.deepEqual(
    order(reorderPortsByGeometry(model.nodes, stale)),
    order(model.nodes),
    'stale routes fall back to physical neighbor centers',
  );
  const missing = model.edges.map((edge) => ({
    ...edge,
    data: { ...edge.data!, points: undefined },
  }));
  assert.deepEqual(order(reorderPortsByGeometry(model.nodes, missing)), order(model.nodes));
});

test('real TaskVision topology reruns ELK with unbraided local source leads and matching final sockets', async () => {
  const model = repositoryFanFixture();
  const laid = await layoutGraph(model);
  const paths = new Map<string, string>();
  for (const edge of laid.edges) {
    const source = laid.nodes.find((node) => node.id === edge.source)!;
    const target = laid.nodes.find((node) => node.id === edge.target)!;
    const start = {
      x: source.position.x + source.width!,
      y: source.position.y + source.data.wirePorts[edge.sourceHandle!]!.y,
    };
    const end = {
      x: target.position.x,
      y: target.position.y + target.data.wirePorts[edge.targetHandle!]!.y,
    };
    assert.deepEqual(edge.data?.points?.[0], start, 'fixture keeps actual final ELK routes');
    assert.deepEqual(edge.data?.points?.at(-1), end);
    const cable = separatedCable(
      { source: start, target: end, sourceId: source.id, targetId: target.id },
      laid.nodes,
    );
    paths.set(
      edge.id,
      cable?.path ?? displayRoute(edge.data!.points!, 'flow', 36, laid.nodes).path,
    );
  }
  for (const node of laid.nodes)
    for (const side of ['in', 'out'] as const) {
      const siblings = laid.edges.filter((edge) =>
        side === 'out' ? edge.source === node.id : edge.target === node.id,
      );
      if (node.id === 'module:apps/mcp' && side === 'out') assert.equal(siblings.length, 2);
      const x = side === 'out' ? node.position.x + node.width! : node.position.x - 60;
      for (let i = 0; i < siblings.length; i++)
        for (let j = i + 1; j < siblings.length; j++)
          assert.equal(
            pathsIntersectNearX(paths.get(siblings[i]!.id)!, paths.get(siblings[j]!.id)!, x, 60),
            false,
            `${node.id} ${side}: ${siblings[i]!.id} / ${siblings[j]!.id}: no sibling intersection within 60 world pixels`,
          );
    }
});

function pathLines(path: string): [RoutePoint, RoutePoint][] {
  const lines: [RoutePoint, RoutePoint][] = [];
  let previous = { x: 0, y: 0 };
  for (const command of path.matchAll(/([MLC]) ([^MLC]+)/g)) {
    const values = command[2]!.trim().split(/[ ,]+/).map(Number);
    const end = { x: values.at(-2)!, y: values.at(-1)! };
    if (command[1] === 'L') lines.push([previous, end]);
    if (command[1] === 'C') {
      const curve = [
        previous,
        { x: values[0]!, y: values[1]! },
        { x: values[2]!, y: values[3]! },
        end,
      ] as const;
      let before = previous;
      for (let step = 1; step <= 160; step++) {
        const after = cubicPoint(curve, step / 160);
        lines.push([before, after]);
        before = after;
      }
    }
    previous = end;
  }
  return lines;
}
function pathsIntersectNearX(first: string, second: string, x: number, width: number): boolean {
  const cross = (a: RoutePoint, b: RoutePoint) => a.x * b.y - a.y * b.x;
  for (const [a, b] of pathLines(first))
    for (const [c, d] of pathLines(second)) {
      if (
        Math.max(a.x, b.x) < x ||
        Math.min(a.x, b.x) > x + width ||
        Math.max(c.x, d.x) < x ||
        Math.min(c.x, d.x) > x + width
      )
        continue;
      const r = { x: b.x - a.x, y: b.y - a.y },
        s = { x: d.x - c.x, y: d.y - c.y },
        delta = { x: c.x - a.x, y: c.y - a.y };
      const denominator = cross(r, s);
      if (Math.abs(denominator) < 1e-9) {
        if (
          Math.abs(cross(delta, r)) < 1e-7 &&
          Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x), x) <=
            Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x), x + width) &&
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
            Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
        )
          return true;
        continue;
      }
      const t = cross(delta, s) / denominator,
        u = cross(delta, r) / denominator;
      const hitX = a.x + t * r.x;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && hitX >= x && hitX <= x + width) return true;
    }
  return false;
}

test('ELK border-center routes survive real socket perimeter measurement without grid hooks', () => {
  const points = [
    { x: 328, y: 644 },
    { x: 764, y: 644 },
    { x: 764, y: 481 },
    { x: 856, y: 481 },
  ];
  const liveSource = { x: 331, y: 644 },
    liveTarget = { x: 853, y: 481 };
  const accepted = matchingRoute(points, liveSource, liveTarget);
  assert.ok(accepted);
  assert.deepEqual(accepted[0], liveSource);
  assert.deepEqual(accepted.at(-1), liveTarget);
  const drawn = displayRoute(accepted, 'flow', 36);
  assert.ok(
    drawn.path.startsWith('M 331,644 L 728,644'),
    'long smooth departure, no3px mismatch-induced grid hook',
  );
  assert.equal(
    matchingRoute(points, { x: 358, y: 644 }, liveTarget),
    undefined,
    'actual drag remains stale',
  );
});
