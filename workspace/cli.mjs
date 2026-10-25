#!/usr/bin/env node
import { createWorkspace } from './core/index.mjs';

const argv=process.argv.slice(2),rootIndex=argv.indexOf('--root');
let root=process.cwd();
if(rootIndex>=0){root=argv[rootIndex+1];argv.splice(rootIndex,2);}
const operation=argv[0]||'snapshot';
const allowed=new Set(['snapshot','context','source','annotation_upsert','task_create','task_claim','task_heartbeat','task_release','review_submit','updates','export']);
let workspace;
try{
  if(!allowed.has(operation))throw new Error('Unknown or human-only operation. Human decisions belong in the Web workspace.');
  const args=argv[1]?JSON.parse(argv[1]):{};
  workspace=createWorkspace(root);
  console.log(JSON.stringify(workspace.dispatch(operation,args,{role:'agent',id:'cli'}),null,2));
}catch(error){console.error(JSON.stringify({error:{code:error.code||'INVALID_ARGUMENT',message:error.message}}));process.exitCode=1;}
finally{workspace?.close();}
