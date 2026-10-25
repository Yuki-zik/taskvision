import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Actor,
  Annotation,
  Claim,
  EventRecord,
  ProjectInfo,
  Review,
  Task,
  UpdatesResult,
} from '../../shared/src/types';
import { privateDirectory } from './filesystem';
import type { AnnotationCoordinates, ScopeCoordinates, WorkspaceLocation } from './coordinates';
import { fail, integer, now, text } from './validation';

export interface CapturedFile {
  hash: string;
  text: string | null;
}
export interface Capture {
  files: Record<string, CapturedFile>;
  complete: boolean;
  capturedAt: string;
}
export interface Baseline extends Capture {
  taskId: string;
  workspaceId: string;
}
export type StoredTask = Task & { coordinates?: ScopeCoordinates };
export type StoredClaim = Claim & { coordinates?: ScopeCoordinates };
export type StoredReview = Review & { coordinates?: ScopeCoordinates };
export type StoredAnnotation = Annotation & { coordinates?: AnnotationCoordinates };
interface RecordTypes {
  workspace: WorkspaceLocation;
  annotation: StoredAnnotation;
  task: StoredTask;
  claim: StoredClaim;
  review: StoredReview;
  baseline: Baseline;
  'review-baseline': Baseline;
  'review-source': Capture;
}
type RecordKind = keyof RecordTypes;
const MAX_PRIVATE_BYTES = 32 * 1024 * 1024;

/** Preserves the existing records/events/scans schema and Git common-directory location. */
export class Store {
  private db: DatabaseSync;
  constructor(project: ProjectInfo) {
    privateDirectory(path.dirname(project.storePath));
    if (fs.existsSync(project.storePath) && fs.lstatSync(project.storePath).isSymbolicLink())
      fail('FORBIDDEN', 'Database cannot be a symbolic link.');
    this.db = new DatabaseSync(project.storePath);
    try {
      fs.chmodSync(project.storePath, 0o600);
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
        CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,actor TEXT NOT NULL,createdAt TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS scans(workspaceId TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  get<K extends RecordKind>(kind: K, id: string): RecordTypes[K] | null {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id);
    if (!row) return null;
    if (typeof row.data !== 'string') fail('INTERNAL', 'Invalid workspace record encoding.');
    // This is the private serialization boundary; public/untrusted documents are validated separately.
    return JSON.parse(row.data) as RecordTypes[K];
  }
  list<K extends RecordKind>(kind: K): RecordTypes[K][] {
    return this.db
      .prepare('SELECT data FROM records WHERE kind=? ORDER BY id')
      .all(kind)
      .map((row) => {
        if (typeof row.data !== 'string') fail('INTERNAL', 'Invalid workspace record encoding.');
        return JSON.parse(row.data) as RecordTypes[K];
      });
  }
  require<K extends RecordKind>(kind: K, id: unknown): RecordTypes[K] {
    const record = this.get(kind, text(id, 'id', 128));
    if (!record) fail('NOT_FOUND', kind + ' does not exist.');
    return record;
  }
  save<K extends RecordKind>(kind: K, id: string, record: RecordTypes[K]): void {
    this.db
      .prepare(
        'INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',
      )
      .run(kind, id, JSON.stringify(record));
  }
  remove(kind: RecordKind, id: string): void {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  }
  savePrivate<K extends 'baseline' | 'review-baseline' | 'review-source'>(
    kind: K,
    id: string,
    record: RecordTypes[K],
  ): boolean {
    const encoded = JSON.stringify(record);
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) AS bytes FROM records WHERE kind IN ('baseline','review-baseline','review-source') AND NOT (kind=? AND id=?)",
      )
      .get(kind, id);
    if (Number(row?.bytes || 0) + Buffer.byteLength(encoded) > MAX_PRIVATE_BYTES) return false;
    this.save(kind, id, record);
    return true;
  }
  revision(): number {
    return Number(
      this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM events').get()?.n || 0,
    );
  }
  event(
    type: string,
    actor: Actor | { role: 'system'; id: string },
    payload: Record<string, unknown>,
  ): number {
    return Number(
      this.db
        .prepare('INSERT INTO events(type,actor,createdAt,payload) VALUES(?,?,?,?)')
        .run(type, actor.role + ':' + actor.id, now(), JSON.stringify(payload)).lastInsertRowid,
    );
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  recordScan(workspaceId: string, fingerprint: string, files: number): void {
    this.transaction(() => {
      const previous = this.db
        .prepare('SELECT fingerprint FROM scans WHERE workspaceId=?')
        .get(workspaceId);
      if (previous?.fingerprint === fingerprint) return;
      this.db
        .prepare(
          'INSERT INTO scans(workspaceId,fingerprint) VALUES(?,?) ON CONFLICT(workspaceId) DO UPDATE SET fingerprint=excluded.fingerprint',
        )
        .run(workspaceId, fingerprint);
      this.event('source-changed', { role: 'system', id: 'index' }, { workspaceId, files });
    });
  }
  updates(afterValue: unknown, limitValue: unknown): UpdatesResult {
    const after = integer(afterValue, 0, 0, Number.MAX_SAFE_INTEGER),
      limit = integer(limitValue, 100, 1, 500);
    const rows = this.db
      .prepare(
        'SELECT sequence,type,actor,createdAt,payload FROM events WHERE sequence>? ORDER BY sequence LIMIT ?',
      )
      .all(after, limit + 1);
    const events: EventRecord[] = rows.slice(0, limit).map((row) => ({
      sequence: Number(row.sequence),
      type: String(row.type),
      actor: String(row.actor),
      createdAt: String(row.createdAt),
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
    }));
    return { events, cursor: events.at(-1)?.sequence || after, hasMore: rows.length > limit };
  }
  close(): void {
    this.db.close();
  }
}
