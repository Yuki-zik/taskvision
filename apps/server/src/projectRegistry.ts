import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { PrivateState, stateError } from './userPreferences.js';

export interface RegisteredProject {
  id: string;
  name: string;
  path: string;
}
const registrySchema = z
  .object({ version: z.literal(1), roots: z.array(z.string().min(1).max(4096)).max(128) })
  .strict();
const PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
];
function canonicalRoot(input: unknown, initial = false): string {
  if (
    typeof input !== 'string' ||
    !path.isAbsolute(input) ||
    input.length > 4096 ||
    input.includes('\0') ||
    input.includes('\\') ||
    input.split('/').includes('..')
  )
    throw stateError('Project root must be an absolute path without parent traversal.');
  let canonical: string;
  try {
    // A final symlink could conceal a different approval target. Parents are canonicalized.
    if (fs.lstatSync(path.resolve(input)).isSymbolicLink())
      throw stateError('Choose the actual project directory, not a symbolic link.', 'FORBIDDEN');
    canonical = fs.realpathSync(input);
    if (!fs.statSync(canonical).isDirectory())
      throw stateError('Project root must be a directory.');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['FORBIDDEN', 'INVALID_ARGUMENT'].includes(String(error.code))
    )
      throw error;
    throw stateError('Project directory does not exist or is unavailable.');
  }
  if (canonical === path.parse(canonical).root || canonical === fs.realpathSync(os.homedir()))
    throw stateError('Home and filesystem roots cannot be registered.', 'FORBIDDEN');
  if (!initial) {
    let gitRoot = '';
    try {
      gitRoot = execFileSync('git', ['-C', canonical, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        maxBuffer: 8192,
      }).trim();
    } catch {
      /* Non-Git projects need an explicit recognized project marker. */
    }
    const projectMarker = PROJECT_MARKERS.some((name) => {
      try {
        return fs.lstatSync(path.join(canonical, name)).isFile();
      } catch {
        return false;
      }
    });
    if ((!gitRoot || fs.realpathSync(gitRoot) !== canonical) && !projectMarker)
      throw stateError('Choose a Git repository root or a directory with a project manifest.');
  }
  return canonical;
}
function describe(root: string): RegisteredProject {
  return {
    id: crypto.createHash('sha256').update(root).digest('hex').slice(0, 20),
    name: path.basename(root),
    path: root,
  };
}

export class ProjectRegistry {
  readonly initialId: string;
  private readonly initial: RegisteredProject;
  constructor(
    root: string,
    private readonly state: PrivateState,
  ) {
    this.initial = describe(canonicalRoot(path.resolve(root), true));
    this.initialId = this.initial.id;
    this.projects(); // Validate existing state before starting a listener; no directory scan.
  }
  private projects(): Map<string, RegisteredProject> {
    const saved = this.state.read('projects.json', 1024 * 1024);
    const parsed = registrySchema.safeParse(saved ?? { version: 1, roots: [] });
    if (!parsed.success) throw stateError('Stored project registry is invalid.', 'CONFLICT');
    const projects = new Map([[this.initial.id, this.initial]]);
    // Keep offline approvals visible. Each actual access revalidates the canonical path.
    for (const root of parsed.data.roots) {
      if (
        !path.isAbsolute(root) ||
        path.normalize(root) !== root ||
        root === path.parse(root).root ||
        root === os.homedir()
      )
        throw stateError('Stored project root is invalid.', 'CONFLICT');
      const project = describe(root);
      projects.set(project.id, project);
    }
    return projects;
  }
  list(): { projects: RegisteredProject[]; initialId: string } {
    return { projects: [...this.projects().values()], initialId: this.initialId };
  }
  register(input: unknown): RegisteredProject {
    const project = describe(canonicalRoot(input));
    const projects = this.projects();
    projects.set(project.id, project);
    if (projects.size > 128) throw stateError('At most 128 approved projects can be registered.');
    this.state.write(
      'projects.json',
      { version: 1, roots: [...projects.values()].map((item) => item.path) },
      1024 * 1024,
    );
    return project;
  }
  resolve(ids: string[]): RegisteredProject {
    const id = ids.length === 0 ? this.initialId : ids.length === 1 ? ids[0] : '';
    const project = this.projects().get(id);
    if (!project)
      throw stateError('Project is not registered. Choose an approved project.', 'FORBIDDEN');
    try {
      if (canonicalRoot(project.path, true) !== project.path) throw new Error('Root changed');
    } catch {
      throw stateError(
        'Approved project is unavailable or its canonical path changed. Restore it or register its new path.',
        'CONFLICT',
      );
    }
    return project;
  }
}
