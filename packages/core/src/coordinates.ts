import fs from 'node:fs';
import path from 'node:path';
import type { ProjectInfo, Task } from '../../shared/src/types';
import { digest, git, normalizePath, safePath } from './filesystem';
import type { Store, StoredTask } from './store';
import { fail } from './validation';

export interface WorkspaceLocation {
  workspaceId: string;
  root: string;
  repositoryRoot: string;
  prefix: string;
}
export interface ScopeCoordinates {
  version: 1;
  paths: string[];
  workspaceId: string;
}
export interface AnnotationCoordinates {
  version: 1;
  path: string;
  workspaceId: string;
}

/** SQLite is shared by a Git repository; coordinates are independent of the opened subdirectory. */
export class Coordinates {
  readonly location: WorkspaceLocation;
  constructor(
    readonly project: ProjectInfo,
    private store: Store,
  ) {
    const repositoryRoot = project.isGit
      ? git(project.root, ['rev-parse', '--show-toplevel'])
      : project.root;
    this.location = this.describe(project.root, repositoryRoot);
    const locations = new Map<string, WorkspaceLocation>([
      [this.location.workspaceId, this.location],
    ]);
    let ancestor = project.root;
    while (ancestor !== repositoryRoot) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) fail('INTERNAL', 'Workspace is outside its Git repository.');
      ancestor = parent;
      const location = this.describe(ancestor, repositoryRoot);
      locations.set(location.workspaceId, location);
    }
    if (project.isGit)
      for (const field of git(project.root, ['worktree', 'list', '--porcelain', '-z']).split(
        '\0',
      )) {
        if (!field.startsWith('worktree ')) continue;
        try {
          const root = fs.realpathSync(field.slice(9)),
            location = this.describe(root, root);
          locations.set(location.workspaceId, location);
        } catch {
          /* Pruned worktrees remain unknown and fail closed for legacy leases. */
        }
      }
    store.transaction(() => {
      for (const location of locations.values())
        store.save('workspace', location.workspaceId, location);
    });
  }
  private describe(root: string, repositoryRoot: string): WorkspaceLocation {
    return {
      workspaceId: digest(root).slice(0, 20),
      root,
      repositoryRoot,
      prefix: path.relative(repositoryRoot, root).split(path.sep).join('/'),
    };
  }
  find(workspaceId: string): WorkspaceLocation | null {
    if (typeof workspaceId !== 'string') return null;
    return this.store.get('workspace', workspaceId);
  }
  forWorkspace(workspaceId: string, paths: string[]): ScopeCoordinates | null {
    const location = this.find(workspaceId);
    if (!location) return null;
    return {
      version: 1,
      workspaceId,
      paths: paths.map((relative) =>
        normalizePath([location.prefix, normalizePath(relative)].filter(Boolean).join('/')),
      ),
    };
  }
  scope(paths: string[]): ScopeCoordinates {
    return this.forWorkspace(this.project.workspaceId, paths)!;
  }
  local(relative: string): string | null {
    const prefix = this.location.prefix;
    if (!prefix) return relative;
    if (relative === prefix) return '';
    return relative.startsWith(prefix + '/') ? relative.slice(prefix.length + 1) : null;
  }
  localScopes(scope: ScopeCoordinates): string[] {
    return scope.paths.map((relative) => {
      const local = this.local(relative);
      if (local === null)
        fail(
          'FORBIDDEN',
          'The entire task scope is outside this workspace. Open its repository root.',
        );
      return local;
    });
  }
  publicPaths(scope: ScopeCoordinates | null): string[] {
    return scope
      ? scope.paths.map((p) => this.local(p)).filter((p): p is string => p !== null && p !== '')
      : [];
  }
  taskScope(task: StoredTask): ScopeCoordinates | null {
    if (task.coordinates) return task.coordinates;
    const claim = this.store.get('claim', task.id);
    if (claim) return claim.coordinates || this.forWorkspace(claim.workspaceId, claim.paths);
    const baseline = this.store.get('baseline', task.id);
    if (baseline) return this.forWorkspace(baseline.workspaceId, task.paths);
    const review = this.store.list('review').find((r) => r.taskId === task.id);
    if (review) return review.coordinates || this.forWorkspace(review.workspaceId, review.paths);
    // Non-Git stores belong to one root. Old Git tasks without origin evidence cannot be guessed.
    return this.project.isGit ? null : this.scope(task.paths);
  }
  publicTask(task: StoredTask): Task {
    const { coordinates: _coordinates, ...record } = task;
    const scope = this.taskScope(task),
      origin = scope ? this.find(scope.workspaceId) : null;
    const paths = this.publicPaths(scope).filter((relative) => {
      if (!origin || origin.repositoryRoot === this.location.repositoryRoot) return true;
      try {
        safePath(this.project, relative, { directory: true });
        return true;
      } catch {
        return false;
      }
    });
    return { ...record, paths };
  }
}
