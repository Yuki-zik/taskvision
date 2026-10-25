import type { Annotation, Snapshot } from '../domain';
import { moduleForPath, isInfrastructurePath } from '../graph/scopes';
import { sourcePriority } from '../graph/model';

export interface ReadingEntry {
  path: string;
  line: number;
  title: string;
  tag?: Annotation['tag'];
}

export function projectEntrypoints(snapshot: Snapshot, limit = 4): ReadingEntry[] {
  const candidates = snapshot.annotations
    .filter(
      (annotation) =>
        annotation.path &&
        !isInfrastructurePath(annotation.path) &&
        annotation.status === 'active' &&
        annotation.freshness === 'current' &&
        (annotation.tag === 'CORE' || annotation.tag === 'REUSE'),
    )
    .sort(
      (a, b) =>
        sourcePriority(a.path) * 2 +
          Number(a.tag === 'REUSE') -
          (sourcePriority(b.path) * 2 + Number(b.tag === 'REUSE')) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line,
    );
  const entries: ReadingEntry[] = [];
  const modules = new Set<string>();
  for (const annotation of candidates) {
    const module = moduleForPath(annotation.path);
    if (modules.has(module)) continue;
    modules.add(module);
    entries.push({
      path: annotation.path,
      line: annotation.line,
      title: annotation.summary,
      tag: annotation.tag,
    });
    if (entries.length === limit) return entries;
  }
  for (const file of [...snapshot.files]
    .filter((file) => !isInfrastructurePath(file.path) && sourcePriority(file.path) === 0)
    .sort((a, b) => a.path.localeCompare(b.path))) {
    const module = moduleForPath(file.path);
    if (modules.has(module)) continue;
    modules.add(module);
    entries.push({
      path: file.path,
      line: file.symbols[0]?.line ?? 1,
      title:
        file.symbols
          .slice(0, 2)
          .map((symbol) => symbol.name)
          .join(' · ') || file.path.split('/').at(-1)!,
    });
    if (entries.length === limit) break;
  }
  return entries;
}
