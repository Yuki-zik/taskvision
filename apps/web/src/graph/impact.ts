import type { KnowledgeEdge, KnowledgeNode } from './model';

export const IMPACT_MODES = [
  'all',
  'dependencies',
  'dependents',
  'impact',
  'neighborhood',
] as const;
export type ImpactMode = (typeof IMPACT_MODES)[number];

export interface ImpactAnalysis {
  /** Null when the requested focus is absent from the passed graph. */
  focusId: string | null;
  mode: ImpactMode;
  /** Primary nodes, including the valid focus; all passed nodes in all mode. */
  affected: Set<string>;
  /** Original directed edge IDs on shortest traversal paths; all valid edges in all mode. */
  edgeIds: Set<string>;
  /** Shortest hops, ordered by depth then ID. All mode records only a valid focus at zero. */
  depths: Map<string, number>;
  /** One-hop nodes, excluding focus. Counts are zero in all mode. */
  directCount: number;
  /** Nodes beyond one hop, excluding focus. Only impact mode can have these. */
  indirectCount: number;
  /** Passed nodes outside this lens, including connected nodes beyond its hop limit. */
  disconnectedCount: number;
}

/**
 * Analyze the already scoped, collapsed and category-filtered graph without changing it.
 * source → target means source imports target. Impact walks incoming edges; it describes
 * possible static reachability, never proof that an importer's behavior will break.
 *
 * A highlighted edge must advance one shortest hop in the chosen traversal direction.
 * Keep all equal shortest paths and parallel categories, rather than an arbitrary BFS
 * tree. Same-depth links, longer detours, self loops and cycle returns are excluded.
 * Edge IDs always refer to the original arrows, even when traversal is reversed.
 *
 * BFS visits only passed nodes, once each, using a queue index instead of recursion or
 * shift(). Analysis is O(V + E), plus sorting output IDs for deterministic iteration.
 * Missing focus yields an empty focused lens; all mode requires no focus or traversal.
 * Additional zero-hop seed nodes represent expanded files inside a selected module:
 * they are analyzed as part of the same module, never counted as its dependents.
 */
export function analyzeImpact(
  nodes: readonly Readonly<Pick<KnowledgeNode, 'id'>>[],
  edges: readonly Readonly<Pick<KnowledgeEdge, 'id' | 'source' | 'target'>>[],
  focusId: string | null | undefined = null,
  mode: ImpactMode = 'all',
  additionalSeedIds: readonly string[] = [],
): ImpactAnalysis {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const focus = focusId != null && nodeIds.has(focusId) ? focusId : null;
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const depths = new Map<string, number>();
  const edgeIds = new Set<string>();
  if (focus !== null) {
    depths.set(focus, 0);
    if (mode !== 'all')
      for (const id of [...new Set(additionalSeedIds)].sort()) {
        if (nodeIds.has(id)) depths.set(id, 0);
      }
  }

  if (mode === 'all') {
    return {
      focusId: focus,
      mode,
      affected: new Set([...nodeIds].sort()),
      edgeIds: new Set(validEdges.map((edge) => edge.id).sort()),
      depths,
      directCount: 0,
      indirectCount: 0,
      disconnectedCount: 0,
    };
  }

  if (focus !== null) {
    const adjacency = new Map<string, { nodeId: string; edgeId: string }[]>();
    const add = (from: string, to: string, edgeId: string) => {
      const neighbors = adjacency.get(from) ?? [];
      neighbors.push({ nodeId: to, edgeId });
      adjacency.set(from, neighbors);
    };
    for (const edge of validEdges) {
      if (mode === 'dependencies' || mode === 'neighborhood')
        add(edge.source, edge.target, edge.id);
      if (mode !== 'dependencies') add(edge.target, edge.source, edge.id);
    }
    const queue = [...depths.keys()];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      const depth = depths.get(current)!;
      if (mode !== 'impact' && depth >= 1) continue;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!depths.has(neighbor.nodeId)) {
          depths.set(neighbor.nodeId, depth + 1);
          queue.push(neighbor.nodeId);
        }
        if (depths.get(neighbor.nodeId) === depth + 1) edgeIds.add(neighbor.edgeId);
      }
    }
  }

  const orderedDepths = new Map(
    [...depths].sort(([a, aDepth], [b, bDepth]) => aDepth - bDepth || (a < b ? -1 : a > b ? 1 : 0)),
  );
  let directCount = 0;
  let indirectCount = 0;
  for (const depth of orderedDepths.values()) {
    if (depth === 1) directCount++;
    else if (depth > 1) indirectCount++;
  }
  return {
    focusId: focus,
    mode,
    affected: new Set([...depths.keys()].sort()),
    edgeIds: new Set([...edgeIds].sort()),
    depths: orderedDepths,
    directCount,
    indirectCount,
    disconnectedCount: nodeIds.size - depths.size,
  };
}
