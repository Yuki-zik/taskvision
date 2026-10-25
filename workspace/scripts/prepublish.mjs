import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url);
function run(args,timeout=120000){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',timeout});if(result.error)throw result.error;if(result.status!==0)throw new Error('Build step failed: '+args.join(' '));}
if(process.env.TASKVISION_PREVIEW_OFFLINE==='1'){
 const icons=require('../../src/codiconNames.js');if(!Array.isArray(icons)||icons.length<100)throw new Error('Committed codicon map is missing or invalid.');
 console.log('Offline preview: using '+icons.length+' committed codicon entries.');
}else run(['buildCodiconNames.js'],30000);
run(['--openssl-legacy-provider','node_modules/webpack/bin/webpack.js','--mode','production']);
run(['workspace/scripts/bundle.mjs']);
