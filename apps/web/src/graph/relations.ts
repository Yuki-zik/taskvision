import type { RelationCategory, RelationData } from './model';

interface RelationPresentation {
  label: string;
  hint: string;
  color: string;
  dash?: string;
}

export const SUMMARY_RELATION: RelationPresentation = {
  label: '汇总依赖',
  hint: '同一引用方到同一提供方的依赖合并显示；仅包含当前选中的关系类别',
  color: '#aab9cc',
};

// Labels and distinct dashes carry the meaning even without color.
export const RELATIONS: Record<RelationCategory, RelationPresentation> = {
  runtime: { label: '运行时', hint: '静态导入 / require；含旧版 import', color: '#77c6ce' },
  type: { label: '类型', hint: '仅类型导入', color: '#9aaeff', dash: '7 5' },
  reexport: { label: '再导出', hint: 'export … from', color: '#e6bd79', dash: '10 3 2 3' },
  dynamic: { label: '动态', hint: 'import()；不推断实际执行', color: '#caa2fa', dash: '12 4' },
  lexical: {
    label: '词法估计',
    hint: '词法识别，未经 AST 语义确认',
    color: '#b2bdcc',
    dash: '1 5',
  },
};

export function relationPresentation(data: RelationData): RelationPresentation {
  return data.grouped ? SUMMARY_RELATION : RELATIONS[data.category];
}

/**
 * Summary mode deliberately colors by the importing node, not by a fabricated
 * runtime semantics. A stable ID hash means filtering categories or polling
 * never randomly changes a module's cable color. A 24-step coprime hue spread
 * reduces visually adjacent colors in small architecture graphs.
 */
export function sourceCableColor(sourceId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < sourceId.length; i++)
    hash = Math.imul(hash ^ sourceId.charCodeAt(i), 16777619);
  const hue = ((((hash >>> 0) % 24) * 7) % 24) * 15 + 8;
  return 'hsl(' + hue + ' 58% 68%)';
}
