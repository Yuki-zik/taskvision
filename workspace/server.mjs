import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkspace } from './core/index.mjs';

const PUBLIC=fileURLToPath(new URL('./public/',import.meta.url));
const MUTATIONS=new Set(['annotation_upsert','edit_source_annotation','task_create','review_resolve']);
const CODES={INVALID_ARGUMENT:400,NOT_FOUND:404,CONFLICT:409,FORBIDDEN:403,STALE:409};
const STATIC=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/style.css','style.css'],['/helpers.js','helpers.js']]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function sameToken(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
async function readBody(req){
  const max=128*1024;let size=0;const chunks=[];
  if(Number(req.headers['content-length'])>max){const e=new Error('Request exceeds 128 KiB.');e.status=413;throw e;}
  for await(const chunk of req){size+=chunk.length;if(size>max){const e=new Error('Request exceeds 128 KiB.');e.status=413;throw e;}chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const e=new Error('Invalid JSON body.');e.status=400;throw e;}
}

// INTENT: Loopback-only service. Browser writes need the same-origin session token; local OS users remain trusted.
export async function startServer({root=process.cwd(),port=4317}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid local port.');
  const core=createWorkspace(root),token=crypto.randomBytes(32).toString('hex');
  let address='',actualPort=0;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      const hosts=new Set(['127.0.0.1:'+actualPort,'localhost:'+actualPort]);
      const origins=new Set(['http://127.0.0.1:'+actualPort,'http://localhost:'+actualPort]);
      if(!hosts.has(req.headers.host)||req.headers.origin&&!origins.has(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:{code:'FORBIDDEN',message:'Only same-origin loopback requests are accepted.'}});
      const url=new URL(req.url,address);
      if(req.method==='GET'){
        if(url.pathname==='/api/bootstrap')return json(res,200,{token,snapshot:core.dispatch('snapshot')});
        const reads=new Map([['/api/snapshot','snapshot'],['/api/source','source'],['/api/updates','updates'],['/api/export','export']]);
        if(reads.has(url.pathname)){
          const op=reads.get(url.pathname);const args=op==='source'?{path:url.searchParams.get('path')}:op==='updates'?{after:url.searchParams.has('after')?Number(url.searchParams.get('after')):0}:{};
          if(op==='export')res.setHeader('Content-Disposition','attachment; filename="taskvision-knowledge.json"');
          return json(res,200,core.dispatch(op,args));
        }
        if(STATIC.has(url.pathname)){
          const filename=path.join(PUBLIC,STATIC.get(url.pathname));
          if(!fs.existsSync(filename))return json(res,503,{error:{code:'NOT_READY',message:'Workspace UI is not installed.'}});
          res.writeHead(200,{'Content-Type':MIME[path.extname(filename)],'Cache-Control':'no-cache'});return res.end(fs.readFileSync(filename));
        }
      }
      if(req.method==='POST'&&url.pathname==='/api/operation'){
        if(!sameToken(req.headers['x-taskvision-token'],token))return json(res,403,{error:{code:'FORBIDDEN',message:'Missing or expired workspace token. Reload this page.'}});
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:{code:'INVALID_ARGUMENT',message:'Use application/json.'}});
        const body=await readBody(req);
        if(!body||typeof body!=='object'||!MUTATIONS.has(body.operation))return json(res,400,{error:{code:'INVALID_ARGUMENT',message:'Unsupported browser operation.'}});
        return json(res,200,core.dispatch(body.operation,body.args||{},{role:'human',id:'human'}));
      }
      return json(res,404,{error:{code:'NOT_FOUND',message:'Unknown workspace route.'}});
    }catch(error){return json(res,error.status||CODES[error.code]||500,{error:{code:error.code||'INTERNAL',message:error.code||error.status?error.message:'Workspace operation failed.'}});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=2000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){core.close();throw error;}
  actualPort=server.address().port;address='http://127.0.0.1:'+actualPort+'/';
  let closed=false;
  return {server,url:address,token,async close(){if(closed)return;closed=true;await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});core.close();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const argv=process.argv.slice(2),value=flag=>{const i=argv.indexOf(flag);return i<0?undefined:argv[i+1];};
  try{
    const app=await startServer({root:value('--root')||process.cwd(),port:value('--port')===undefined?4317:Number(value('--port'))});
    console.log(JSON.stringify({ready:true,url:app.url,pid:process.pid}));
    const close=async()=>{await app.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
