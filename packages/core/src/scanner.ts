import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDirectives } from '../../../src/annotationParser';
import type {
  Annotation,
  IndexStats,
  ProjectInfo,
  ScanLimits,
  SourceEdge,
  SourceFile,
  SourceResult,
  Tag,
} from '../../shared/src/types';
import { digest, inventory, readSource, safePath, statFingerprint } from './filesystem';
import { fail } from './validation';
import { analyzeSyntax, type SourceDependency } from './syntax';

export interface SourceAnnotation extends Annotation {
  sourcePrefix: string;
  sourceTag: string;
  sourceSuffix: string;
  directives: string[];
  inlineStatus: string;
}
interface ParsedSource {
  source: Pick<SourceResult, 'path' | 'hash'>;
  annotations: SourceAnnotation[];
  file: SourceFile;
  imports: SourceDependency[];
  fingerprint: string;
}
export interface ScanData {
  files: SourceFile[];
  annotations: SourceAnnotation[];
  edges: SourceEdge[];
  hashes: Record<string, string>;
  limits: ScanLimits;
  stats: IndexStats;
}
export function publicAnnotation(annotation: Annotation): Annotation {
  const {
    id,
    tag,
    summary,
    body,
    path: relative,
    line,
    endLine,
    origin,
    author,
    status,
    revision,
    fileHash,
    freshness,
    contextKind,
    stableId,
    symbol,
    updatedAt,
    anchorKind,
  } = annotation;
  return {
    id,
    tag,
    summary,
    body,
    path: relative,
    line,
    endLine,
    origin,
    author,
    status,
    revision,
    fileHash,
    freshness,
    ...(contextKind ? { contextKind } : {}),
    ...(stableId ? { stableId } : {}),
    ...(symbol ? { symbol } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(anchorKind ? { anchorKind } : {}),
  };
}
export class SourceIndex {
  private cache = new Map<string, ParsedSource>();
  constructor(
    readonly project: ProjectInfo,
    readonly maxFiles: number,
  ) {}
  private parse(source: SourceResult, fingerprint: string): ParsedSource {
    const analysis = analyzeSyntax(source),
      annotations: SourceAnnotation[] = [],
      counts = new Map<string, number>();
    for (const [line, comment] of analysis.comments) {
      const match = /^(CORE|REUSE|INTENT|REVIEW|TODO|FIXME|NOTE)\b\s*:?\s*(.*)$/i.exec(
        comment.body,
      );
      if (!match) continue;
      const original = match[1].toUpperCase(),
        parsed = parseDirectives(match[2], original);
      let tag: Tag | undefined;
      if (original === 'NOTE')
        tag = parsed.reviewKind
          ? 'REVIEW'
          : ['entrypoint', 'must-read'].includes(parsed.contextKind || '')
            ? 'CORE'
            : ['reusable', 'example'].includes(parsed.contextKind || '')
              ? 'REUSE'
              : parsed.contextKind
                ? 'INTENT'
                : undefined;
      else tag = original === 'FIXME' ? 'TODO' : (original as Tag);
      if (!tag) continue;
      const status = /^\[(todo|doing|blocked|paused|review|done|wontdo|idea)\]\s*/i.exec(
        parsed.trimmedText,
      );
      const summary = parsed.trimmedText
        .replace(/^\[(todo|doing|blocked|paused|review|done|wontdo|idea)\]\s*/i, '')
        .trim();
      const key = source.path + '|' + (parsed.stableId || tag + '|' + summary),
        ordinal = counts.get(key) || 0;
      counts.set(key, ordinal + 1);
      annotations.push({
        id: 'src.' + digest(this.project.workspaceId + '|' + key + '|' + ordinal).slice(0, 24),
        tag,
        summary,
        body: '',
        path: source.path,
        line,
        endLine: line,
        origin: 'source',
        author: 'source',
        status:
          status?.[1]?.toLowerCase() === 'done'
            ? 'resolved'
            : tag === 'REVIEW'
              ? 'needs-review'
              : 'active',
        revision: 1,
        fileHash: source.hash,
        freshness: 'current',
        contextKind: parsed.contextKind,
        stableId: parsed.stableId,
        sourcePrefix: comment.prefix,
        sourceTag: original,
        sourceSuffix: comment.suffix,
        directives: parsed.rawTokens,
        inlineStatus: status?.[0] || '',
      });
    }
    annotations.sort((a, b) => a.line - b.line);
    return {
      source: { path: source.path, hash: source.hash },
      annotations,
      file: {
        path: source.path,
        language: path.extname(source.path).slice(1) || 'text',
        lines: source.lines,
        tags: [...new Set(annotations.map((a) => a.tag))],
        annotationCount: annotations.length,
        symbols: analysis.symbols,
      },
      imports: analysis.imports,
      fingerprint,
    };
  }
  scan(): ScanData {
    const start = performance.now(),
      list = inventory(this.project, this.maxFiles),
      current = new Set(list.paths);
    for (const relative of this.cache.keys())
      if (!current.has(relative)) this.cache.delete(relative);
    let readFiles = 0,
      cachedFiles = 0,
      skippedFiles = 0,
      incomplete = false,
      parseMs = 0;
    const parsed: ParsedSource[] = [];
    for (const relative of list.paths) {
      try {
        const fingerprint = statFingerprint(this.project, relative),
          cached = this.cache.get(relative);
        if (cached?.fingerprint === fingerprint) {
          parsed.push(cached);
          cachedFiles++;
          continue;
        }
        this.cache.delete(relative);
        const source = readSource(this.project, relative, { checkIgnore: false });
        readFiles++;
        // An unstable read must never be cached under a later metadata fingerprint.
        if (statFingerprint(this.project, relative) !== fingerprint) {
          incomplete = true;
          skippedFiles++;
          continue;
        }
        const parseStart = performance.now(),
          next = this.parse(source, fingerprint);
        parseMs += performance.now() - parseStart;
        this.cache.set(relative, next);
        parsed.push(next);
      } catch {
        this.cache.delete(relative);
        skippedFiles++;
        incomplete = true;
      }
    }
    const paths = new Set(parsed.map((p) => p.source.path)),
      edges: SourceEdge[] = [];
    for (const item of parsed)
      for (const dependency of item.imports) {
        const base = path.posix.normalize(
          path.posix.join(path.posix.dirname(item.source.path), dependency.specifier),
        );
        // TypeScript source commonly imports emitted .js/.mjs/.cjs paths. Resolve
        // source counterparts without inventing a dependency on a generated file.
        const sourceCounterparts = base.endsWith('.mjs')
          ? [base.slice(0, -4) + '.mts', base.slice(0, -4) + '.d.mts']
          : base.endsWith('.cjs')
            ? [base.slice(0, -4) + '.cts', base.slice(0, -4) + '.d.cts']
            : base.endsWith('.js')
              ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx', base.slice(0, -3) + '.d.ts']
              : [];
        const target = [
          base,
          ...sourceCounterparts,
          ...['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.py'].map(
            (ext) => base + ext,
          ),
          base + '/index.js',
          base + '/index.ts',
          base + '/index.tsx',
        ].find((p) => paths.has(p));
        if (target)
          edges.push({
            from: item.source.path,
            to: target,
            kind: dependency.kind,
            provenance: dependency.provenance,
            line: dependency.line,
            specifier: dependency.specifier,
          });
      }
    return {
      files: parsed.map((p) => p.file),
      annotations: parsed.flatMap((p) => p.annotations),
      edges,
      hashes: Object.fromEntries(parsed.map((p) => [p.source.path, p.source.hash])),
      limits: {
        truncated: list.truncated,
        scannedFiles: parsed.length,
        maxFiles: this.maxFiles,
        skippedFiles,
        incomplete,
      },
      stats: { readFiles, cachedFiles, scanMs: performance.now() - start, parseMs },
    };
  }
  patch(
    annotation: SourceAnnotation,
    summary: string,
    expectedHash: string,
  ): { path: string; line: number } {
    const source = readSource(this.project, annotation.path);
    if (source.hash !== expectedHash)
      fail('STALE', 'Source changed. Reload before editing this annotation.');
    if (/[\r\n\u2028\u2029]/.test(summary))
      fail('INVALID_ARGUMENT', 'A source annotation must stay on one line.');
    const current = this.parse(source, '').annotations.find((a) => a.id === annotation.id);
    if (!current) fail('STALE', 'Annotation moved or changed. Reload its anchor.');
    if (
      ((current.sourcePrefix.includes('/*') || current.sourceSuffix.includes('*/')) &&
        summary.includes('*/')) ||
      ((current.sourcePrefix.includes('<!--') || current.sourceSuffix.includes('-->')) &&
        summary.includes('-->'))
    )
      fail('INVALID_ARGUMENT', 'Annotation text cannot terminate its comment.');
    const ending = source.text.includes('\r\n') ? '\r\n' : '\n',
      lines = source.text.split(/\r?\n/);
    const tail = current.directives.length ? ' ' + current.directives.join(' ') : '';
    lines[current.line - 1] =
      current.sourcePrefix +
      current.sourceTag +
      ': ' +
      current.inlineStatus +
      summary +
      tail +
      current.sourceSuffix;
    const filename = safePath(this.project, current.path),
      temp = filename + '.taskvision-' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, lines.join(ending), { flag: 'wx', mode: fs.statSync(filename).mode });
      if (readSource(this.project, current.path).hash !== expectedHash)
        fail('STALE', 'Source changed during the edit.');
      fs.renameSync(temp, filename);
      this.cache.delete(current.path);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return { path: current.path, line: current.line };
  }
  close(): void {
    this.cache.clear();
  }
}
