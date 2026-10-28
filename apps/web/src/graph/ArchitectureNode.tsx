import { memo, useLayoutEffect } from 'react';
import { Handle, Position, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  ArrowUpRight,
  ArrowRightFromLine,
  ArrowRightToLine,
  ChevronDown,
  CircleDashed,
  Code2,
  FileCode2,
  Files,
  Focus,
  Folder,
  Minus,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeFooter,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '../components/react-flow-ui/base-node';
import type { KnowledgeNode } from './model';
import { deriveNodeFacts } from './node-facts';
import { RELATIONS, SUMMARY_RELATION, sourceCableColor } from './relations';
import { MAP_ZOOM_THRESHOLD, nodeSize, readingMode } from './presentation';
import { ROOT_SCOPE, TEST_SCOPE } from './scopes';

export const ArchitectureNode = memo(function ArchitectureNode({
  id,
  data,
  selected,
}: NodeProps<KnowledgeNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const ports = Object.values(data.wirePorts);
  const portGeometry = JSON.stringify(ports.map((port) => [port.id, port.y]));
  const crowded = ports.some((port) => port.crowded);
  const crowdingLabel = crowded
    ? '连接密集，间距已压缩，部分端点可能重叠；可使用邻居聚焦或关系分类筛选查看'
    : '';
  // Subscribe to the threshold crossing, never to every viewport wheel pixel.
  const farZoom = useStore((state) => state.transform[2] < MAP_ZOOM_THRESHOLD);
  // React Flow otherwise retains old handle bounds when degree changes without
  // changing the card dimensions, or when semantic zoom changes dot diameter.
  useLayoutEffect(() => updateNodeInternals(id), [id, portGeometry, farZoom, updateNodeInternals]);
  const mode = readingMode(farZoom ? 0 : MAP_ZOOM_THRESHOLD, data.detailed);
  const module = data.kind === 'module';
  const facts = deriveNodeFacts(data);
  const virtualScope = data.path === ROOT_SCOPE || data.path === TEST_SCOPE;
  const parentPath = data.path.slice(0, Math.max(0, data.path.lastIndexOf('/')));
  const name =
    module && !virtualScope && data.label === data.path ? data.path.split('/').at(-1) : data.label;
  const namespace =
    data.path === TEST_SCOPE
      ? 'tests'
      : data.path === ROOT_SCOPE
        ? 'root'
        : data.path.split('/')[0];
  const location = virtualScope
    ? data.path === TEST_SCOPE
      ? '跨目录测试'
      : '项目根目录'
    : parentPath || '根目录';
  const sourceLocation = `${data.summaryPath}:${data.summaryLine}`;
  const summary = data.summary || '暂无源码摘要';
  const incomingLabel = `当前可见关系：${facts.incoming} 个唯一引用方，引用此${module ? '模块' : '文件'}；共 ${facts.incomingReferences} 条源码引用`;
  const outgoingLabel = `当前可见关系：依赖 ${facts.outgoing} 个唯一提供方；共 ${facts.outgoingReferences} 条源码引用`;
  const freshnessLabel = `${facts.staleAnnotations} 条标注源码已变化，${facts.missingAnnotations} 条标注锚点缺失`;
  const accessibleLabel = [
    `${module ? '模块' : '文件'} ${data.label}`,
    virtualScope ? location : data.path,
    `${data.files} 个文件`,
    `${data.lines.toLocaleString()} 行`,
    summary,
    incomingLabel,
    outgoingLabel,
    ...facts.statuses.map((status) => status.label),
    crowdingLabel,
    ...facts.tags.map(({ tag, count }) => `${tag} 标注 ${count}`),
    !facts.tags.length && '暂无标注',
  ]
    .filter(Boolean)
    .join('，');

  return (
    <BaseNode
      tabIndex={-1}
      data-slot="base-node"
      className={`tv-node-kit graph-node ${module ? 'module-node' : 'file-node'} ${data.detailed ? 'detailed-node' : 'overview-node'}${selected ? ' is-selected' : ''}`}
      style={nodeSize(data.kind, data.detailed)}
      data-reading-mode={mode}
      data-namespace={namespace}
      data-pending-review={data.reviews > 0 || undefined}
      data-wire-crowded={crowded || undefined}
      role="group"
      aria-label={accessibleLabel}
    >
      {ports.map((port) => {
        const relation = port.category === 'summary' ? SUMMARY_RELATION : RELATIONS[port.category];
        const wireColor =
          port.category === 'summary'
            ? sourceCableColor(port.side === 'out' ? id : port.counterpart)
            : relation.color;
        const kinds = Object.entries(port.kindCounts)
          .map(
            ([category, count]) =>
              `${RELATIONS[category as keyof typeof RELATIONS].label} ${count}`,
          )
          .join(' · ');
        const size = port.crowded ? Math.max(1, Math.min(3, port.spacing * 0.7)) : farZoom ? 6 : 8;
        return (
          <Handle
            key={port.id}
            type={port.side === 'in' ? 'target' : 'source'}
            id={port.id}
            position={port.side === 'in' ? Position.Left : Position.Right}
            isConnectable={false}
            data-edge-id={port.edgeId}
            data-relation-category={port.category}
            data-wire-crowded={port.crowded || undefined}
            title={`${port.side === 'in' ? '引用方' : '依赖'} ${port.counterpart} · ${kinds}${port.crowded ? ` · ${crowdingLabel}` : ''}`}
            style={{
              // The 1px shell border is inside the measured node rectangle.
              // These offsets put handle centers exactly at ELK's x/y.
              top: port.y - 1,
              // React Flow's fixed-position port endpoint is on the card
              // border. Center the visible circle there rather than 4px
              // inside the node, or the cable will appear disconnected.
              left: port.side === 'in' ? -size / 2 : undefined,
              right: port.side === 'out' ? -size / 2 : undefined,
              // React Flow's default lateral 50% transform makes its
              // computed cable attachment land at the circle's outer edge.
              // With a centered box and only vertical centering, the visible
              // circle and measured SVG endpoint remain attached at its perimeter.
              transform: 'translateY(-50%)',
              width: size,
              height: size,
              minWidth: size,
              minHeight: size,
              borderWidth: port.crowded ? 0 : 1,
              background: wireColor,
              opacity: farZoom ? 0.55 : 0.9,
            }}
          />
        );
      })}
      <BaseNodeHeader className="node-heading" data-slot="base-node-header">
        <span className="node-icon" aria-hidden="true">
          {module ? (
            <Folder size={18} strokeWidth={1.7} />
          ) : (
            <FileCode2 size={18} strokeWidth={1.7} />
          )}
        </span>
        <BaseNodeHeaderTitle className="node-title">
          <strong title={virtualScope ? data.label : data.path}>{name}</strong>
          <span className="node-metadata" title={virtualScope ? location : data.path}>
            {location}
          </span>
        </BaseNodeHeaderTitle>
        {module && data.onDrill && (
          <button
            type="button"
            className="node-drill nodrag nopan"
            title={`查看 ${data.label} 全部文件`}
            aria-label={`进入 ${data.label} 模块`}
            onClick={(event) => {
              event.stopPropagation();
              data.onDrill?.(data.path);
            }}
          >
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        )}
      </BaseNodeHeader>
      <BaseNodeContent className="node-content">
        {data.summaryPath && data.onSource ? (
          <button
            type="button"
            className="node-summary node-summary-link nodrag nopan"
            title={`${summary}\n${sourceLocation}`}
            aria-label={`${summary}，查看源码 ${sourceLocation}`}
            onClick={(event) => {
              event.stopPropagation();
              data.onSource?.(data.summaryPath, data.summaryLine);
            }}
          >
            <span className="node-summary-text">{summary}</span>
            {mode === 'detail' && (
              <span className="node-source" aria-hidden="true">
                <span>
                  {data.summaryPath.split('/').at(-1)}:{data.summaryLine}
                </span>
                <ArrowUpRight size={12} />
              </span>
            )}
          </button>
        ) : (
          <p className="node-summary" title={summary}>
            <span className="node-summary-text">{summary}</span>
          </p>
        )}
        <div className="node-tags" aria-label="知识标注计数">
          {facts.tags.length ? (
            facts.tags.map(({ tag, count }) => (
              <span
                key={tag}
                className="node-marker"
                data-tag={tag}
                title={
                  tag === 'REVIEW'
                    ? `REVIEW 知识标注 ${count} 条；独立于 Agent 交付的待验收项`
                    : `${tag} 知识标注 ${count} 条`
                }
                aria-label={`${tag} 标注 ${count}`}
              >
                <span>{tag}</span> <b>{count}</b>
              </span>
            ))
          ) : (
            <span className="node-unannotated">暂无标注</span>
          )}
        </div>
        {mode === 'detail' && facts.symbols.length > 0 && (
          <div
            className="node-symbols"
            title={facts.symbols.map((symbol) => symbol.name).join(' · ')}
          >
            <Code2 size={12} aria-hidden="true" />
            <span>{facts.symbols.map((symbol) => symbol.name).join(' · ')}</span>
          </div>
        )}
      </BaseNodeContent>
      <div className="node-metrics" aria-label="文件、源码行数与当前可见依赖统计">
        <span className="node-file-count" title={`${facts.files} 个已索引文件`}>
          <Files size={12} aria-hidden="true" />
          <b>{facts.files.toLocaleString()}</b> 文件
        </span>
        <span title={`${facts.lines.toLocaleString()} 行已索引源码（含空行与注释）`}>
          <Code2 size={12} aria-hidden="true" />
          <b>{facts.lines.toLocaleString()}</b> LOC
        </span>
        <span title={incomingLabel} aria-label={incomingLabel}>
          <ArrowRightToLine size={12} aria-hidden="true" />
          <b>{facts.incoming}</b> 引用
        </span>
        <span title={outgoingLabel} aria-label={outgoingLabel}>
          <ArrowRightFromLine size={12} aria-hidden="true" />
          <b>{facts.outgoing}</b> 依赖
        </span>
      </div>
      <BaseNodeFooter className="node-footer">
        {facts.statuses.map((status) => (
          <span
            key={status.kind}
            className={`node-state${status.kind === 'review' ? ' review-color' : ''}`}
            data-state={status.kind}
            title={status.kind === 'stale' ? freshnessLabel : status.label}
          >
            {status.kind === 'review' ? (
              <Focus size={12} aria-hidden="true" />
            ) : status.kind === 'owner' ? (
              <UserRound size={12} aria-hidden="true" />
            ) : status.kind === 'stale' ? (
              <TriangleAlert size={12} aria-hidden="true" />
            ) : (
              <CircleDashed size={12} aria-hidden="true" />
            )}
            <span>{status.label}</span>
          </span>
        ))}
        {module && data.onExpand && (
          <button
            type="button"
            className="node-expand nodrag nopan"
            title={
              data.expanded
                ? `已显示 ${data.shownFiles} / ${data.files} 个文件，收起文件`
                : `展开最相关的 ${Math.min(4, data.files)} / ${data.files} 个文件`
            }
            aria-label={`${data.expanded ? '收起' : '展开'} ${data.label}`}
            aria-expanded={data.expanded}
            onClick={(event) => {
              event.stopPropagation();
              data.onExpand?.(data.path);
            }}
          >
            {data.expanded ? (
              <Minus size={13} aria-hidden="true" />
            ) : (
              <ChevronDown size={13} aria-hidden="true" />
            )}
          </button>
        )}
      </BaseNodeFooter>
    </BaseNode>
  );
});
