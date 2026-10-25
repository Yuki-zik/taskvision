import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileCode2,
  GitBranch,
  Layers3,
  ListTodo,
  Network,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  TAGS,
  canDecideProposal,
  inScope,
  type Annotation,
  type Filter,
  type Selection,
  type Tag,
  type View,
} from './domain';
import { GraphView } from './graph/GraphView';
import { useWorkspace } from './hooks/useWorkspace';
import { errorMessage } from './services/api';
import { AnnotationEditor, type EditorTarget } from './components/AnnotationEditor';
import { Inspector } from './components/Inspector';
import { KnowledgeView } from './components/KnowledgeView';
import { ReviewsView } from './components/ReviewsView';
import { TasksView } from './components/TasksView';
import { TransferPanel } from './components/TransferPanel';
import { IconButton, Loading, Notice } from './components/ui';

const navigation = [
  { id: 'map', label: '项目架构', icon: Network },
  { id: 'knowledge', label: '知识索引', icon: BookOpen },
  { id: 'tasks', label: '协作任务', icon: ListTodo },
  { id: 'reviews', label: '人工审阅', icon: ShieldCheck },
] satisfies Array<{ id: View; label: string; icon: typeof Network }>;

export default function App() {
  const { snapshot, error, loading, refresh, mutate } = useWorkspace();
  const [view, setView] = useState<View>('map');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<Tag | ''>('');
  const [hotspots, setHotspots] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(snapshot?.files);
  filesRef.current = snapshot?.files;
  const filter = useMemo<Filter>(() => ({ query, tag, hotspots }), [query, tag, hotspots]);
  const onSelect = useCallback((next: Selection) => {
    const directory =
      next.path &&
      !filesRef.current?.some((file) => file.path === next.path) &&
      filesRef.current?.some((file) => inScope(file.path, next.path));
    setSelection(directory ? null : next);
    setModule(directory ? next.path : null);
    setEditor(null);
    setTransfer(false);
  }, []);
  const onModule = useCallback((path: string) => {
    setModule(path);
    setSelection(null);
    setEditor(null);
    setTransfer(false);
  }, []);
  const closeDetail = useCallback(() => {
    setSelection(null);
    setModule(null);
    setEditor(null);
    setTransfer(false);
  }, []);
  const onEdit = useCallback(
    (annotation?: Annotation) => {
      setTransfer(false);
      setEditor({
        annotation,
        path: annotation?.path ?? selection?.path ?? '',
        line: annotation?.line ?? selection?.line ?? 1,
      });
    },
    [selection],
  );
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === 'Escape') {
        closeDetail();
        searchRef.current?.blur();
        setHelp(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [closeDetail]);
  async function decide(annotation: Annotation, decision: 'accept' | 'archive') {
    if (!canDecideProposal(annotation)) {
      setActionError('只能采纳或归档共享指导的待处理提议。源码与历史记录请通过编辑入口处理。');
      return;
    }
    setActionError('');
    try {
      await mutate('annotation_decide', {
        id: annotation.id,
        decision,
        expectedRevision: annotation.revision,
      });
      notify(decision === 'accept' ? '已采纳这条 Agent 提议' : '已归档这条提议');
    } catch (failure) {
      setActionError(errorMessage(failure));
    }
  }
  const changeView = (next: View) => {
    setView(next);
    closeDetail();
    setActionError('');
  };
  const pending = snapshot?.reviews.filter((review) => review.status === 'pending').length ?? 0;
  const quickFiles = useMemo(
    () =>
      snapshot
        ? [...snapshot.files]
            .sort((a, b) => b.annotationCount - a.annotationCount || a.path.localeCompare(b.path))
            .slice(0, 5)
        : [],
    [snapshot],
  );
  const mobileDetail = !!(selection || module !== null || editor || transfer);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workbench-content">
        跳到工作区
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={22} strokeWidth={1.7} />
          </span>
          <span>
            TaskVision<small>项目工作台</small>
          </span>
        </div>
        <div className="rail-project">
          <div className="project-monogram">
            {snapshot?.project.name.slice(0, 1).toUpperCase() || 'T'}
          </div>
          <div>
            <strong title={snapshot?.project.name}>
              {snapshot?.project.name || '连接项目中…'}
            </strong>
            <span>
              <GitBranch size={11} />
              {snapshot?.project.branch || '本地工作区'}
            </span>
          </div>
        </div>
        <nav className="primary-nav" aria-label="工作台导航">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              onClick={() => changeView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              title={item.label}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === 'reviews' && pending > 0 && <b>{pending}</b>}
            </button>
          ))}
        </nav>
        <div className="quick-files">
          <div className="rail-section-title">
            代码入口
            <ArrowUpRight size={12} />
          </div>
          {quickFiles.map((file) => (
            <button
              key={file.path}
              title={file.path}
              onClick={() => onSelect({ path: file.path, line: 1 })}
            >
              <FileCode2 size={13} />
              <span>{file.path.split('/').at(-1)}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button onClick={() => setHelp((value) => !value)}>
            <CircleHelp size={16} />
            <span>操作说明</span>
          </button>
          <div className="connection-status">
            <span
              className={`connection-dot${error ? ' disconnected' : snapshot ? '' : ' connecting'}`}
            />
            <span>{error ? '连接中断' : snapshot ? '本地工作区已连接' : '正在连接本地服务'}</span>
          </div>
        </div>
      </aside>
      <main className="workbench" id="workbench-content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{navigation.find((item) => item.id === view)?.label}</h1>
            <span className="workspace-label">{snapshot?.project.name || 'TaskVision'}</span>
          </div>
          <div className="topbar-actions">
            <IconButton
              label="刷新工作区"
              onClick={() => {
                void refresh();
              }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </IconButton>
            <button
              className="button transfer-button"
              aria-label="导入 / 导出"
              title="导入 / 导出"
              onClick={() => {
                setTransfer((value) => !value);
                setEditor(null);
              }}
            >
              <ArrowDownToLine size={15} />
              <span>导入 / 导出</span>
            </button>
            <button
              className="button primary"
              aria-label="添加指导"
              title="添加指导"
              onClick={() => onEdit()}
            >
              <Plus size={16} />
              <span>添加指导</span>
            </button>
          </div>
        </header>
        <div className="filterbar">
          <div className="search-field">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="搜索文件、符号或知识"
              placeholder={
                view === 'tasks'
                  ? '搜索任务、负责人或代码路径…'
                  : view === 'reviews'
                    ? '搜索交付与代码范围…'
                    : '搜索文件、符号或知识…'
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <IconButton label="清除搜索" onClick={() => setQuery('')}>
                <X size={13} />
              </IconButton>
            ) : (
              <kbd>⌘ K</kbd>
            )}
          </div>
          {(view === 'map' || view === 'knowledge') && (
            <div className="tag-filters" aria-label="知识标签筛选">
              <button
                className={!tag && !hotspots ? 'selected' : ''}
                onClick={() => {
                  setTag('');
                  setHotspots(false);
                }}
              >
                全部
              </button>
              {TAGS.filter((item) => item !== 'TODO').map((item) => (
                <button
                  key={item}
                  className={`${tag === item ? 'selected ' : ''}filter-${item.toLowerCase()}`}
                  onClick={() => setTag((current) => (current === item ? '' : item))}
                >
                  {item}
                </button>
              ))}
              <button
                className={`hotspot-filter${hotspots ? ' selected' : ''}`}
                onClick={() => setHotspots((value) => !value)}
                aria-pressed={hotspots}
              >
                <ShieldCheck size={13} />
                关注点
              </button>
            </div>
          )}
        </div>
        {(error || actionError) && (
          <div className="global-notice">
            <Notice danger>
              {actionError || error}{' '}
              {actionError ? (
                <button onClick={() => setActionError('')} className="text-button">
                  关闭
                </button>
              ) : (
                <button
                  onClick={() => {
                    void refresh();
                  }}
                  className="text-button"
                >
                  重试连接
                </button>
              )}
            </Notice>
          </div>
        )}
        {help && (
          <div className="help-strip">
            <div>
              <strong>从结构理解项目</strong>
              <p>
                单击节点查看上下文；双击模块进入文件层级。使用画布控件平移、缩放或聚焦邻居。⌘ / Ctrl
                + K 搜索，Esc 关闭详情。网页编辑与人工验收均绑定具体版本。
              </p>
            </div>
            <IconButton label="关闭说明" onClick={() => setHelp(false)}>
              <X size={17} />
            </IconButton>
          </div>
        )}
        {snapshot ? (
          <div className={`workspace-stage${mobileDetail ? ' detail-open' : ''}`}>
            <div className="primary-pane">
              {view === 'map' && (
                <GraphView
                  snapshot={snapshot}
                  filter={filter}
                  selection={selection}
                  onSelect={onSelect}
                  onModule={onModule}
                />
              )}
              {view === 'knowledge' && (
                <KnowledgeView
                  snapshot={snapshot}
                  filter={filter}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDecide={(annotation, decision) => {
                    void decide(annotation, decision);
                  }}
                />
              )}
              {view === 'tasks' && (
                <TasksView
                  snapshot={snapshot}
                  query={query}
                  initialPath={selection?.path ?? ''}
                  onSelect={onSelect}
                  mutate={mutate}
                  onSaved={() => notify('协作任务已创建')}
                />
              )}
              {view === 'reviews' && (
                <ReviewsView
                  snapshot={snapshot}
                  query={query}
                  mutate={mutate}
                  onSelect={onSelect}
                  onSaved={() => notify('人工审阅意见已保存')}
                />
              )}
              {view !== 'map' && (
                <div className="content-footer">
                  <span>{snapshot.project.name}</span>
                  <span>修订 r{snapshot.revision}</span>
                  <ChevronRight size={12} />
                </div>
              )}
            </div>
            <div className="detail-slot">
              {editor ? (
                <AnnotationEditor
                  key={`${editor.annotation?.id ?? `new:${editor.path}`}`}
                  target={editor}
                  snapshot={snapshot}
                  mutate={mutate}
                  onClose={() => setEditor(null)}
                  onSaved={() => {
                    setEditor(null);
                    notify('项目知识已保存');
                  }}
                />
              ) : transfer ? (
                <TransferPanel
                  snapshot={snapshot}
                  mutate={mutate}
                  onClose={() => setTransfer(false)}
                  onSaved={() => notify('知识导入完成')}
                />
              ) : (
                <Inspector
                  snapshot={snapshot}
                  selection={selection}
                  module={module}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDecide={(annotation, decision) => {
                    void decide(annotation, decision);
                  }}
                  onClose={closeDetail}
                />
              )}
            </div>
          </div>
        ) : loading ? (
          <Loading>正在连接本地工作区…</Loading>
        ) : (
          <div className="connection-empty">
            <Network size={32} strokeWidth={1.4} />
            <h2>暂时无法打开工作区</h2>
            <p>请确认 TaskVision 本地服务正在运行，再重新连接。</p>
            <button
              className="button primary"
              onClick={() => {
                void refresh();
              }}
            >
              <RefreshCw size={15} />
              重新连接
            </button>
          </div>
        )}
        {snapshot && !mobileDetail && (
          <button className="mobile-context-button" onClick={() => onModule('')}>
            <PanelRightOpen size={17} />
            项目上下文
          </button>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <datalist id="project-source-paths">
        {snapshot?.files.map((file) => (
          <option key={file.path} value={file.path} />
        ))}
      </datalist>
    </div>
  );
}
