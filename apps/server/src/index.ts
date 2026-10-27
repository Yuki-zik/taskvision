import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './server.js';
export { startServer } from './server.js';
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  try {
    const app = await startServer({
      root: option('--root') ?? process.cwd(),
      port: option('--port') === undefined ? 4317 : Number(option('--port')),
    });
    console.log(JSON.stringify({ ready: true, url: app.url, pid: process.pid, version: '3.6.0' }));
    const close = async (): Promise<void> => {
      await app.close();
      process.exit(0);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
