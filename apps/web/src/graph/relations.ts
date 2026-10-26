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
  color: '#68736f',
};

// Labels and distinct dashes carry the meaning even without color.
export const RELATIONS: Record<RelationCategory, RelationPresentation> = {
  runtime: { label: '运行时', hint: '静态导入 / require；含旧版 import', color: '#477360' },
  type: { label: '类型', hint: '仅类型导入', color: '#657297', dash: '7 5' },
  reexport: { label: '再导出', hint: 'export … from', color: '#826a43', dash: '10 3 2 3' },
  dynamic: { label: '动态', hint: 'import()；不推断实际执行', color: '#71638b', dash: '12 4' },
  lexical: {
    label: '词法估计',
    hint: '词法识别，未经 AST 语义确认',
    color: '#7b7566',
    dash: '1 5',
  },
};

export function relationPresentation(data: RelationData): RelationPresentation {
  return data.grouped ? SUMMARY_RELATION : RELATIONS[data.category];
}
