import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Code2,
  FileCode2,
  FolderOpen,
  GitBranch,
  Plus,
} from 'lucide-react';
import type { Annotation, Selection, Snapshot, SourceResult } from '../domain';
import { api, errorMessage } from '../services/api';
import { projectEntrypoints } from '../services/entrypoints';
import { filesForScope, scopeLabel } from '../graph/scopes';
import { Empty, Loading, Notice, PanelHeading, TagChip } from './ui';
import { KnowledgeEntry } from './KnowledgeEntry';

interface Props {
  snapshot: Snapshot;
  selection: Selection | null;
  module: string | null;
  onSelect: (selection: Selection) => void;
  onEdit: (annotation?: Annotation) => void;
  onDecide: (annotation: Annotation, decision: 'accept' | 'archive') => void;
  onClose: () => void;
}
export function Inspector({
  snapshot,
  selection,
  module,
  onSelect,
  onEdit,
  onDecide,
  onClose,
}: Props) {
  const [source, setSource] = useState<SourceResult | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'knowledge' | 'source'>('knowledge');
  const [reload, setReload] = useState(0);
  const selectedLine = useRef<HTMLDivElement | null>(null);
  const path = selection?.path ?? '';
  const file = snapshot.files.find((item) => item.path === path);
  const fileAnnotations = snapshot.annotations.filter(
    (item) => item.path === path && item.status !== 'archived',
  );
  const sourceVersion = fileAnnotations
    .filter((item) => item.origin === 'source')
    .map((item) => item.fileHash)
    .join(',');
  useEffect(() => {
    if (!path) {
      setSource(null);
      return;
    }
    const controller = new AbortController();
    setSource(null);
    setSourceError('');
    setLoading(true);
    void api
      .source(path, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSource(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setSourceError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, sourceVersion, reload, snapshot.revision]);
  useEffect(() => {
    if (selection?.line && path) setTab('source');
  }, [selection, path]);
  useEffect(() => {
    if (tab === 'source')
      selectedLine.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [source, tab, selection?.line]);
  const activeAnnotations = snapshot.annotations.filter((item) => item.status !== 'archived');
  if (!selection && module !== null && module !== '') {
    const files = filesForScope(snapshot.files, module);
    const annotations = activeAnnotations.filter((item) =>
      files.some((file) => file.path === item.path),
    );
    return (
      <aside className="inspector">
        <PanelHeading title="模块详情" onClose={onClose} />
        <div className="inspector-scroll">
          <div className="scope-heading">
            <FolderOpen size={24} />
            <h3>{scopeLabel(module)}</h3>
            <p>
              {files.length} 个文件 · {annotations.length} 条知识
            </p>
          </div>
          <div className="section-label">关键理解</div>
          {annotations.slice(0, 4).map((annotation) => (
            <KnowledgeEntry
              key={annotation.id}
              annotation={annotation}
              onSelect={onSelect}
              onEdit={onEdit}
              onDecide={onDecide}
              compact
            />
          ))}
          <div className="section-label">模块文件</div>
          <div className="module-file-list">
            {files.map((item) => (
              <button key={item.path} onClick={() => onSelect({ path: item.path, line: 1 })}>
                <FileCode2 size={14} />
                <span>{item.path}</span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      </aside>
    );
  }
  if (!selection) {
    const readingOrder = projectEntrypoints(snapshot);
    const introduction = activeAnnotations.find(
      (item) => !item.path && item.tag === 'INTENT' && item.status === 'active',
    );
    return (
      <aside className="inspector project-inspector">
        <PanelHeading title="项目上下文" onClose={module !== null ? onClose : undefined}>
          <BookOpen size={17} />
        </PanelHeading>
        <div className="inspector-scroll">
          <div className="project-detail">
            <h3>{snapshot.project.name}</h3>
            <p>
              <GitBranch size={13} />
              {snapshot.project.branch || '非 Git 工作区'}
              {snapshot.project.head && <code>{snapshot.project.head.slice(0, 7)}</code>}
            </p>
            {introduction ? (
              <button
                className="project-introduction"
                title={introduction.summary}
                onClick={() => onSelect({ path: '', line: 1, annotationId: introduction.id })}
              >
                {introduction.summary}
              </button>
            ) : (
              <span>选择模块进入源码，优先阅读入口与复用约定。</span>
            )}
          </div>
          <div className="section-label">
            源码入口与复用<span>{readingOrder.length} 个阅读点</span>
          </div>
          <div className="reading-entries">
            {readingOrder.length ? (
              readingOrder.map((entry) => (
                <button
                  key={entry.path}
                  className="reading-entry"
                  onClick={() => onSelect({ path: entry.path, line: entry.line })}
                >
                  <div>
                    {entry.tag ? <TagChip tag={entry.tag} /> : <FileCode2 size={14} />}
                    <span>{entry.path.split('/').at(-1)}</span>
                    <ArrowUpRight size={13} />
                  </div>
                  <strong title={entry.title}>{entry.title}</strong>
                  <small>
                    {entry.path}:{entry.line}
                  </small>
                </button>
              ))
            ) : (
              <Empty title="留下第一条项目知识">标记核心入口与复用约定，帮助协作者理解项目。</Empty>
            )}
          </div>
          <button className="add-guidance" onClick={() => onEdit()}>
            <Plus size={16} />
            添加项目指导
            <ArrowRight size={15} />
          </button>
          <div className="index-footnote">
            <span>索引范围</span>
            <p>
              {snapshot.limits.scannedFiles} 个文件
              {snapshot.limits.truncated ? ' · 已达到扫描预算' : ''}
            </p>
            <p>图中关系来自可解析的静态引用。</p>
          </div>
        </div>
      </aside>
    );
  }
  return (
    <aside className="inspector source-inspector">
      <PanelHeading title={path ? '文件详情' : '项目级指导'} onClose={onClose}>
        <button className="text-button" onClick={() => onEdit()}>
          <Plus size={13} />
          指导
        </button>
      </PanelHeading>
      <div className="file-detail-heading">
        <FileCode2 size={19} />
        <div>
          <h3>{path.split('/').at(-1) || snapshot.project.name}</h3>
          <p title={path}>{path || '整个项目'}</p>
        </div>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="文件详情">
        <button
          id="inspector-knowledge-tab"
          role="tab"
          aria-selected={tab === 'knowledge'}
          aria-controls="inspector-detail"
          onClick={() => setTab('knowledge')}
        >
          <BookOpen size={14} />
          知识 <span>{fileAnnotations.length}</span>
        </button>
        <button
          id="inspector-source-tab"
          role="tab"
          disabled={!path}
          aria-selected={tab === 'source'}
          aria-controls="inspector-detail"
          onClick={() => setTab('source')}
        >
          <Code2 size={14} />
          源码{file && <span>{file.lines} 行</span>}
        </button>
      </div>
      <div
        className={`inspector-scroll ${tab === 'source' ? 'source-scroll' : ''}`}
        id="inspector-detail"
        role="tabpanel"
        aria-labelledby={`inspector-${tab}-tab`}
      >
        {tab === 'knowledge' ? (
          <>
            {fileAnnotations.length ? (
              fileAnnotations.map((annotation) => (
                <KnowledgeEntry
                  key={annotation.id}
                  annotation={annotation}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDecide={onDecide}
                />
              ))
            ) : (
              <Empty title="此处还没有知识">
                添加指导或在源码注释中使用 CORE、REUSE、INTENT 等标签。
              </Empty>
            )}
            {file && file.symbols.length > 0 && (
              <>
                <div className="section-label">已索引符号</div>
                <div className="symbol-list">
                  {file.symbols.map((symbol) => (
                    <button
                      key={`${symbol.name}:${symbol.line}`}
                      onClick={() => onSelect({ path, line: symbol.line })}
                    >
                      <Braces size={13} />
                      <span>{symbol.name}</span>
                      <small>L{symbol.line}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : loading ? (
          <Loading>正在读取源码…</Loading>
        ) : sourceError ? (
          <div className="padded">
            <Notice danger>{sourceError}</Notice>
            <button className="button" onClick={() => setReload((value) => value + 1)}>
              重新读取
            </button>
          </div>
        ) : source ? (
          <>
            <div className="source-version">SHA256 {source.hash.slice(0, 12)} · 只读源码</div>
            <div className="source-code" role="region" aria-label={`${path} 源码`} tabIndex={0}>
              {source.text.split('\n').map((text, index) => {
                const number = index + 1;
                const tags = fileAnnotations.filter(
                  (annotation) => annotation.line <= number && annotation.endLine >= number,
                );
                return (
                  <div
                    key={number}
                    ref={number === selection.line ? selectedLine : undefined}
                    className={`source-line${number === selection.line ? ' selected-line' : ''}${tags.length ? ' annotated-line' : ''}`}
                  >
                    <button
                      className="line-number"
                      title={`为第 ${number} 行添加指导`}
                      onClick={() => onSelect({ path, line: number })}
                    >
                      {number}
                    </button>
                    <code>
                      {text.split(/\b(CORE|REUSE|INTENT|REVIEW|TODO)\b/g).map((part, i) =>
                        /^(CORE|REUSE|INTENT|REVIEW|TODO)$/.test(part) ? (
                          <mark className={`source-tag tag-${part.toLowerCase()}`} key={i}>
                            {part}
                          </mark>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      ) || ' '}
                    </code>
                    {tags.length > 0 && (
                      <button
                        className="source-annotation-dot"
                        title={tags.map((annotation) => annotation.summary).join('\n')}
                        aria-label={`查看第 ${number} 行知识`}
                        onClick={() => {
                          setTab('knowledge');
                        }}
                      >
                        {tags.length > 1 ? tags.length : <span />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <Empty title="没有可读取的源码">请选择项目内的文件。</Empty>
        )}
      </div>
    </aside>
  );
}
