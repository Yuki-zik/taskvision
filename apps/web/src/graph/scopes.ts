import { inScope, type SourceFile } from '../domain';

export const ROOT_SCOPE = '@root';
export const TEST_SCOPE = '@tests';

export function isTestPath(path: string): boolean {
  return /(^|\/)(?:test|tests|__tests__|test-extension)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(
    path,
  );
}

// Directory and file roles are explicit. Infrastructure stays available through its own counted view.
export function isInfrastructurePath(path: string): boolean {
  if (isTestPath(path)) return false;
  return (
    /^(?:agent|docs?|licenses?|resources?|assets|scripts|workspace|build|dist|out|coverage|\.github)\//i.test(
      path,
    ) ||
    /(?:^|\/)(?:AGENTS|README[^/]*|LICENSE[^/]*|NOTICE[^/]*|CHANGELOG|MIGRATION)(?:\.[^/]*)?$/i.test(
      path,
    ) ||
    /\.(?:md|mdx|txt|json|jsonc|ya?ml|toml|lock)$/i.test(path) ||
    /(?:^|\/)(?:[^/]*\.config\.[^/]+|build[^/]*\.[cm]?[jt]s|Dockerfile|Makefile)$/i.test(path)
  );
}

export function moduleForPath(path: string): string {
  if (isTestPath(path)) return TEST_SCOPE;
  const parts = path.split('/');
  if (parts.length === 1) return ROOT_SCOPE;
  return (parts[0] === 'apps' || parts[0] === 'packages') && parts.length > 2
    ? parts.slice(0, 2).join('/')
    : parts[0]!;
}

export function scopeLabel(scope: string): string {
  if (scope === ROOT_SCOPE) return '根目录文件';
  if (scope === TEST_SCOPE) return '测试';
  return scope;
}

export function filesForScope(files: SourceFile[], scope: string): SourceFile[] {
  if (scope === ROOT_SCOPE) return files.filter((file) => !file.path.includes('/'));
  if (scope === TEST_SCOPE) return files.filter((file) => isTestPath(file.path));
  return files.filter((file) => inScope(file.path, scope));
}

export function groupForPath(path: string, scope: string): string | null {
  if (!scope) return moduleForPath(path);
  if (scope === ROOT_SCOPE) return null;
  if (scope === TEST_SCOPE) {
    const parts = path.split('/');
    const testIndex = parts.findIndex((part) =>
      /^(?:test|tests|__tests__|test-extension)$/i.test(part),
    );
    return testIndex >= 0
      ? parts.slice(0, testIndex + 1).join('/')
      : path.slice(0, path.lastIndexOf('/')) || null;
  }
  const relative = path.slice(scope.length + 1);
  return relative.includes('/') ? `${scope}/${relative.split('/')[0]}` : null;
}
