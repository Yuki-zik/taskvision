import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  useNodesInitialized,
  useReactFlow,
  useNodes,
  type EdgeProps,
  type OnNodesChange,
  type OnEdgesChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import { SmartEdgeProvider, useSmartEdgePath } from '@tisoap/react-flow-smart-edge';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Expand,
  Focus,
  Layers3,
  Network,
  Map as MapIcon,
  RotateCcw,
} from 'lucide-react';
import type { Filter, Selection, Snapshot } from '../domain';
import { Empty, IconButton, Notice } from '../components/ui';
import {
  buildGraph,
  defaultRelationMode,
  RELATION_CATEGORIES,
  type KnowledgeEdge,
  type KnowledgeNode,
  type RelationCategory,
  type RelationMode,
} from './model';
import { filesForScope, groupForPath, ROOT_SCOPE, scopeLabel, TEST_SCOPE } from './scopes';
import { layoutGraph, retainPositions, reorderPortsByGeometry } from './layout';
import { RELATIONS, SUMMARY_RELATION, relationPresentation, sourceCableColor } from './relations';
import { RelationDetails } from './RelationDetails';
import { matchingRoute, displayRoute, separatedCable, obstacleLaneWaypoints } from './routing';
import { analyzeImpact, type ImpactMode } from './impact';
import { ArchitectureNode } from './ArchitectureNode';
import { GraphLegend, type WireDisplayStyle } from './GraphLegend';

const fitOptions = {
  padding: {
    top: '64px' as const,
    bottom: '68px' as const,
    left: '24px' as const,
    right: '24px' as const,
  },
  minZoom: 0.7,
  maxZoom: 1.05,
  duration: 200,
};

/**
 * Readable desktop layouts use the familiar 75% floor. On shorter windows a
 * hard 75% minimum crops entire module cards; relax it just enough to display
 * the source-grounded overview. Normal zoom/pan remains under the user's control.
 */
function responsiveFitOptions(nodes: KnowledgeNode[]) {
  const stage = document.querySelector<HTMLElement>('.graph-workspace .react-flow');
  if (!stage || !nodes.length) return fitOptions;
  const left = Math.min(...nodes.map((node) => node.position.x));
  const right = Math.max(...nodes.map((node) => node.position.x + (node.width ?? 0)));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const bottom = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 0)));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const readableZoom = Math.min(
    (stage.clientWidth - 32) / width,
    (stage.clientHeight - 40) / height,
  );
  return { ...fitOptions, minZoom: Math.min(fitOptions.minZoom, Math.max(0.3, readableZoom)) };
}
function RoutedEdge(props: EdgeProps<KnowledgeEdge>) {
  const { data, sourceX, sourceY, targetX, targetY } = props;
  const style = (data?.wireStyle ?? 'flow') as WireDisplayStyle;
  const obstacles = useNodes<KnowledgeNode>();
  const lane = data as
    | (typeof data & {
        wireLaneIndex?: number;
        wireLaneCount?: number;
        wireCorridorIndex?: number;
        wireCorridorCount?: number;
      })
    | undefined;
  const cable = separatedCable(
    {
      source: { x: sourceX, y: sourceY },
      target: { x: targetX, y: targetY },
      sourceId: props.source,
      targetId: props.target,
      laneIndex: lane?.wireLaneIndex,
      laneCount: lane?.wireLaneCount,
    },
    obstacles,
  );
  const waypoints = cable
    ? []
    : obstacleLaneWaypoints(
        {
          source: { x: sourceX, y: sourceY },
          target: { x: targetX, y: targetY },
          sourceId: props.source,
          targetId: props.target,
          laneIndex: lane?.wireCorridorIndex,
          laneCount: lane?.wireCorridorCount,
        },
        obstacles,
      );
  const { route, isDragging } = useSmartEdgePath({
    ...props,
    waypoints: waypoints.length ? waypoints : undefined,
    preset: 'smoothstep',
    options: { nodePadding: 13, gridRatio: 8, borderRadius: 12 },
  });
  // Smart Edge v5 defers A* routing while a node is being dragged. Its last
  // completed path remains cached, so preview the native path for the *current*
  // endpoints instead of drawing a stale route and label in the old position.
  const points = isDragging
    ? undefined
    : matchingRoute(data?.points, { x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  const fallback = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 12,
    offset: 27,
  });
  const smart = !isDragging && route?.kind === 'routed' ? route : null;
  // One geometry presentation pipeline: never let a cached grid SVG override
  // a valid smooth curve, nor reuse a stale ELK route after node movement.
  // Smart Edge's raw grid points omit the actual socket centers. Anchor the
  // cleaned polyline to LIVE handles instead of leaving visible detached tails.
  const orderedPoints =
    points ??
    (smart?.points
      ? [{ x: sourceX, y: sourceY }, ...smart.points, { x: targetX, y: targetY }]
      : undefined);
  const displayed =
    style === 'direct'
      ? displayRoute(
          [
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
          ],
          'direct',
        )
      : style === 'flow' && cable
        ? { path: cable.path, center: cable.center }
        : orderedPoints && orderedPoints.length > 1
          ? displayRoute(orderedPoints, 'flow', style === 'flow' ? 36 : 10, obstacles)
          : { path: fallback[0], center: { x: fallback[1], y: fallback[2] } };
  const path = displayed.path;
  const center = displayed.center;
  const relation = data ? relationPresentation(data) : RELATIONS.runtime;
  const wireColor = data?.grouped ? sourceCableColor(props.source) : relation.color;
  // An active hovered/focused wire wins over an older selected wire.
  // Otherwise the older selection keeps full opacity in the same hub.
  const emphasized = !data?.muted && (data?.emphasized || props.selected);
  const kindCount = Object.values(data?.kindCounts ?? {}).filter((count) => count > 0).length;
  const label = data?.grouped
    ? data.hovered || emphasized
      ? `${kindCount}类·${data.count}处`
      : undefined
    : data?.hovered || emphasized
      ? `${relation.label}${(data?.count ?? 1) > 1 ? ` · ${data!.count}` : ''}`
      : undefined;
  return (
    <>
      <path
        d={path}
        className="tv-wire-casing"
        aria-hidden="true"
        pointerEvents="none"
        fill="none"
        stroke="var(--studio-canvas, #10151f)"
        strokeWidth={emphasized ? 5.5 : 4.2}
        strokeDasharray={relation.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={data?.muted && !emphasized ? 0.12 : 1}
      />
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={18}
        label={label}
        labelX={center.x}
        labelY={center.y}
        labelStyle={{ fill: '#d9e9ff', fontSize: 11, fontWeight: 550 }}
        labelBgStyle={{ fill: '#20324a', fillOpacity: 0.98 }}
        labelBgPadding={[5, 3]}
        labelBgBorderRadius={3}
        style={{
          stroke: wireColor,
          strokeDasharray: relation.dash,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: emphasized ? 2.65 : 1.65,
          opacity: data?.muted && !emphasized ? 0.12 : emphasized ? 1 : 0.82,
        }}
      />
    </>
  );
}
const nodeTypes = { knowledge: ArchitectureNode };
const edgeTypes = { routed: RoutedEdge };
interface Props {
  snapshot: Snapshot;
  filter: Filter;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onModule: (scope: string) => void;
}

function GraphCanvas({ snapshot, filter, selection, onSelect, onModule }: Props) {
  const [scope, setScope] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [infrastructure, setInfrastructure] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [wireStyle, setWireStyle] = useState<WireDisplayStyle>('flow');
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState<ImpactMode>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [focusedEdge, setFocusedEdge] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [relationModeOverride, setRelationMode] = useState<RelationMode>();
  const relationMode = relationModeOverride ?? defaultRelationMode(scope);
  const [visibleRelations, setVisibleRelations] = useState<RelationCategory[]>([
    ...RELATION_CATEGORIES,
  ]);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  const [fitTick, setFitTick] = useState(0);
  const [layoutBusy, setLayoutBusy] = useState(true);
  const [layoutError, setLayoutError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewportMode, setViewportMode] = useState<'read' | 'all'>('read');
  const graph = useReactFlow<KnowledgeNode, KnowledgeEdge>();
  const initialized = useNodesInitialized();
  const positions = useRef(new Map<string, Map<string, XYPosition>>());
  const viewports = useRef(new Map<string, Viewport>());
  const layoutContext = useRef('');
  const resetPositions = useRef(false);
  const pendingFit = useRef(false);
  const fitAsOverview = useRef(false);
  // Keep a first node click from opening the side inspector until React Flow
  // can distinguish a double click. Opening it immediately resizes this
  // canvas between click #1 and #2 and can swallow the second click.
  const pendingInspector = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingInspector = useCallback(() => {
    if (pendingInspector.current !== null) clearTimeout(pendingInspector.current);
    pendingInspector.current = null;
  }, []);
  useEffect(() => () => cancelPendingInspector(), [cancelPendingInspector]);
  const context = `${snapshot.project.workspaceId}:${scope}:${infrastructure}:${detailed}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const model = useMemo(
    () =>
      buildGraph(snapshot, {
        scope,
        expanded,
        filter,
        focusId,
        infrastructure,
        detailed,
        relationMode,
        relationKinds: visibleRelations,
      }),
    [
      snapshot,
      scope,
      expanded,
      filter,
      focusId,
      infrastructure,
      detailed,
      relationMode,
      visibleRelations,
    ],
  );
  // Expanded files replace their module's imports with file-level connectors.
  // Treat those visible file representatives as zero-hop sources belonging to
  // the selected module; expanding it must not make its callers disappear.
  const analysis = useMemo(() => {
    const selectedNode = model.nodes.find((node) => node.id === selectedId);
    const additionalSeeds =
      selectedNode?.data.kind === 'module'
        ? model.nodes
            .filter(
              (node) =>
                node.data.kind === 'file' &&
                groupForPath(node.data.path, scope) === selectedNode.data.path,
            )
            .map((node) => node.id)
        : [];
    return analyzeImpact(model.nodes, model.edges, selectedId, impactMode, additionalSeeds);
  }, [model, scope, selectedId, impactMode]);
  const impactActive = impactMode !== 'all' && analysis.focusId !== null;
  const latest = useRef(model);
  latest.current = model;
  const rememberViewport = useCallback(() => {
    viewports.current.set(contextRef.current, graph.getViewport());
  }, [graph]);
  const drill = useCallback(
    (path: string) => {
      cancelPendingInspector();
      rememberViewport();
      setScope(path);
      setExpanded([]);
      setFocusId(null);
      setSelectedId(null);
      setSelectedEdgeId(null);
      setImpactMode('all');
      onModule(path);
    },
    [rememberViewport, onModule, cancelPendingInspector],
  );
  const toggle = useCallback((path: string) => {
    setExpanded((previous) =>
      previous.includes(path) ? previous.filter((item) => item !== path) : [...previous, path],
    );
    setFocusId(null);
  }, []);
  useEffect(() => {
    setFocusId(null);
  }, [filter.query, filter.tag, filter.hotspots]);
  const decorate = useCallback(
    (items: KnowledgeNode[]) =>
      items.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onExpand: toggle,
          onDrill: drill,
          onSource: (path: string, line: number) => onSelect({ path, line }),
        },
      })),
    [drill, toggle, onSelect],
  );

  useEffect(() => {
    let canceled = false;
    const newContext = layoutContext.current !== context;
    const explicitLayout = resetPositions.current;
    resetPositions.current = false;
    setLayoutBusy(true);
    void layoutGraph(latest.current)
      .then((result) => {
        if (canceled) return;
        const remembered = explicitLayout
          ? new Map<string, XYPosition>()
          : (positions.current.get(context) ?? new Map<string, XYPosition>());
        const restored = remembered.size
          ? reorderPortsByGeometry(retainPositions(result.nodes, remembered), result.edges)
          : result.nodes;
        const rememberedPositions = new Map(remembered);
        for (const node of restored) rememberedPositions.set(node.id, node.position);
        positions.current.set(context, rememberedPositions);
        const data = new Map(latest.current.nodes.map((node) => [node.id, node.data]));
        setNodes(
          decorate(
            restored.map((node) => ({
              ...node,
              data: { ...(data.get(node.id) ?? node.data), wirePorts: node.data.wirePorts },
            })),
          ),
        );
        const positionsChanged = restored.some(
          (node, index) =>
            node.position.x !== result.nodes[index]!.position.x ||
            node.position.y !== result.nodes[index]!.position.y ||
            Object.values(node.data.wirePorts).some(
              (port) => result.nodes[index]!.data.wirePorts[port.id]?.y !== port.y,
            ),
        );
        setEdges(
          result.edges.map((edge) => ({
            ...edge,
            data: { ...edge.data!, points: positionsChanged ? undefined : edge.data?.points },
            markerEnd: {
              type: MarkerType.Arrow,
              markerUnits: 'userSpaceOnUse',
              strokeWidth: 1.35,
              width: 9,
              height: 9,
              color: edge.data!.grouped
                ? sourceCableColor(edge.source)
                : relationPresentation(edge.data!).color,
            },
          })),
        );
        setLayoutBusy(false);
        setLayoutError('');
        layoutContext.current = context;
        if (newContext) {
          const saved = viewports.current.get(context);
          if (saved) {
            void graph.setViewport(saved);
            setZoom(saved.zoom);
          } else {
            fitAsOverview.current = false;
            setViewportMode('read');
            pendingFit.current = true;
          }
        }
      })
      .catch(() => {
        if (!canceled) {
          setLayoutError('自动布局失败，请点击重新布局重试。');
          setLayoutBusy(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [model.signature, context, layoutTick, graph, decorate]);

  // Fit only after React Flow measures nodes, and only for an explicit fit or a new scope.
  // Never use ReactFlow's fitView prop: it can race this readable initial viewport.
  useEffect(() => {
    if (!initialized || layoutBusy || !pendingFit.current || !nodes.length) return;
    // React Flow can report initialized before the asynchronous ELK positions are
    // reflected in its internal measured bounds. A first-frame fit cuts off the
    // upper nodes even though clicking Fit again works. Let both React and Flow
    // commit the layout before centering the user's initial viewport.
    let frame = 0;
    const settle = window.setTimeout(() => {
      frame = requestAnimationFrame(() => {
        const stage = document.querySelector<HTMLElement>('.graph-workspace .react-flow');
        if (!stage) return;
        const left = Math.min(...nodes.map((node) => node.position.x));
        const top = Math.min(...nodes.map((node) => node.position.y));
        const right = Math.max(...nodes.map((node) => node.position.x + (node.width ?? 0)));
        const bottom = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 0)));
        // Fit the committed ELK coordinates, not React Flow's one-frame-old
        // internal bounds. Its initial estimate previously shrank this real
        // eight-module view to39% although64% fits the same canvas.
        const allZoom = Math.max(
          0.15,
          Math.min(
            1.05,
            (stage.clientWidth - 80) / Math.max(1, right - left),
            (stage.clientHeight - 44) / Math.max(1, bottom - top),
          ),
        );
        // A rich node editor must not shrink metrics to6px merely to fit every
        // card. Initial reading view retains an85%floor; explicit Fit shows all.
        // Small/mobile canvases also retain actions via normal panning/zoom.
        const nextZoom = fitAsOverview.current ? allZoom : Math.max(0.85, allZoom);
        pendingFit.current = false;
        setZoom(nextZoom);
        void graph.setViewport(
          {
            x: (stage.clientWidth - (right - left) * nextZoom) / 2 - left * nextZoom,
            y: (stage.clientHeight - (bottom - top) * nextZoom) / 2 - top * nextZoom,
            zoom: nextZoom,
          },
          { duration: 160 },
        );
      });
    }, 90);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
    };
  }, [initialized, layoutBusy, fitTick, nodes.length, graph]);
  useEffect(() => {
    const currentData = new Map(model.nodes.map((node) => [node.id, node.data]));
    setNodes((previous) =>
      decorate(
        previous.map((node) => {
          const fresh = currentData.get(node.id);
          if (!fresh) return node;
          // Geometry-refined port order must survive metadata-only polling. New
          // topology is reconciled by the layout pass, not alphabetical model data.
          const samePorts =
            Object.keys(fresh.wirePorts).length === Object.keys(node.data.wirePorts).length &&
            Object.keys(fresh.wirePorts).every((key) => key in node.data.wirePorts);
          const wirePorts = samePorts
            ? Object.fromEntries(
                Object.entries(fresh.wirePorts).map(([key, port]) => [
                  key,
                  {
                    ...port,
                    y: node.data.wirePorts[key]!.y,
                    spacing: node.data.wirePorts[key]!.spacing,
                  },
                ]),
              )
            : fresh.wirePorts;
          return { ...node, data: { ...fresh, wirePorts } };
        }),
      ),
    );
  }, [model, decorate]);
  // One activation path for mouse and keyboard. The parent inspector selection must
  // change with the graph center, otherwise its reconciliation effect restores the
  // previously selected file after the next graph update.
  const activateNode = useCallback(
    (node: KnowledgeNode) => {
      cancelPendingInspector();
      setSelectedEdgeId(null);
      setSelectedId(node.id);
      if (node.data.kind === 'file') {
        onSelect({ path: node.data.path, line: 1 });
      } else {
        const target = node.data.path;
        pendingInspector.current = setTimeout(() => {
          pendingInspector.current = null;
          onModule(target);
        }, 280);
      }
    },
    [onSelect, onModule, cancelPendingInspector],
  );
  // Polling may change evidence/counts without changing topology or the saved view.
  useEffect(() => {
    const fresh = new Map(model.edges.map((edge) => [edge.id, edge.data!]));
    setSelectedEdgeId((previous) => (previous && fresh.has(previous) ? previous : null));
    setHoveredEdge((previous) => (previous && fresh.has(previous) ? previous : null));
    setFocusedEdge((previous) => (previous && fresh.has(previous) ? previous : null));
    setEdges((previous) =>
      previous.map((edge) => ({
        ...edge,
        data: { ...edge.data!, ...fresh.get(edge.id) },
      })),
    );
  }, [model]);
  useEffect(() => {
    if (!selection?.path || selectedEdgeId) return;
    const visible =
      nodes.find((node) => node.id === `file:${selection.path}`) ??
      nodes.find(
        (node) =>
          node.data.kind === 'module' &&
          filesForScope(
            [
              {
                path: selection.path,
                language: '',
                lines: 0,
                tags: [],
                annotationCount: 0,
                symbols: [],
              },
            ],
            node.data.path,
          ).length > 0,
      );
    if (visible) setSelectedId(visible.id);
  }, [selection, nodes, selectedEdgeId]);
  const onNodesChange: OnNodesChange<KnowledgeNode> = useCallback((changes) => {
    // React Flow keyboard Enter/Space emits a select change without onNodeClick.
    // Keep the human's analysis center in sync with mouse and keyboard actions.
    for (const change of changes) {
      if (change.type === 'select' && change.selected) setSelectedId(change.id);
    }
    if (changes.some((change) => change.type === 'position' && change.position))
      setEdges((previous) =>
        previous.map((edge) => ({ ...edge, data: { ...edge.data!, points: undefined } })),
      );
    setNodes((previous) => {
      const next = applyNodeChanges(changes, previous);
      if (changes.some((change) => change.type === 'position')) {
        const remembered = new Map(positions.current.get(contextRef.current));
        for (const node of next) remembered.set(node.id, node.position);
        positions.current.set(contextRef.current, remembered);
      }
      return next;
    });
  }, []);
  const onEdgesChange: OnEdgesChange<KnowledgeEdge> = useCallback((changes) => {
    for (const change of changes)
      if (change.type === 'select') {
        // A dependency detail is part of the selected module's impact context.
        // Selecting its arrow must not silently erase the current lens target.
        setSelectedEdgeId((previous) =>
          change.selected ? change.id : previous === change.id ? null : previous,
        );
      }
  }, []);
  const activeNode = impactActive ? null : (hoveredId ?? selectedId);
  const wireLanes = useMemo(() => {
    const grouped = new Map<string, KnowledgeEdge[]>();
    for (const edge of edges) {
      const key = JSON.stringify([edge.source, edge.target]);
      grouped.set(key, [...(grouped.get(key) ?? []), edge]);
    }
    const lanes = new Map<string, { index: number; count: number }>();
    for (const group of grouped.values()) {
      group.sort((a, b) => a.id.localeCompare(b.id));
      group.forEach((edge, index) => lanes.set(edge.id, { index, count: group.length }));
    }
    return lanes;
  }, [edges]);
  // Stable target-specific ranks distinguish routes that converge on the same
  // provider even when their importer nodes differ.
  const corridorLanes = useMemo(() => {
    const targets = new Map<string, KnowledgeEdge[]>();
    for (const edge of edges) targets.set(edge.target, [...(targets.get(edge.target) ?? []), edge]);
    const lanes = new Map<string, { index: number; count: number }>();
    for (const group of targets.values()) {
      group.sort((a, b) => a.id.localeCompare(b.id));
      group.forEach((edge, index) => lanes.set(edge.id, { index, count: group.length }));
    }
    return lanes;
  }, [edges]);
  const activeWire = hoveredEdge ?? focusedEdge ?? selectedEdgeId;
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        zIndex: edge.id === activeWire ? 20 : 0,
        selected: edge.id === selectedEdgeId,
        ariaLabel: `${edge.source.replace(/^(module|file):/, '')} 依赖于 ${edge.target.replace(/^(module|file):/, '')}，${relationPresentation(edge.data!).label}，${edge.data!.grouped ? `${Object.values(edge.data!.kindCounts ?? {}).filter((count) => count > 0).length} 类，` : ''}${edge.data!.count} 处引用。按 Enter 查看来源证据。`,
        data: {
          ...edge.data!,
          wireStyle,
          wireLaneIndex: wireLanes.get(edge.id)?.index ?? 0,
          wireLaneCount: wireLanes.get(edge.id)?.count ?? 1,
          wireCorridorIndex: corridorLanes.get(edge.id)?.index ?? 0,
          wireCorridorCount: corridorLanes.get(edge.id)?.count ?? 1,
          hovered: edge.id === hoveredEdge,
          // A hovered/keyboard-focused/selected wire outranks the module lens.
          // Otherwise selecting a provider makes every incident wire vivid,
          // preventing the user from following one route through crossings.
          emphasized: activeWire
            ? edge.id === activeWire
            : impactActive
              ? analysis.edgeIds.has(edge.id)
              : !!activeNode && (edge.source === activeNode || edge.target === activeNode),
          muted: activeWire
            ? edge.id !== activeWire
            : impactActive
              ? !analysis.edgeIds.has(edge.id)
              : !!activeNode && edge.source !== activeNode && edge.target !== activeNode,
        },
      })),
    [
      edges,
      activeNode,
      activeWire,
      hoveredEdge,
      focusedEdge,
      selectedEdgeId,
      impactActive,
      analysis,
      wireLanes,
      corridorLanes,
      wireStyle,
    ],
  );
  const selectedEdge = displayedEdges.find((edge) => edge.id === selectedEdgeId);
  // Apply impact colors as an overlay without editing source knowledge or relaying out nodes.
  // This preserves the user's pan/zoom and keeps the original directed edges inspectable.
  const controlledNodes = useMemo(
    () =>
      nodes.map((node) => {
        const depth = impactActive ? analysis.depths.get(node.id) : undefined;
        const lensClass = !impactActive
          ? ''
          : depth === undefined
            ? 'impact-muted'
            : depth === 0
              ? 'impact-focus'
              : depth === 1
                ? 'impact-direct'
                : 'impact-indirect';
        const activeEdge = activeWire ? edges.find((edge) => edge.id === activeWire) : undefined;
        const wireClass = activeEdge
          ? node.id === activeEdge.source || node.id === activeEdge.target
            ? 'tv-wire-endpoint'
            : 'tv-wire-unrelated'
          : '';
        return {
          ...node,
          selected: node.id === selectedId,
          className: [node.className, lensClass, wireClass].filter(Boolean).join(' '),
          ariaLabel: `${node.data.label}${depth === undefined ? (impactActive ? '，不在当前静态分析范围' : '') : depth === 0 ? '，分析中心' : `，静态依赖距离${depth}跳`}`,
          data: { ...node.data, impactDepth: depth },
        };
      }),
    [nodes, selectedId, impactActive, analysis, activeWire, edges],
  );
  const closeRelation = useCallback(() => {
    const id = selectedEdgeId;
    setSelectedEdgeId(null);
    if (id)
      requestAnimationFrame(() =>
        document
          .querySelector<SVGGElement>(`.react-flow__edge[data-id="${CSS.escape(id)}"]`)
          ?.focus(),
      );
  }, [selectedEdgeId]);
  const breadcrumbs =
    scope === ROOT_SCOPE || scope === TEST_SCOPE ? [scope] : scope.split('/').filter(Boolean);
  const fit = () => {
    fitAsOverview.current = true;
    setViewportMode('all');
    pendingFit.current = true;
    setFitTick((tick) => tick + 1);
  };
  return (
    <section className="graph-workspace" aria-label="项目架构图">
      <div className="graph-breadcrumb">
        <div className="breadcrumb-trail">
          {scope && (
            <IconButton
              label="返回上层模块"
              onClick={() =>
                drill(
                  scope.startsWith('@')
                    ? ''
                    : scope.includes('/')
                      ? scope.slice(0, scope.lastIndexOf('/'))
                      : '',
                )
              }
            >
              <ArrowLeft size={15} />
            </IconButton>
          )}
          <button onClick={() => drill('')} className={!scope ? 'current' : ''}>
            <Layers3 size={15} />
            {snapshot.project.name}
          </button>
          {breadcrumbs.map((part, i) => (
            <span key={`${part}-${i}`}>
              <ChevronRight size={13} />
              <button
                onClick={() =>
                  drill(part.startsWith('@') ? part : breadcrumbs.slice(0, i + 1).join('/'))
                }
                className={i === breadcrumbs.length - 1 ? 'current' : ''}
              >
                {scopeLabel(part)}
              </button>
            </span>
          ))}
        </div>
        <span className="graph-scope-meta">
          {model.nodes.length} 个{scope ? '节点' : '模块'} · {model.totalFiles} 个文件
        </span>
      </div>
      <div className="graph-view-options">
        <div className="scope-switch" role="group" aria-label="代码与基础设施">
          <button
            className={!infrastructure ? 'active' : ''}
            aria-pressed={!infrastructure}
            onClick={() => {
              rememberViewport();
              setInfrastructure(false);
              setExpanded([]);
              setFocusId(null);
            }}
          >
            代码架构 <span>{model.codeFiles}</span>
          </button>
          <button
            className={infrastructure ? 'active' : ''}
            aria-pressed={infrastructure}
            onClick={() => {
              rememberViewport();
              setInfrastructure(true);
              setExpanded([]);
              setFocusId(null);
            }}
          >
            基础设施 <span>{model.infrastructureFiles}</span>
          </button>
        </div>
        <div className="detail-switch" role="group" aria-label="图信息密度">
          <button
            className={!detailed ? 'active' : ''}
            aria-pressed={!detailed}
            onClick={() => {
              rememberViewport();
              setDetailed(false);
            }}
          >
            概览
          </button>
          <button
            className={detailed ? 'active' : ''}
            aria-pressed={detailed}
            onClick={() => {
              rememberViewport();
              setDetailed(true);
            }}
          >
            详情
          </button>
        </div>
        <GraphLegend mode={relationMode} style={wireStyle} onStyle={setWireStyle} />
      </div>
      <div className="relation-toolbar" aria-label="关系图例与筛选">
        <div className="relation-mode-switch" role="group" aria-label="关系显示方式">
          {(['summary', 'categories'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={relationMode === mode}
              title={
                mode === 'summary' ? '合并同向依赖，点击查看分类证据' : '按关系类型分别显示路径'
              }
              onClick={() => {
                setRelationMode(mode);
                setSelectedEdgeId(null);
                setHoveredEdge(null);
                setFocusedEdge(null);
              }}
            >
              {mode === 'summary' ? '汇总' : '分类'}
            </button>
          ))}
        </div>
        <span className="relation-reading">
          引用方 <ArrowUpRight size={13} /> 提供方 · 箭头表示依赖
        </span>
        {relationMode === 'summary' && (
          <span className="relation-summary-legend" title={SUMMARY_RELATION.hint}>
            <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
              <path d="M1 6 H11 M8 3 L11 6 L8 9" fill="none" stroke="#4779ad" strokeWidth="1.8" />
              <path
                d="M13 6 H22 M19 3 L22 6 L19 9"
                fill="none"
                stroke="#9a683e"
                strokeWidth="1.8"
              />
            </svg>
            按引用方着色 · 同向依赖汇总
          </span>
        )}
        <div className="relation-toggles" role="group" aria-label="关系类型">
          {RELATION_CATEGORIES.map((category) => {
            const relation = RELATIONS[category];
            const count = model.counts?.[category] ?? 0;
            return (
              <button
                key={category}
                aria-pressed={visibleRelations.includes(category)}
                title={relation.hint}
                onClick={() =>
                  setVisibleRelations((previous) =>
                    previous.includes(category)
                      ? previous.filter((item) => item !== category)
                      : [...previous, category],
                  )
                }
              >
                <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
                  <path
                    d="M1 6 H21 M18 3 L21 6 L18 9"
                    fill="none"
                    stroke={relation.color}
                    strokeWidth="1.6"
                    strokeDasharray={relation.dash}
                    strokeLinecap="round"
                  />
                </svg>
                {relation.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <section
        className="impact-toolbar"
        role="region"
        aria-label="依赖与影响分析"
        hidden={!selectedId}
      >
        <div
          className="impact-target"
          title={selectedId?.replace(/^(module|file):/, '') ?? '请先点击一个模块或文件'}
        >
          <Network size={14} aria-hidden="true" />
          <strong>{selectedId ? selectedId.replace(/^(module|file):/, '') : '先选中模块'}</strong>
        </div>
        <div className="impact-buttons" role="group" aria-label="依赖分析模式">
          {(
            [
              ['all', '全图', '显示全部源码依赖'],
              ['dependencies', '它依赖', '当前模块直接引用的其他模块'],
              ['dependents', '依赖它', '直接引用当前模块的其他模块'],
              ['impact', '潜在影响', '从被引用模块出发，沿反向依赖递归寻找可能需要复核的模块'],
              ['neighborhood', '一跳邻域', '直接上游和下游，保留源码箭头方向'],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              type="button"
              disabled={mode !== 'all' && !selectedId}
              aria-pressed={impactMode === mode}
              title={hint}
              className={impactMode === mode ? 'active' : ''}
              onClick={() => {
                setFocusId(null);
                setImpactMode(mode);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="impact-summary" aria-live="polite">
          {impactActive
            ? `${analysis.directCount} 个直接 · ${analysis.indirectCount} 个间接`
            : '依据已解析的源码依赖'}
        </span>
      </section>
      <div
        className="flow-container"
        onKeyDownCapture={(event) => {
          // React Flow's built-in Enter/Space handler can update its internal
          // selection without emitting a usable controlled onNodesChange.
          // Select only when the focused element is the node container itself;
          // Enter on its drill/expand/source buttons must retain their action.
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches('.react-flow__node[data-id]'))
            return;
          if (event.key === 'Enter' || event.key === ' ') {
            const node = nodes.find((item) => item.id === target.getAttribute('data-id'));
            if (node) activateNode(node);
          }
          if (event.key === 'Escape') {
            setSelectedId(null);
            setImpactMode('all');
          }
        }}
        onFocusCapture={(event) => {
          const edge = event.target.closest('.react-flow__edge');
          setFocusedEdge(edge?.getAttribute('data-id') ?? null);
        }}
        onBlurCapture={(event) => {
          if (
            !(event.relatedTarget instanceof Element) ||
            !event.relatedTarget.closest('.react-flow__edge')
          )
            setFocusedEdge(null);
        }}
      >
        <SmartEdgeProvider nodes={controlledNodes}>
          <ReactFlow<KnowledgeNode, KnowledgeEdge>
            nodes={controlledNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgeClick={(_, edge) => {
              cancelPendingInspector();
              setSelectedEdgeId(edge.id);
            }}
            onPaneClick={() => {
              cancelPendingInspector();
              setSelectedEdgeId(null);
            }}
            onNodeDragStop={() => {
              // Keep the layout's local-route port order during manual moves.
              // Re-sorting by distant centers here would reintroduce fan braids;
              // explicit re-layout computes a fresh route-aware ordering.
              setEdges((current) =>
                current.map((edge) => ({ ...edge, data: { ...edge.data!, points: undefined } })),
              );
            }}
            onNodeClick={(_, node) => activateNode(node)}
            onNodeDoubleClick={(_, node) => {
              if (node.data.kind === 'module') drill(node.data.path);
            }}
            onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
            onNodeMouseLeave={() => setHoveredId(null)}
            onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
            onEdgeMouseLeave={() => setHoveredEdge(null)}
            onMoveEnd={(_, viewport) => {
              setZoom(viewport.zoom);
              viewports.current.set(contextRef.current, viewport);
            }}
            nodesConnectable={false}
            nodesDraggable={!layoutBusy}
            elementsSelectable
            edgesFocusable
            colorMode="dark"
            minZoom={0.15}
            maxZoom={1.7}
            deleteKeyCode={null}
            attributionPosition="bottom-left"
            aria-label="可缩放、拖动的项目结构"
            ariaLabelConfig={{
              'node.a11yDescription.default':
                '按 Enter 或空格选择节点。使用方向键移动，按 Escape 取消选择。',
              'node.a11yDescription.keyboardDisabled':
                '按 Enter 或空格选择节点，按 Escape 取消选择。',
              'node.a11yDescription.ariaLiveMessage': ({ x, y }) =>
                `节点已移动到横坐标 ${Math.round(x)}，纵坐标 ${Math.round(y)}。`,
              'edge.a11yDescription.default': '按 Enter 或空格选择依赖关系。',
              'controls.ariaLabel': '画布控制',
              'controls.zoomIn.ariaLabel': '放大',
              'controls.zoomOut.ariaLabel': '缩小',
              'controls.fitView.ariaLabel': '适合画布',
              'controls.interactive.ariaLabel': '切换交互',
              'minimap.ariaLabel': '项目结构缩略图',
              'handle.ariaLabel': '依赖连接点',
            }}
          >
            <Background variant={BackgroundVariant.Dots} color="#2c384b" gap={24} size={0.8} />
            <Controls
              position="bottom-right"
              showInteractive={false}
              fitViewOptions={responsiveFitOptions(nodes)}
              onFitView={fit}
            />
            {showMiniMap && (
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                nodeColor={(node) =>
                  node.type === 'knowledge' && node.data.kind === 'module' ? '#506987' : '#7b6c94'
                }
                maskColor="rgba(16,21,31,0.8)"
              />
            )}
            <Panel position="top-right" className="graph-actions">
              <button
                className="canvas-button"
                onClick={() => {
                  resetPositions.current = true;
                  setLayoutTick((tick) => tick + 1);
                }}
                disabled={layoutBusy}
              >
                <RotateCcw size={14} className={layoutBusy ? 'spin' : ''} />
                重新布局
              </button>
              <button
                className={`canvas-button${viewportMode === 'read' ? ' readable-mode' : ''}`}
                aria-label="阅读缩放"
                aria-pressed={viewportMode === 'read'}
                title="保留信息字号；拖动画布浏览其他节点"
                onClick={() => {
                  fitAsOverview.current = false;
                  setViewportMode('read');
                  pendingFit.current = true;
                  setFitTick((tick) => tick + 1);
                }}
              >
                阅读
              </button>
              <IconButton label="适合画布，保留文字可读" onClick={fit}>
                <Expand size={16} />
              </IconButton>
              <button
                className={`canvas-button${focusId ? ' active' : ''}`}
                disabled={!selectedId}
                onClick={() => {
                  setImpactMode('all');
                  setFocusId((previous) => (previous ? null : selectedId));
                }}
              >
                <Focus size={14} />
                {focusId ? '显示全图' : '聚焦邻居'}
              </button>
              <IconButton
                label="切换缩略图"
                aria-pressed={showMiniMap}
                onClick={() => setShowMiniMap((value) => !value)}
              >
                <MapIcon size={15} />
              </IconButton>
              <span className="zoom-level" aria-label="当前缩放">
                {Math.round(zoom * 100)}%
              </span>
            </Panel>
          </ReactFlow>
        </SmartEdgeProvider>
        {selectedEdge && (
          <RelationDetails edge={selectedEdge} onSelect={onSelect} onClose={closeRelation} />
        )}
        {!layoutBusy && !model.nodes.length && (
          <div className="graph-empty">
            <Empty title="当前范围没有匹配文件">
              清除筛选、切换代码 / 基础设施，或返回项目层级。
            </Empty>
          </div>
        )}
        {layoutError && (
          <div className="graph-notice">
            <Notice danger>{layoutError}</Notice>
          </div>
        )}
        {layoutBusy && (
          <div className="layout-status" role="status">
            <RotateCcw size={13} className="spin" />
            正在整理结构…
          </div>
        )}
      </div>
      <footer className="canvas-footer">
        <span>
          {wireStyle === 'direct'
            ? '直连模式不避障 · 线可经过中间节点'
            : viewportMode === 'read'
              ? '阅读缩放 · 拖动画布浏览 · 适合画布可查看全图'
              : '全图视角 · 点击阅读恢复字号 · 双击进入模块'}
        </span>
        <span>
          {impactActive
            ? '静态潜在影响范围 · 只基于当前已解析引用，不证明程序会出错'
            : infrastructure
              ? '配置 / 文档 / 构建 / 资源'
              : '源码引用关系 · 词法估计已标记'}
          {snapshot.limits.truncated ? ' · 索引未完整' : ''}
        </span>
      </footer>
    </section>
  );
}
export function GraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
