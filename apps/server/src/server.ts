import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createWorkspace } from '../../../packages/core/src/index.js';
import {
  dispatchValidated,
  HUMAN_MUTATIONS,
  isOperation,
} from '../../../packages/shared/src/schemas.js';
import type { Actor, ErrorCode, Workspace } from '../../../packages/shared/src/types.js';
import { ProjectRegistry } from './projectRegistry.js';
import {
  MAX_PREFERENCES_BYTES,
  PrivateState,
  UserPreferenceStore,
  stateError,
} from './userPreferences.js';

const HUMAN: Actor = { role: 'human', id: 'human' };
const AGENT: Actor = { role: 'agent', id: 'http-read' };
const STATUS: Record<ErrorCode, number> = {
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  STALE: 409,
  INTERNAL: 500,
};
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function readJson(request: IncomingMessage, maximum = 2 * 1024 * 1024): Promise<unknown> {
  // Import previews fit within this budget; ordinary edits remain bounded by their schemas.
  if (Number(request.headers['content-length']) > maximum)
    throw httpError(`请求超过 ${maximum} 字节。`, 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.length;
    if (size > maximum) throw httpError(`请求超过 ${maximum} 字节。`, 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    if (size > 128 * 1024) throw httpError('编辑请求超过 128 KiB。', 413);
    throw httpError('请求不是有效 JSON，请刷新页面后重试。', 400);
  }
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function tokenMatches(input: string | string[] | undefined, expected: string): boolean {
  return (
    typeof input === 'string' &&
    Buffer.byteLength(input) === Buffer.byteLength(expected) &&
    crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expected))
  );
}

function assetPath(publicRoot: string, pathname: string): string | undefined {
  if (pathname === '/' || pathname === '/index.html') return path.join(publicRoot, 'index.html');
  if (!/^\/assets\/[A-Za-z0-9_./-]+\.(?:js|css|svg|png|ico|json)$/.test(pathname)) return undefined;
  const relative = pathname.slice(1);
  if (relative.split('/').some((part) => part === '..' || part === '.')) return undefined;
  const candidate = path.resolve(publicRoot, relative);
  return candidate.startsWith(path.resolve(publicRoot) + path.sep) ? candidate : undefined;
}

export interface ServerOptions {
  root?: string;
  port?: number;
  publicRoot?: string;
  preferencesDir?: string;
}
export interface RunningServer {
  server: Server;
  url: string;
  token: string;
  close(): Promise<void>;
}

// INTENT: HTTP is a local human workspace. Network data cannot choose its actor role.
export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const root = options.root ?? process.cwd();
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('端口须为 0–65535 的整数。');
  const publicRoot = options.publicRoot ?? fileURLToPath(new URL('./public/', import.meta.url));
  const privateState = new PrivateState(options.preferencesDir);
  const registry = new ProjectRegistry(root, privateState);
  const preferences = new UserPreferenceStore(privateState);
  const workspaces = new Map<string, { workspace: Workspace; device: number; inode: number }>();
  function workspaceFor(ids: string[]): Workspace {
    const project = registry.resolve(ids);
    const stat = fs.statSync(project.path);
    let cached = workspaces.get(project.id);
    if (cached && (cached.device !== stat.dev || cached.inode !== stat.ino))
      throw stateError(
        'Project directory was replaced. Register the new directory explicitly.',
        'CONFLICT',
      );
    if (!cached) {
      cached = { workspace: createWorkspace(project.path), device: stat.dev, inode: stat.ino };
      workspaces.set(project.id, cached);
    }
    return cached.workspace;
  }
  function closeWorkspaces(): void {
    // One failing cleanup must not prevent the remaining databases from closing.
    for (const { workspace } of workspaces.values()) {
      try {
        workspace.close();
      } catch {
        /* Continue closing all project resources. */
      }
    }
    workspaces.clear();
  }
  workspaceFor([]);
  const token = crypto.randomBytes(32).toString('hex');
  let url = '';
  let actualPort = 0;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // React Flow positions nodes with inline style attributes. Scripts never allow inline/eval.
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const hosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
      const origins = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
      const origin = request.headers.origin;
      if (
        !hosts.has(request.headers.host ?? '') ||
        (origin !== undefined && !origins.has(origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        return sendJson(response, 403, {
          error: {
            code: 'FORBIDDEN',
            message: '仅允许本机同源访问。请从 TaskVision 打开的地址访问工作台。',
          },
        });
      }
      const parsed = new URL(request.url ?? '/', url);
      const ids = parsed.searchParams.getAll('project');
      if (request.method === 'GET' && parsed.pathname === '/api/projects')
        return sendJson(response, 200, registry.list());
      if (request.method === 'GET' && parsed.pathname === '/api/highlight-settings') {
        const selected = registry.resolve(ids);
        const raw =
          selected.id === registry.initialId ? process.env.TASKVISION_VSCODE_HIGHLIGHTS : undefined;
        let settings: unknown = null;
        if (raw && Buffer.byteLength(raw) <= 90 * 1024) {
          try {
            const candidate: unknown = JSON.parse(raw);
            if (
              isObject(candidate) &&
              (candidate.customHighlight === undefined || isObject(candidate.customHighlight)) &&
              (candidate.defaultHighlight === undefined || isObject(candidate.defaultHighlight)) &&
              (candidate.enabled === undefined || typeof candidate.enabled === 'boolean')
            )
              settings = candidate;
          } catch {
            /* Corrupt user-local visual config safely falls back to defaults. */
          }
        }
        return sendJson(response, 200, {
          settings,
          source: settings ? 'vscode-effective' : 'package-default',
        });
      }
      if (request.method === 'GET' && parsed.pathname === '/api/preferences') {
        const project = registry.resolve(ids);
        return sendJson(response, 200, { preferences: preferences.get(project.id) });
      }
      // Each request keeps its own project; there is no globally mutable current workspace.
      if (request.method === 'GET') {
        switch (parsed.pathname) {
          case '/api/bootstrap':
            return sendJson(response, 200, {
              token,
              snapshot: workspaceFor(ids).dispatch('snapshot'),
            });
          case '/api/snapshot':
            return sendJson(response, 200, workspaceFor(ids).dispatch('snapshot'));
          case '/api/source':
            return sendJson(
              response,
              200,
              dispatchValidated(
                workspaceFor(ids),
                'source',
                { path: parsed.searchParams.get('path') },
                AGENT,
              ),
            );
          case '/api/updates':
            return sendJson(
              response,
              200,
              dispatchValidated(
                workspaceFor(ids),
                'updates',
                { after: Number(parsed.searchParams.get('after') ?? 0) },
                AGENT,
              ),
            );
          case '/api/export':
            response.setHeader(
              'Content-Disposition',
              'attachment; filename="taskvision-knowledge.json"',
            );
            return sendJson(response, 200, workspaceFor(ids).dispatch('export'));
          case '/favicon.ico':
            response.writeHead(204);
            return response.end();
        }
        const review = /^\/api\/reviews\/([^/]+)$/.exec(parsed.pathname);
        if (review)
          return sendJson(
            response,
            200,
            dispatchValidated(
              workspaceFor(ids),
              'review_detail',
              { reviewId: decodeURIComponent(review[1]) },
              AGENT,
            ),
          );
        const filename = assetPath(publicRoot, parsed.pathname);
        if (filename && fs.existsSync(filename) && fs.statSync(filename).isFile()) {
          response.writeHead(200, {
            'Content-Type': MIME[path.extname(filename)] ?? 'application/octet-stream',
            'Cache-Control': parsed.pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          });
          return response.end(fs.readFileSync(filename));
        }
        if (parsed.pathname === '/')
          return sendJson(response, 503, {
            error: { code: 'NOT_FOUND', message: '工作台前端尚未构建。请执行 npm run build。' },
          });
      }
      if (
        request.method === 'POST' &&
        ['/api/operation', '/api/projects/register', '/api/preferences'].includes(parsed.pathname)
      ) {
        if (!tokenMatches(request.headers['x-taskvision-token'], token))
          return sendJson(response, 403, {
            error: { code: 'FORBIDDEN', message: '页面会话已失效，请刷新后重试。' },
          });
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
          throw httpError('请求须使用 application/json。', 415);
        if (parsed.pathname !== '/api/projects/register') registry.resolve(ids);
        const input = await readJson(
          request,
          parsed.pathname === '/api/preferences'
            ? MAX_PREFERENCES_BYTES
            : parsed.pathname === '/api/projects/register'
              ? 8192
              : 2 * 1024 * 1024,
        );
        if (parsed.pathname === '/api/projects/register') {
          if (!isObject(input) || Object.keys(input).length !== 1 || !('root' in input))
            throw httpError('Project registration requires only an absolute root.', 400);
          const project = registry.register(input.root);
          const cached = workspaces.get(project.id);
          if (cached) {
            const stat = fs.statSync(project.path);
            if (cached.device !== stat.dev || cached.inode !== stat.ino) {
              cached.workspace.close();
              workspaces.delete(project.id);
            }
          }
          return sendJson(response, 200, { project });
        }
        if (parsed.pathname === '/api/preferences') {
          const project = registry.resolve(ids);
          const patch =
            isObject(input) && Object.keys(input).length === 1 && 'preferences' in input
              ? input.preferences
              : input;
          return sendJson(response, 200, { preferences: preferences.update(project.id, patch) });
        }
        if (
          !isObject(input) ||
          !isOperation(input.operation) ||
          !(HUMAN_MUTATIONS as readonly string[]).includes(input.operation)
        ) {
          return sendJson(response, 400, {
            error: { code: 'INVALID_ARGUMENT', message: '网页不支持此操作。' },
          });
        }
        // Keep the original small edit budget; only explicit import is allowed the larger envelope.
        if (
          input.operation !== 'knowledge_import' &&
          Buffer.byteLength(JSON.stringify(input)) > 128 * 1024
        )
          throw httpError('编辑请求超过 128 KiB。', 413);
        return sendJson(
          response,
          200,
          dispatchValidated(workspaceFor(ids), input.operation, input.args, HUMAN),
        );
      }
      return sendJson(response, 404, {
        error: { code: 'NOT_FOUND', message: '找不到工作台页面或接口。' },
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Unknown operation error');
      const record = error as Error & { code?: string; status?: number };
      const code = record.code && record.code in STATUS ? (record.code as ErrorCode) : 'INTERNAL';
      const status = record.status ?? STATUS[code];
      return sendJson(response, status, {
        error: {
          code: status < 500 && code === 'INTERNAL' ? 'INVALID_ARGUMENT' : code,
          message: status >= 500 ? '工作台操作失败，请检查本地服务日志。' : error.message,
        },
      });
    }
  });
  server.once('close', closeWorkspaces);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 2000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    closeWorkspaces();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    closeWorkspaces();
    throw new Error('无法获取本地服务端口。');
  }
  actualPort = address.port;
  url = `http://127.0.0.1:${actualPort}/`;
  let closed = false;
  return {
    server,
    url,
    token,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      closeWorkspaces();
    },
  };
}
