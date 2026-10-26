import type { Edge, Node } from '@xyflow/react';
import type { Annotation, Filter, Snapshot, SourceEdge, SourceFile, Tag } from '../domain';
import { inScope, matchesAnnotation } from '../domain';
import { filesForScope, groupForPath, isInfrastructurePath, scopeLabel } from './scopes';
import { nodeSize } from './presentation';
export { moduleForPath } from './scopes';

export interface KnowledgeNodeData extends Record<string, unknown> {
  kind: 'module' | 'file';
  path: string;
  label: string;
  files: number;
  lines: number;
  summary: string;
  counts: Record<Tag, number>;
  owners: string[];
  reviews: number;
  expanded: boolean;
  detailed: boolean;
  shownFiles: number;
  summaryPath: string;
  summaryLine: number;
  annotations: Annotation[];
  onExpand?: (path: string) => void;
  onDrill?: (path: string) => void;
  onSource?: (path: string, line: number) => void;
}
export type KnowledgeNode = Node<KnowledgeNodeData, 'knowledge'>;
export interface RoutePoint {
  x: number;
  y: number;
}
export const EVIDENCE_LIMIT = 40;
export const RELATION_CATEGORIES = ['runtime', 'type', 'reexport', 'dynamic', 'lexical'] as const;
export type RelationCategory = (typeof RELATION_CATEGORIES)[number];
export type RelationMode = 'summary' | 'categories';
export type RelationCounts = Partial<Record<RelationCategory, number>>;
export interface RelationData extends Record<string, unknown> {
  category: RelationCategory;
  grouped?: boolean;
  kindCounts?: RelationCounts;
  sourceKindCounts?: Partial<Record<SourceEdge['kind'], number>>;
  count: number;
  evidence: SourceEdge[];
  points?: RoutePoint[];
  emphasized?: boolean;
  muted?: boolean;
  hovered?: boolean;
  parallelCount: number;
}
export type KnowledgeEdge = Edge<RelationData, 'routed'>;

export function relationCategory(kind: SourceEdge['kind']): RelationCategory | undefined {
  switch (kind) {
    case 'runtime-import':
    case 'require':
    case 'import':
      return 'runtime';
    case 'type-import':
      return 'type';
    case 're-export':
      return 'reexport';
    case 'dynamic-import':
      return 'dynamic';
    case 'lexical-import':
      return 'lexical';
  }
}

// Separate ports keep coexisting relation categories selectable rather than overpainting them.
export function relationHandle(side: 'in' | 'out', category: RelationCategory): string {
  return category === 'runtime' ? side : `${side}-${category}`;
}
export function relationOffset(category: RelationCategory): number {
  return { runtime: 0, type: -40, reexport: -20, dynamic: 20, lexical: 40 }[category];
}
export interface GraphModel {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  signature: string;
  totalFiles: number;
  codeFiles: number;
  infrastructureFiles: number;
  detailed: boolean;
  counts?: Record<RelationCategory, number>;
}
export interface GraphOptions {
  scope: string;
  expanded: string[];
  filter: Filter;
  focusId: string | null;
  infrastructure?: boolean;
  detailed?: boolean;
  relationMode?: RelationMode;
  relationKinds?: RelationCategory[];
}

export function defaultRelationMode(scope: string): RelationMode {
  return scope ? 'categories' : 'summary';
}

// Round-robin sampling keeps even rare source kinds represented within the display budget.
function sampleEvidence(buckets: SourceEdge[][]): SourceEdge[] {
  if (buckets.reduce((sum, bucket) => sum + bucket.length, 0) <= EVIDENCE_LIMIT)
    return buckets.flat().map((edge) => ({ ...edge }));
  const evidence: SourceEdge[] = [];
  for (let index = 0; evidence.length < EVIDENCE_LIMIT; index++) {
    let added = false;
    for (const bucket of buckets) {
      const edge = bucket[index];
      if (edge) {
        evidence.push({ ...edge });
        added = true;
        if (evidence.length === EVIDENCE_LIMIT) break;
      }
    }
    if (!added) break;
  }
  return evidence;
}

export function sourcePriority(path: string): number {
  return /(?:^|\/)(?:index|extension|main|server|App|types|schemas)\.[cm]?[jt]sx?$/.test(path)
    ? 0
    : 1;
}

function dataFor(
  snapshot: Snapshot,
  files: SourceFile[],
  path: string,
  kind: 'module' | 'file',
  expanded: boolean,
  detailed: boolean,
): KnowledgeNodeData {
  const paths = new Set(files.map((file) => file.path));
  const annotations = snapshot.annotations.filter(
    (annotation) => paths.has(annotation.path) && annotation.status !== 'archived',
  );
  const counts: Record<Tag, number> = { CORE: 0, INTENT: 0, REUSE: 0, REVIEW: 0, TODO: 0 };
  for (const annotation of annotations) counts[annotation.tag]++;
  const priority: Record<Tag, number> = { CORE: 0, INTENT: 2, REUSE: 1, REVIEW: 3, TODO: 4 };
  const summary = [...annotations].sort(
    (a, b) =>
      priority[a.tag] - priority[b.tag] ||
      sourcePriority(a.path) - sourcePriority(b.path) ||
      a.line - b.line,
  )[0];
  const owners = [
    ...new Set(
      snapshot.claims
        .filter(
          (claim) =>
            Date.parse(claim.expiresAt) > Date.now() &&
            claim.paths.some((scope) => files.some((file) => inScope(file.path, scope))),
        )
        .map((claim) => claim.agentId),
    ),
  ];
  const reviews = snapshot.reviews.filter(
    (review) =>
      review.status === 'pending' &&
      review.paths.some((scope) => files.some((file) => inScope(file.path, scope))),
  ).length;
  const entryFiles = [...files].sort(
    (a, b) => sourcePriority(a.path) - sourcePriority(b.path) || a.path.localeCompare(b.path),
  );
  const entry = entryFiles[0];
  const useEntry =
    kind === 'module' &&
    entry &&
    sourcePriority(entry.path) === 0 &&
    (!summary || sourcePriority(summary.path) !== 0);
  const entrySummary =
    files.length === 1
      ? [
          entry?.path.split('/').at(-1),
          ...(entry?.symbols.slice(0, 2).map((symbol) => symbol.name) ?? []),
        ]
          .filter(Boolean)
          .join(' · ')
      : entryFiles
          .slice(0, 3)
          .map((file) => file.path.split('/').at(-1))
          .join(' · ');
  return {
    kind,
    path,
    label: kind === 'module' ? scopeLabel(path) : path.split('/').at(-1)!,
    files: files.length,
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    detailed,
    summary: useEntry
      ? entrySummary
      : (summary?.summary ??
        (kind === 'module'
          ? entrySummary
          : `${files[0]?.language ?? '文本'} · ${files[0]?.symbols.length ?? 0} 个已索引符号`)),
    summaryPath: useEntry ? entry.path : (summary?.path ?? entry?.path ?? ''),
    summaryLine: useEntry ? (entry.symbols[0]?.line ?? 1) : (summary?.line ?? 1),
    counts,
    owners,
    reviews,
    expanded,
    shownFiles: expanded ? Math.min(4, files.length) : 0,
    annotations,
  };
}

// INTENT: Aggregate actual import edges at the current scope; grouping never creates dependencies.
export function buildGraph(snapshot: Snapshot, options: GraphOptions): GraphModel {
  const { scope, expanded, filter, focusId, infrastructure = false, detailed = false } = options;
  const relationMode = options.relationMode ?? defaultRelationMode(scope);
  const relationKinds = options.relationKinds ?? RELATION_CATEGORIES;
  const scoped = filesForScope(snapshot.files, scope);
  const infrastructureFiles = scoped.filter((file) => isInfrastructurePath(file.path)).length;
  const query = filter.query.trim().toLowerCase();
  const annotations = snapshot.annotations.filter((annotation) =>
    matchesAnnotation(annotation, filter),
  );
  const annotatedPaths = new Set(annotations.map((annotation) => annotation.path));
  const files = scoped.filter(
    (file) =>
      isInfrastructurePath(file.path) === infrastructure &&
      (!filter.tag || annotatedPaths.has(file.path)) &&
      (!filter.hotspots ||
        annotatedPaths.has(file.path) ||
        snapshot.reviews.some(
          (review) =>
            review.status === 'pending' && review.paths.some((path) => inScope(file.path, path)),
        )) &&
      (!query ||
        `${file.path} ${file.symbols.map((symbol) => symbol.name).join(' ')}`
          .toLowerCase()
          .includes(query) ||
        annotatedPaths.has(file.path)),
  );
  const groups = new Map<string, SourceFile[]>();
  const nodes: KnowledgeNode[] = [];
  const representative = new Map<string, string>();
  const makeNode = (data: KnowledgeNodeData) => {
    const id = `${data.kind}:${data.path}`;
    const { width, height } = nodeSize(data.kind, detailed);
    nodes.push({ id, type: 'knowledge', data, position: { x: 0, y: 0 }, width, height });
    return id;
  };
  for (const file of files) {
    const group = groupForPath(file.path, scope);
    if (group === null)
      representative.set(
        file.path,
        makeNode(dataFor(snapshot, [file], file.path, 'file', false, detailed)),
      );
    else groups.set(group, [...(groups.get(group) ?? []), file]);
  }
  for (const [path, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const isExpanded = expanded.includes(path);
    const moduleId = makeNode(dataFor(snapshot, items, path, 'module', isExpanded, detailed));
    for (const file of items) representative.set(file.path, moduleId);
    if (isExpanded) {
      const sorted = [...items].sort(
        (a, b) =>
          sourcePriority(a.path) - sourcePriority(b.path) ||
          b.annotationCount - a.annotationCount ||
          a.path.localeCompare(b.path),
      );
      for (const file of sorted.slice(0, 4))
        representative.set(
          file.path,
          makeNode(dataFor(snapshot, [file], file.path, 'file', false, detailed)),
        );
    }
  }
  const dependencies = new Map<string, KnowledgeEdge>();
  const evidenceByEdge = new Map<string, Map<SourceEdge['kind'], SourceEdge[]>>();
  for (const edge of snapshot.edges) {
    const category = relationCategory(edge.kind);
    const source = representative.get(edge.from),
      target = representative.get(edge.to);
    if (!category || !source || !target || source === target) continue;
    const id = `dependency:${category}:${source}→${target}`;
    const existing = dependencies.get(id);
    if (existing?.data) {
      existing.data.count++;
      existing.data.kindCounts![category] = existing.data.count;
      const counts = existing.data.sourceKindCounts!;
      counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;
    } else
      dependencies.set(id, {
        id,
        source,
        target,
        sourceHandle: relationHandle('out', category),
        targetHandle: relationHandle('in', category),
        type: 'routed',
        data: {
          category,
          count: 1,
          kindCounts: { [category]: 1 },
          sourceKindCounts: { [edge.kind]: 1 },
          evidence: [],
          parallelCount: 1,
        },
      });
    const buckets = evidenceByEdge.get(id) ?? new Map<SourceEdge['kind'], SourceEdge[]>();
    const bucket = buckets.get(edge.kind) ?? [];
    if (bucket.length < EVIDENCE_LIMIT) bucket.push(edge);
    buckets.set(edge.kind, bucket);
    evidenceByEdge.set(id, buckets);
  }
  const categorized = [...dependencies.values()];
  for (const edge of categorized)
    edge.data!.evidence = sampleEvidence([...evidenceByEdge.get(edge.id)!.values()]);
  const filtered = categorized.filter((edge) => relationKinds.includes(edge.data!.category));
  const grouped = new Map<string, KnowledgeEdge>();
  if (relationMode === 'summary') {
    for (const edge of filtered) {
      const id = `dependency:summary:${edge.source}→${edge.target}`;
      let summary = grouped.get(id);
      if (!summary) {
        summary = {
          id,
          source: edge.source,
          target: edge.target,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'routed',
          data: {
            // Compatibility port/category only: grouped metadata carries the actual meaning.
            category: 'runtime',
            grouped: true,
            kindCounts: {},
            sourceKindCounts: {},
            count: 0,
            evidence: [],
            parallelCount: 1,
          },
        };
        grouped.set(id, summary);
      }
      const data = summary.data!;
      data.count += edge.data!.count;
      Object.assign(data.kindCounts!, edge.data!.kindCounts);
      Object.assign(data.sourceKindCounts!, edge.data!.sourceKindCounts);
      data.evidence.push(...edge.data!.evidence);
    }
    for (const edge of grouped.values()) {
      const buckets = new Map<SourceEdge['kind'], SourceEdge[]>();
      for (const evidence of edge.data!.evidence) {
        const bucket = buckets.get(evidence.kind) ?? [];
        bucket.push(evidence);
        buckets.set(evidence.kind, bucket);
      }
      edge.data!.evidence = sampleEvidence([...buckets.values()]);
    }
  }
  const edges = relationMode === 'summary' ? [...grouped.values()] : filtered;
  const endpointCounts = new Map<string, number>();
  for (const edge of edges) {
    const key = JSON.stringify([edge.source, edge.target]);
    endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1);
  }
  for (const edge of edges)
    edge.data!.parallelCount = endpointCounts.get(JSON.stringify([edge.source, edge.target]))!;
  const neighborIds = new Set([focusId]);
  if (focusId)
    for (const edge of edges) {
      if (edge.source === focusId) neighborIds.add(edge.target);
      if (edge.target === focusId) neighborIds.add(edge.source);
    }
  const visibleNodes = focusId ? nodes.filter((node) => neighborIds.has(node.id)) : nodes;
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  // Toolbar totals describe all source relationships in the focused neighborhood,
  // regardless of display filters. Derive neighbors from the unfiltered category
  // edges; deriving them from visibleEdges would incorrectly make hidden kinds
  // look like they disappeared from the actual project.
  const countIds = new Set(focusId ? [focusId] : nodes.map((node) => node.id));
  if (focusId)
    for (const edge of categorized) {
      if (edge.source === focusId) countIds.add(edge.target);
      if (edge.target === focusId) countIds.add(edge.source);
    }
  const counts: Record<RelationCategory, number> = {
    runtime: 0,
    type: 0,
    reexport: 0,
    dynamic: 0,
    lexical: 0,
  };
  for (const edge of categorized)
    if (countIds.has(edge.source) && countIds.has(edge.target))
      counts[edge.data!.category] += edge.data!.count;
  const signature = JSON.stringify([
    visibleNodes.map((node) => [node.id, node.width, node.height]).sort(),
    visibleEdges.map((edge) => [edge.id, edge.source, edge.target]).sort(),
  ]);
  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    signature,
    totalFiles: files.length,
    codeFiles: scoped.length - infrastructureFiles,
    infrastructureFiles,
    detailed,
    counts,
  };
}
