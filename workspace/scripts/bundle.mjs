import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['mcp.mjs'],outfile:path.join(root,'mcp.bundle.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',external:['./core/index.mjs'],legalComments:'eof',banner:{js:"import { createRequire as __taskvisionCreateRequire } from 'node:module'; const require = __taskvisionCreateRequire(import.meta.url);"},logLevel:'info'});
