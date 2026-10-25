import { context } from 'esbuild';
const build = await context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});
await build.watch();
console.log('Watching TypeScript extension sources.');
