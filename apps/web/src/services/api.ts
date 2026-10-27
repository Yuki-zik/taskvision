import type { PersonalPreferences, PreferencePatch } from './personalization';
import type { SourceHighlightSettings } from './sourceHighlight';
import type { RegisteredProject } from '../components/ProjectSwitcher';
import type {
  ErrorCode,
  OperationArgs,
  OperationName,
  OperationResult,
  ReviewDetail,
  Snapshot,
  SourceResult,
} from '../domain';

const recovery: Record<ErrorCode, string> = {
  INVALID_ARGUMENT: '请检查填写内容和代码路径。',
  NOT_FOUND: '内容可能已删除，请刷新后重试。',
  CONFLICT: '当前内容与其他修改冲突，草稿已保留，请比较最新版本。',
  FORBIDDEN: '当前操作未获允许，请检查本地服务与工作区权限。',
  STALE: '源码版本已变化，请读取最新内容后重新检查。',
  INTERNAL: '本地服务发生错误，请查看服务日志后重试。',
};
export class ApiFailure extends Error {
  constructor(
    public readonly code: string,
    detail: string,
  ) {
    super(
      `${code in recovery ? recovery[code as ErrorCode] : '请求失败，请重试。'}${detail ? ` ${detail}` : ''}（${code}）`,
    );
    this.name = 'ApiFailure';
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误，请重试。';
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiFailure('OFFLINE', '无法连接本地 TaskVision 服务。请确认工作台服务正在运行。');
  }
  const body: unknown = await response.json().catch(() => {
    throw new ApiFailure('INVALID_RESPONSE', '本地服务未返回有效 JSON。');
  });
  if (!response.ok) {
    const failure =
      typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
    const code =
      typeof failure === 'object' && failure !== null && 'code' in failure
        ? String(failure.code)
        : String(response.status);
    const detail =
      typeof failure === 'object' && failure !== null && 'message' in failure
        ? String(failure.message)
        : '';
    throw new ApiFailure(code, detail);
  }
  return body as T;
}
// Per-tab URL selection; the server authorizes every registered ID. Never read a root from URL.
export function currentProjectId(): string {
  return typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('project') ?? '');
}
function projectQuery(projectId: string): string {
  return projectId ? '?project=' + encodeURIComponent(projectId) : '';
}
function projectUrl(route: string, projectId: string): string {
  return route + projectQuery(projectId);
}
export const api = {
  bootstrap: (signal?: AbortSignal, projectId = currentProjectId()) =>
    request<{ token: string; snapshot: Snapshot }>(projectUrl('/api/bootstrap', projectId), {
      signal,
    }),
  snapshot: (signal?: AbortSignal, projectId = currentProjectId()) =>
    request<Snapshot>(projectUrl('/api/snapshot', projectId), { signal }),
  projects: (signal?: AbortSignal) =>
    request<{ projects: RegisteredProject[]; initialId: string }>('/api/projects', { signal }),
  registerProject: (token: string, root: string) =>
    request<{ project: RegisteredProject }>('/api/projects/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TaskVision-Token': token },
      body: JSON.stringify({ root }),
    }),
  highlightSettings: (projectId: string, signal?: AbortSignal) =>
    request<{
      settings: SourceHighlightSettings | null;
      source: 'vscode-effective' | 'package-default';
    }>(projectUrl('/api/highlight-settings', projectId), { signal }),
  preferences: (projectId: string, signal?: AbortSignal) =>
    request<{ preferences: PersonalPreferences }>(projectUrl('/api/preferences', projectId), {
      signal,
    }),
  savePreferences: (token: string, projectId: string, preferences: PreferencePatch) =>
    request<{ preferences: PersonalPreferences }>(projectUrl('/api/preferences', projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TaskVision-Token': token },
      body: JSON.stringify({ preferences }),
      keepalive: new TextEncoder().encode(JSON.stringify({ preferences })).length < 60000,
    }),
  source: (path: string, signal?: AbortSignal, projectId = currentProjectId()) =>
    request<SourceResult>(
      '/api/source?path=' +
        encodeURIComponent(path) +
        (projectId ? '&project=' + encodeURIComponent(projectId) : ''),
      { signal },
    ),
  review: (id: string, signal?: AbortSignal, projectId = currentProjectId()) =>
    request<ReviewDetail>(projectUrl('/api/reviews/' + encodeURIComponent(id), projectId), {
      signal,
    }),
  operation: <K extends OperationName>(
    token: string,
    operation: K,
    args: OperationArgs<K>,
    projectId = currentProjectId(),
  ) =>
    request<OperationResult<K>>(projectUrl('/api/operation', projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TaskVision-Token': token },
      body: JSON.stringify({ operation, args }),
    }),
};
export type Mutate = <K extends OperationName>(
  operation: K,
  args: OperationArgs<K>,
) => Promise<OperationResult<K>>;
