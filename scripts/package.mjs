import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(
  process.argv[2] || path.join(root, 'artifacts', 'taskvision-3.2.1-preview.vsix'),
);
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/@vscode/vsce/vsce'),
    'package',
    '--pre-release',
    '--no-dependencies',
    '--out',
    output,
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
