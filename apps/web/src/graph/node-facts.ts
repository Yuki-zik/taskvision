import type { Tag } from '../domain';
import type { KnowledgeNodeData } from './model';

export interface NodeStatusFact {
  kind: 'review' | 'owner' | 'unclaimed' | 'stale';
  label: string;
}

const TAG_ORDER: readonly Tag[] = ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO'];

/** Visible graph facts, never inferred health or progress. Ports describe the
 * current graph/filter: counterpart counts and source-reference counts differ. */
export function deriveNodeFacts(
  data: Pick<
    KnowledgeNodeData,
    'files' | 'lines' | 'counts' | 'owners' | 'reviews' | 'annotations' | 'wirePorts'
  >,
) {
  const ports = Object.values(data.wirePorts);
  const incoming = ports.filter((port) => port.side === 'in');
  const outgoing = ports.filter((port) => port.side === 'out');
  const annotations = data.annotations.filter((annotation) => annotation.status !== 'archived');
  const staleAnnotations = annotations.filter(
    (annotation) => annotation.freshness === 'stale',
  ).length;
  const missingAnnotations = annotations.filter(
    (annotation) => annotation.freshness === 'missing',
  ).length;
  const owners = [...new Set(data.owners.filter((owner) => owner.trim()))];
  const statuses: NodeStatusFact[] = [];
  if (data.reviews > 0) statuses.push({ kind: 'review', label: `待验收 ${data.reviews}` });
  statuses.push(
    owners.length
      ? { kind: 'owner', label: `Agent ${owners.join('、')}` }
      : { kind: 'unclaimed', label: '未认领' },
  );
  const outdated = staleAnnotations + missingAnnotations;
  if (outdated > 0) statuses.push({ kind: 'stale', label: `标注待核 ${outdated}` });

  const symbols = new Map<string, { name: string; path: string; line: number }>();
  for (const annotation of annotations) {
    if (!annotation.symbol || !annotation.path) continue;
    const key = JSON.stringify([annotation.path, annotation.line, annotation.symbol]);
    symbols.set(key, {
      name: annotation.symbol,
      path: annotation.path,
      line: annotation.line,
    });
  }

  return {
    files: data.files,
    lines: data.lines,
    incoming: new Set(incoming.map((port) => port.counterpart)).size,
    outgoing: new Set(outgoing.map((port) => port.counterpart)).size,
    incomingReferences: incoming.reduce((sum, port) => sum + port.count, 0),
    outgoingReferences: outgoing.reduce((sum, port) => sum + port.count, 0),
    tags: TAG_ORDER.filter((tag) => data.counts[tag] > 0).map((tag) => ({
      tag,
      count: data.counts[tag],
    })),
    annotationCount: annotations.length,
    reviewAnnotations: data.counts.REVIEW,
    pendingReviews: data.reviews,
    staleAnnotations,
    missingAnnotations,
    statuses,
    symbols: [...symbols.values()],
  };
}
