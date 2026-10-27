import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Columns3,
  Laptop,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import type { PersonalPreferences, PreferencePatch } from '../services/personalization';
interface Props {
  preferences: PersonalPreferences;
  onChange: (patch: PreferencePatch) => void;
  onReset: () => void;
  bottomMaximum?: number;
}
export function WorkspaceAppearance({
  preferences,
  onChange,
  onReset,
  bottomMaximum = 700,
}: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => document.removeEventListener('keydown', key);
  }, [open]);
  const modes = [
    { id: 'system' as const, name: '跟随系统', icon: Laptop },
    { id: 'light' as const, name: '浅色', icon: Sun },
    { id: 'dark' as const, name: '深色', icon: Moon },
  ];
  const docks = [
    { id: 'left' as const, name: '详情在左侧', icon: PanelLeft },
    { id: 'right' as const, name: '详情在右侧', icon: PanelRight },
    { id: 'bottom' as const, name: '详情在下方', icon: PanelBottom },
  ];
  return (
    <div className="appearance-control">
      <button
        ref={trigger}
        className="button appearance-trigger"
        aria-label="个性化布局与主题"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="布局和主题设置"
        onClick={() => setOpen((v) => !v)}
      >
        <Columns3 size={16} />
        <span>布局与外观</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="appearance-popover" role="dialog" aria-label="工作台个性化" ref={dialog}>
          <header>
            <strong>个性化工作台</strong>
            <button
              className="icon-button"
              aria-label="关闭外观设置"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </header>
          <p>设置仅保存在本机用户偏好中，不写入项目源码。</p>
          <div className="appearance-section-title">主题</div>
          <div className="appearance-options" role="group" aria-label="选择工作台主题">
            {modes.map((item) => (
              <button
                key={item.id}
                aria-pressed={preferences.theme === item.id}
                className={preferences.theme === item.id ? 'current' : ''}
                onClick={() => onChange({ theme: item.id })}
              >
                <item.icon size={15} />
                {item.name}
              </button>
            ))}
          </div>
          <div className="appearance-section-title">详情面板位置</div>
          <div className="appearance-options" role="group" aria-label="调整详情面板位置">
            {docks.map((item) => (
              <button
                key={item.id}
                aria-pressed={preferences.detailDock === item.id}
                className={preferences.detailDock === item.id ? 'current' : ''}
                onClick={() => onChange({ detailDock: item.id })}
              >
                <item.icon size={15} />
                {item.name}
              </button>
            ))}
          </div>
          <div className="appearance-section-title">区域宽度</div>
          <label className="appearance-range">
            左侧导航{' '}
            <span>{preferences.sidebarCollapsed ? '收起' : preferences.sidebarWidth + ' px'}</span>
            <input
              type="range"
              aria-label="左侧导航宽度"
              min="160"
              max="340"
              step="1"
              value={preferences.sidebarWidth}
              onChange={(e) =>
                onChange({ sidebarWidth: Number(e.target.value), sidebarCollapsed: false })
              }
            />
          </label>
          <label className="appearance-range">
            详情面板{' '}
            <span>
              {preferences.detailDock === 'bottom'
                ? Math.min(preferences.detailHeight, bottomMaximum)
                : preferences.detailWidth}{' '}
              px
            </span>
            <input
              type="range"
              aria-label="详情面板宽度或高度"
              min={preferences.detailDock === 'bottom' ? 220 : 290}
              max={preferences.detailDock === 'bottom' ? bottomMaximum : 740}
              step="1"
              value={
                preferences.detailDock === 'bottom'
                  ? Math.min(preferences.detailHeight, bottomMaximum)
                  : preferences.detailWidth
              }
              onChange={(e) =>
                onChange(
                  preferences.detailDock === 'bottom'
                    ? { detailHeight: Number(e.target.value) }
                    : { detailWidth: Number(e.target.value) },
                )
              }
            />
          </label>
          <div className="appearance-bottom">
            <button
              className="button"
              onClick={() => onChange({ sidebarCollapsed: !preferences.sidebarCollapsed })}
            >
              {preferences.sidebarCollapsed ? '展开左侧导航' : '收起左侧导航'}
            </button>
            <button
              className="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              <RotateCcw size={14} />
              恢复默认布局
            </button>
          </div>
          <p className="appearance-footnote">
            也可以拖动区域分隔线调整尺寸；分隔线支持键盘方向键。
          </p>
        </div>
      )}
    </div>
  );
}
