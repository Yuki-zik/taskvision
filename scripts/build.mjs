import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const flags = new Set(process.argv.slice(2));
const production = flags.has('--production');
const legacyOnly = flags.has('--legacy');
const runtimeOnly = flags.has('--runtime');
const extensionOnly = flags.has('--extension');
const banner =
  "import { createRequire as __taskvisionRequire } from 'node:module'; import { fileURLToPath as __taskvisionFileURL } from 'node:url'; import { dirname as __taskvisionDirname } from 'node:path'; const require = __taskvisionRequire(import.meta.url); const __filename = __taskvisionFileURL(import.meta.url); const __dirname = __taskvisionDirname(__filename);";

function files(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(filename, extension)
      : entry.name.endsWith(extension) && !entry.name.endsWith('.d.ts')
        ? [filename]
        : [];
  });
}

async function legacyModules() {
  const entries = files(path.join(root, 'src'), '.ts');
  await build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: path.join(root, 'out/legacy/src'),
    outbase: path.join(root, 'src'),
    bundle: false,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    logLevel: 'warning',
  });
}

async function extension() {
  await build({
    absWorkingDir: root,
    entryPoints: ['src/extension.ts'],
    outfile: path.join(root, 'dist/extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node16',
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    logLevel: 'info',
  });
}

async function runtime() {
  const entries = [
    ['packages/core/src/index.ts', 'workspace/core/index.mjs'],
    ['apps/server/src/index.ts', 'workspace/server.mjs'],
    ['apps/mcp/src/index.ts', 'workspace/mcp.bundle.mjs'],
    ['apps/cli/src/index.ts', 'workspace/cli.mjs'],
  ];
  for (const [source, output] of entries) {
    await build({
      absWorkingDir: root,
      entryPoints: [source],
      outfile: path.join(root, output),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      minify: production,
      plugins: source.startsWith('packages/core')
        ? []
        : [
            {
              name: 'shared-core-runtime',
              setup(context) {
                context.onResolve({ filter: /packages\/core\/src\/index\.js$/ }, () => ({
                  path: './core/index.mjs',
                  external: true,
                }));
              },
            },
          ],
      banner: { js: banner },
      legalComments: 'eof',
      sourcemap: !production,
      logLevel: 'info',
    });
  }
  // Keep the original development MCP command working; there is only one implementation.
  fs.writeFileSync(
    path.join(root, 'workspace/mcp.mjs'),
    "import { runMcp } from './mcp.bundle.mjs'; await runMcp();\n",
  );
}

if (legacyOnly) await legacyModules();
else if (runtimeOnly) await runtime();
else if (extensionOnly) {
  await legacyModules();
  await extension();
} else {
  await legacyModules();
  await extension();
  await runtime();
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'apps/web/vite.config.ts',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('Web build failed.');
}
console.log('TaskVision build complete.');
