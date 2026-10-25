import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import type { ProjectInfo, SourceResult } from '../../shared/src/types';
import { errorCode, fail } from './validation';

export const MAX_SOURCE = 512 * 1024;
const EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.sh',
  '.bash',
  '.zsh',
  '.rb',
  '.php',
  '.vue',
  '.svelte',
  '.html',
  '.css',
  '.scss',
  '.md',
  '.mdx',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.sql',
  '.v',
  '.sv',
  '.vh',
  '.svh',
  '.txt',
]);
const EXCLUDED = new Set([
  '.git',
  '.taskvision',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.next',
  '.cache',
  '.idea',
  '.vscode',
  '.codex',
  '.agents',
  '.claude',
]);
const SECRET =
  /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\..*)?)$|\.(?:pem|key|p12|pfx|keystore)$/i;
export const digest = (value: string | Uint8Array): string =>
  crypto.createHash('sha256').update(value).digest('hex');
export function git(root: string, args: string[], fallback = ''): string {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}
export function projectInfo(root: string): ProjectInfo {
  let canonical: string;
  try {
    canonical = fs.realpathSync(root);
    if (!fs.statSync(canonical).isDirectory())
      fail('INVALID_ARGUMENT', 'Project root must be a directory.');
  } catch {
    fail('INVALID_ARGUMENT', 'Project root must be an existing directory.');
  }
  const common = git(canonical, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return {
    name: path.basename(canonical),
    root: canonical,
    branch: git(canonical, ['branch', '--show-current']),
    head: git(canonical, ['rev-parse', 'HEAD']),
    workspaceId: digest(canonical).slice(0, 20),
    storePath: path.join(
      common || path.join(canonical, '.taskvision'),
      common ? 'taskvision' : '',
      'workspace.sqlite',
    ),
    isGit: !!git(canonical, ['rev-parse', '--show-toplevel']),
  };
}
function blocked(relative: string): boolean {
  return relative
    .split('/')
    .some(
      (p) =>
        EXCLUDED.has(p) ||
        SECRET.test(p) ||
        p === '..' ||
        p === '.' ||
        (p.startsWith('.') && p !== '.github' && p !== '.gitignore'),
    );
}
function supported(relative: string): boolean {
  return (
    EXTENSIONS.has(path.extname(relative).toLowerCase()) ||
    ['Dockerfile', 'Makefile', 'LICENSE'].includes(path.basename(relative))
  );
}
export function normalizePath(value: unknown, { empty = false }: { empty?: boolean } = {}): string {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.length > 1024
  )
    fail('INVALID_ARGUMENT', 'Expected a repository-relative POSIX path.');
  if (!value && empty) return '';
  if (
    !value ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((x) => !x || x === '.' || x === '..')
  )
    fail('FORBIDDEN', 'Path must stay inside the project.');
  if (blocked(value)) fail('FORBIDDEN', 'This path is excluded from the knowledge workspace.');
  return value;
}
export interface PathOptions {
  directory?: boolean;
  allowMissing?: boolean;
  checkIgnore?: boolean;
}
function checkIgnored(project: ProjectInfo, clean: string): void {
  if (!project.isGit) return;
  const result = spawnSync('git', ['-C', project.root, 'check-ignore', '--no-index', '--', clean], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && result.status !== 1))
    fail('FORBIDDEN', 'Cannot validate ignored project paths.');
  if (result.status === 0) fail('FORBIDDEN', 'Ignored files are not exposed.');
}
export function safePath(
  project: ProjectInfo,
  relative: unknown,
  { directory = false, allowMissing = false, checkIgnore = true }: PathOptions = {},
): string {
  const clean = normalizePath(relative);
  if (checkIgnore) checkIgnored(project, clean);
  if (!directory && !supported(clean)) fail('FORBIDDEN', 'Unsupported source format.');
  let current = project.root;
  const parts = clean.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (errorCode(error) === 'ENOENT' && allowMissing) return path.join(project.root, ...parts);
      fail('NOT_FOUND', 'Project path does not exist.');
    }
    if (stat.isSymbolicLink()) fail('FORBIDDEN', 'Symbolic links are not exposed.');
    if (i < parts.length - 1 && !stat.isDirectory())
      fail('NOT_FOUND', 'Parent path is not a directory.');
    if (i === parts.length - 1 && !(stat.isFile() || (directory && stat.isDirectory())))
      fail('FORBIDDEN', 'Unsupported project entry.');
  }
  return current;
}
export function readSource(
  project: ProjectInfo,
  relative: string,
  options: PathOptions = {},
): SourceResult {
  const filename = safePath(project, relative, options);
  let fd: number | undefined;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_SOURCE)
      fail('FORBIDDEN', 'Source is not a regular text file or exceeds 512 KiB.');
    const bytes = fs.readFileSync(fd);
    if (bytes.length > MAX_SOURCE || bytes.includes(0))
      fail('FORBIDDEN', 'Binary or oversized source is not exposed.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path: relative, text, hash: digest(bytes), lines: text.split(/\r?\n/).length };
  } catch (error) {
    if (['FORBIDDEN', 'NOT_FOUND', 'INVALID_ARGUMENT'].includes(errorCode(error) || ''))
      throw error;
    return fail('FORBIDDEN', 'Cannot safely read this source file.');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
export function inventory(
  project: ProjectInfo,
  maxFiles: number,
): { paths: string[]; truncated: boolean } {
  const candidates: string[] = [];
  let capped = false;
  if (project.isGit) {
    let raw: string;
    try {
      raw = execFileSync(
        'git',
        ['-C', project.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        {
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 8 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );
    } catch {
      fail('INVALID_ARGUMENT', 'Git file inventory exceeded the scan budget or failed.');
    }
    const files = [...new Set(raw.split('\0').filter(Boolean))];
    const check = files.length
      ? spawnSync('git', ['-C', project.root, 'check-ignore', '--no-index', '--stdin', '-z'], {
          input: files.join('\0') + '\0',
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 8 * 1024 * 1024,
        })
      : { status: 1, stdout: '', error: undefined };
    if (check.error || (check.status !== 0 && check.status !== 1))
      fail('INVALID_ARGUMENT', 'Cannot validate ignored project paths.');
    const ignored = new Set((check.stdout || '').split('\0').filter(Boolean));
    candidates.push(...files.filter((file) => !ignored.has(file)));
  } else {
    let visited = 0;
    function walk(dir: string, prefix = ''): void {
      for (const item of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        if (++visited > 20000) {
          capped = true;
          return;
        }
        const relative = prefix ? prefix + '/' + item.name : item.name;
        if (blocked(relative) || item.isSymbolicLink()) continue;
        if (item.isDirectory()) walk(path.join(dir, item.name), relative);
        else if (item.isFile()) candidates.push(relative);
        if (capped) return;
      }
    }
    walk(project.root);
  }
  const filtered = candidates.filter((p) => !blocked(p) && supported(p)).sort();
  return { paths: filtered.slice(0, maxFiles), truncated: capped || filtered.length > maxFiles };
}
// The cache trusts metadata only for indexing. Review fingerprints always read source bytes.
export function statFingerprint(project: ProjectInfo, relative: string): string {
  const filename = safePath(project, relative, { checkIgnore: false });
  const stat = fs.lstatSync(filename, { bigint: true });
  if (!stat.isFile() || stat.size > BigInt(MAX_SOURCE))
    fail('FORBIDDEN', 'Source exceeds the indexing budget.');
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.mode].join(':');
}
export function privateDirectory(folder: string): void {
  const missing: string[] = [];
  let current = folder;
  while (!fs.existsSync(current)) {
    missing.push(current);
    current = path.dirname(current);
  }
  // Check every existing ancestor, including a symlink above the storage directory.
  for (let ancestor = current; ; ancestor = path.dirname(ancestor)) {
    if (fs.lstatSync(ancestor).isSymbolicLink())
      fail('FORBIDDEN', 'Workspace storage cannot be a symbolic link.');
    if (path.dirname(ancestor) === ancestor) break;
  }
  for (const entry of missing.reverse()) fs.mkdirSync(entry, { mode: 0o700 });
}

/** Inventory only the requested source scopes; unlike the UI index this must fail closed. */
export function scopeInventory(
  project: ProjectInfo,
  scopes: string[],
  maxFiles: number,
): { paths: string[]; truncated: boolean } {
  const paths = new Set<string>();
  let visited = 0;
  function ignored(entries: string[]): Set<string> {
    if (!project.isGit || !entries.length) return new Set();
    const result = spawnSync(
      'git',
      ['-C', project.root, 'check-ignore', '--no-index', '--stdin', '-z'],
      {
        input: entries.join('\0') + '\0',
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    if (result.error || (result.status !== 0 && result.status !== 1))
      fail('FORBIDDEN', 'Cannot validate ignored review paths.');
    return new Set((result.stdout || '').split('\0').filter(Boolean));
  }
  function walk(relative: string, filename: string): void {
    if (++visited > 20000)
      fail(
        'CONFLICT',
        'Task scope inventory exceeded its entry budget. Narrow the directory scope.',
      );
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(filename);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return;
      fail('FORBIDDEN', 'Cannot inspect every entry in the task scope.');
    }
    if (stat.isSymbolicLink())
      fail(
        'FORBIDDEN',
        'Task scope contains a symbolic link. Narrow the scope to readable source.',
      );
    if (stat.isFile()) {
      if (supported(relative)) paths.add(relative);
      return;
    }
    if (!stat.isDirectory())
      fail('FORBIDDEN', 'Task scope contains an unsupported filesystem entry.');
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(filename, { withFileTypes: true });
    } catch {
      fail('FORBIDDEN', 'Cannot enumerate every directory in the task scope.');
    }
    const allowed = entries
      .map((entry) => ({ entry, relative: relative ? relative + '/' + entry.name : entry.name }))
      .filter((item) => !blocked(item.relative));
    const excluded = ignored(allowed.map((item) => item.relative));
    for (const item of allowed.sort((a, b) => a.relative.localeCompare(b.relative))) {
      if (excluded.has(item.relative)) continue;
      // Non-source regular files are intentionally outside the knowledge boundary.
      if (item.entry.isFile() && !supported(item.relative)) continue;
      walk(item.relative, path.join(filename, item.entry.name));
      if (paths.size > maxFiles) return;
    }
  }
  for (const scope of scopes) {
    const filename = scope
      ? safePath(project, scope, { directory: true, allowMissing: true })
      : project.root;
    walk(scope, filename);
    if (paths.size > maxFiles) break;
  }
  return { paths: [...paths].sort(), truncated: paths.size > maxFiles };
}
