#!/usr/bin/env node
import { createWorkspace } from '../../../packages/core/src/index.js';
import {
  AGENT_OPERATIONS,
  dispatchValidated,
  isOperation,
} from '../../../packages/shared/src/schemas.js';
const argv = process.argv.slice(2);
const rootIndex = argv.indexOf('--root');
let root = process.cwd();
if (rootIndex >= 0) {
  root = argv[rootIndex + 1] ?? '';
  argv.splice(rootIndex, 2);
}
let workspace: ReturnType<typeof createWorkspace> | undefined;
try {
  const operation = argv[0] ?? 'snapshot';
  if (!isOperation(operation) || !(AGENT_OPERATIONS as readonly string[]).includes(operation))
    throw new Error(
      'Unknown or human-only operation. Human decisions belong in the Web workspace.',
    );
  const args: unknown = argv[1] ? JSON.parse(argv[1]) : {};
  workspace = createWorkspace(root);
  console.log(
    JSON.stringify(
      dispatchValidated(workspace, operation, args, { role: 'agent', id: 'cli' }),
      null,
      2,
    ),
  );
} catch (cause) {
  const error =
    cause instanceof Error ? (cause as Error & { code?: string }) : new Error('Unknown error');
  console.error(
    JSON.stringify({
      error: { code: 'code' in error ? error.code : 'INVALID_ARGUMENT', message: error.message },
    }),
  );
  process.exitCode = 1;
} finally {
  workspace?.close();
}
