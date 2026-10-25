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
export const api = {
  bootstrap: (signal?: AbortSignal) =>
    request<{ token: string; snapshot: Snapshot }>('/api/bootstrap', { signal }),
  snapshot: (signal?: AbortSignal) => request<Snapshot>('/api/snapshot', { signal }),
  source: (path: string, signal?: AbortSignal) =>
    request<SourceResult>(`/api/source?path=${encodeURIComponent(path)}`, { signal }),
  review: (id: string, signal?: AbortSignal) =>
    request<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}`, { signal }),
  operation: <K extends OperationName>(token: string, operation: K, args: OperationArgs<K>) =>
    request<OperationResult<K>>('/api/operation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TaskVision-Token': token },
      body: JSON.stringify({ operation, args }),
    }),
};
export type Mutate = <K extends OperationName>(
  operation: K,
  args: OperationArgs<K>,
) => Promise<OperationResult<K>>;
