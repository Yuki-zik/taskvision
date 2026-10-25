// CORE: One domain contract is consumed by the extension, Web, CLI, HTTP and MCP adapters.
export const TAGS = ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO'] as const;
export type Tag = (typeof TAGS)[number];
export type Actor = { role: 'human' | 'agent'; id: string };
export type ErrorCode =
  'INVALID_ARGUMENT' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'STALE' | 'INTERNAL';
export interface ApiError {
  error: { code: ErrorCode; message: string };
}
export interface ProjectInfo {
  name: string;
  root: string;
  branch: string;
  head: string;
  workspaceId: string;
  storePath: string;
  isGit: boolean;
}
export interface SourceSymbol {
  name: string;
  line: number;
  endLine?: number;
  kind: string;
}
export interface SourceFile {
  path: string;
  language: string;
  lines: number;
  tags: Tag[];
  annotationCount: number;
  symbols: SourceSymbol[];
}
export interface SourceEdge {
  from: string;
  to: string;
  kind: string;
  provenance: string;
}
export interface Annotation {
  id: string;
  tag: Tag;
  summary: string;
  body: string;
  path: string;
  line: number;
  endLine: number;
  origin: 'source' | 'web' | 'legacy';
  author: string;
  status: 'active' | 'proposed' | 'needs-review' | 'resolved' | 'archived';
  revision: number;
  fileHash: string | null;
  freshness: 'current' | 'stale' | 'missing';
  contextKind?: string;
  stableId?: string;
  symbol?: string;
  updatedAt?: string;
  anchorKind?: 'project' | 'module' | 'file';
}
export interface Task {
  id: string;
  title: string;
  description: string;
  paths: string[];
  dependsOn: string[];
  status: 'todo' | 'doing' | 'review' | 'done';
  owner?: string;
  updatedAt: string;
}
export interface PublicClaim {
  taskId: string;
  agentId: string;
  expiresAt: string;
  paths: string[];
  workspaceId: string;
}
export interface Claim extends PublicClaim {
  token: string;
}
export interface Review {
  id: string;
  taskId: string;
  summary: string;
  paths: string[];
  focusPaths?: string[];
  evidence: string[];
  evidenceStatus?: 'agent-reported';
  status: 'pending' | 'accepted' | 'changes-requested';
  workspaceId: string;
  head: string;
  fileHashes: Record<string, string>;
  createdAt: string;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}
export interface ScanLimits {
  truncated: boolean;
  scannedFiles: number;
  maxFiles: number;
  skippedFiles?: number;
  incomplete?: boolean;
}
export interface IndexStats {
  readFiles: number;
  cachedFiles: number;
  scanMs: number;
  parseMs?: number;
}
export interface Snapshot {
  project: ProjectInfo;
  revision: number;
  files: SourceFile[];
  annotations: Annotation[];
  tasks: Task[];
  claims: PublicClaim[];
  reviews: Review[];
  edges: SourceEdge[];
  limits: ScanLimits;
  stats?: IndexStats;
}
export interface SourceResult {
  path: string;
  text: string;
  hash: string;
  lines: number;
}
export interface ContextResult {
  revision: number;
  annotations: Annotation[];
  tasks: Task[];
  readOrder: { path: string; line: number; reason: string }[];
  contentPolicy?: string;
  limits?: ScanLimits;
  selection?: {
    matched: number;
    returned: number;
    omittedMatches: number;
    omittedGuidance: number;
  };
}
export interface EventRecord {
  sequence: number;
  type: string;
  actor: string;
  createdAt: string;
  payload: Record<string, unknown>;
}
export interface UpdatesResult {
  events: EventRecord[];
  cursor: number;
  hasMore: boolean;
}
export interface KnowledgeExport {
  version: 1;
  project: ProjectInfo;
  annotations: Annotation[];
  tasks: Task[];
  reviews: Review[];
  exportedAt?: string;
}
export interface AnnotationInput {
  id?: string;
  tag: Tag;
  summary: string;
  body?: string;
  path?: string;
  line?: number;
  expectedRevision?: number;
}
export interface TaskInput {
  title: string;
  description?: string;
  paths: string[];
  dependsOn?: string[];
}
export interface LeaseInput {
  taskId: string;
  agentId: string;
  token: string;
}
export interface ReviewFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
  before: string | null;
  after: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  current?: string | null;
  currentHash?: string | null;
  truncated?: boolean;
}
export interface ReviewDetail {
  review: Review;
  files: ReviewFile[];
  baselineAvailable: boolean;
  stale: boolean;
  warning?: string;
}
export type EmptyArgs = Record<string, never>;
export interface Operations {
  snapshot: { args: EmptyArgs; result: Snapshot };
  context: {
    args: { query?: string; tag?: Tag; path?: string; limit?: number };
    result: ContextResult;
  };
  source: { args: { path: string }; result: SourceResult };
  annotation_upsert: {
    args: AnnotationInput;
    result: { annotation: Annotation; revision: number };
  };
  annotation_decide: {
    args: { id: string; decision: 'accept' | 'archive'; expectedRevision: number };
    result: { annotation: Annotation; revision: number };
  };
  edit_source_annotation: {
    args: { id: string; summary: string; expectedHash: string };
    result: { annotation: Annotation; revision: number };
  };
  task_create: { args: TaskInput; result: { task: Task; revision: number } };
  task_claim: {
    args: { taskId: string; agentId: string; ttlSeconds?: number };
    result: { task: Task; claim: Claim; revision: number };
  };
  task_heartbeat: {
    args: LeaseInput & { ttlSeconds?: number };
    result: { claim: Claim; revision: number };
  };
  task_release: { args: LeaseInput; result: { task: Task; revision: number } };
  review_submit: {
    args: LeaseInput & { summary: string; paths?: string[]; evidence?: string[] };
    result: { review: Review; task: Task; revision: number };
  };
  review_detail: { args: { reviewId: string }; result: ReviewDetail };
  review_resolve: {
    args: { reviewId: string; decision: 'accepted' | 'changes-requested'; note?: string };
    result: { review: Review; task: Task; revision: number };
  };
  updates: { args: { after?: number; limit?: number }; result: UpdatesResult };
  export: { args: EmptyArgs; result: KnowledgeExport };
  knowledge_import: {
    args: { document: unknown; dryRun?: boolean };
    result: {
      imported: number;
      skipped: number;
      conflicts: string[];
      revision: number;
      dryRun: boolean;
    };
  };
}
export type OperationName = keyof Operations;
export type OperationArgs<K extends OperationName> = Operations[K]['args'];
export type OperationResult<K extends OperationName> = Operations[K]['result'];
export interface Workspace {
  dispatch<K extends OperationName>(
    operation: K,
    args?: OperationArgs<K>,
    actor?: Actor,
  ): OperationResult<K>;
  close(): void;
}
export interface WorkspaceOptions {
  maxFiles?: number;
}
