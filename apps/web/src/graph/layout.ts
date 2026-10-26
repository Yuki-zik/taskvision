import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import type { XYPosition } from '@xyflow/react';
import type { GraphModel, KnowledgeEdge, KnowledgeNode } from './model';
import { RELATION_CATEGORIES, relationHandle, relationOffset } from './model';
import { nodeSize } from './presentation';

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
export async function layoutGraph(model: GraphModel): Promise<LaidOutGraph> {
  const elk = await (engine ??= import('elkjs/lib/elk.bundled.js').then(
    (module) => new module.default(),
  ));
  const input: ElkNode = {
    id: 'workspace',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '112',
      'elk.spacing.edgeNode': '20',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '64',
      'elk.aspectRatio': '1.35',
      'elk.layered.compaction.connectedComponents': 'false',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: model.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: RELATION_CATEGORIES.flatMap((category) =>
        (['in', 'out'] as const).map((side) => ({
          id: `${node.id}:${relationHandle(side, category)}`,
          x: side === 'in' ? 0 : (node.width ?? nodeSize(node.data.kind, node.data.detailed).width),
          y:
            (node.height ?? nodeSize(node.data.kind, node.data.detailed).height) / 2 +
            relationOffset(category),
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': side === 'in' ? 'WEST' : 'EAST' },
        })),
      ),
    })),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}:${edge.sourceHandle}`],
      targets: [`${edge.target}:${edge.targetHandle}`],
    })),
  };
  const graph = await elk.layout(input);
  const positions = new Map(
    graph.children?.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
  );
  const routes = new Map(
    graph.edges?.map((edge) => [
      edge.id,
      edge.sections?.flatMap((section) => [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]),
    ]),
  );
  return {
    nodes: model.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
    edges: model.edges.map((edge) => ({
      ...edge,
      data: { ...edge.data!, points: routes.get(edge.id) },
    })),
  };
}
