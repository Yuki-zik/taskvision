import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  GitBranch,
  ListTodo,
  LoaderCircle,
  Plus,
  UserRound,
  X,
} from 'lucide-react';
import type { Selection, Snapshot, Task } from '../domain';
import { formatTime, statuses } from '../domain';
import { useDraft } from '../hooks/useDraft';
import { errorMessage, type Mutate } from '../services/api';
import { Empty, Notice } from './ui';

interface TaskDraft {
  title: string;
  description: string;
  paths: string;
  dependsOn: string[];
}
interface Props {
  snapshot: Snapshot;
  query: string;
  initialPath: string;
  onSelect: (selection: Selection) => void;
  mutate: Mutate;
  onSaved: () => void;
}
export function TasksView({ snapshot, query, initialPath, onSelect, mutate, onSaved }: Props) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { draft, setDraft, clear, storageError } = useDraft<TaskDraft>(
    `taskvision:${snapshot.project.workspaceId}:task:new`,
    { title: '', description: '', paths: initialPath, dependsOn: [] },
  );
  const tasks = snapshot.tasks.filter((task) =>
    `${task.title} ${task.description} ${task.paths.join(' ')} ${task.owner ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const paths = [
        ...new Set(
          draft.paths
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
      if (!paths.length) throw new Error('请至少填写一个代码范围。');
      await mutate('task_create', {
        title: draft.title.trim(),
        description: draft.description.trim(),
        paths,
        dependsOn: draft.dependsOn,
      });
      clear();
      setDraft({ title: '', description: '', paths: '', dependsOn: [] });
      setCreating(false);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const groups: Array<{ status: Task['status']; title: string }> = [
    { status: 'doing', title: '进行中' },
    { status: 'review', title: '等待验收' },
    { status: 'todo', title: '待认领' },
    { status: 'done', title: '已完成' },
  ];
  return (
    <section className="content-view tasks-view">
      <div className="view-heading">
        <div>
          <h2>协作任务</h2>
          <p>明确代码范围与前置依赖，追踪真实认领和交付。</p>
        </div>
        <button className="button primary" onClick={() => setCreating((value) => !value)}>
          {creating ? <X size={15} /> : <Plus size={15} />}
          {creating ? '关闭创建' : '创建任务'}
        </button>
      </div>
      {creating && (
        <form
          className="task-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <h3>创建协作任务</h3>
          {error && <Notice danger>{error}</Notice>}
          {storageError && <Notice danger>浏览器无法持久保存草稿，请在关闭前提交。</Notice>}
          <label>
            任务标题
            <input
              autoFocus
              required
              maxLength={500}
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="明确下一项需要完成的工作"
            />
          </label>
          <label>
            目标与验收条件
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="说明预期行为、约束和需要提供的证据"
            />
          </label>
          <label>
            代码范围
            <textarea
              rows={3}
              required
              value={draft.paths}
              onChange={(event) =>
                setDraft((current) => ({ ...current, paths: event.target.value }))
              }
              placeholder="每行一个项目内路径，例如 src/auth 或 packages/core/index.ts"
            />
            <span className="field-help">Agent 的认领与重叠检查将使用这些路径。</span>
          </label>
          {snapshot.tasks.length > 0 && (
            <fieldset className="dependency-picker">
              <legend>前置任务（可选）</legend>
              {snapshot.tasks.map((task) => (
                <label key={task.id}>
                  <input
                    type="checkbox"
                    checked={draft.dependsOn.includes(task.id)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        dependsOn: event.target.checked
                          ? [...current.dependsOn, task.id]
                          : current.dependsOn.filter((id) => id !== task.id),
                      }))
                    }
                  />
                  <span>
                    {task.title}
                    <small>{statuses[task.status]}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="form-actions">
            <button className="button primary" disabled={busy || !draft.title.trim()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}创建任务
            </button>
            <button type="button" className="button" onClick={() => setCreating(false)}>
              保留草稿
            </button>
          </div>
        </form>
      )}
      {snapshot.claims.some((claim) => Date.parse(claim.expiresAt) > Date.now()) && (
        <div className="coordination-note">
          <UserRound size={15} />
          当前认领范围来自有效租约；代码锁属于协作约定。
        </div>
      )}
      {groups.map((group) => {
        const items = tasks.filter((task) => task.status === group.status);
        if (!items.length) return null;
        return (
          <div key={group.status} className="task-group">
            <div className="section-label">
              <span className={`status-dot status-${group.status}`} />
              {group.title}
              <span>{items.length}</span>
            </div>
            {items.map((task) => {
              const claim = snapshot.claims.find(
                (item) => item.taskId === task.id && Date.parse(item.expiresAt) > Date.now(),
              );
              return (
                <article key={task.id} className="task-row">
                  <div className={`task-status-icon status-${task.status}`}>
                    {task.status === 'done' ? <Check size={18} /> : <ListTodo size={18} />}
                  </div>
                  <div className="task-main">
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-paths">
                      {task.paths.map((path) => (
                        <button key={path} onClick={() => onSelect({ path, line: 1 })}>
                          {path}
                          <ArrowRight size={11} />
                        </button>
                      ))}
                    </div>
                    <div className="task-meta">
                      <span>
                        <UserRound size={12} />
                        {claim?.agentId || task.owner || '尚无认领'}
                      </span>
                      {claim && (
                        <span>
                          <CalendarClock size={12} />
                          租约至 {formatTime(claim.expiresAt)}
                        </span>
                      )}
                      <span>{formatTime(task.updatedAt)}</span>
                    </div>
                    {task.dependsOn.length > 0 && (
                      <div className="task-dependencies">
                        <GitBranch size={12} />
                        依赖{' '}
                        {task.dependsOn
                          .map((id) => snapshot.tasks.find((item) => item.id === id)?.title ?? id)
                          .join('、')}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        );
      })}
      {!tasks.length && (
        <Empty title={query ? '没有匹配的任务' : '把下一步变成一项明确的任务'}>
          {query
            ? '尝试搜索任务标题、负责人或代码路径。'
            : '创建目标、代码范围与依赖，Agent 可通过 MCP 认领并提交真实结果。'}
        </Empty>
      )}
    </section>
  );
}
