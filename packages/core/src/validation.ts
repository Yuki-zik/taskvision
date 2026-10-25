import type { Actor, ErrorCode, Tag } from '../../shared/src/types';
import { TAGS } from '../../shared/src/types';

export class WorkspaceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}
export function fail(code: ErrorCode, message: string): never {
  throw new WorkspaceError(code, message);
}
export const now = (): string => new Date().toISOString();
export function object(value: unknown, name = 'Arguments'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('INVALID_ARGUMENT', `${name} must be an object.`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 8000, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (
    typeof value !== 'string' ||
    (!optional && !value.trim()) ||
    value.length > max ||
    value.includes('\0')
  )
    fail('INVALID_ARGUMENT', `${name} must be nonempty text within ${max} characters.`);
  return value.trim();
}
export function integer(value: unknown, fallback: number, min: number, max: number): number {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max)
    fail('INVALID_ARGUMENT', `Integer must be between ${min} and ${max}.`);
  return n;
}
export function strings(value: unknown, name: string, max = 50): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max)
    fail('INVALID_ARGUMENT', `${name} must be a bounded array.`);
  return [...new Set(value.map((entry: unknown) => text(entry, name, 2048)))];
}
export function tag(value: unknown): Tag {
  if (!TAGS.some((t) => t === value)) fail('INVALID_ARGUMENT', 'Unsupported annotation tag.');
  return value as Tag;
}
export function actorIdentity(value: unknown): Actor {
  const actor = object(value, 'Actor');
  if (actor.role !== 'human' && actor.role !== 'agent') fail('FORBIDDEN', 'Invalid actor role.');
  return { role: actor.role, id: text(actor.id, 'actor id', 128) };
}
export function requireHuman(actor: Actor): void {
  if (actor.role !== 'human')
    fail('FORBIDDEN', 'This operation requires explicit human review in the workspace.');
}
export const overlaps = (a: string, b: string): boolean =>
  a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
