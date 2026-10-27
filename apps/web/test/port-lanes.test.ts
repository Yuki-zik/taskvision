import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { SourceIndex } from '../../../packages/core/src/scanner';
import type { Snapshot } from '../src/domain';
import { layoutGraph, retainPositions } from '../src/graph/layout';
import { buildGraph, type GraphModel, type GraphOptions } from '../src/graph/model';
import { nodeSize } from '../src/graph/presentation';

const options: GraphOptions = {
  scope: '',
  expanded: [],
  filter: { query: '', tag: '', hotspots: false },
  focusId: null,
  relationMode: 'categories',
};

// Exercise the actual scanner and source lines, including imports that collapse
// inside a module, an unresolved package and a completely disconnected module.
function sourceFixture(t: TestContext, extra: Record<string, string> = {}): Snapshot {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-port-lanes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = {
    'apps/cli/index.ts': "import { run } from '../../packages/core/index';\nrun();\n",
    'apps/mcp/index.ts': "import { run } from '../../packages/core/index';\nrun();\n",
    'apps/server/index.ts': "import { run } from '../../packages/core/index';\nrun();\n",
    'apps/web/index.ts': [
      "import { run } from '../../packages/core/index';",
      "import type { Config } from '../../packages/core/index';",
      "export { run } from '../../packages/core/index';",
      "export const load = () => import('../../packages/core/index');",
      "import { shared } from '../../packages/shared/index';",
      "import { helper } from './helper';",
      "import external from 'unresolved-vendor';",
      'export const page = (config: Config) => [run(), shared, helper, external, config];',
    ].join('\n'),
    'apps/web/secondary.ts': "import { run } from '../../packages/core/index';\nrun();\n",
    'apps/web/helper.ts': 'export const helper = true;\n',
    'packages/core/index.ts':
      'export interface Config { name: string }\nexport const run = () => true;\n',
    'packages/shared/index.ts': 'export const shared = true;\n',
    'packages/island/index.ts': 'export const isolated = true;\n',
    ...extra,
  };
  for (const [relative, content] of Object.entries(sources)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  const project: Snapshot['project'] = {
    name: 'Real source port fixture',
    root,
    branch: '',
    head: '',
    workspaceId: 'port-lanes',
    storePath: '',
    isGit: false,
  };
  const scanned = new SourceIndex(project, 200).scan();
  assert.equal(scanned.files.length, Object.keys(sources).length);
  assert.ok(scanned.edges.every((edge) => edge.provenance.startsWith('typescript-ast-')));
  return {
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
}

function assertPortGeometry(model: GraphModel): void {
  const portIds = new Set<string>();
  for (const node of model.nodes) {
    assert.deepEqual(
      { width: node.width, height: node.height },
      nodeSize(node.data.kind, node.data.detailed),
    );
    const ports = Object.values(node.data.wirePorts);
    const attached = model.edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    );
    assert.equal(ports.length, attached.length, `${node.id}: only live dependency ports`);
    for (const [id, port] of Object.entries(node.data.wirePorts)) {
      assert.equal(id, port.id);
      assert.ok(!portIds.has(id), 'port IDs are globally unique, including their side');
      portIds.add(id);
      assert.ok(port.y >= 16 && port.y <= node.height! - 16, `${id}: corner clearance`);
      const edge = attached.find((item) => item.id === port.edgeId)!;
      assert.ok(edge, `${id}: port must represent a real visible edge`);
      assert.equal(port.id, port.side === 'in' ? edge.targetHandle : edge.sourceHandle);
      assert.equal(port.counterpart, port.side === 'in' ? edge.source : edge.target);
      assert.equal(port.category, edge.data!.grouped ? 'summary' : edge.data!.category);
      assert.deepEqual(port.kindCounts, edge.data!.kindCounts);
      assert.equal(port.count, edge.data!.count);
    }
    for (const side of ['in', 'out'] as const) {
      const ys = ports
        .filter((port) => port.side === side)
        .map((port) => port.y)
        .sort((a, b) => a - b);
      if (ys.length <= node.height! - 32 + 1)
        assert.equal(
          new Set(ys).size,
          ys.length,
          `${node.id}: unique physical endpoints on ${side}`,
        );
      if (ys.length <= 8)
        for (let index = 1; index < ys.length; index++)
          assert.ok(ys[index]! - ys[index - 1]! >= 8, `${node.id}: at least 8px apart`);
    }
  }
  assert.equal(portIds.size, model.edges.length * 2);
}

test('scanned shared-core fan-in and multi-category fan-out have distinct ports without phantom edges', (t) => {
  const snapshot = sourceFixture(t);
  const model = buildGraph(snapshot, options);
  assert.equal(model.nodes.length, 7);
  assert.equal(model.edges.length, 8);
  assert.deepEqual(
    model.edges.map((edge) => `${edge.source}->${edge.target}:${edge.data!.category}`).sort(),
    [
      'module:apps/cli->module:packages/core:runtime',
      'module:apps/mcp->module:packages/core:runtime',
      'module:apps/server->module:packages/core:runtime',
      'module:apps/web->module:packages/core:runtime',
      'module:apps/web->module:packages/core:type',
      'module:apps/web->module:packages/core:reexport',
      'module:apps/web->module:packages/core:dynamic',
      'module:apps/web->module:packages/shared:runtime',
    ].sort(),
  );
  const incoming = model.edges.filter((edge) => edge.target === 'module:packages/core');
  const outgoing = model.edges.filter((edge) => edge.source === 'module:apps/web');
  assert.equal(new Set(incoming.map((edge) => edge.targetHandle)).size, 7);
  assert.equal(new Set(outgoing.map((edge) => edge.sourceHandle)).size, 5);
  assertPortGeometry(model);
  const webPorts = Object.values(
    model.nodes.find((node) => node.id === 'module:apps/web')!.data.wirePorts,
  );
  assert.deepEqual(
    webPorts.map((port) => [port.counterpart, port.category]),
    [
      ['module:packages/core', 'runtime'],
      ['module:packages/core', 'type'],
      ['module:packages/core', 'reexport'],
      ['module:packages/core', 'dynamic'],
      ['module:packages/shared', 'runtime'],
    ],
    'ports are ordered by counterpart and then semantic category, never input order',
  );
  const evidence = model.edges.flatMap((edge) => edge.data!.evidence);
  assert.equal(evidence.length, 9);
  assert.equal(
    model.edges.reduce((sum, edge) => sum + edge.data!.count, 0),
    9,
  );
  for (const original of snapshot.edges.filter((edge) => edge.to.startsWith('packages/')))
    assert.ok(evidence.some((item) => JSON.stringify(item) === JSON.stringify(original)));
  assert.ok(evidence.every((item) => item.line && item.specifier));
});

test('port identity, ordering, geometry and layout signature survive input reordering and evidence polling', (t) => {
  const snapshot = sourceFixture(t);
  const original = buildGraph(snapshot, options);
  const reordered = buildGraph(
    {
      ...snapshot,
      revision: 2,
      files: [...snapshot.files].reverse(),
      edges: [...snapshot.edges].reverse(),
    },
    options,
  );
  assert.equal(reordered.signature, original.signature);
  for (const node of original.nodes)
    assert.deepEqual(
      reordered.nodes.find((item) => item.id === node.id)!.data.wirePorts,
      node.data.wirePorts,
    );
  const runtime = snapshot.edges.find((edge) => edge.from === 'apps/cli/index.ts')!;
  const polled = buildGraph(
    { ...snapshot, revision: 3, edges: [...snapshot.edges, { ...runtime, line: 12 }] },
    options,
  );
  assert.equal(polled.signature, original.signature);
  assertPortGeometry(polled);
  for (const edge of original.edges) {
    const next = polled.edges.find((item) => item.id === edge.id)!;
    assert.equal(next.sourceHandle, edge.sourceHandle);
    assert.equal(next.targetHandle, edge.targetHandle);
  }
  for (const node of original.nodes)
    for (const port of Object.values(node.data.wirePorts)) {
      const next = polled.nodes.find((item) => item.id === node.id)!.data.wirePorts[port.id]!;
      assert.equal(next.y, port.y);
      assert.equal(next.category, port.category);
    }
});

test('one through eight live ports retain at least 8px separation for both node kinds and reading densities', (t) => {
  const leaves = Array.from({ length: 8 }, (_, index) => `packages/degree-${index}`);
  const snapshot = sourceFixture(t, {
    'apps/degree/index.ts': leaves
      .map((leaf, index) => `import { leaf as leaf${index} } from '../../${leaf}/index';`)
      .join('\n'),
    ...Object.fromEntries(
      leaves.map((leaf) => [`${leaf}/index.ts`, 'export const leaf = true;\n']),
    ),
  });
  const sourceEdges = snapshot.edges.filter((edge) => edge.from === 'apps/degree/index.ts');
  assert.equal(sourceEdges.length, 8);
  for (let degree = 1; degree <= 8; degree++)
    for (const detailed of [false, true])
      for (const expanded of [[], ['apps/degree']]) {
        const model = buildGraph(
          { ...snapshot, edges: sourceEdges.slice(0, degree) },
          { ...options, detailed, expanded },
        );
        const source = model.nodes.find(
          (node) =>
            node.id === (expanded.length ? 'file:apps/degree/index.ts' : 'module:apps/degree'),
        )!;
        assert.equal(Object.values(source.data.wirePorts).length, degree);
        assertPortGeometry(model);
      }
});

test('actual ELK routes use precisely the live ports in module/file overview and detail geometry', async (t) => {
  const snapshot = sourceFixture(t);
  for (const detailed of [false, true])
    for (const expanded of [[], ['apps/web', 'packages/core']]) {
      const model = buildGraph(snapshot, { ...options, detailed, expanded });
      assertPortGeometry(model);
      const laid = await layoutGraph(model);
      assert.equal(laid.edges.length, model.edges.length);
      for (const edge of laid.edges) {
        const source = laid.nodes.find((node) => node.id === edge.source)!;
        const target = laid.nodes.find((node) => node.id === edge.target)!;
        const out = source.data.wirePorts[edge.sourceHandle!]!;
        const incoming = target.data.wirePorts[edge.targetHandle!]!;
        const start = edge.data!.points?.[0];
        const end = edge.data!.points?.at(-1);
        assert.ok(start && end, `${edge.id}: actual ELK route`);
        for (const [actual, expected] of [
          [start.x, source.position.x + source.width!],
          [start.y, source.position.y + out.y],
          [end.x, target.position.x],
          [end.y, target.position.y + incoming.y],
        ])
          assert.ok(Math.abs(actual! - expected!) < 1e-6, `${edge.id}: ${actual} != ${expected}`);
      }
      const remembered = new Map(
        laid.nodes.map((node) => [node.id, { x: node.position.x + 37, y: node.position.y - 19 }]),
      );
      for (const node of retainPositions(laid.nodes, remembered)) {
        assert.deepEqual(node.position, remembered.get(node.id));
        assert.deepEqual(
          node.data.wirePorts,
          model.nodes.find((item) => item.id === node.id)!.data.wirePorts,
        );
      }
    }
});

test('summary ports retain real category provenance and aggregate counts, including a type-only summary', (t) => {
  const snapshot = sourceFixture(t);
  const model = buildGraph(snapshot, { ...options, relationMode: 'summary' });
  assert.equal(model.edges.length, 5);
  assertPortGeometry(model);
  const edge = model.edges.find(
    (item) => item.source === 'module:apps/web' && item.target === 'module:packages/core',
  )!;
  assert.equal(edge.data!.count, 5);
  assert.deepEqual(edge.data!.kindCounts, { runtime: 2, type: 1, reexport: 1, dynamic: 1 });
  const filtered = buildGraph(snapshot, {
    ...options,
    relationMode: 'summary',
    relationKinds: ['type'],
  });
  assert.equal(filtered.edges.length, 1);
  assertPortGeometry(filtered);
  const port = filtered.nodes.find((node) => node.id === 'module:apps/web')!.data.wirePorts[
    filtered.edges[0]!.sourceHandle!
  ]!;
  assert.equal(port.category, 'summary');
  assert.deepEqual(port.kindCounts, { type: 1 });
  assert.equal(port.count, 1);
  assert.deepEqual(
    filtered.counts,
    model.counts,
    'display filters preserve true relationship counts',
  );
});

test('high degree is explicitly crowded and bounded, preserves every edge and can be reduced using existing focus', (t) => {
  const leaves = Array.from(
    { length: 32 },
    (_, index) => `packages/leaf-${String(index).padStart(2, '0')}`,
  );
  const snapshot = sourceFixture(t, {
    'apps/hub/index.ts': leaves
      .map((leaf, index) => `import { leaf as leaf${index} } from '../../${leaf}/index';`)
      .join('\n'),
    ...Object.fromEntries(
      leaves.map((leaf) => [`${leaf}/index.ts`, 'export const leaf = true;\n']),
    ),
  });
  const model = buildGraph(snapshot, options);
  const hub = model.nodes.find((node) => node.id === 'module:apps/hub')!;
  const ports = Object.values(hub.data.wirePorts);
  assert.equal(ports.length, leaves.length);
  assert.ok(ports.every((port) => port.crowded));
  assert.equal(new Set(ports.map((port) => port.y)).size, leaves.length);
  assert.ok(ports.every((port) => port.y >= 16 && port.y <= hub.height! - 16));
  assert.equal(model.edges.length, leaves.length + 8);
  assertPortGeometry(model);
  const focused = buildGraph(snapshot, { ...options, focusId: `module:${leaves[0]}` });
  assert.equal(focused.edges.length, 1);
  assertPortGeometry(focused);
  assert.ok(
    focused.nodes.every((node) =>
      Object.values(node.data.wirePorts).every((port) => !port.crowded),
    ),
  );
  assert.deepEqual(
    focused.edges[0]!.data,
    model.edges.find((edge) => edge.id === focused.edges[0]!.id)!.data,
  );
});

test('degree beyond pixel capacity honestly shares crowded physical slots while preserving unique logical ports and all counts', (t) => {
  const leaves = Array.from(
    { length: 100 },
    (_, index) => `packages/dense-${String(index).padStart(3, '0')}`,
  );
  const snapshot = sourceFixture(t, {
    'apps/dense/index.ts': leaves
      .map((leaf, index) => `import { leaf as leaf${index} } from '../../${leaf}/index';`)
      .join('\n'),
    ...Object.fromEntries(
      leaves.map((leaf) => [`${leaf}/index.ts`, 'export const leaf = true;\n']),
    ),
  });
  const model = buildGraph(snapshot, options);
  const hub = model.nodes.find((node) => node.id === 'module:apps/dense')!;
  const ports = Object.values(hub.data.wirePorts);
  assert.equal(ports.length, 100);
  assert.equal(new Set(ports.map((port) => port.id)).size, 100);
  assert.ok(ports.every((port) => port.crowded && Number.isInteger(port.y)));
  assert.equal(new Set(ports.map((port) => port.y)).size, hub.height! - 32 + 1);
  assert.equal(model.edges.length, 108);
  assert.equal(
    model.edges.reduce((sum, edge) => sum + edge.data!.count, 0),
    109,
  );
  assertPortGeometry(model);
});
