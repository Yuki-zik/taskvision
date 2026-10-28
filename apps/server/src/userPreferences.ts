import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { z } from 'zod';

export const MAX_PREFERENCES_BYTES = 256 * 1024;
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const safeKey = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value));
const graphView = z
  .object({
    positions: z
      .record(safeKey, z.object({ x: coordinate, y: coordinate }).strict())
      .refine((value) => Object.keys(value).length <= 2000),
    viewport: z
      .object({ x: coordinate, y: coordinate, zoom: z.number().finite().min(0.05).max(4) })
      .strict()
      .optional(),
  })
  .strict();
const preferencePatch = z
  .object({
    theme: z.enum(['dark', 'light', 'system']).optional(),
    sidebarWidth: z.number().finite().min(160).max(340).optional(),
    detailWidth: z.number().finite().min(290).max(740).optional(),
    // Pixels are bounded here; the browser also caps the rendered bottom pane at 65vh.
    detailHeight: z.number().finite().min(220).max(2000).optional(),
    detailDock: z.enum(['right', 'left', 'bottom']).optional(),
    sidebarCollapsed: z.boolean().optional(),
    graphViews: z
      .record(safeKey, graphView)
      .refine((value) => Object.keys(value).length <= 32)
      .optional(),
  })
  .strict();
export type UserPreferences = Required<z.infer<typeof preferencePatch>>;
export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  sidebarWidth: 184,
  detailWidth: 364,
  detailHeight: 300,
  detailDock: 'right',
  sidebarCollapsed: false,
  graphViews: {},
};

export function stateError(
  message: string,
  code: 'INVALID_ARGUMENT' | 'FORBIDDEN' | 'CONFLICT' = 'INVALID_ARGUMENT',
): Error {
  return Object.assign(new Error(message), { code });
}
function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Private user state is deliberately independent of ports and repository storage. */
export class PrivateState {
  readonly directory: string;
  constructor(directory = path.join(os.homedir(), '.config', 'taskvision')) {
    this.directory = path.resolve(directory);
    if (this.directory === path.parse(this.directory).root || this.directory === os.homedir())
      throw stateError('Personal state needs a dedicated private directory.');
    this.checkDirectory(false);
  }
  private checkDirectory(create: boolean): boolean {
    try {
      const stat = fs.lstatSync(this.directory);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw stateError('Personal state directory cannot be a symbolic link.', 'FORBIDDEN');
      // Canonicalize parents, e.g. macOS /tmp, but never accept an aliased final directory.
      if (create) fs.chmodSync(this.directory, 0o700);
      return true;
    } catch (error) {
      if (!missing(error)) throw error;
      if (!create) return false;
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      fs.chmodSync(this.directory, 0o700);
      return true;
    }
  }
  private checkFile(filename: string): void {
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw stateError('Personal state must be a private regular file.', 'FORBIDDEN');
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  read(name: string, maximum = MAX_PREFERENCES_BYTES): unknown | undefined {
    if (!this.checkDirectory(false)) return undefined;
    const filename = path.join(this.directory, name);
    this.checkFile(filename);
    let fd: number | undefined;
    try {
      fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum)
        throw stateError('Personal state file is invalid or too large.', 'FORBIDDEN');
      const bytes = fs.readFileSync(fd);
      if (bytes.length > maximum)
        throw stateError('Personal state file is too large.', 'FORBIDDEN');
      return JSON.parse(bytes.toString('utf8')) as unknown;
    } catch (error) {
      if (missing(error)) return undefined;
      if (error instanceof SyntaxError)
        throw stateError('Personal state file contains invalid JSON.', 'CONFLICT');
      throw error;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  write(name: string, value: unknown, maximum = MAX_PREFERENCES_BYTES): void {
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > maximum)
      throw stateError('Personal state exceeds its size budget.');
    this.checkDirectory(true);
    const filename = path.join(this.directory, name);
    this.checkFile(filename);
    const temporary = path.join(
      this.directory,
      `.${name}.${crypto.randomBytes(12).toString('hex')}.tmp`,
    );
    let fd: number | undefined;
    try {
      fd = fs.openSync(
        temporary,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, filename);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      fs.rmSync(temporary, { force: true });
    }
  }
}

export class UserPreferenceStore {
  constructor(private readonly state: PrivateState) {}
  private filename(projectId: string): string {
    if (!/^[a-f0-9]{20}$/.test(projectId)) throw stateError('Unknown project.', 'FORBIDDEN');
    return `preferences-${projectId}.json`;
  }
  get(projectId: string): UserPreferences {
    const saved = this.state.read(this.filename(projectId));
    const result = preferencePatch.safeParse(saved ?? {});
    if (!result.success) throw stateError('Stored personal preferences are invalid.', 'CONFLICT');
    return { ...DEFAULT_PREFERENCES, ...result.data };
  }
  update(projectId: string, input: unknown): UserPreferences {
    const reset = z
      .object({ reset: z.literal(true) })
      .strict()
      .safeParse(input);
    const result = preferencePatch.safeParse(input);
    if (!reset.success && !result.success) throw stateError('Invalid personal preferences.');
    // Read fresh before each patch so tabs editing different controls preserve each other's fields.
    const current = this.get(projectId);
    const next = reset.success ? { ...DEFAULT_PREFERENCES } : { ...current, ...result.data };
    this.state.write(this.filename(projectId), next);
    return next;
  }
}
