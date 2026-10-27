import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderGit2, FolderPlus, GitBranch, X } from 'lucide-react';
export interface RegisteredProject {
  id: string;
  name: string;
  path: string;
  branch?: string;
}
interface Props {
  projects: RegisteredProject[];
  currentId: string;
  currentName: string;
  onSelect: (id: string) => Promise<boolean>;
  onRegister: (path: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  busy: boolean;
  error: string;
}
export function ProjectSwitcher({
  projects,
  currentId,
  currentName,
  onSelect,
  onRegister,
  onRefresh,
  busy,
  error,
}: Props) {
  const [open, setOpen] = useState(false),
    [adding, setAdding] = useState(false),
    [folder, setFolder] = useState('');
  const dialog = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    void onRefresh();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAdding(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onRefresh]);
  useEffect(() => {
    if (open) dialog.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open]);
  const choose = async (id: string) => {
    if (!(await onSelect(id))) return;
    setOpen(false);
    setAdding(false);
  };
  return (
    <div className="project-switcher">
      <button
        type="button"
        ref={trigger}
        className="project-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="切换观察项目"
        title="切换当前工程"
      >
        <FolderGit2 size={16} />
        <span className="project-trigger-label">{currentName || '选择项目'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="project-switcher-panel"
          ref={dialog}
          role="dialog"
          aria-label="切换和添加本地项目"
        >
          <div className="project-panel-heading">
            <strong>本地工程</strong>
            <button
              className="icon-button"
              aria-label="关闭项目列表"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <p className="project-panel-help">
            只打开你明确登记的工程。每个工程的知识、审阅及个人布局独立。
          </p>
          <div className="project-option-list">
            {projects.map((item) => (
              <button
                key={item.id}
                className={item.id === currentId ? 'project-option current' : 'project-option'}
                title={item.path}
                onClick={() => {
                  void choose(item.id);
                }}
                disabled={busy}
              >
                <FolderGit2 size={16} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.path}</small>
                </span>
                {item.id === currentId && <Check size={15} />}
              </button>
            ))}
          </div>
          {!adding ? (
            <button className="button project-add" disabled={busy} onClick={() => setAdding(true)}>
              <FolderPlus size={15} />
              添加本地工程路径
            </button>
          ) : (
            <form
              className="project-add-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!folder.trim()) return;
                try {
                  await onRegister(folder.trim());
                  setFolder('');
                  setAdding(false);
                  setOpen(false);
                } catch {
                  /* parent shows the error without dropping typed path */
                }
              }}
            >
              <label htmlFor="project-path">工程文件夹的绝对路径</label>
              <input
                id="project-path"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="/Users/…/Code/my-project"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <p>
                请确认这是你授权 TaskVision 读取的工程。登记只会建立只读索引，不执行其中的代码。
              </p>
              <div>
                <button type="button" className="button" onClick={() => setAdding(false)}>
                  取消
                </button>
                <button type="submit" className="button primary" disabled={busy}>
                  {busy ? '检查目录…' : '确认添加并打开'}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="project-switch-error" role="alert">
              {error}
            </p>
          )}
          <p className="project-panel-footnote">
            <GitBranch size={12} />
            不同浏览器标签页可以独立查看不同工程。
          </p>
        </div>
      )}
    </div>
  );
}
