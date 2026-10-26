import { memo, useRef } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
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
import { RELATION_CATEGORIES, relationHandle, relationOffset, type KnowledgeNode } from './model';
import { MAP_ZOOM_THRESHOLD, nodeSize, readingMode } from './presentation';
import { ROOT_SCOPE, TEST_SCOPE } from './scopes';

const TAG_PRIORITY: Tag[] = ['REVIEW', 'CORE', 'REUSE', 'INTENT', 'TODO'];

export const ArchitectureNode = memo(function ArchitectureNode({
  data,
  selected,
}: NodeProps<KnowledgeNode>) {
  const nodeElement = useRef<HTMLDivElement>(null);
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
          role="group"
          aria-label={accessibleLabel}
        >
          {RELATION_CATEGORIES.map((category) => (
            <Handle
              key={`in-${category}`}
              type="target"
              id={relationHandle('in', category)}
              position={Position.Left}
              isConnectable={false}
              style={{ top: `calc(50% + ${relationOffset(category)}px)` }}
            />
          ))}
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
          {RELATION_CATEGORIES.map((category) => (
            <Handle
              key={`out-${category}`}
              type="source"
              id={relationHandle('out', category)}
              position={Position.Right}
              isConnectable={false}
              style={{ top: `calc(50% + ${relationOffset(category)}px)` }}
            />
          ))}
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
