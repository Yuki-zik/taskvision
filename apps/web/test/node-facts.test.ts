import assert from 'node:assert/strict';
import test from 'node:test';
import type { Annotation } from '../src/domain';
import type { KnowledgeNodeData, WirePort } from '../src/graph/model';
import { deriveNodeFacts } from '../src/graph/node-facts';
import { MAP_ZOOM_THRESHOLD, nodeSize, readingMode } from '../src/graph/presentation';

const empty = (): KnowledgeNodeData => ({
  kind: 'module',
  path: 'packages/core',
  label: 'packages/core',
  files: 0,
  lines: 0,
  summary: '',
  counts: { CORE: 0, REUSE: 0, INTENT: 0, REVIEW: 0, TODO: 0 },
  owners: [],
  reviews: 0,
  expanded: false,
  detailed: false,
  shownFiles: 0,
  summaryPath: '',
  summaryLine: 1,
  annotations: [],
  wirePorts: {},
});

function port(
  id: string,
  side: WirePort['side'],
  counterpart: string,
  category: WirePort['category'],
  count = 1,
): WirePort {
  return {
    id,
    edgeId: id,
    side,
    counterpart,
    category,
    kindCounts: category === 'summary' ? { runtime: count } : { [category]: count },
    count,
    y: 50,
    spacing: 18,
    crowded: false,
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'a',
    tag: 'CORE',
    summary: 'Real source knowledge',
    body: '',
    path: 'packages/core/index.ts',
    line: 12,
    endLine: 12,
    origin: 'source',
    author: 'source',
    status: 'active',
    revision: 1,
    fileHash: null,
    freshness: 'current',
    ...overrides,
  };
}

test('incoming counts referencing counterparts; outgoing counts depended-on providers once per side', () => {
  const data = empty();
  const ports = [
    port('in:web:runtime', 'in', 'module:apps/web', 'runtime', 7),
    port('in:web:type', 'in', 'module:apps/web', 'type', 3),
    port('in:cli', 'in', 'module:apps/cli', 'runtime', 2),
    port('out:shared:runtime', 'out', 'module:packages/shared', 'runtime', 5),
    port('out:shared:type', 'out', 'module:packages/shared', 'type', 4),
    port('out:web', 'out', 'module:apps/web', 'dynamic'),
  ];
  data.wirePorts = Object.fromEntries(ports.map((item) => [item.id, item]));
  const facts = deriveNodeFacts(data);
  assert.equal(facts.incoming, 2);
  assert.equal(facts.outgoing, 2);
  assert.equal(facts.incomingReferences, 12);
  assert.equal(facts.outgoingReferences, 10);
});

test('grouped source reference counts never become counterpart counts', () => {
  const data = empty();
  data.wirePorts = { incoming: port('incoming', 'in', 'module:apps/web', 'summary', 19) };
  const facts = deriveNodeFacts(data);
  assert.equal(facts.incoming, 1);
  assert.equal(facts.incomingReferences, 19);
  assert.equal(facts.outgoing, 0);
});

test('all five nonzero tag counts remain visible and REVIEW is distinct from pending delivery reviews', () => {
  const data = empty();
  data.counts = { CORE: 3, REUSE: 2, INTENT: 6, REVIEW: 11, TODO: 4 };
  data.reviews = 2;
  data.owners = ['codex', 'codex', 'reviewer'];
  const facts = deriveNodeFacts(data);
  assert.deepEqual(facts.tags, [
    { tag: 'CORE', count: 3 },
    { tag: 'REUSE', count: 2 },
    { tag: 'INTENT', count: 6 },
    { tag: 'REVIEW', count: 11 },
    { tag: 'TODO', count: 4 },
  ]);
  assert.deepEqual(facts.statuses, [
    { kind: 'review', label: '待验收 2' },
    { kind: 'owner', label: 'Agent codex、reviewer' },
  ]);
  assert.equal(facts.pendingReviews, 2);
  assert.equal(facts.reviewAnnotations, 11);
});

test('REVIEW annotations alone do not claim a pending review or an owner', () => {
  const data = empty();
  data.counts.REVIEW = 8;
  const facts = deriveNodeFacts(data);
  assert.equal(facts.pendingReviews, 0);
  assert.deepEqual(facts.statuses, [{ kind: 'unclaimed', label: '未认领' }]);
  assert.deepEqual(facts.tags, [{ tag: 'REVIEW', count: 8 }]);
});

test('only actual nonarchived freshness states disclose stale or missing annotations', () => {
  const data = empty();
  data.annotations = [
    annotation({ id: 'current' }),
    annotation({ id: 'stale', freshness: 'stale' }),
    annotation({ id: 'missing', freshness: 'missing' }),
    annotation({ id: 'archived', freshness: 'stale', status: 'archived' }),
  ];
  data.reviews = 1;
  data.owners = ['builder'];
  const facts = deriveNodeFacts(data);
  assert.equal(facts.staleAnnotations, 1);
  assert.equal(facts.missingAnnotations, 1);
  assert.equal(facts.annotationCount, 3);
  assert.deepEqual(facts.statuses, [
    { kind: 'review', label: '待验收 1' },
    { kind: 'owner', label: 'Agent builder' },
    { kind: 'stale', label: '标注待核 2' },
  ]);
  assert.ok(facts.statuses.length <= 3);
});

test('details retain real annotated source symbols with their source coordinates', () => {
  const data = empty();
  data.annotations = [
    annotation({ symbol: 'loadGraph' }),
    annotation({ id: 'duplicate', symbol: 'loadGraph' }),
    annotation({ id: 'other-file', symbol: 'loadGraph', path: 'packages/core/loader.ts' }),
    annotation({ id: 'no-symbol', symbol: undefined }),
    annotation({ id: 'archived', symbol: 'oldGraph', status: 'archived' }),
  ];
  assert.deepEqual(deriveNodeFacts(data).symbols, [
    { name: 'loadGraph', path: 'packages/core/index.ts', line: 12 },
    { name: 'loadGraph', path: 'packages/core/loader.ts', line: 12 },
  ]);
});

test('zero-data facts truthfully report no annotations and unclaimed with zero metrics', () => {
  const facts = deriveNodeFacts(empty());
  assert.equal(facts.files, 0);
  assert.equal(facts.lines, 0);
  assert.equal(facts.incoming, 0);
  assert.equal(facts.outgoing, 0);
  assert.equal(facts.incomingReferences, 0);
  assert.equal(facts.outgoingReferences, 0);
  assert.equal(facts.annotationCount, 0);
  assert.equal(facts.pendingReviews, 0);
  assert.equal(facts.staleAnnotations, 0);
  assert.equal(facts.missingAnnotations, 0);
  assert.deepEqual(facts.tags, []);
  assert.deepEqual(facts.symbols, []);
  assert.deepEqual(facts.statuses, [{ kind: 'unclaimed', label: '未认领' }]);
});

test('studio geometry reserves overview facts at initial zoom and simplifies only below 0.48', () => {
  assert.deepEqual(nodeSize('module', false), { width: 304, height: 196 });
  assert.deepEqual(nodeSize('module', true), { width: 328, height: 248 });
  assert.deepEqual(nodeSize('file', false), { width: 292, height: 184 });
  assert.deepEqual(nodeSize('file', true), { width: 316, height: 236 });
  assert.equal(MAP_ZOOM_THRESHOLD, 0.48);
  assert.equal(readingMode(0.7, false), 'overview');
  assert.equal(readingMode(0.7, true), 'detail');
  assert.equal(readingMode(0.48, false), 'overview');
  assert.equal(readingMode(0.479, true), 'map');
});
