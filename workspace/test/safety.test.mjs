import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const coreModule = process.env.TASKVISION_CORE_MODULE || new URL('../core/index.mjs', import.meta.url).href;
const { createWorkspace } = await import(coreModule);

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'taskvision-safety-'));fs.writeFileSync(path.join(root,'main.js'),'// CORE: Entry [tv:id=main]\nexport function main() { return 1; }\n');const w=createWorkspace(root);t.after(()=>{w.close();fs.rmSync(root,{recursive:true,force:true});});return {root,w,run:(op,args={},actor={role:'agent',id:'test'})=>w.dispatch(op,args,actor)};}
const human={role:'human',id:'human'};

test('independent processes racing for a lease yield exactly one winner',async t=>{
  const {root,run}=fixture(t),task=run('task_create',{title:'Concurrent claim',paths:['main.js']}).task;
  const module=coreModule;
  function child(id){return new Promise((resolve,reject)=>{
    const code=`import {createWorkspace} from ${JSON.stringify(module)};const w=createWorkspace(${JSON.stringify(root)});try{const r=w.dispatch('task_claim',{taskId:${JSON.stringify(task.id)},agentId:${JSON.stringify(id)}});console.log(JSON.stringify({ok:true,owner:r.claim.agentId}));}catch(e){console.log(JSON.stringify({ok:false,code:e.code}));}finally{w.close();}`;
    const p=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('exit',exit=>{try{if(exit!==0)throw new Error(err);resolve(JSON.parse(out));}catch(e){reject(e);}});
  });}
  const results=await Promise.all([child('parallel-a'),child('parallel-b')]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'CONFLICT');
  assert.equal(run('snapshot').claims.length,1);
  assert.ok(!JSON.stringify(run('snapshot').claims).includes('token'));
});

test('expired leases are reclaimable and old fencing tokens cannot mutate',t=>{
  const {run}=fixture(t),task=run('task_create',{title:'Expiry',paths:['main.js']}).task;
  const first=run('task_claim',{taskId:task.id,agentId:'a',ttlSeconds:30}).claim;
  const store=new DatabaseSync(run('snapshot').project.storePath);
  // Manipulate only this isolated test database instead of waiting 30 seconds.
  const old=JSON.parse(store.prepare("SELECT data FROM records WHERE kind='claim' AND id=?").get(task.id).data);old.expiresAt=new Date(Date.now()-1000).toISOString();store.prepare("UPDATE records SET data=? WHERE kind='claim' AND id=?").run(JSON.stringify(old),task.id);store.close();
  const next=run('task_claim',{taskId:task.id,agentId:'b'}).claim;
  assert.notEqual(next.token,first.token);
  assert.throws(()=>run('task_heartbeat',{taskId:task.id,agentId:'a',token:first.token}),e=>e.code==='CONFLICT');
});

test('source comment edits cannot inject line breaks or terminate a block comment',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'block.js'),'/* CORE: In block [tv:id=block] */\nexport const x = 1;\n');
  const a=run('snapshot').annotations.find(a=>a.path==='block.js');
  for(const summary of ['text\nrunCode()','text\u2028runCode()','text */ runCode(); /*'])assert.throws(()=>run('edit_source_annotation',{id:a.id,summary,expectedHash:a.fileHash},human),e=>e.code==='INVALID_ARGUMENT');
  assert.match(fs.readFileSync(path.join(root,'block.js'),'utf8'),/In block/);
});

test('CRLF source edits preserve line endings and stable directives',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'crlf.js'),'// REUSE: Original [tv:id=crlf]\r\nexport const n=1;\r\n');
  const a=run('snapshot').annotations.find(a=>a.path==='crlf.js');run('edit_source_annotation',{id:a.id,summary:'Updated',expectedHash:a.fileHash},human);
  assert.equal(fs.readFileSync(path.join(root,'crlf.js'),'utf8'),'// REUSE: Updated [tv:id=crlf]\r\nexport const n=1;\r\n');
});

test('web notes become stale after an anchored file changes',t=>{
  const {root,run}=fixture(t),note=run('annotation_upsert',{tag:'REUSE',summary:'Confirmed function',path:'main.js',line:2},human).annotation;
  fs.appendFileSync(path.join(root,'main.js'),'// changed\n');
  assert.equal(run('snapshot').annotations.find(a=>a.id===note.id).freshness,'stale');
});


test('tracked files that are subsequently gitignored do not leak through snapshots',t=>{
  const {root,run}=fixture(t);
  execFileSync('git',['init','-q',root]);
  fs.writeFileSync(path.join(root,'private.js'),'// CORE: Must remain ignored\n');
  fs.writeFileSync(path.join(root,'.gitignore'),'private.js\n');
  execFileSync('git',['-C',root,'add','-f','private.js']);
  const fresh=createWorkspace(root);t.after(()=>fresh.close());
  assert.ok(!fresh.dispatch('snapshot').files.some(f=>f.path==='private.js'));
  assert.ok(!fresh.dispatch('snapshot').annotations.some(a=>a.summary.includes('Must remain ignored')));
});

test('review fingerprint includes every task scope even when Agent focuses on one file',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'other.js'),'export const original=1;\n');
  const task=run('task_create',{title:'Two scopes',paths:['main.js','other.js']}).task;
  const claim=run('task_claim',{taskId:task.id,agentId:'scope-agent'}).claim;
  const review=run('review_submit',{taskId:task.id,agentId:'scope-agent',token:claim.token,summary:'Focus on main',paths:['main.js']}).review;
  fs.writeFileSync(path.join(root,'other.js'),'export const changed=2;\n');
  assert.throws(()=>run('review_resolve',{reviewId:review.id,decision:'accepted'},human),e=>e.code==='STALE');
});


test('an empty Git repository produces a valid empty workspace',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'taskvision-empty-'));execFileSync('git',['init','-q',root]);
  const w=createWorkspace(root);t.after(()=>{w.close();fs.rmSync(root,{recursive:true,force:true});});
  const s=w.dispatch('snapshot');assert.equal(s.files.length,0);assert.equal(s.annotations.length,0);assert.equal(s.limits.truncated,false);
});
