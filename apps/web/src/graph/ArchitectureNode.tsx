import { memo, useLayoutEffect, useRef } from 'react';
import { Handle, Position, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  ArrowUpRight,
  ChevronDown,
  FileCode2,
  Files,
  Focus,
  Folder,
  Minus,
  UserRound,
} from 'lucide-react';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeFooter,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '../components/react-flow-ui/base-node';
import {
  NodeTooltip,
  NodeTooltipContent,
  NodeTooltipTrigger,
} from '../components/react-flow-ui/node-tooltip';
import { FloatingNodePanel } from '../components/react-flow-ui/floating-node-panel';
import type { Tag } from '../domain';
import type { KnowledgeNode } from './model';
import { RELATIONS, SUMMARY_RELATION, sourceCableColor } from './relations';
import { MAP_ZOOM_THRESHOLD, nodeSize, readingMode } from './presentation';
import { ROOT_SCOPE, TEST_SCOPE } from './scopes';

const TAG_PRIORITY: Tag[] = ['REVIEW', 'CORE', 'REUSE', 'INTENT', 'TODO'];

export const ArchitectureNode = memo(function ArchitectureNode({
  id,
  data,
  selected,
}: NodeProps<KnowledgeNode>) {
  const nodeElement = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const ports = Object.values(data.wirePorts);
  const portGeometry = JSON.stringify(ports.map((port) => [port.id, port.y]));
  const crowded = ports.some((port) => port.crowded);
  const crowdingLabel = crowded
    ? '连接密集，间距已压缩，部分端点可能重叠；可使用邻居聚焦或关系分类筛选查看'
    : '';
  // React Flow otherwise retains old handle bounds when degree changes without
  // changing the card dimensions (e.g. category toggles and topology polling).
  useLayoutEffect(() => updateNodeInternals(id), [id, portGeometry, updateNodeInternals]);
  // Subscribe to the threshold crossing, never to every viewport wheel pixel.
  const farZoom = useStore((state) => state.transform[2] < MAP_ZOOM_THRESHOLD);
  const mode = readingMode(farZoom ? 0 : MAP_ZOOM_THRESHOLD, data.detailed);
  const module = data.kind === 'module';
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
  const tags = TAG_PRIORITY.filter((tag) => data.counts[tag] > 0);
  const sourceLocation = `${data.summaryPath}:${data.summaryLine}`;
  const ownerLabel = data.owners.length ? `Agent ${data.owners.join('、')}` : '';
  const reviewLabel = data.reviews ? `${data.reviews} 项待验收` : '';
  const mapReview = mode === 'map' && data.counts.REVIEW > 0;
  const accessibleLabel = [
    `${module ? '模块' : '文件'} ${data.label}`,
    virtualScope ? location : data.path,
    `${data.files} 个文件`,
    data.summary,
    reviewLabel,
    ownerLabel,
    crowdingLabel,
    ...tags.map((tag) => `${tag} ${data.counts[tag]}`),
  ]
    .filter(Boolean)
    .join('，');
  const marker = tags[0];

  return (
    <NodeTooltip>
      <NodeTooltipTrigger>
        <BaseNode
          ref={nodeElement}
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
            const relation =
              port.category === 'summary' ? SUMMARY_RELATION : RELATIONS[port.category];
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
            const size = port.crowded ? Math.max(1, Math.min(3, port.spacing * 0.7)) : 6;
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
                  // border. Center the visible circle there rather than 3px
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
                title={`${data.summary}\n${sourceLocation}`}
                aria-label={`${data.summary}，查看源码 ${sourceLocation}`}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onSource?.(data.summaryPath, data.summaryLine);
                }}
              >
                <span className="node-summary-text">{data.summary}</span>
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
              <p className="node-summary" title={data.summary}>
                <span className="node-summary-text">{data.summary}</span>
              </p>
            )}
            {mode === 'detail' && tags.length > 0 && (
              <div className="node-tags">
                {tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="node-marker">
                    {tag} {data.counts[tag]}
                  </span>
                ))}
                {tags.length > 2 && <span className="node-tag-overflow">+{tags.length - 2}</span>}
              </div>
            )}
          </BaseNodeContent>
          <BaseNodeFooter className="node-footer">
            <span className="node-file-count" title={`${data.files} 个文件`}>
              {module ? (
                <Files size={12} aria-hidden="true" />
              ) : (
                <FileCode2 size={12} aria-hidden="true" />
              )}
              <span>
                {module || mode === 'map'
                  ? `${data.files} 个文件`
                  : `${data.lines.toLocaleString()} 行`}
              </span>
            </span>
            <span
              className={`node-state${data.reviews || mapReview ? ' review-color' : ''}`}
              title={[reviewLabel, ownerLabel, ...tags.map((tag) => `${tag} ${data.counts[tag]}`)]
                .filter(Boolean)
                .join(' · ')}
            >
              {data.reviews ? (
                <>
                  <Focus size={12} aria-hidden="true" />
                  <span>{reviewLabel}</span>
                </>
              ) : mapReview ? (
                <>
                  <Focus size={12} aria-hidden="true" />
                  <span>REVIEW {data.counts.REVIEW}</span>
                </>
              ) : data.owners.length ? (
                <>
                  <UserRound size={12} aria-hidden="true" />
                  <span>{ownerLabel}</span>
                </>
              ) : marker ? (
                <span className="node-marker">
                  {marker} {data.counts[marker]}
                </span>
              ) : null}
            </span>
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
      </NodeTooltipTrigger>
      <NodeTooltipContent
        className="tv-node-kit tv-node-detail nodrag nopan nowheel"
        position={Position.Bottom}
        offset={10}
        aria-label={`${data.label} 详情`}
      >
        <strong className="node-detail-name">{data.label}</strong>
        <p className="node-detail-path">{virtualScope ? location : data.path}</p>
        <p className="node-detail-summary">{data.summary}</p>
        <p className="node-detail-facts">
          {data.files} 个文件 · {data.lines.toLocaleString()} 行 · {data.annotations.length} 条知识
          {data.expanded && ` · 已显示 ${data.shownFiles} / ${data.files} 个文件`}
        </p>
        {crowded && <p className="node-detail-facts">{crowdingLabel}</p>}
        {tags.length > 0 && (
          <div className="node-detail-tags">
            {tags.map((tag) => (
              <span key={tag} className="node-marker">
                {tag} {data.counts[tag]}
              </span>
            ))}
          </div>
        )}
        {reviewLabel && (
          <p className="node-detail-state review-color">
            <Focus size={14} aria-hidden="true" />
            {reviewLabel}
          </p>
        )}
        {ownerLabel && (
          <p className="node-detail-state">
            <UserRound size={14} aria-hidden="true" />
            {ownerLabel}
          </p>
        )}
        {data.summaryPath && data.onSource && (
          <button
            type="button"
            className="node-detail-source"
            onClick={(event) => {
              event.stopPropagation();
              data.onSource?.(data.summaryPath, data.summaryLine);
            }}
            aria-label={`打开源码 ${sourceLocation}`}
          >
            <FileCode2 size={14} aria-hidden="true" />
            <span>{sourceLocation}</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </NodeTooltipContent>
      <FloatingNodePanel
        reference={nodeElement}
        isVisible={selected}
        placement="top"
        distance={12}
        className="react-flow__node-toolbar tv-node-kit tv-node-actions nodrag nopan"
        role="group"
        aria-label={`${data.label} 操作`}
      >
        {data.summaryPath && data.onSource && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onSource?.(data.summaryPath, data.summaryLine);
            }}
            aria-label={`查看源码 ${sourceLocation}`}
          >
            <FileCode2 size={14} aria-hidden="true" />
            源码
          </button>
        )}
        {module && data.onDrill && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onDrill?.(data.path);
            }}
            aria-label={`进入模块 ${data.label}`}
          >
            <ArrowUpRight size={14} aria-hidden="true" />
            进入模块
          </button>
        )}
        {module && data.onExpand && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onExpand?.(data.path);
            }}
            aria-label={`${data.expanded ? '收起' : '展开'}文件 ${data.label}`}
            aria-expanded={data.expanded}
          >
            {data.expanded ? (
              <Minus size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
            {data.expanded ? '收起' : '展开'}文件
          </button>
        )}
      </FloatingNodePanel>
    </NodeTooltip>
  );
});
