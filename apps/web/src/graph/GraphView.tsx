import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  useNodesInitialized,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
  type OnNodesChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Expand,
  FileCode2,
  Focus,
  Folder,
  Layers3,
  Minus,
  Network,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import type { Filter, Selection, Snapshot, Tag } from '../domain';
import { Empty, IconButton, Notice, TagChip } from '../components/ui';
import { buildGraph, type KnowledgeEdge, type KnowledgeNode } from './model';
import { filesForScope, ROOT_SCOPE, scopeLabel, TEST_SCOPE } from './scopes';
import { layoutGraph, retainPositions } from './layout';

const fitOptions = {
  padding: {
    top: '64px' as const,
    bottom: '105px' as const,
    left: '24px' as const,
    right: '24px' as const,
  },
  minZoom: 0.75,
  maxZoom: 1.05,
  duration: 200,
};
const GraphNode = memo(function GraphNode({ data, selected }: NodeProps<KnowledgeNode>) {
  const module = data.kind === 'module';
  const tags = (['REVIEW', 'CORE', 'REUSE', 'INTENT'] as Tag[]).filter(
    (tag) => data.counts[tag] > 0,
  );
  return (
    <article
      className={`graph-node ${module ? 'module-node' : 'file-node'} ${data.detailed ? 'detailed-node' : 'overview-node'}${selected ? ' is-selected' : ''}`}
    >
      <Handle type="target" id="in" position={Position.Left} isConnectable={false} />
      <div className="node-heading">
        <span className={`node-icon ${module ? 'module-icon' : ''}`}>
          {module ? <Folder size={17} /> : <FileCode2 size={17} />}
        </span>
        <div className="node-title">
          <strong title={data.label}>{data.label}</strong>
          <span>
            {module
              ? `${data.files} 个文件`
              : data.path.slice(0, Math.max(0, data.path.lastIndexOf('/'))) || '根目录'}
          </span>
        </div>
        {module && (
          <button
            className="node-drill nodrag nopan"
            title={`查看 ${data.label} 全部文件`}
            aria-label={`进入 ${data.label} 模块`}
            onClick={(event) => {
              event.stopPropagation();
              data.onDrill?.(data.path);
            }}
          >
            <ArrowUpRight size={17} />
          </button>
        )}
      </div>
      {data.summaryPath ? (
        <button
          className="node-summary node-summary-link nodrag nopan"
          title={`${data.summary}\n${data.summaryPath}:${data.summaryLine}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onSource?.(data.summaryPath, data.summaryLine);
          }}
        >
          {data.summary}
        </button>
      ) : (
        <p className="node-summary" title={data.summary}>
          {data.summary}
        </p>
      )}
      <div className="node-tags">
        {tags.length ? (
          tags
            .slice(0, data.detailed ? 3 : 2)
            .map((tag) => <TagChip key={tag} tag={tag} count={data.counts[tag]} />)
        ) : (
          <span className="node-unannotated">
            {data.lines.toLocaleString()} 行 · {data.annotations.length} 条知识
          </span>
        )}
      </div>
      <div className="node-footer">
        <span className={data.reviews ? 'review-color' : 'node-ownership'}>
          {data.reviews ? (
            <>
              <Focus size={12} />
              {data.reviews} 项待验收
            </>
          ) : data.owners.length ? (
            <>
              <UserRound size={12} />
              {data.owners.join('、')}
            </>
          ) : data.expanded ? (
            <>
              {data.shownFiles} / {data.files} 个文件
            </>
          ) : (
            <>
              <Network size={12} />
              {data.annotations.length} 条知识
            </>
          )}
        </span>
        {module && (
          <button
            className="node-expand nodrag nopan"
            onClick={(event) => {
              event.stopPropagation();
              data.onExpand?.(data.path);
            }}
            title={
              data.expanded
                ? '收起文件，右上角查看全部'
                : `展开最相关的 ${Math.min(4, data.files)} / ${data.files} 个文件，右上角查看全部`
            }
            aria-label={`${data.expanded ? '收起' : '展开'} ${data.label}`}
          >
            {data.expanded ? <Minus size={12} /> : <ChevronDown size={12} />}
            {data.expanded ? '收起' : `展开 ${Math.min(4, data.files)}/${data.files}`}
          </button>
        )}
      </div>
      <Handle type="source" id="out" position={Position.Right} isConnectable={false} />
    </article>
  );
});

function RoutedEdge(props: EdgeProps<KnowledgeEdge>) {
  const { data, sourceX, sourceY, targetX, targetY } = props;
  const points = data?.points;
  const unchanged =
    points?.length &&
    Math.abs(points[0]!.x - sourceX) < 3 &&
    Math.abs(points[0]!.y - sourceY) < 3 &&
    Math.abs(points[points.length - 1]!.x - targetX) < 3 &&
    Math.abs(points[points.length - 1]!.y - targetY) < 3;
  const path = unchanged
    ? points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
    : getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        borderRadius: 9,
        offset: 27,
      })[0];
  const emphasized = data?.emphasized || props.selected;
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      interactionWidth={16}
      style={{
        stroke: emphasized ? '#367760' : '#819b8a',
        strokeWidth: emphasized ? 2.5 : 1.5,
        opacity: data?.muted && !emphasized ? 0.3 : 1,
      }}
    />
  );
}
const nodeTypes = { knowledge: GraphNode };
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
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  const [fitTick, setFitTick] = useState(0);
  const [layoutBusy, setLayoutBusy] = useState(true);
  const [layoutError, setLayoutError] = useState('');
  const [zoom, setZoom] = useState(1);
  const graph = useReactFlow<KnowledgeNode, KnowledgeEdge>();
  const initialized = useNodesInitialized();
  const positions = useRef(new Map<string, Map<string, XYPosition>>());
  const viewports = useRef(new Map<string, Viewport>());
  const layoutContext = useRef('');
  const resetPositions = useRef(false);
  const pendingFit = useRef(false);
  const context = `${snapshot.project.workspaceId}:${scope}:${infrastructure}:${detailed}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const model = useMemo(
    () => buildGraph(snapshot, { scope, expanded, filter, focusId, infrastructure, detailed }),
    [snapshot, scope, expanded, filter, focusId, infrastructure, detailed],
  );
  const latest = useRef(model);
  latest.current = model;
  const rememberViewport = useCallback(() => {
    viewports.current.set(contextRef.current, graph.getViewport());
  }, [graph]);
  const drill = useCallback(
    (path: string) => {
      rememberViewport();
      setScope(path);
      setExpanded([]);
      setFocusId(null);
      setSelectedId(null);
      onModule(path);
    },
    [rememberViewport, onModule],
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
        const restored = remembered.size ? retainPositions(result.nodes, remembered) : result.nodes;
        const rememberedPositions = new Map(remembered);
        for (const node of restored) rememberedPositions.set(node.id, node.position);
        positions.current.set(context, rememberedPositions);
        const data = new Map(latest.current.nodes.map((node) => [node.id, node.data]));
        setNodes(
          decorate(restored.map((node) => ({ ...node, data: data.get(node.id) ?? node.data }))),
        );
        setEdges(
          result.edges.map((edge) => ({
            ...edge,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#819b8a' },
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
          } else pendingFit.current = true;
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
    const frame = requestAnimationFrame(() => {
      pendingFit.current = false;
      void graph.fitView(fitOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, layoutBusy, fitTick, nodes.length, graph]);
  useEffect(() => {
    const currentData = new Map(model.nodes.map((node) => [node.id, node.data]));
    setNodes((previous) =>
      decorate(previous.map((node) => ({ ...node, data: currentData.get(node.id) ?? node.data }))),
    );
  }, [model, decorate]);
  useEffect(() => {
    if (!selection?.path) return;
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
  }, [selection, nodes]);
  const onNodesChange: OnNodesChange<KnowledgeNode> = useCallback((changes) => {
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
  const activeNode = hoveredId ?? selectedId;
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          count: edge.data?.count ?? 1,
          emphasized:
            edge.id === hoveredEdge ||
            (!!activeNode && (edge.source === activeNode || edge.target === activeNode)),
          muted: !!activeNode && edge.source !== activeNode && edge.target !== activeNode,
        },
      })),
    [edges, activeNode, hoveredEdge],
  );
  const breadcrumbs =
    scope === ROOT_SCOPE || scope === TEST_SCOPE ? [scope] : scope.split('/').filter(Boolean);
  const fit = () => {
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
      </div>
      <div className="flow-container">
        <ReactFlow<KnowledgeNode, KnowledgeEdge>
          nodes={nodes.map((node) => ({ ...node, selected: node.id === selectedId }))}
          edges={displayedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            setSelectedId(node.id);
            if (node.data.kind === 'file') onSelect({ path: node.data.path, line: 1 });
            else onModule(node.data.path);
          }}
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
          <Background variant={BackgroundVariant.Dots} color="#ccd1cc" gap={22} size={1} />
          <Controls position="bottom-right" showInteractive={false} fitViewOptions={fitOptions} />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            nodeColor={(node) =>
              node.type === 'knowledge' && node.data.kind === 'module' ? '#b8c9ca' : '#e2dcd0'
            }
            maskColor="rgba(244,245,240,0.76)"
          />
          <Panel position="top-left" className="graph-actions">
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
            <IconButton label="适合画布，保留文字可读" onClick={fit}>
              <Expand size={16} />
            </IconButton>
            <button
              className={`canvas-button${focusId ? ' active' : ''}`}
              disabled={!selectedId}
              onClick={() => setFocusId((previous) => (previous ? null : selectedId))}
            >
              <Focus size={14} />
              {focusId ? '显示全图' : '聚焦邻居'}
            </button>
            <span className="zoom-level" aria-label="当前缩放">
              {Math.round(zoom * 100)}%
            </span>
          </Panel>
          <Panel position="bottom-center" className="graph-legend">
            <span>
              <i className="legend-module" />
              模块
            </span>
            <span>
              <i className="legend-file" />
              文件
            </span>
            <span className="legend-edge">
              实际引用 <ArrowUpRight size={12} />
            </span>
          </Panel>
        </ReactFlow>
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
        <span>双击进入模块 · 右上角查看全部文件 · 拖动画布平移</span>
        <span>
          {infrastructure ? '配置 / 文档 / 构建 / 资源' : '连线仅来自实际静态引用'}
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
