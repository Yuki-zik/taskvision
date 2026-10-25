import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const destination = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-agent-acceptance-'));
if (fs.existsSync(path.join(destination, '.git')))
  throw new Error('Refusing to overwrite an existing acceptance repository.');
fs.mkdirSync(destination, { recursive: true });
const files = {
  'package.json':
    JSON.stringify(
      {
        name: 'taskvision-acceptance-research-kit',
        private: true,
        type: 'module',
        scripts: { test: 'node --test test/*.test.js' },
      },
      null,
      2,
    ) + '\n',
  '.gitignore': '.taskvision/\n.agent-private/\nnode_modules/\n',
  'AGENTS.md': `# Isolated TaskVision integration fixture\nThis repository is an explicitly authorized test fixture, not the user's production project. Use the taskvision-workspace Skill and the configured TaskVision MCP. Query project knowledge and reusable code before edits. Claim only the assigned task paths and obey live human guidance. Never self-approve a review. Do not edit tests or shared helpers to make them pass. No network, credentials, external repositories, global config, commits or push. Write only assigned feature files.\n`,
  'README.md':
    '# Research kit acceptance fixture\n\nTwo independent feature tasks test source discovery, code reuse, live human guidance, scope leases and review handoff through real Codex MCP sessions.\n',
  'src/shared/statistics.js': `// REUSE: Numerical summaries already handle empty arrays and reject non-finite values. Reuse this function instead of adding a second reduction. [tv:id=reuse.statistics]\n// INTENT: Empty input has count=0 and mean=null; non-finite data must throw TypeError. [tv:id=intent.statistics]\nexport function summarizeFinite(values) {\n  if (!Array.isArray(values) || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Expected finite numeric values');\n  if (!values.length) return { count: 0, mean: null, minimum: null, maximum: null };\n  let sum = 0, compensation = 0;\n  for (const value of values) { const corrected = value - compensation; const next = sum + corrected; compensation = (next - sum) - corrected; sum = next; }\n  return { count: values.length, mean: sum / values.length, minimum: Math.min(...values), maximum: Math.max(...values) };\n}\n`,
  'src/shared/checkpoint-schema.js': `// REUSE: This module owns checkpoint validation and defaulting. Consumers must reuse it so schema rules stay consistent. [tv:id=reuse.checkpoint-schema]\n// CORE: Checkpoint metadata v1 normalization. [tv:id=core.checkpoint-schema]\nexport function normalizeCheckpoint(metadata) {\n  if (!metadata || !Number.isInteger(metadata.epoch) || metadata.epoch < 0) throw new TypeError('Invalid checkpoint epoch');\n  const step = metadata.step ?? 0;\n  if (!Number.isInteger(step) || step < 0) throw new TypeError('Invalid checkpoint step');\n  return { epoch: metadata.epoch, step, schemaVersion: 1 };\n}\n`,
  'src/training/metrics.js': `// CORE: Training report entrypoint. [tv:id=core.epoch-metrics]\n// TODO: Summarize epoch loss using existing reusable statistics.\nexport function epochMetrics(losses) {\n  throw new Error('Not implemented');\n}\n`,
  'src/storage/checkpoint-label.js': `// CORE: Human-readable checkpoint label entrypoint. [tv:id=core.checkpoint-label]\n// TODO: Format normalized metadata as run:epoch=<epoch>;step=<step>.\nexport function checkpointLabel(metadata) {\n  throw new Error('Not implemented');\n}\n`,
  'test/metrics.test.js': `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {epochMetrics} from '../src/training/metrics.js';\ntest('reports training loss using the established numeric contract',()=>{assert.deepEqual(epochMetrics([2,4,6]),{samples:3,lossMean:4,lossRange:[2,6]});});\ntest('empty and invalid data follow the shared contract',()=>{assert.deepEqual(epochMetrics([]),{samples:0,lossMean:null,lossRange:[null,null]});assert.throws(()=>epochMetrics([1,NaN]),TypeError);});\n`,
  'test/checkpoint.test.js': `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {checkpointLabel} from '../src/storage/checkpoint-label.js';\ntest('labels normalized checkpoint metadata',()=>{assert.equal(checkpointLabel({epoch:3,step:17}),'run:epoch=3;step=17');assert.equal(checkpointLabel({epoch:0}),'run:epoch=0;step=0');});\ntest('invalid metadata follows the shared validation contract',()=>{assert.throws(()=>checkpointLabel({epoch:-1}),TypeError);assert.throws(()=>checkpointLabel({epoch:1,step:1.5}),TypeError);});\n`,
};
for (const [name, content] of Object.entries(files)) {
  const target = path.join(destination, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
const skill = path.join(destination, '.agents/skills/taskvision-workspace/SKILL.md');
fs.mkdirSync(path.dirname(skill), { recursive: true });
fs.copyFileSync(path.join(repository, 'workspace/skills/taskvision-workspace/SKILL.md'), skill);
const git = (args) =>
  execFileSync('git', ['-C', destination, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
git(['init', '-q']);
git(['add', '.']);
git([
  '-c',
  'user.name=TaskVision Acceptance',
  '-c',
  'user.email=acceptance@localhost',
  'commit',
  '-qm',
  'test: source-linked human-agent acceptance fixture',
]);
const worktreeA = destination + '-metrics',
  worktreeB = destination + '-checkpoint';
for (const [branch, folder] of [
  ['metrics', worktreeA],
  ['checkpoint', worktreeB],
])
  git(['worktree', 'add', '-qb', branch, folder]);
const result = {
  root: destination,
  worktreeA,
  worktreeB,
  head: git(['rev-parse', 'HEAD']),
  expectedFeatures: [
    'reuse numerical summary',
    'reuse checkpoint normalization',
    'human guidance refresh',
    'lease conflict',
    'review handoff',
  ],
};
fs.writeFileSync(
  path.join(destination, '..', 'agent-fixture.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
