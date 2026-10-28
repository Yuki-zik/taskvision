import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, shift, size, hide, offset } from '@floating-ui/dom';
import { ArrowUpRight, ChevronDown, FileCode2, Folder, Maximize2, Minus, X } from 'lucide-react';
import { statuses, type Snapshot } from '../domain';
import type { KnowledgeNode, KnowledgeNodeData } from './model';
import { deriveNodeFacts } from './node-facts';
import { ROOT_SCOPE, TEST_SCOPE } from './scopes';

export const ANNOTATION_PREVIEW_LIMIT = 5;

/** Keep totals independent of the bounded preview; retain exact source provenance. */
export function prepareNodeDetail(data: KnowledgeNodeData) {
  const facts = deriveNodeFacts(data);
  const annotations = data.annotations.filter((item) => item.status !== 'archived');
  const preview = annotations.slice(0, ANNOTATION_PREVIEW_LIMIT);
  return {
    ...facts,
    preview,
    remainingAnnotations: annotations.length - preview.length,
    crowded: Object.values(data.wirePorts).some((port) => port.crowded),
  };
}

interface Props {
  node: KnowledgeNode;
  reference: HTMLElement;
  limits: Snapshot['limits'];
  theme: 'dark' | 'light';
  onClose: () => void;
  onInspect: () => void;
}

/** A single non-modal, screen-sized surface; Floating UI owns all placement. */
export function NodeDetailPopover({ node, reference, limits, theme, onClose, onInspect }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { data } = node;
  const facts = prepareNodeDetail(data);
  const module = data.kind === 'module';
  const path =
    data.path === ROOT_SCOPE ? '项目根目录' : data.path === TEST_SCOPE ? '跨目录测试' : data.path;
  const name = module && data.label === data.path ? data.path.split('/').at(-1) : data.label;

  useLayoutEffect(() => {
    const floating = panel.current;
    if (!floating) return;
    let alive = true;
    let focused = false;
    // The popup can extend beyond the canvas. Only its anchor is clipped by it.
    // Keep the floating card inside the canvas, not over the Activity Bar
    // or toolbar; the portal is still outside the React Flow transform.
    const boundary = reference.closest<HTMLElement>('.flow-container') ?? document.documentElement;
    const update = () => {
      void computePosition(reference, floating, {
        placement: 'right',
        strategy: 'fixed',
        middleware: [
          offset(12),
          flip({ boundary, padding: 12, fallbackAxisSideDirection: 'start' }),
          shift({ boundary, padding: 12, crossAxis: true }),
          size({
            boundary,
            padding: 12,
            apply({ availableWidth, availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxWidth: `${Math.max(0, Math.min(452, availableWidth))}px`,
                maxHeight: `${Math.max(0, Math.min(584, availableHeight))}px`,
              });
            },
          }),
          hide({
            boundary: reference.closest('.react-flow') ?? boundary,
            strategy: 'referenceHidden',
          }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        if (!alive) return;
        const hidden = Boolean(middlewareData.hide?.referenceHidden);
        Object.assign(floating.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: hidden ? 'hidden' : 'visible',
        });
        floating.dataset.placement = placement;
        if (!hidden && !focused) {
          floating.focus({ preventScroll: true });
          focused = true;
        }
      });
    };
    const cleanup = autoUpdate(reference, floating, update, { animationFrame: true });
    return () => {
      alive = false;
      cleanup();
    };
  }, [reference]);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="node-detail-popover nodrag nopan nowheel"
      data-theme={theme}
      data-node-id={node.id}
      style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <header className="ndp-header">
        <span className="ndp-icon" aria-hidden="true">
          {module ? <Folder size={23} /> : <FileCode2 size={23} />}
        </span>
        <div className="ndp-title">
          <h2 id={titleId}>{name}</h2>
          <p>
            {module ? '模块' : '文件'} · {path}
          </p>
        </div>
        <button type="button" className="ndp-close" aria-label="关闭节点详情" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="ndp-body">
        <p className="ndp-summary">{data.summary || '暂无源码摘要'}</p>
        <dl className="ndp-metrics" aria-label="已索引文件与当前可见关系">
          <div>
            <dt>已索引文件</dt>
            <dd>{facts.files.toLocaleString()}</dd>
          </div>
          <div>
            <dt>源码行数 LOC</dt>
            <dd>{facts.lines.toLocaleString()}</dd>
          </div>
          <div>
            <dt>引用方</dt>
            <dd>
              {facts.incoming}
              <small>{facts.incomingReferences} 处引用</small>
            </dd>
          </div>
          <div>
            <dt>依赖方</dt>
            <dd>
              {facts.outgoing}
              <small>{facts.outgoingReferences} 处引用</small>
            </dd>
          </div>
        </dl>
        <p className="ndp-note">关系计数基于当前可见图；LOC 含空行与注释。</p>
        {(limits.truncated || limits.incomplete) && (
          <p className="ndp-warning">
            索引未完整 · 已扫描 {limits.scannedFiles} / 上限 {limits.maxFiles} 个文件
          </p>
        )}
        {facts.crowded && (
          <p className="ndp-warning">连接密集，部分端点可能重叠；可用关系筛选或邻域聚焦查看。</p>
        )}
        {module && data.expanded && (
          <p className="ndp-note">
            画布已展开 {data.shownFiles} / {facts.files} 个文件
          </p>
        )}
        <section aria-label="知识与状态" className="ndp-section">
          <h3>
            知识标注 <span>{facts.annotationCount}</span>
          </h3>
          <div className="ndp-tags">
            {facts.tags.length ? (
              facts.tags.map(({ tag, count }) => (
                <span className="ndp-tag" data-tag={tag} key={tag}>
                  {tag} <b>{count}</b>
                </span>
              ))
            ) : (
              <span className="ndp-note">暂无标注</span>
            )}
          </div>
          <div className="ndp-statuses" aria-label="实际工作状态">
            {facts.statuses.map((status) => (
              <span key={status.kind} data-state={status.kind}>
                {status.label}
              </span>
            ))}
          </div>
          {(facts.staleAnnotations > 0 || facts.missingAnnotations > 0) && (
            <p className="ndp-warning">
              {facts.staleAnnotations} 条源码已变化 · {facts.missingAnnotations} 条锚点缺失
            </p>
          )}
          {facts.reviewAnnotations > 0 && (
            <p className="ndp-note">REVIEW 是知识标注；待验收仅计实际交付记录。</p>
          )}
        </section>
        {facts.symbols.length > 0 && (
          <section className="ndp-section" aria-label="标注关联源码符号">
            <h3>
              关联符号 <span>{facts.symbols.length}</span>
            </h3>
            <div className="ndp-symbols">
              {facts.symbols.slice(0, 8).map((symbol) => (
                <button
                  key={JSON.stringify(symbol)}
                  type="button"
                  title={`${symbol.path}:${symbol.line}`}
                  onClick={() => data.onSource?.(symbol.path, symbol.line)}
                  disabled={!data.onSource}
                >
                  {symbol.name}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
            {facts.symbols.length > 8 && (
              <p className="ndp-note">
                另有 {facts.symbols.length - 8} 个符号，在完整检查器中查看。
              </p>
            )}
          </section>
        )}
        <section aria-label="真实标注预览" className="ndp-section">
          <h3>
            标注预览{' '}
            <span>
              {facts.preview.length} / {facts.annotationCount}
            </span>
          </h3>
          {facts.preview.length ? (
            <ol className="ndp-annotations">
              {facts.preview.map((annotation) => (
                <li key={annotation.id} data-tag={annotation.tag}>
                  <div className="ndp-annotation-heading">
                    <span className="ndp-tag" data-tag={annotation.tag}>
                      {annotation.tag}
                    </span>
                    <strong>{annotation.summary}</strong>
                  </div>
                  {annotation.body && (
                    <p className="ndp-excerpt">
                      {annotation.body.slice(0, 220)}
                      {annotation.body.length > 220 ? '…' : ''}
                    </p>
                  )}
                  <div className="ndp-provenance">
                    {annotation.path && data.onSource ? (
                      <button
                        type="button"
                        onClick={() => data.onSource?.(annotation.path, annotation.line)}
                        aria-label={`打开标注源码 ${annotation.path}:${annotation.line}`}
                      >
                        <FileCode2 size={12} />
                        <span>
                          {annotation.path}:{annotation.line}
                          {annotation.endLine > annotation.line ? `–${annotation.endLine}` : ''}
                        </span>
                        <ArrowUpRight size={12} />
                      </button>
                    ) : (
                      <span>
                        {annotation.path || '项目级标注'}
                        {annotation.path ? `:${annotation.line}` : ''}
                      </span>
                    )}
                    <span>
                      {annotation.origin === 'source'
                        ? '源码注释'
                        : annotation.origin === 'web'
                          ? 'Web 标注'
                          : '历史导入'}{' '}
                      · {annotation.author} · {statuses[annotation.status] ?? annotation.status} ·{' '}
                      {statuses[annotation.freshness] ?? annotation.freshness}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ndp-note">此节点尚无知识标注；可在完整检查器中添加。</p>
          )}
          {facts.remainingAnnotations > 0 && (
            <p className="ndp-note">
              另有 {facts.remainingAnnotations} 条标注，在完整检查器中查看。
            </p>
          )}
        </section>
      </div>
      <footer className="ndp-actions">
        {data.summaryPath && data.onSource && (
          <button type="button" onClick={() => data.onSource?.(data.summaryPath, data.summaryLine)}>
            <FileCode2 size={15} />
            打开源码
          </button>
        )}
        {module && data.onDrill && (
          <button type="button" onClick={() => data.onDrill?.(data.path)}>
            <ArrowUpRight size={15} />
            进入模块
          </button>
        )}
        {module && data.onExpand && (
          <button
            type="button"
            aria-expanded={data.expanded}
            onClick={() => data.onExpand?.(data.path)}
          >
            {data.expanded ? <Minus size={15} /> : <ChevronDown size={15} />}
            {data.expanded ? '收起文件' : '展开文件'}
          </button>
        )}
        <button type="button" className="ndp-primary" onClick={onInspect}>
          <Maximize2 size={15} />
          完整检查器
        </button>
      </footer>
      <span className="ndp-sr-only" role="status" aria-live="polite">
        已打开{module ? '模块' : '文件'} {data.label} 详情，{facts.annotationCount} 条标注。按
        Escape 关闭并返回节点。
      </span>
    </div>,
    document.body,
  );
}
