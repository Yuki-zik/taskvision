import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServer } from '../server.mjs';

async function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'taskvision-http-'));
  fs.writeFileSync(path.join(root,'main.js'),'// CORE: API fixture entry\nexport const value = 1;\n');
  const app=await startServer({root,port:0});
  t.after(async()=>{await app.close();fs.rmSync(root,{recursive:true,force:true});});
  const bootstrap=await (await fetch(app.url+'api/bootstrap')).json();
  return {root,app,bootstrap,post:body=>fetch(app.url+'api/operation',{method:'POST',headers:{'content-type':'application/json','X-TaskVision-Token':bootstrap.token},body:JSON.stringify(body)})};
}

test('HTTP bootstrap and human writes use the real core',async t=>{
  const {app,bootstrap,post}=await fixture(t);
  assert.ok(bootstrap.snapshot.annotations.some(a=>a.tag==='CORE'));
  const response=await post({operation:'annotation_upsert',args:{tag:'INTENT',summary:'Preserve the API fixture'}});
  assert.equal(response.status,200);
  const saved=await response.json();assert.equal(saved.annotation.author,'human:human');
  const snapshot=await (await fetch(app.url+'api/snapshot')).json();
  assert.ok(snapshot.annotations.some(a=>a.id===saved.annotation.id));
});

test('HTTP rejects missing CSRF token, foreign origins/hosts, invalid JSON and large bodies',async t=>{
  const {app,bootstrap}=await fixture(t);
  const body=JSON.stringify({operation:'annotation_upsert',args:{tag:'INTENT',summary:'bad'}});
  assert.equal((await fetch(app.url+'api/operation',{method:'POST',headers:{'content-type':'application/json'},body})).status,403);
  assert.equal((await fetch(app.url+'api/bootstrap',{headers:{origin:'https://hostile.example'}})).status,403);
  const hostileHostStatus=await new Promise((resolve,reject)=>{const req=http.get(app.url+'api/bootstrap',{headers:{Host:'hostile.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(hostileHostStatus,403);
  assert.equal((await fetch(app.url+'api/source?path=..%2Foutside.js')).status,403);
  const headers={'content-type':'application/json','X-TaskVision-Token':bootstrap.token};
  assert.equal((await fetch(app.url+'api/operation',{method:'POST',headers,body:'{broken'})).status,400);
  assert.equal((await fetch(app.url+'api/operation',{method:'POST',headers,body:'x'.repeat(140000)})).status,413);
});

test('MCP initializes, lists tools and reads Web guidance without restart',async t=>{
  const {root,post}=await fixture(t);
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp.mjs',import.meta.url)),'--root',root],stderr:'pipe'});
  const client=new Client({name:'taskvision-acceptance',version:'1.0.0'});
  await client.connect(transport);t.after(()=>client.close());
  const list=await client.listTools();
  assert.ok(list.tools.some(t=>t.name==='taskvision_context'));
  assert.ok(!list.tools.some(t=>t.name==='taskvision_review_resolve'||t.name==='taskvision_edit_source_annotation'));
  await post({operation:'annotation_upsert',args:{tag:'INTENT',summary:'HUMAN_INTENT_MCP_ROUNDTRIP'}});
  const reply=await client.callTool({name:'taskvision_context',arguments:{query:'HUMAN_INTENT_MCP_ROUNDTRIP'}});
  assert.equal(reply.isError,undefined);
  assert.ok(JSON.stringify(reply).includes('HUMAN_INTENT_MCP_ROUNDTRIP'));
  const proposal=await client.callTool({name:'taskvision_annotation_upsert',arguments:{tag:'REUSE',summary:'Proposed via MCP',role:'human'}});
  assert.ok(JSON.stringify(proposal).includes('proposed'));
});
