import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
export { createMcpServer } from './server.js';
export async function runMcp(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf('--root');
  const root = index < 0 ? process.cwd() : args[index + 1];
  if (!root) throw new Error('Missing --root value.');
  const app = createMcpServer(root, process.env.TASKVISION_AGENT_ID ?? 'mcp');
  try {
    await app.server.connect(new StdioServerTransport());
    const close = async (): Promise<void> => {
      await app.close();
      process.exit(0);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    process.stdin.once('end', () => {
      void app.close();
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await app.close();
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await runMcp();
