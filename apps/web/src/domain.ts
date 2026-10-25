export * from '../../../packages/shared/src/types';
import type { Annotation, Tag } from '../../../packages/shared/src/types';

export type View = 'map' | 'knowledge' | 'tasks' | 'reviews';
export interface Selection {
  path: string;
  line: number;
  annotationId?: string;
}
export interface Filter {
  query: string;
  tag: Tag | '';
  hotspots: boolean;
}
export const tagNames: Record<Tag, string> = {
  CORE: '核心',
  REUSE: '复用',
  INTENT: '意图',
  REVIEW: '审阅',
  TODO: '待办',
};
export const statuses: Record<string, string> = {
  active: '已确认',
  proposed: 'Agent 提议',
  'needs-review': '待审阅',
  resolved: '已解决',
  archived: '已归档',
  current: '当前版本',
  stale: '源码已变化',
  missing: '锚点缺失',
  pending: '待人工审阅',
  accepted: '已验收',
  'changes-requested': '要求修改',
  todo: '待认领',
  doing: '进行中',
  review: '待验收',
  done: '已完成',
};
export function inScope(path: string, scope: string): boolean {
  const normalized = scope.replace(/\/$/, '');
  return !normalized || path === normalized || path.startsWith(`${normalized}/`);
}
export function matchesAnnotation(annotation: Annotation, filter: Filter): boolean {
  return (
    annotation.status !== 'archived' &&
    (!filter.tag || annotation.tag === filter.tag) &&
    (!filter.hotspots ||
      annotation.tag === 'REVIEW' ||
      annotation.status === 'proposed' ||
      annotation.freshness !== 'current') &&
    `${annotation.path} ${annotation.summary} ${annotation.body} ${annotation.symbol ?? ''} ${annotation.tag}`
      .toLowerCase()
      .includes(filter.query.trim().toLowerCase())
  );
}
export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}
export function canDecideProposal(annotation: Annotation): boolean {
  return (
    annotation.origin === 'web' &&
    (annotation.status === 'proposed' || annotation.status === 'needs-review')
  );
}
