import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import type { XYPosition } from '@xyflow/react';
import {
  RELATION_CATEGORIES,
  type GraphModel,
  type KnowledgeEdge,
  type KnowledgeNode,
  type RoutePoint,
} from './model';
import { nodeSize } from './presentation';
import { finitePoint } from './route-geometry';
import { cubicPoint, separatedCable } from './routing';

let engine: Promise<ELK> | undefined;
export interface LaidOutGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
// Existing positions survive data/topology updates. Additions occupy free space around the remembered nodes.
export function retainPositions(
  items: KnowledgeNode[],
  remembered: Map<string, XYPosition>,
): KnowledgeNode[] {
  const settled = items
    .filter((node) => remembered.has(node.id))
    .map((node) => ({ ...node, position: remembered.get(node.id)! }));
  for (const item of items.filter((node) => !remembered.has(node.id))) {
    const node = { ...item, position: { ...item.position } };
    while (
      settled.some(
        (other) =>
          node.position.x < other.position.x + other.width! + 20 &&
          node.position.x + node.width! + 20 > other.position.x &&
          node.position.y < other.position.y + other.height! + 20 &&
          node.position.y + node.height! + 20 > other.position.y,
      )
    )
      node.position.y += node.height! + 30;
    settled.push(node);
  }
  const positions = new Map(settled.map((node) => [node.id, node.position]));
  return items.map((node) => ({ ...node, position: positions.get(node.id)! }));
}
/**
 * Reassign physical slots from the actual routed departure/approach 60 world
 * pixels along the rendered clear cubic or valid ELK polyline. Distant
 * neighbor center Y breaks ties and remains the fallback for missing/stale
 * routes. Port IDs, metadata, node
 * order and retained/manual positions remain unchanged. Discard route points
 * if slots change; layoutGraph reruns ELK with the refined fixed ports.
 */
export function reorderPortsByGeometry(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
): KnowledgeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byEdge = new Map(edges.map((edge) => [edge.id, edge]));
  const categories: readonly string[] = ['summary', ...RELATION_CATEGORIES];
  const heightOf = (node: KnowledgeNode): number =>
    node.measured?.height ?? node.height ?? nodeSize(node.data.kind, node.data.detailed).height;
  const centerY = (nodeId: string): number => {
    const neighbor = byId.get(nodeId);
    return neighbor ? neighbor.position.y + heightOf(neighbor) / 2 : 0;
  };
  const localY = new Map<string, { in: number; out: number }>();
  for (const edge of edges) {
    const source = byId.get(edge.source),
      target = byId.get(edge.target);
    const points = edge.data?.points;
    if (source && target && routeMatchesPorts(points, source, target, edge)) {
      // Match the renderer's clear-cubic-first policy. A steep clear cubic
      // starts turning earlier than its orthogonal ELK skeleton; sampling only
      // that skeleton can push an otherwise exterior crossing into a socket.
      const cable = separatedCable(
        {
          source: points[0]!,
          target: points.at(-1)!,
          sourceId: source.id,
          targetId: target.id,
        },
        nodes,
      );
      const lead = cable
        ? cable.segments.flatMap((segment, index) =>
            Array.from({ length: 33 }, (_, step) => cubicPoint(segment, step / 32)).slice(
              index === 0 ? 0 : 1,
            ),
          )
        : points;
      localY.set(edge.id, {
        out: routeOrdinate(lead, false),
        in: routeOrdinate(lead, true),
      });
    }
  }
  return nodes.map((node) => {
    const height = heightOf(node);
    const margin = Math.min(24, height / 2);
    const span = Math.max(0, height - margin * 2);
    const ports = (['in', 'out'] as const).flatMap((side) => {
      const ordered = Object.values(node.data.wirePorts)
        .filter((port) => port.side === side && byEdge.has(port.edgeId))
        .sort(
          (a, b) =>
            (localY.get(a.edgeId)?.[side] ?? centerY(a.counterpart)) -
              (localY.get(b.edgeId)?.[side] ?? centerY(b.counterpart)) ||
            centerY(a.counterpart) - centerY(b.counterpart) ||
            categories.indexOf(a.category) - categories.indexOf(b.category) ||
            a.edgeId.localeCompare(b.edgeId),
        );
      const spacing = Math.min(18, span / Math.max(1, ordered.length - 1));
      const firstY = (height - spacing * (ordered.length - 1)) / 2;
      return ordered.map((port, index) => ({
        ...port,
        y: Math.round(firstY + spacing * index),
        spacing,
        crowded: ordered.length > Math.floor(span / 18) + 1,
      }));
    });
    return {
      ...node,
      data: { ...node.data, wirePorts: Object.fromEntries(ports.map((port) => [port.id, port])) },
    };
  });
}

/** Arc length sampling reads local routing intent without inventing a router. */
function routeOrdinate(points: RoutePoint[], fromEnd: boolean): number {
  let index = fromEnd ? points.length - 1 : 0;
  const step = fromEnd ? -1 : 1;
  let remaining = 60;
  let before = points[index]!;
  for (index += step; index >= 0 && index < points.length; index += step) {
    const after = points[index]!;
    const length = Math.hypot(after.x - before.x, after.y - before.y);
    if (length > 0 && remaining <= length)
      return before.y + ((after.y - before.y) * remaining) / length;
    remaining -= length;
    before = after;
  }
  return before.y;
}

function routeMatchesPorts(
  points: RoutePoint[] | undefined,
  source: KnowledgeNode,
  target: KnowledgeNode,
  edge: KnowledgeEdge,
): points is RoutePoint[] {
  if (!points || points.length < 2 || !points.every(finitePoint)) return false;
  const out = source.data.wirePorts[edge.sourceHandle!];
  const incoming = target.data.wirePorts[edge.targetHandle!];
  if (!out || !incoming) return false;
  const start = points[0]!,
    end = points.at(-1)!;
  const width =
    source.measured?.width ??
    source.width ??
    nodeSize(source.data.kind, source.data.detailed).width;
  return (
    Math.abs(start.x - source.position.x - width) < 1e-6 &&
    Math.abs(start.y - source.position.y - out.y) < 1e-6 &&
    Math.abs(end.x - target.position.x) < 1e-6 &&
    Math.abs(end.y - target.position.y - incoming.y) < 1e-6
  );
}

function edgeRoutes(graph: ElkNode): Map<string, RoutePoint[] | undefined> {
  return new Map(
    graph.edges?.map((edge) => [
      edge.id,
      edge.sections?.flatMap((section) => [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]),
    ]),
  );
}

function layoutInput(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): ElkNode {
  return {
    id: 'workspace',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '112',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
      'elk.spacing.portPort': '18',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '64',
      'elk.aspectRatio': '1.35',
      'elk.layered.compaction.connectedComponents': 'false',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width:
        node.measured?.width ?? node.width ?? nodeSize(node.data.kind, node.data.detailed).width,
      height:
        node.measured?.height ?? node.height ?? nodeSize(node.data.kind, node.data.detailed).height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS', 'elk.spacing.portPort': '18' },
      ports: Object.values(node.data.wirePorts).map((port) => ({
        id: port.id,
        x:
          port.side === 'in'
            ? 0
            : (node.measured?.width ??
              node.width ??
              nodeSize(node.data.kind, node.data.detailed).width),
        y: port.y,
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': port.side === 'in' ? 'WEST' : 'EAST' },
      })),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceHandle!],
      targets: [edge.targetHandle!],
    })),
  };
}

export async function layoutGraph(model: GraphModel): Promise<LaidOutGraph> {
  const elk = await (engine ??= import('elkjs/lib/elk.bundled.js').then(
    (module) => new module.default(),
  ));
  let nodes = model.nodes;
  let graph: ElkNode;
  // First read actual routed departure/approach, then use locally ordered
  // unique ports. A third pass handles order changes during refinement.
  for (let pass = 0; ; pass++) {
    graph = await elk.layout(layoutInput(nodes, model.edges));
    const positions = new Map(
      graph.children?.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
    );
    nodes = nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
    const routed = edgeRoutes(graph);
    const refined = reorderPortsByGeometry(
      nodes,
      model.edges.map((edge) => ({
        ...edge,
        data: { ...edge.data!, points: routed.get(edge.id) },
      })),
    );
    const stable = nodes.every((node, index) =>
      Object.values(node.data.wirePorts).every(
        (port) => refined[index]!.data.wirePorts[port.id]?.y === port.y,
      ),
    );
    if (pass >= 1 && stable) break;
    if (pass === 2) {
      // Neighbors in different layers can exchange center Y even with fixed
      // within-layer order. Keep the final spatial slots; the endpoint guard
      // below discards only ELK routes whose sockets changed. SmartEdge remains
      // the existing live fallback instead of allowing an unbounded layout loop.
      nodes = refined;
      break;
    }
    nodes = refined;
  }
  const routes = edgeRoutes(graph);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    nodes,
    edges: model.edges.map((edge) => {
      const source = byId.get(edge.source)!,
        target = byId.get(edge.target)!;
      const points = routes.get(edge.id);
      const matches = routeMatchesPorts(points, source, target, edge);
      return { ...edge, data: { ...edge.data!, points: matches ? points : undefined } };
    }),
  };
}
