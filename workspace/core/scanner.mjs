import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const parser = require('../../src/annotationParser.js');

export const TAGS = ['CORE', 'REUSE', 'INTENT', 'REVIEW', 'TODO'];
export const MAX_SOURCE = 512 * 1024;
const EXTENSIONS = new Set(['.js','.mjs','.cjs','.jsx','.ts','.tsx','.py','.rs','.go','.java','.c','.h','.cc','.cpp','.hpp','.cs','.swift','.kt','.sh','.bash','.zsh','.rb','.php','.vue','.svelte','.html','.css','.scss','.md','.mdx','.json','.jsonc','.yaml','.yml','.toml','.sql','.v','.sv','.vh','.svh','.txt']);
const EXCLUDED = new Set(['.git','.taskvision','node_modules','vendor','dist','build','out','target','coverage','__pycache__','.venv','venv','.next','.cache','.idea','.vscode','.codex','.agents','.claude']);
const SECRET = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\..*)?)$|\.(?:pem|key|p12|pfx|keystore)$/i;
export function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
export function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function git(root, args, fallback = '') {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return fallback; }
}
export function projectInfo(root) {
  const canonical = fs.realpathSync(root);
  if (!fs.statSync(canonical).isDirectory()) fail('INVALID_ARGUMENT', 'Project root must be a directory.');
  const common = git(canonical, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const repo = git(canonical, ['rev-parse', '--show-toplevel']);
  // CORE: Each checkout has its own source index; Git worktrees share coordination storage.
  return { name: path.basename(canonical), root: canonical, branch: git(canonical, ['branch', '--show-current']), head: git(canonical, ['rev-parse', 'HEAD']), workspaceId: digest(canonical).slice(0, 20), storePath: path.join(common || path.join(canonical, '.taskvision'), common ? 'taskvision' : '', 'workspace.sqlite'), isGit: !!repo };
}
function blocked(relative) {
  const pieces = relative.split('/');
  return pieces.some(piece => EXCLUDED.has(piece) || SECRET.test(piece) || piece === '..' || piece === '.') || pieces.some(p => p.startsWith('.') && p !== '.github' && p !== '.gitignore');
}
export function normalizePath(value, { empty = false } = {}) {
  if (typeof value !== 'string' || value.includes('\0') || value.includes('\\') || value.length > 1024) fail('INVALID_ARGUMENT', 'Expected a repository-relative POSIX path.');
  if (!value && empty) return '';
  if (!value || path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..')) fail('FORBIDDEN', 'Path must stay inside the project.');
  if (blocked(value)) fail('FORBIDDEN', 'This path is excluded from the knowledge workspace.');
  return value;
}
export function safePath(project, relative, { directory = false, allowMissing = false, checkIgnore = true } = {}) {
  const clean = normalizePath(relative);
  let current = project.root;
  const parts = clean.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT' && allowMissing && i === parts.length - 1) return current;
      fail('NOT_FOUND', 'Project path does not exist.');
    }
    if (stat.isSymbolicLink()) fail('FORBIDDEN', 'Symbolic links are not exposed.');
    if (i < parts.length - 1 && !stat.isDirectory()) fail('NOT_FOUND', 'Parent path is not a directory.');
    if (i === parts.length - 1 && !(stat.isFile() || (directory && stat.isDirectory()))) fail('FORBIDDEN', 'Unsupported project entry.');
  }
  if (checkIgnore && project.isGit) {
    const ignored = git(project.root, ['check-ignore', '--no-index', '--', clean]);
    if (ignored) fail('FORBIDDEN', 'Ignored files are not exposed.');
  }
  if (!directory && !EXTENSIONS.has(path.extname(clean).toLowerCase()) && !['Dockerfile','Makefile','LICENSE'].includes(path.basename(clean))) fail('FORBIDDEN', 'Unsupported source format.');
  return current;
}
export function readSource(project, relative, opts = {}) {
  const filename = safePath(project, relative, opts);
  // O_NOFOLLOW closes the final-component symlink race. Same-user filesystem writers remain trusted.
  let fd;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_SOURCE) fail('FORBIDDEN', 'Source is not a regular text file or exceeds 512 KiB.');
    const bytes = fs.readFileSync(fd);
    if (bytes.length > MAX_SOURCE || bytes.includes(0)) fail('FORBIDDEN', 'Binary or oversized source is not exposed.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path: relative, text, hash: digest(bytes), lines: text.split(/\r?\n/).length };
  } catch (error) {
    if (error.code && ['FORBIDDEN','NOT_FOUND','INVALID_ARGUMENT'].includes(error.code)) throw error;
    fail('FORBIDDEN', 'Cannot safely read this source file.');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function fileList(project, maxFiles) {
  const candidates = [];
  let capped = false;
  if (project.isGit) {
    let raw;
    try { raw = execFileSync('git', ['-C', project.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore'] }); }
    catch { fail('INVALID_ARGUMENT', 'Git file inventory exceeded the scan budget or failed.'); }
    const inventory=[...new Set(raw.split('\0').filter(Boolean))];
    // Git ls-files includes tracked-but-now-ignored files; exclude them from all index surfaces too.
    const check=inventory.length ? spawnSync('git',['-C',project.root,'check-ignore','--no-index','--stdin','-z'],{input:inventory.join('\0')+'\0',encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024}) : {status:1,stdout:''};
    if(check.error || ![0,1].includes(check.status))fail('INVALID_ARGUMENT','Cannot validate ignored project paths.');
    const ignored=new Set((check.stdout||'').split('\0').filter(Boolean));
    candidates.push(...inventory.filter(file=>!ignored.has(file)));
  } else {
    let visited = 0;
    function walk(dir, prefix = '') {
      for (const item of fs.readdirSync(dir, { withFileTypes:true }).sort((a,b) => a.name.localeCompare(b.name))) {
        if (++visited > 20000) { capped = true; return; }
        const relative = prefix ? prefix + '/' + item.name : item.name;
        if (blocked(relative) || item.isSymbolicLink()) continue;
        if (item.isDirectory()) walk(path.join(dir,item.name),relative);
        else if (item.isFile()) candidates.push(relative);
        if (capped) return;
      }
    }
    walk(project.root);
  }
  const filtered = candidates.filter(p => !blocked(p) && (EXTENSIONS.has(path.extname(p).toLowerCase()) || ['Dockerfile','Makefile','LICENSE'].includes(path.basename(p)))).sort();
  return { paths:filtered.slice(0,maxFiles), truncated:capped || filtered.length > maxFiles };
}
// A conservative standalone-comment scanner, not a language server or full AST parser.
function commentAt(line, ext, state) {
  if (state.longString) {
    const at = line.indexOf(state.longString);
    if (at >= 0) state.longString = null;
    return null;
  }
  if (state.block) {
    const end = line.indexOf('*/');
    if (end >= 0) state.block = false;
    const match = /^(\s*\*?\s*)(.*?)(\s*\*\/.*)?$/.exec(line);
    return match ? { prefix:match[1],body:match[2],suffix:match[3] || '' } : null;
  }
  const prefixes = ['.py','.sh','.bash','.zsh','.rb','.yaml','.yml','.toml'].includes(ext) ? /^(\s*#\s*)(.*)$/ : ['.sql'].includes(ext) ? /^(\s*--\s*)(.*)$/ : ['.md','.mdx','.html'].includes(ext) ? /^(\s*<!--\s*)(.*?)(\s*-->\s*)?$/ : /^(\s*(?:\/\/|\/\*)\s*)(.*?)(\s*\*\/\s*)?$/;
  const match = prefixes.exec(line);
  if (match) {
    if (match[1].includes('/*') && !line.includes('*/')) state.block = true;
    return { prefix:match[1],body:match[2],suffix:match[3] || '' };
  }
  if (ext === '.py') {
    const m = /('''|""")/.exec(line);
    if (m && line.indexOf(m[1],m.index+3) < 0) state.longString=m[1];
  } else if (['.js','.mjs','.cjs','.jsx','.ts','.tsx'].includes(ext)) {
    let quote = null;
    for (let i=0;i<line.length;i++) {
      const c=line[i];
      if(c==='\\') { i++; continue; }
      if(quote) { if(c===quote)quote=null; continue; }
      if(c==='/' && line[i+1]==='/') break;
      if(c==='/' && line[i+1]==='*') { const end=line.indexOf('*/',i+2); if(end<0){state.block=true;break;}i=end+1;continue; }
      if(c==='"'||c==="'"||c==='`') quote=c;
    }
    if(quote==='`') state.longString='`';
  }
  return null;
}
function annotate(source, project) {
  const annotations=[],symbols=[], imports=[], counts=new Map(), state={};
  const ext=path.extname(source.path).toLowerCase();
  const lines=source.text.split(/\r?\n/);
  for (let i=0;i<lines.length;i++) {
    const line=lines[i], comment=commentAt(line,ext,state);
    if (comment) {
      const match=/^(CORE|REUSE|INTENT|REVIEW|TODO|FIXME|NOTE)\b\s*:?\s*(.*)$/i.exec(comment.body);
      if (match) {
        const original=match[1].toUpperCase(), parsed=parser.parseDirectives(match[2],original);
        let tag=original;
        if(tag==='NOTE') tag=parsed.reviewKind?'REVIEW':parsed.contextKind==='entrypoint'||parsed.contextKind==='must-read'?'CORE':parsed.contextKind==='reusable'||parsed.contextKind==='example'?'REUSE':parsed.contextKind?'INTENT':null;
        if(tag==='FIXME')tag='TODO';
        if(tag){
          const status=/^\[(todo|doing|blocked|paused|review|done|wontdo|idea)\]\s*/i.exec(parsed.trimmedText);
          const summary=parsed.trimmedText.replace(/^\[(todo|doing|blocked|paused|review|done|wontdo|idea)\]\s*/i,'').trim();
          const key=source.path+'|'+(parsed.stableId || tag+'|'+summary), ordinal=counts.get(key)||0;counts.set(key,ordinal+1);
          annotations.push({id:'src.'+digest(project.workspaceId+'|'+key+'|'+ordinal).slice(0,24),tag,summary,body:'',path:source.path,line:i+1,endLine:i+1,origin:'source',author:'source',status:status?.[1]==='done'?'resolved':tag==='REVIEW'?'needs-review':'active',revision:1,fileHash:source.hash,freshness:'current',contextKind:parsed.contextKind,stableId:parsed.stableId,sourcePrefix:comment.prefix,sourceTag:original,sourceSuffix:comment.suffix,directives:parsed.rawTokens,inlineStatus:status?.[0]||''});
        }
      }
    }
    if (!comment && !state.longString && !state.block) {
      let match=/^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|def|fn|module)\s+([\w$]+)/.exec(line);
      if(!match)match=/^\s*(?:export\s+)?(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/.exec(line);
      if(match)symbols.push({name:match[1],line:i+1,kind:'lexical-symbol'});
      const imp=/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/.exec(line);
      if(imp)imports.push(imp[1]);
    }
  }
  return {annotations,symbols,imports};
}
export function scan(project, maxFiles=2000) {
  const list=fileList(project,maxFiles),files=[],annotations=[],edges=[],hashes={},pending=[];
  for(const relative of list.paths){
    let source;try{source=readSource(project,relative,{checkIgnore:false});}catch{continue;}
    hashes[relative]=source.hash;
    const found=annotate(source,project);annotations.push(...found.annotations);
    files.push({path:relative,language:path.extname(relative).slice(1)||'text',lines:source.lines,tags:[...new Set(found.annotations.map(a=>a.tag))],annotationCount:found.annotations.length,symbols:found.symbols});
    pending.push({path:relative,imports:found.imports});
  }
  const paths=new Set(files.map(f=>f.path));
  for(const item of pending)for(const imp of item.imports){
    const base=path.posix.normalize(path.posix.join(path.posix.dirname(item.path),imp));
    const target=[base,base+'.js',base+'.mjs',base+'.ts',base+'.tsx',base+'/index.js',base+'/index.ts',base+'.py'].find(x=>paths.has(x));
    if(target)edges.push({from:item.path,to:target,kind:'import',provenance:'lexical-static-import'});
  }
  return {files,annotations,edges,hashes,limits:{truncated:list.truncated,scannedFiles:files.length,maxFiles}};
}
export function patchSourceAnnotation(project, annotation, summary, expectedHash) {
  const source=readSource(project,annotation.path);
  if(source.hash!==expectedHash)fail('STALE','Source changed. Reload before editing this annotation.');
  if(/[\r\n\u2028\u2029]/.test(summary))fail('INVALID_ARGUMENT','A source annotation must stay on one line.');
  const ending=source.text.includes('\r\n')?'\r\n':'\n',lines=source.text.split(/\r?\n/);
  const current=annotate(source,project).annotations.find(a=>a.id===annotation.id);
  if(!current)fail('STALE','Annotation moved or changed. Reload its anchor.');
  if((current.sourcePrefix.includes('/*') || current.sourceSuffix.includes('*/')) && summary.includes('*/') || (current.sourcePrefix.includes('<!--') || current.sourceSuffix.includes('-->')) && summary.includes('-->'))fail('INVALID_ARGUMENT','Annotation text cannot terminate its comment.');
  const tail=current.directives.length?' '+current.directives.join(' '):'';
  lines[current.line-1]=current.sourcePrefix+current.sourceTag+': '+current.inlineStatus+summary+tail+current.sourceSuffix;
  const filename=safePath(project,current.path),temp=filename+'.taskvision-'+crypto.randomUUID()+'.tmp';
  try{
    const mode=fs.statSync(filename).mode;
    fs.writeFileSync(temp,lines.join(ending),{flag:'wx',mode});
    if(readSource(project,current.path).hash!==expectedHash)fail('STALE','Source changed during the edit.');
    fs.renameSync(temp,filename);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return {path:current.path,line:current.line};
}
