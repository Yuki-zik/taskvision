/** Narrow untrusted JSON without granting it a trusted domain type. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : [];
}
export function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Clone normalized JSON records without depending on newer extension-host globals. */
export function cloneJson<T extends object>(value: T): T {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  return cloned as T;
}
