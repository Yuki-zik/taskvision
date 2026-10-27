import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, X } from 'lucide-react';
import { RELATIONS } from './relations';
import { RELATION_CATEGORIES, type RelationMode } from './model';

export type WireDisplayStyle = 'flow' | 'orthogonal' | 'direct';
export const WIRE_STYLE_LABELS: Record<WireDisplayStyle, string> = {
  flow: '流线',
  orthogonal: '圆角',
  direct: '直连',
};
interface Props {
  mode: RelationMode;
  style: WireDisplayStyle;
  onStyle: (style: WireDisplayStyle) => void;
}
export function CurveSample({
  style,
  color = 'currentColor',
  dash,
}: {
  style: WireDisplayStyle;
  color?: string;
  dash?: string;
}) {
  const d =
    style === 'flow'
      ? 'M2 20 C18 20 18 4 38 4'
      : style === 'orthogonal'
        ? 'M2 20 H12 Q18 20 18 14 V10 Q18 4 24 4 H38'
        : 'M2 20 L38 4';
  return (
    <svg viewBox="0 0 42 24" width="34" height="20" aria-hidden="true">
      <path
        d={d}
        stroke={color}
        strokeWidth="1.7"
        fill="none"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The legend describes evidence and rendering separately, never inventing execution semantics. */
export function GraphLegend({ mode, style, onStyle }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [open]);
  return (
    <div className="studio-legend-wrap">
      <div className="studio-wire-switch" role="group" aria-label="连线几何样式">
        {(['flow', 'orthogonal', 'direct'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={style === value}
            aria-label={`${WIRE_STYLE_LABELS[value]}连线`}
            title={
              value === 'direct'
                ? '直线表达端点关系，不避让中间节点'
                : value === 'flow'
                  ? '平滑切线，保持实际连接端点'
                  : '大圆角走线，保留空间通道'
            }
            onClick={() => onStyle(value)}
          >
            <CurveSample style={value} />
            <span>{WIRE_STYLE_LABELS[value]}</span>
          </button>
        ))}
        <span className="studio-control-divider" />
        <button
          type="button"
          className="studio-legend-trigger"
          ref={trigger}
          aria-label="展开图例"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <BookOpen size={14} />
          <span>图例</span>
          <ChevronDown size={12} />
        </button>
      </div>
      {open && (
        <section id={id} className="studio-legend-panel" aria-label="节点与连线图例">
          <header>
            <strong>读懂这张图</strong>
            <button
              type="button"
              aria-label="关闭图例"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          </header>
          <p className="studio-legend-direction">
            <span>引用方</span>
            <ArrowRight size={17} />
            <span>被依赖方</span>
          </p>
          <p className="studio-legend-note">箭头表示源码依赖，不表示执行顺序或数据流。</p>
          <div className="studio-legend-section-title">连线语义</div>
          {RELATION_CATEGORIES.map((category) => (
            <div className="studio-legend-relation" key={category}>
              <CurveSample
                style={style}
                color={RELATIONS[category].color}
                dash={RELATIONS[category].dash}
              />
              <strong>{RELATIONS[category].label}</strong>
              <span>
                {category === 'runtime'
                  ? 'import / require'
                  : category === 'type'
                    ? '仅类型依赖'
                    : category === 'reexport'
                      ? 'export … from'
                      : category === 'dynamic'
                        ? 'import()'
                        : '非 AST 词法识别'}
              </span>
            </div>
          ))}
          <p className="studio-legend-note">
            {mode === 'summary'
              ? '汇总视图：颜色区分引用方，同一方向合并；点击线查看真实类别与数量。'
              : '分类视图：颜色和虚实线区分类别。曲线几何选项只改变外观。'}
          </p>
          <div className="studio-legend-section-title">节点知识与状态</div>
          <div className="studio-legend-tags">
            <span className="studio-tag core">CORE · 核心</span>
            <span className="studio-tag reuse">REUSE · 复用</span>
            <span className="studio-tag intent">INTENT · 约束</span>
            <span className="studio-tag review">REVIEW · 阅读点</span>
            <span className="studio-tag todo">TODO · 待办</span>
          </div>
          <p className="studio-legend-note">
            “待验收”来自真实提交；REVIEW 标签只代表源码审阅点。数值为当前索引范围，Agent
            名称只展示有效认领。
          </p>
          {style === 'direct' && (
            <p className="studio-legend-warning">
              直连模式不避障，线可穿过中间节点；阅读复杂项目建议流线或圆角。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
