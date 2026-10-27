import { routeSmartEdgeBatch } from '@tisoap/react-flow-smart-edge';
import { Position } from '@xyflow/react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cableLaneOffset,
  cubicPoint,
  separatedCable,
  obstacleLaneWaypoints,
} from '../src/graph/routing';

const source = { x: 0, y: 90 };
const target = { x: 260, y: 90 };
const a = { id: 'source', position: { x: -140, y: 25 }, width: 140, height: 120 };
const b = { id: 'target', position: { x: 260, y: 25 }, width: 140, height: 120 };

test('sibling wires take independent lanes even when endpoints are shared', () => {
  const wires = Array.from({ length: 3 }, (_, laneIndex) =>
    separatedCable(
      { source, target, sourceId: 'source', targetId: 'target', laneIndex, laneCount: 3 },
      [a, b],
    ),
  );
  assert.ok(wires.every(Boolean));
  assert.deepEqual(
    wires.map((wire) => wire!.laneOffset),
    [-18, 0, 18],
  );
  assert.deepEqual(
    wires.map((wire) => wire!.center.y),
    [72, 90, 108],
  );
  assert.equal(new Set(wires.map((wire) => wire!.path)).size, 3);
  for (const wire of wires) {
    assert.deepEqual(cubicPoint(wire!.segments[0], 1), cubicPoint(wire!.segments[1], 0));
    assert.deepEqual(cubicPoint(wire!.segments[1], 1), target);
  }
});

test('cables reject node intersections and fall back to Smart Edge', () => {
  const obstacle = { id: 'obstacle', position: { x: 100, y: 55 }, width: 48, height: 78 };
  assert.equal(
    separatedCable({ source, target, sourceId: 'source', targetId: 'target' }, [a, obstacle, b]),
    undefined,
  );
  assert.ok(separatedCable({ source, target, sourceId: 'source', targetId: 'target' }, [a, b]));
  assert.equal(
    separatedCable(
      {
        source: { x: 200, y: 90 },
        target: { x: 70, y: 80 },
        sourceId: 'source',
        targetId: 'target',
      },
      [a, b],
    ),
    undefined,
  );
});

test('lane offsets are deterministic for all counts', () => {
  assert.equal(cableLaneOffset(0, 1), 0);
  assert.equal(cableLaneOffset(0, 2), -9);
  assert.equal(cableLaneOffset(1, 2), 9);
  assert.ok(Number.isFinite(cableLaneOffset(100, 10)));
});

test('waypoints pass around a real blocking node and remain in separate lanes', () => {
  const obstacle = { id: 'obstacle', position: { x: 400, y: 0 }, width: 264, height: 120 };
  const start = { x: 264, y: 48 };
  const finish = { x: 800, y: 48 };
  const paths = Array.from({ length: 3 }, (_, laneIndex) =>
    obstacleLaneWaypoints(
      {
        source: { ...start, y: start.y + laneIndex * 12 },
        target: { ...finish, y: finish.y + laneIndex * 12 },
        sourceId: 'importer',
        targetId: 'provider',
        laneIndex,
        laneCount: 3,
      },
      [obstacle],
    ),
  );
  assert.ok(paths.every((path) => path.length === 2));
  assert.equal(new Set(paths.map((path) => path[0]!.y)).size, 3);
  for (const path of paths)
    for (const waypoint of path)
      assert.ok(waypoint.y <= obstacle.position.y - 13 || waypoint.y >= 120 + 13);
});

test('real Smart Edge A* obeys independent waypoints around the blocking node', () => {
  const nodes = [
    {
      id: 'importer',
      position: { x: 0, y: 0 },
      width: 264,
      height: 120,
      measured: { width: 264, height: 120 },
      data: {},
    },
    {
      id: 'provider',
      position: { x: 800, y: 0 },
      width: 264,
      height: 120,
      measured: { width: 264, height: 120 },
      data: {},
    },
    {
      id: 'obstacle',
      position: { x: 400, y: 0 },
      width: 264,
      height: 120,
      measured: { width: 264, height: 120 },
      data: {},
    },
  ];
  const edges = [48, 60, 72].map((y, index) => ({
    id: 'wire-' + index,
    source: 'importer',
    target: 'provider',
    sourceX: 264,
    sourceY: y,
    targetX: 800,
    targetY: y,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    preset: 'smoothstep' as const,
    options: { nodePadding: 13, gridRatio: 8, borderRadius: 12 },
    waypoints: obstacleLaneWaypoints(
      {
        source: { x: 264, y },
        target: { x: 800, y },
        sourceId: 'importer',
        targetId: 'provider',
        laneIndex: index,
        laneCount: 3,
      },
      nodes,
    ),
  }));
  const routes = routeSmartEdgeBatch(nodes, edges);
  const paths = edges.map((edge) => {
    const route = routes[edge.id];
    assert.equal(route?.kind, 'routed', 'actual A* computed a route for each dependency');
    if (!route || route.kind !== 'routed') throw new Error('No path for ' + edge.id);
    return route;
  });
  assert.equal(
    new Set(paths.map((route) => route.edgeCenterY)).size,
    3,
    'three distinguishable mid-corridors',
  );
  for (const route of paths) {
    assert.ok(route.points && route.points.length >= 3);
    // Smart Edge returns a grid polyline; every segment must stay outside the
    // actual unrelated node interior, not merely look separated in a screenshot.
    const points = route.points as number[][];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1]!;
      const [x2, y2] = points[i]!;
      if (y1 === y2 && y1! > 0 && y1! < 120)
        assert.ok(
          !(Math.min(x1!, x2!) < 664 && Math.max(x1!, x2!) > 400),
          'horizontal blocker avoided',
        );
      if (x1 === x2 && x1! > 400 && x1! < 664)
        assert.ok(
          !(Math.min(y1!, y2!) < 120 && Math.max(y1!, y2!) > 0),
          'vertical blocker avoided',
        );
    }
  }
});
