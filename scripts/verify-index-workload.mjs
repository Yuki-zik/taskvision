import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createWorkspace } from '../workspace/core/index.mjs';

// A representative repository workload: discover tagged modules, idle refresh, one edited source.
// This is an acceptance measurement, not a synthetic arithmetic benchmark or CI hardware promise.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taskvision-index-workload-'));
let workspace;
try {
  for (let index = 0; index < 1000; index++) {
    const relative = `src/module-${Math.floor(index / 100)}/component-${index}.ts`;
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(
      filename,
      `// ${index % 10 === 0 ? 'REUSE' : 'CORE'}: Component ${index} uses the existing numeric contract. [tv:id=component.${index}]\nexport function component${index}(value: number): number { return value + ${index}; }\n`,
    );
  }
  workspace = createWorkspace(root);
  const coldStart = performance.now();
  const cold = workspace.dispatch('snapshot');
  const coldMs = performance.now() - coldStart;
  const warm = [];
  for (let index = 0; index < 5; index++) {
    const start = performance.now();
    const snapshot = workspace.dispatch('snapshot');
    warm.push({ elapsedMs: performance.now() - start, stats: snapshot.stats });
  }
  const filename = path.join(root, 'src/module-0/component-0.ts');
  fs.appendFileSync(filename, '// REVIEW: Verify changed component boundary\n');
  const changedStart = performance.now();
  const changed = workspace.dispatch('snapshot');
  const changedMs = performance.now() - changedStart;
  const medianWarmMs = [...warm.map((entry) => entry.elapsedMs)].sort((a, b) => a - b)[2];
  const checks = {
    allFilesIndexed: cold.files.length === 1000 && !cold.limits.truncated,
    noIdleContentRereads: warm.every((entry) => entry.stats.readFiles === 0),
    oneFileInvalidation: changed.stats.readFiles === 1 && changed.stats.cachedFiles === 999,
    changedAnnotationVisible: changed.annotations.some((note) => note.tag === 'REVIEW'),
    coldUnderFiveSeconds: coldMs < 5000,
    medianIdleUnderHalfSecond: medianWarmMs < 500,
  };
  console.log(
    JSON.stringify(
      {
        environment: { platform: process.platform, arch: process.arch, node: process.version },
        workload: { files: 1000, modules: 10 },
        coldMs,
        coldStats: cold.stats,
        warm,
        medianWarmMs,
        changedMs,
        changedStats: changed.stats,
        checks,
        passed: Object.values(checks).every(Boolean),
      },
      null,
      2,
    ),
  );
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
} finally {
  workspace?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
