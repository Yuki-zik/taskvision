import { z } from 'zod';
import { TAGS } from './types.js';
import type { Actor, OperationArgs, OperationName, OperationResult, Workspace } from './types.js';

const id = z.string().min(1).max(128);
const sourcePath = z.string().min(1).max(1024);
const scope = z.array(sourcePath).min(1).max(50);
const lease = { taskId: id, agentId: id, token: id };
const ttlSeconds = z.number().int().min(30).max(3600).optional();

export const operationSchemas = {
  snapshot: z.object({}),
  context: z.object({
    query: z.string().max(1000).optional(),
    tag: z.enum(TAGS).optional(),
    path: z.string().max(1024).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  source: z.object({ path: sourcePath }),
  annotation_upsert: z.object({
    id: id.optional(),
    tag: z.enum(TAGS),
    summary: z.string().min(1).max(2000),
    body: z.string().max(16000).optional(),
    path: z.string().max(1024).optional(),
    line: z.number().int().min(1).optional(),
    expectedRevision: z.number().int().min(1).optional(),
  }),
  annotation_decide: z.object({
    id,
    decision: z.enum(['accept', 'archive']),
    expectedRevision: z.number().int().min(1),
  }),
  edit_source_annotation: z.object({
    id,
    summary: z.string().min(1).max(2000),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  task_create: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional(),
    paths: scope,
    dependsOn: z.array(id).max(50).optional(),
  }),
  task_claim: z.object({ taskId: id, agentId: id, ttlSeconds }),
  task_heartbeat: z.object({ ...lease, ttlSeconds }),
  task_release: z.object(lease),
  review_submit: z.object({
    ...lease,
    summary: z.string().min(1).max(8000),
    paths: scope.optional(),
    evidence: z.array(z.string().max(2048)).max(50).optional(),
  }),
  review_detail: z.object({ reviewId: id }),
  review_resolve: z.object({
    reviewId: id,
    decision: z.enum(['accepted', 'changes-requested']),
    note: z.string().max(8000).optional(),
  }),
  updates: z.object({
    after: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  export: z.object({}),
  knowledge_import: z.object({ document: z.unknown(), dryRun: z.boolean().optional() }),
} satisfies { [K in OperationName]: z.ZodType<OperationArgs<K>> };

export const AGENT_OPERATIONS = [
  'snapshot',
  'context',
  'source',
  'annotation_upsert',
  'task_create',
  'task_claim',
  'task_heartbeat',
  'task_release',
  'review_submit',
  'review_detail',
  'updates',
  'export',
] as const satisfies readonly OperationName[];
export const HUMAN_MUTATIONS = [
  'annotation_upsert',
  'annotation_decide',
  'edit_source_annotation',
  'task_create',
  'review_resolve',
  'knowledge_import',
] as const satisfies readonly OperationName[];
export const READ_OPERATIONS = [
  'snapshot',
  'context',
  'source',
  'review_detail',
  'updates',
  'export',
] as const;

export function isOperation(value: unknown): value is OperationName {
  return typeof value === 'string' && Object.hasOwn(operationSchemas, value);
}

export function parseOperation<K extends OperationName>(name: K, input: unknown): OperationArgs<K> {
  const parsed = operationSchemas[name].safeParse(input ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error = new Error(`参数无效：${issue?.path.join('.') || name}。${issue?.message || ''}`);
    Object.assign(error, { code: 'INVALID_ARGUMENT' });
    throw error;
  }
  // The mapped schema above statically enforces the matching args for every operation.
  return parsed.data as OperationArgs<K>;
}

export function dispatchValidated<K extends OperationName>(
  workspace: Workspace,
  operation: K,
  input: unknown,
  actor: Actor,
): OperationResult<K> {
  return workspace.dispatch(operation, parseOperation(operation, input), actor);
}
