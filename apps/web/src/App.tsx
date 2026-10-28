import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
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
import { api, currentProjectId, errorMessage } from './services/api';
import {
  DEFAULT_PREFERENCES,
  boundGraphViews,
  systemTheme,
  type GraphCanvasState,
} from './services/personalization';
import { ProjectSwitcher, type RegisteredProject } from './components/ProjectSwitcher';
import { WorkspaceAppearance } from './components/WorkspaceAppearance';
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

function setProjectLocation(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('project', id);
  window.history.replaceState(null, '', url);
}

export default function App() {
  const [projects, setProjects] = useState<RegisteredProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [registryError, setRegistryError] = useState('');
  const refreshProjects = useCallback(async () => {
    try {
      const registry = await api.projects();
      setProjects(registry.projects);
      setRegistryError('');
      setProjectId((previous) => {
        if (previous) return previous;
        const requested = currentProjectId();
        const selected = registry.projects.some((item) => item.id === requested)
          ? requested
          : registry.initialId;
        setProjectLocation(selected);
        return selected;
      });
    } catch (failure) {
      setRegistryError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);
  const changeProject = useCallback((id: string) => {
    setProjectLocation(id);
    setProjectId(id);
  }, []);
  if (!projectId)
    return (
      <div className="project-loading" role="status">
        {registryError ? (
          <>
            <Notice danger>{registryError}</Notice>
            <button
              className="button"
              onClick={() => {
                void refreshProjects();
              }}
            >
              重新连接项目列表
            </button>
          </>
        ) : (
          <Loading>正在读取已登记工程…</Loading>
        )}
      </div>
    );
  return (
    <Workspace
      key={projectId}
      projectId={projectId}
      projects={projects}
      onProjectChange={changeProject}
      refreshProjects={refreshProjects}
      registryError={registryError}
    />
  );
}

interface ResizeSeparatorProps {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  horizontal?: boolean;
  direction: number;
  onChange: (value: number) => void;
  controls: string;
  className?: string;
}
function ResizeSeparator({
  label,
  value,
  minimum,
  maximum,
  horizontal = false,
  direction,
  onChange,
  controls,
  className = '',
}: ResizeSeparatorProps) {
  const drag = useRef<{ coordinate: number; value: number } | null>(null);
  const clamp = (next: number) => Math.round(Math.max(minimum, Math.min(maximum, next)));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuenow={value}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      className={`personal-resizer ${horizontal ? 'horizontal' : 'vertical'} ${className}`}
      title={`${label}；方向键调整，Shift 加速，Home / End 调到最小 / 最大`}
      onKeyDown={(event) => {
        const delta = horizontal
          ? event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowUp'
              ? -1
              : 0
          : event.key === 'ArrowRight'
            ? 1
            : event.key === 'ArrowLeft'
              ? -1
              : 0;
        if (!delta && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        onChange(
          event.key === 'Home'
            ? minimum
            : event.key === 'End'
              ? maximum
              : clamp(value + delta * direction * (event.shiftKey ? 32 : 8)),
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { coordinate: horizontal ? event.clientY : event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onChange(
          clamp(
            drag.current.value +
              ((horizontal ? event.clientY : event.clientX) - drag.current.coordinate) * direction,
          ),
        );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}

function Workspace({
  projectId,
  projects,
  onProjectChange,
  refreshProjects,
  registryError,
}: {
  projectId: string;
  projects: RegisteredProject[];
  onProjectChange: (id: string) => void;
  refreshProjects: () => Promise<void>;
  registryError: string;
}) {
  const {
    snapshot,
    error,
    loading,
    refresh,
    mutate,
    registerProject,
    pendingOperations,
    highlightSettings,
    preferences,
    preferencesReady,
    preferenceError,
    updatePreferences,
    flushPreferences,
  } = useWorkspace(projectId);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [detailHidden, setDetailHidden] = useState(false);
  const [compactWindow, setCompactWindow] = useState(() => window.innerWidth <= 760);
  const [inspectorRequested, setInspectorRequested] = useState(false);
  const [graphReset, setGraphReset] = useState(0);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const effectiveTheme = systemTheme(preferences.theme, systemDark);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    const resize = () => {
      setWindowHeight(window.innerHeight);
      setCompactWindow(window.innerWidth <= 760);
    };
    window.addEventListener('resize', resize);
    return () => {
      media.removeEventListener('change', change);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useLayoutEffect(() => {
    if (preferencesReady) document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme, preferencesReady]);
  const bottomMaximum = Math.min(2000, Math.max(220, Math.floor(windowHeight * 0.65)));
  const graphViews = useRef(preferences.graphViews);
  graphViews.current = preferences.graphViews;
  const graphStateChange = useCallback(
    (scope: string, state: GraphCanvasState) => {
      // The ref avoids dropping one scope when several move-end events batch.
      const views = graphViews.current;
      const next = { ...views };
      delete next[scope];
      next[scope] = state;
      graphViews.current = boundGraphViews(next);
      updatePreferences({ graphViews: graphViews.current });
    },
    [updatePreferences],
  );
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
    setInspectorRequested(false);
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
  // On narrow screens the secondary inspector is an overlay: it must never
  // obscure Tasks/Reviews/Knowledge by default. Open explicitly or when the
  // user selects actual source/edit detail.
  const detailVisible =
    !detailHidden && (mobileDetail || (view !== 'map' && (!compactWindow || inspectorRequested)));
  const approveSwitch = useCallback(async () => {
    if (pendingOperations) {
      setProjectError('当前操作正在保存，请完成后再切换工程。');
      return false;
    }
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '.workspace-stage input:not([type="range"]):not([type="checkbox"]), .workspace-stage textarea',
    );
    const hasDraft =
      !!editor ||
      !!transfer ||
      Array.from(fields).some((field) => !field.readOnly && !!field.value.trim());
    if (
      hasDraft &&
      !window.confirm(
        '当前工程有未提交的编辑。切换会关闭编辑面板；已自动保存的草稿仍属于原工程。确认切换？',
      )
    )
      return false;
    try {
      await flushPreferences();
      return true;
    } catch {
      setProjectError('个人布局尚未保存。请重试保存后再切换，避免丢失设置。');
      return false;
    }
  }, [pendingOperations, editor, transfer, flushPreferences]);
  const selectProject = useCallback(
    async (id: string) => {
      if (id === projectId) return true;
      if (projectBusy || !projects.some((item) => item.id === id)) return false;
      setProjectBusy(true);
      try {
        if (!(await approveSwitch())) return false;
        onProjectChange(id);
        return true;
      } finally {
        setProjectBusy(false);
      }
    },
    [projectId, projectBusy, projects, approveSwitch, onProjectChange],
  );
  useEffect(() => {
    const pop = () => {
      const requested = currentProjectId();
      setProjectLocation(projectId);
      if (requested) void selectProject(requested);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [projectId, selectProject]);
  useEffect(() => {
    if (mobileDetail) setDetailHidden(false);
  }, [selection, module, editor, transfer]);
  const resetLayout = () => {
    updatePreferences({ ...DEFAULT_PREFERENCES, theme: preferences.theme });
    graphViews.current = {};
    setDetailHidden(false);
    setInspectorRequested(false);
    setGraphReset((value) => value + 1);
  };
  const layoutStyle = {
    '--personal-nav-width': `${preferences.sidebarCollapsed ? 58 : preferences.sidebarWidth}px`,
    '--personal-detail-width': `${preferences.detailWidth}px`,
    '--personal-detail-height': `${Math.min(preferences.detailHeight, bottomMaximum)}px`,
  } as CSSProperties;
  if (loading && !preferencesReady)
    return (
      <div className="project-loading">
        <Loading>正在读取工程与个人布局…</Loading>
      </div>
    );
  return (
    <div
      className={`app-shell studio-app personal-workspace${preferences.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={layoutStyle}
      data-detail-dock={preferences.detailDock}
    >
      <a className="skip-link" href="#workbench-content">
        跳到工作区
      </a>
      <aside className="sidebar" id="workspace-navigation">
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
      <button
        className="personal-nav-toggle"
        aria-label={preferences.sidebarCollapsed ? '展开导航栏' : '收起导航栏'}
        aria-expanded={!preferences.sidebarCollapsed}
        aria-controls="workspace-navigation"
        onClick={() => updatePreferences({ sidebarCollapsed: !preferences.sidebarCollapsed })}
      >
        {preferences.sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
      </button>
      {!preferences.sidebarCollapsed && (
        <ResizeSeparator
          className="nav-resizer"
          label="调整左侧导航宽度"
          controls="workspace-navigation"
          value={preferences.sidebarWidth}
          minimum={160}
          maximum={340}
          direction={1}
          onChange={(sidebarWidth) => updatePreferences({ sidebarWidth })}
        />
      )}
      <main className="workbench" id="workbench-content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{navigation.find((item) => item.id === view)?.label}</h1>
            <ProjectSwitcher
              key={projectId}
              projects={projects}
              currentId={projectId}
              currentName={
                snapshot?.project.name || projects.find((item) => item.id === projectId)?.name || ''
              }
              onSelect={selectProject}
              onRefresh={refreshProjects}
              busy={projectBusy || loading}
              error={projectError || registryError}
              onRegister={async (root) => {
                if (!(await approveSwitch())) throw new Error('已取消切换');
                setProjectBusy(true);
                setProjectError('');
                try {
                  const result = await registerProject(root);
                  await refreshProjects();
                  onProjectChange(result.project.id);
                } catch (failure) {
                  setProjectError(errorMessage(failure));
                  throw failure;
                } finally {
                  setProjectBusy(false);
                }
              }}
            />
          </div>
          <div className="topbar-actions">
            {preferencesReady && (
              <WorkspaceAppearance
                bottomMaximum={bottomMaximum}
                preferences={preferences}
                onChange={updatePreferences}
                onReset={resetLayout}
              />
            )}
            {view !== 'map' && (
              <IconButton
                label={detailVisible ? '隐藏详情面板' : '展开详情面板'}
                onClick={() => {
                  if (compactWindow) {
                    setInspectorRequested(!detailVisible);
                    setDetailHidden(false);
                  } else {
                    setDetailHidden((value) => !value);
                  }
                }}
              >
                <PanelRightOpen size={16} />
              </IconButton>
            )}
            {view === 'map' && (
              <button
                className="button graph-context-toggle"
                aria-label="切换项目上下文"
                aria-expanded={detailVisible}
                title={detailVisible ? '收起详情，专注结构' : '查看项目上下文'}
                onClick={() => {
                  if (detailVisible) {
                    closeDetail();
                    setDetailHidden(true);
                  } else {
                    setDetailHidden(false);
                    if (!mobileDetail) onModule('');
                  }
                }}
              >
                <PanelRightOpen size={15} />
                <span>{detailVisible ? '收起详情' : '项目上下文'}</span>
              </button>
            )}
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
                aria-pressed={!tag && !hotspots}
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
                  aria-pressed={tag === item}
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
        {(error || actionError || preferenceError) && (
          <div className="global-notice">
            <Notice danger>
              {actionError || error || preferenceError}{' '}
              {preferenceError && (
                <button
                  className="text-button"
                  onClick={() => {
                    void flushPreferences().catch(() => {});
                  }}
                >
                  重试保存布局
                </button>
              )}
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
          <div
            className={`workspace-stage personal-stage${detailVisible ? ' detail-open' : ' canvas-first'}`}
            data-dock={preferences.detailDock}
          >
            <div className="primary-pane">
              {view === 'map' && (
                <GraphView
                  key={`${projectId}:${graphReset}`}
                  projectId={projectId}
                  graphViews={preferences.graphViews}
                  onGraphViewChange={graphStateChange}
                  theme={effectiveTheme}
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
            {detailVisible && (
              <div className="detail-slot" id="workspace-detail">
                <ResizeSeparator
                  className="detail-resizer"
                  label={
                    preferences.detailDock === 'bottom' ? '调整详情面板高度' : '调整详情面板宽度'
                  }
                  controls="workspace-detail"
                  horizontal={preferences.detailDock === 'bottom'}
                  value={
                    preferences.detailDock === 'bottom'
                      ? Math.min(preferences.detailHeight, bottomMaximum)
                      : preferences.detailWidth
                  }
                  minimum={preferences.detailDock === 'bottom' ? 220 : 290}
                  maximum={preferences.detailDock === 'bottom' ? bottomMaximum : 740}
                  direction={preferences.detailDock === 'left' ? 1 : -1}
                  onChange={(value) =>
                    updatePreferences(
                      preferences.detailDock === 'bottom'
                        ? { detailHeight: value }
                        : { detailWidth: value },
                    )
                  }
                />
                {editor ? (
                  <AnnotationEditor
                    key={`${editor.annotation?.id ?? `new:${editor.path}:${editor.line}`}`}
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
                    {...{ projectId }}
                    theme={effectiveTheme}
                    highlightSettings={highlightSettings}
                    snapshot={snapshot}
                    selection={selection}
                    module={module}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDecide={(annotation, decision) => {
                      void decide(annotation, decision);
                    }}
                    onClose={() => {
                      closeDetail();
                      setDetailHidden(true);
                    }}
                  />
                )}
              </div>
            )}
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
