import assert from 'node:assert/strict';
import test from 'node:test';
import type { Annotation } from '../src/domain';
import { buildGraph } from '../src/graph/model';
import { prepareNodeDetail, ANNOTATION_PREVIEW_LIMIT } from '../src/graph/NodeDetailPopover';
import type { Snapshot } from '../src/domain';

const annotation = (index: number, extra: Partial<Annotation> = {}): Annotation => ({
  id: `annotation-${index}`,
  tag: 'CORE',
  summary: `Source fact ${index}`,
  body: '',
  path: 'src/engine.ts',
  line: index + 1,
  endLine: index + 1,
  origin: 'source',
  author: 'source',
  status: 'active',
  revision: 1,
  fileHash: null,
  freshness: 'current',
  ...extra,
});
const snapshot = (annotations: Annotation[]): Snapshot => ({
  project: {
    name: 'fixture',
    root: '/fixture',
    branch: '',
    head: '',
    workspaceId: 'fixture',
    storePath: '',
    isGit: false,
  },
  revision: 1,
  files: [
    {
      path: 'src/engine.ts',
      language: 'typescript',
      lines: 41,
      tags: ['CORE'],
      annotationCount: annotations.length,
      symbols: [],
    },
    {
      path: 'apps/web/index.ts',
      language: 'typescript',
      lines: 7,
      tags: [],
      annotationCount: 0,
      symbols: [],
    },
  ],
  annotations,
  tasks: [],
  claims: [],
  reviews: [],
  edges: [
    {
      from: 'apps/web/index.ts',
      to: 'src/engine.ts',
      kind: 'runtime-import',
      provenance: 'typescript-ast',
      line: 2,
    },
    {
      from: 'apps/web/index.ts',
      to: 'src/engine.ts',
      kind: 'type-import',
      provenance: 'typescript-ast',
      line: 3,
    },
  ],
  limits: { truncated: false, scannedFiles: 2, maxFiles: 100 },
});
function detail(annotations: Annotation[], overrides: Partial<Snapshot> = {}) {
  const graph = buildGraph(
    { ...snapshot(annotations), ...overrides },
    {
      scope: '',
      expanded: [],
      filter: { query: '', tag: '', hotspots: false },
      focusId: null,
      infrastructure: false,
      detailed: false,
      relationMode: 'categories',
    },
  );
  return prepareNodeDetail(graph.nodes.find((node) => node.data.path === 'src')!.data);
}

test('preview stays bounded without losing annotation totals or provenance', () => {
  const annotations = Array.from({ length: 12 }, (_, index) => annotation(index));
  annotations.push(annotation(99, { status: 'archived' }));
  const result = detail(annotations);
  assert.equal(result.annotationCount, 12);
  assert.equal(result.preview.length, ANNOTATION_PREVIEW_LIMIT);
  assert.equal(result.remainingAnnotations, 12 - ANNOTATION_PREVIEW_LIMIT);
  assert.equal(result.preview[0]!.path, 'src/engine.ts');
  assert.equal(result.preview[0]!.line, 1);
  assert.equal(result.preview[0]!.origin, 'source');
  assert.equal(annotations.length, 13);
});

test('multiple categories count one incoming counterpart and all actual references', () => {
  const result = detail([annotation(0)]);
  assert.equal(result.files, 1);
  assert.equal(result.lines, 41);
  assert.equal(result.incoming, 1);
  assert.equal(result.incomingReferences, 2);
  assert.equal(result.outgoing, 0);
  assert.equal(result.outgoingReferences, 0);
});

test('REVIEW annotations never invent a review delivery, claim, or freshness', () => {
  const result = detail([
    annotation(0, { tag: 'REVIEW' }),
    annotation(1, { freshness: 'stale' }),
    annotation(2, { freshness: 'missing' }),
  ]);
  assert.equal(result.pendingReviews, 0);
  assert.equal(result.staleAnnotations, 1);
  assert.equal(result.missingAnnotations, 1);
  assert.deepEqual(result.statuses, [
    { kind: 'unclaimed', label: '未认领' },
    { kind: 'stale', label: '标注待核 2' },
  ]);
  assert.deepEqual(result.tags, [
    { tag: 'CORE', count: 2 },
    { tag: 'REVIEW', count: 1 },
  ]);
});

test('all semantic tag counts and web provenance survive the preview boundary', () => {
  const tags = ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO'] as const;
  const result = detail(
    tags.map((tag, index) =>
      annotation(index, {
        tag,
        origin: index === 0 ? 'web' : 'source',
        author: index === 0 ? 'human' : 'source',
      }),
    ),
  );
  assert.deepEqual(
    result.tags.map((item) => item.tag),
    [...tags],
  );
  assert.equal(result.preview.find((item) => item.origin === 'web')!.author, 'human');
  assert.equal(result.remainingAnnotations, 0);
});

test('real pending deliveries and live claims remain distinct from expired claims and accepted reviews', () => {
  const pending = {
    id: 'pending',
    taskId: 'task',
    summary: 'Delivered change',
    paths: ['src'],
    evidence: [],
    status: 'pending' as const,
    workspaceId: 'fixture',
    head: 'head',
    fileHashes: {},
    createdAt: '2026-01-01',
  };
  const result = detail([annotation(0)], {
    reviews: [pending, { ...pending, id: 'accepted', status: 'accepted' }],
    claims: [
      {
        taskId: 'task',
        agentId: 'codex',
        paths: ['src'],
        expiresAt: '2999-01-01',
        workspaceId: 'fixture',
      },
      {
        taskId: 'old',
        agentId: 'expired',
        paths: ['src'],
        expiresAt: '2000-01-01',
        workspaceId: 'fixture',
      },
    ],
  });
  assert.equal(result.pendingReviews, 1);
  assert.deepEqual(result.statuses, [
    { kind: 'review', label: '待验收 1' },
    { kind: 'owner', label: 'Agent codex' },
  ]);
});
