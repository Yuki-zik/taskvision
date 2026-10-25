const $=selector=>document.querySelector(selector);
const state={snapshot:null,token:'',tab:'map',tag:'',query:'',selectedPath:'',selectedLine:1,source:null,edit:null,busy:false,failures:0};
const names={map:['项目知识地图','从项目结构找到关键实现，把意图传给下一位开发者。'],knowledge:['语义知识索引','把源码标记、历史复用经验与人类指导放在同一处。'],review:['人工审阅队列','聚焦关键逻辑，检查证据，再对当前代码版本作出判断。'],coordination:['多 Agent 协作','查看任务范围、依赖和租约；避免并行开发重复或相互覆盖。']};
const statusNames={active:'已记录',proposed:'Agent 提议',resolved:'已解决','needs-review':'待审阅',current:'当前',stale:'代码已变化',missing:'锚点缺失',pending:'待人工确认',accepted:'已验收','changes-requested':'要求修改',todo:'待认领',doing:'开发中',review:'待验收',done:'已完成'};
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;}
function button(text,action,cls=''){const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;}
function empty(title,description){const d=el('div','empty-state');d.append(el('h3','',title),el('p','',description));return d;}
function badge(tag){return el('span','tag '+tag.toLowerCase(),tag);}
function error(message){$('#error-banner').hidden=!message;$('#error-banner').textContent=message||'';}
function toast(message){const node=$('#toast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,3500);}
async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options});let body;try{body=await response.json();}catch{throw new Error('服务返回了无效响应，请查看本地服务日志。');}if(!response.ok){const e=new Error(body.error?.message||'请求失败');e.code=body.error?.code;throw e;}return body;}
async function mutate(operation,args){return request('/api/operation',{method:'POST',headers:{'content-type':'application/json','X-TaskVision-Token':state.token},body:JSON.stringify({operation,args})});}
function match(annotation){return (!state.tag||annotation.tag===state.tag)&&(!state.query||(annotation.summary+' '+annotation.body+' '+annotation.path+' '+annotation.tag).toLowerCase().includes(state.query));}
function filtered(){return state.snapshot.annotations.filter(match);}
function pathLabel(annotation){return annotation.path?annotation.path+':'+annotation.line:'项目级指导';}
function section(title,meta){const node=el('div','section-heading');node.append(el('h3','',title));if(meta)node.append(el('span','',meta));return node;}
function knowledgeCard(annotation,inspector=false){
  const card=el('article','knowledge-card');const top=el('div','card-top');
  top.append(badge(annotation.tag),el('span','origin',annotation.origin==='source'?'源码注释':annotation.origin==='legacy'?'历史导入':'共享知识'));
  const flag=annotation.freshness!=='current'?annotation.freshness:annotation.status;
  top.append(el('span','state '+flag,statusNames[flag]||flag));
  if(inspector){const edit=button(annotation.origin==='source'?'编辑注释':annotation.origin==='legacy'?'另存为指导':'编辑',event=>{event.stopPropagation();openNote(annotation);},'edit');top.append(edit);}
  card.append(top,el('h4','',annotation.summary),el('div','code-location',pathLabel(annotation)));
  if(inspector&&annotation.body)card.append(el('p','note-body',annotation.body));
  if(!inspector){card.tabIndex=0;card.addEventListener('click',()=>selectAnnotation(annotation));card.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();selectAnnotation(annotation);}});}
  return card;
}
function renderTree(){
  const root=$('#file-tree');root.replaceChildren();const groups=new Map();
  const relevant=new Set(filtered().map(a=>a.path));
  const files=state.snapshot.files.filter(f=>(!state.tag||relevant.has(f.path))&&(!state.query||f.path.toLowerCase().includes(state.query)||relevant.has(f.path)));
  for(const file of files){const split=file.path.lastIndexOf('/');const group=split<0?'根目录':file.path.slice(0,split);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(file);}
  for(const [name,files] of groups){
    const group=el('details','tree-group');group.open=groups.size<=6||files.some(f=>f.path===state.selectedPath)||files.some(f=>f.annotationCount>0);
    group.append(el('summary','',name));
    for(const file of files){const b=button('',()=>selectFile(file.path),'tree-file'+(file.path===state.selectedPath?' selected':''));b.title=file.path;b.append(el('span','file-icon','◇'),el('span','filename',file.path.split('/').at(-1)));if(file.annotationCount)b.append(el('span','tiny-count',file.annotationCount));group.append(b);}
    root.append(group);
  }
  if(!files.length)root.append(el('p','muted','没有匹配的文件'));
}
function svgEl(tag,attributes={},text){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=String(text);return node;}
function makeMap(){
  const panel=el('div','map-panel');const files=state.snapshot.files,groups=new Map();
  const candidateFiles=state.tag||state.query?files.filter(f=>filtered().some(a=>a.path===f.path)):files;
  for(const file of candidateFiles){const name=file.path.includes('/')?file.path.split('/')[0]:'根目录';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(file);}
  const nodes=[...groups].sort((a,b)=>b[1].reduce((s,f)=>s+f.annotationCount,0)-a[1].reduce((s,f)=>s+f.annotationCount,0)).slice(0,12);
  if(!nodes.length){panel.append(empty('还没有可展示的模块','添加 CORE / REUSE / INTENT / REVIEW 源码注释或网页指导。'));return panel;}
  const width=690,cols=nodes.length<=2?2:3,nodeWidth=187,gap=32,pad=28,nodeHeight=104,rowGap=50,height=Math.ceil(nodes.length/cols)*(nodeHeight+rowGap)+pad;
  const svg=svgEl('svg',{viewBox:`0 0 ${width} ${Math.max(220,height)}`,role:'img','aria-label':'项目目录与静态依赖地图'});
  const defs=svgEl('defs'),marker=svgEl('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#b9c5d8'}));defs.append(marker);svg.append(defs);
  const positions=new Map(nodes.map(([name],i)=>[name,{x:pad+(i%cols)*(nodeWidth+gap),y:pad+Math.floor(i/cols)*(nodeHeight+rowGap)}]));
  const edges=new Set();
  for(const edge of state.snapshot.edges){const a=edge.from.includes('/')?edge.from.split('/')[0]:'根目录',b=edge.to.includes('/')?edge.to.split('/')[0]:'根目录';if(a!==b&&positions.has(a)&&positions.has(b))edges.add(a+'\0'+b);}
  for(const key of edges){const [a,b]=key.split('\0'),p=positions.get(a),q=positions.get(b),x1=p.x+nodeWidth/2,y1=p.y+nodeHeight,x2=q.x+nodeWidth/2,y2=q.y;svg.append(svgEl('path',{class:'map-edge',d:`M ${x1} ${y1} C ${x1} ${y1+28}, ${x2} ${y2-28}, ${x2} ${y2}`,'marker-end':'url(#arrow)'}));}
  for(const [name,items]of nodes){
    const p=positions.get(name),group=svgEl('g',{class:'map-node',tabindex:0,role:'button','aria-label':`查看 ${name} 模块`,transform:`translate(${p.x},${p.y})`});
    group.append(svgEl('rect',{width:nodeWidth,height:nodeHeight,rx:4}),svgEl('text',{x:15,y:26,class:'node-label'},name.length>19?name.slice(0,17)+'…':name),svgEl('text',{x:15,y:47,class:'node-meta'},items.length+' 个文件 · '+items.reduce((n,f)=>n+f.annotationCount,0)+' 个源码标记'));
    const counts={CORE:0,REUSE:0,INTENT:0,REVIEW:0};for(const a of state.snapshot.annotations){if(items.some(f=>f.path===a.path)&&a.tag in counts)counts[a.tag]++;}
    group.append(svgEl('text',{x:15,y:70,class:'node-tags'},`CORE ${counts.CORE}   REUSE ${counts.REUSE}`),svgEl('text',{x:15,y:87,class:'node-tags'},`INTENT ${counts.INTENT}   REVIEW ${counts.REVIEW}`));
    const click=()=>selectFile([...items].sort((a,b)=>b.annotationCount-a.annotationCount)[0].path);group.addEventListener('click',click);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click();}});svg.append(group);
  }
  panel.append(svg);return panel;
}
function renderMap(container){
  container.append(section('项目结构','目录分组 / 点击定位源码'),makeMap(),el('p','map-note','显示目录与可解析的静态 import 关系，最多 12 个模块；这是一张轻量结构地图，不代表完整调用图。'));
  if(state.snapshot.limits.truncated)container.append(el('div','notice','项目超过扫描预算，当前展示部分文件。完整 Review 指纹检查会拒绝截断结果。'));
  const entries=filtered().filter(a=>['CORE','INTENT','REUSE','REVIEW'].includes(a.tag)).sort((a,b)=>['INTENT','CORE','REUSE','REVIEW'].indexOf(a.tag)-['INTENT','CORE','REUSE','REVIEW'].indexOf(b.tag)).slice(0,12);
  container.append(section('优先阅读','意图 → 核心 → 复用 → 审阅'));
  const grid=el('div','core-grid');entries.forEach(a=>grid.append(knowledgeCard(a)));container.append(entries.length?grid:empty('把重要理解留在代码旁','用标签标记关键逻辑，或点击“添加指导”为项目注入开发约束。'));
}
function renderKnowledge(container){const entries=filtered();container.append(section('源码与共享知识',entries.length+' 条'));const list=el('div','knowledge-list');entries.forEach(a=>list.append(knowledgeCard(a)));container.append(entries.length?list:empty('没有匹配的知识','更换筛选条件，或添加一条人类指导。'));}
function renderReviews(container){
  const pending=state.snapshot.reviews.filter(r=>r.status==='pending');
  const hotspots=filtered().filter(a=>a.tag==='REVIEW');
  container.append(el('div','notice','验收绑定当前 worktree、Git 提交和代码指纹。测试记录由 Agent 报告，仍需人工判断；代码变化后必须重新提交。'));
  container.append(section('等待人工决策',pending.length+' 项'));
  for(const review of pending){
    const item=el('article','review-entry');const task=state.snapshot.tasks.find(t=>t.id===review.taskId);
    item.append(el('div','card-top','PENDING REVIEW'),el('h3','',task?.title||review.taskId),el('p','',review.summary));
    const paths=el('div');review.paths.forEach(p=>paths.append(button(p,()=>selectFile(p),'scope-button')));item.append(paths);
    item.append(el('div','evidence','Agent 提供的证据（未自动核验）\n'+(review.evidence.length?review.evidence.join('\n'):'未附测试证据')));
    const note=el('textarea');note.placeholder='人工意见或要求修改的原因';note.setAttribute('aria-label','审阅意见');item.append(note);
    const actions=el('div','review-actions');
    for(const [decision,label,cls]of [['accepted','验收通过','primary'],['changes-requested','要求修改','']])actions.append(button(label,async event=>{
      event.currentTarget.disabled=true;try{await mutate('review_resolve',{reviewId:review.id,decision,note:note.value});toast('人工审阅意见已保存');await refresh(true);}catch(e){error(e.message);event.currentTarget.disabled=false;}
    },cls));
    item.append(actions,el('div','task-id',review.id));container.append(item);
  }
  if(!pending.length)container.append(empty('当前没有待验收交付','Agent 可通过 MCP 提交任务成果、代码范围和测试证据。'));
  container.append(section('关键逻辑阅读点',hotspots.length+' 处'));
  for(const annotation of hotspots)container.append(knowledgeCard(annotation));
}
function renderCoordination(container){
  const heading=section('任务与认领范围',state.snapshot.claims.length+' 个有效租约');heading.append(button('＋ 创建任务',openTask,'primary'));container.append(heading);
  container.append(el('div','notice','同一 Git 仓库的 worktree 共享任务与租约。范围认领属于协作约定，不会阻止外部进程直接改文件。'));
  for(const task of state.snapshot.tasks){
    if(state.query&&!(task.title+' '+task.description+' '+task.paths.join(' ')).toLowerCase().includes(state.query))continue;
    const item=el('article','task-entry'),top=el('div','card-top');top.append(el('span','tag '+(task.status==='review'?'review':task.status==='done'?'reuse':'core'),statusNames[task.status]));
    const claim=state.snapshot.claims.find(c=>c.taskId===task.id);if(claim)top.append(el('span','origin',claim.agentId));
    item.append(top,el('h3','',task.title));if(task.description)item.append(el('p','',task.description));
    const scopes=el('div');task.paths.forEach(p=>scopes.append(button(p,()=>selectFile(p),'scope-button')));item.append(scopes);
    const meta=el('div','task-meta');meta.append(el('span','',claim?'租约至 '+new Date(claim.expiresAt).toLocaleTimeString():task.status==='doing'?'租约已失效，可重新认领':'暂无有效认领'),el('span','',task.dependsOn.length?'依赖 '+task.dependsOn.length+' 个任务':'无前置依赖'));item.append(meta,el('div','task-id',task.id));container.append(item);
  }
  if(!state.snapshot.tasks.length)container.append(empty('还没有协作任务','创建一个明确的开发目标和代码范围，Agent 即可通过 MCP 认领。'));
}
function renderContent(){
  const container=$('#content');const scroll=container.scrollTop;container.replaceChildren();
  ({map:renderMap,knowledge:renderKnowledge,review:renderReviews,coordination:renderCoordination})[state.tab](container);container.scrollTop=scroll;
}
function renderHeader(){
  const snap=state.snapshot;$('#project-name').textContent=snap.project.name;$('#branch').textContent=(snap.project.branch||'本地目录')+(snap.project.head?' · '+snap.project.head.slice(0,7):'');$('#branch').title=snap.project.root;
  $('#file-count').textContent=snap.files.length+' files';$('#knowledge-count').textContent=snap.annotations.length;$('#review-count').textContent=snap.reviews.filter(r=>r.status==='pending').length;$('#task-count').textContent=snap.tasks.filter(t=>t.status!=='done').length;$('#revision').textContent='r'+snap.revision;
  const [title,description]=names[state.tab];$('#view-title').textContent=title;$('#view-description').textContent=description;
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-selected',String(b.dataset.tab===state.tab));});
  document.querySelectorAll('[data-tag]').forEach(b=>b.classList.toggle('selected',b.dataset.tag===state.tag));
}
function renderInspector(){
  const container=$('#inspector-body');container.replaceChildren();
  if(!state.selectedPath){$('#inspector-title').textContent='项目级指导';const notes=state.snapshot.annotations.filter(a=>!a.path);for(const a of notes)container.append(knowledgeCard(a,true));if(!notes.length)container.append(empty('选择一个模块或标签','在项目地图上选择文件，阅读关键逻辑并留下指导。'));return;}
  $('#inspector-title').textContent=state.selectedPath.split('/').at(-1);container.append(el('div','inspector-path',state.selectedPath));
  const notes=state.snapshot.annotations.filter(a=>a.path===state.selectedPath).sort((a,b)=>a.line-b.line);
  for(const a of notes)container.append(knowledgeCard(a,true));
  if(!notes.length)container.append(el('p','muted','这个文件尚未标记。可添加核心入口、复用边界或审阅重点。'));
  const heading=el('div','source-heading');heading.append(el('span','','源代码 · 只读预览'));
  const link=el('a','','在 VS Code 中打开');link.href='vscode://file/'+state.snapshot.project.root.replace(/^\//,'').split('/').map(encodeURIComponent).join('/')+'/'+state.selectedPath.split('/').map(encodeURIComponent).join('/')+':'+state.selectedLine;heading.append(link);container.append(heading);
  if(!state.source||state.source.path!==state.selectedPath){container.append(el('p','muted','正在读取源码…'));return;}
  const box=el('div','source-block'),list=el('ol','source-lines');const lines=state.source.text.split(/\r?\n/);const start=Math.max(0,state.selectedLine-18),end=Math.min(lines.length,start+180);list.start=start+1;
  for(let i=start;i<end;i++){const line=el('li','',lines[i]||' ');line.dataset.line=String(i+1);if(notes.some(a=>a.line===i+1))line.classList.add('marked');if(i+1===state.selectedLine)line.classList.add('focused');list.append(line);}box.append(list);container.append(box);if(end<lines.length)container.append(el('p','muted',`显示 ${start+1}–${end} 行，共 ${lines.length} 行。完整文件可在 VS Code 中阅读。`));
}
async function selectFile(relative,line=1){
  let file=state.snapshot.files.find(f=>f.path===relative);if(!file)file=state.snapshot.files.find(f=>f.path.startsWith(relative+'/'));
  if(!file){error('当前扫描中找不到这个文件。');return;}
  state.selectedPath=file.path;state.selectedLine=line;state.source=null;renderTree();renderInspector();
  try{const source=await request('/api/source?path='+encodeURIComponent(file.path));if(state.selectedPath!==source.path)return;state.source=source;renderInspector();}catch(e){error(e.message);}
}
function selectAnnotation(annotation){if(annotation.path)selectFile(annotation.path,annotation.line);else{state.selectedPath='';renderTree();renderInspector();}}
function openNote(annotation=null){
  state.edit=annotation?.origin==='legacy'?null:annotation;
  const source=annotation?.origin==='source';$('#note-dialog-title').textContent=source?'修改源码注释':annotation?'编辑共享知识':'添加项目指导';
  $('#note-form-hint').textContent=source?'只改这一行的注释正文，保留标签与 tv: 指令。源文件已变化时会拒绝覆盖。':'保存到共享知识库；Agent 下次查询即可读取。不会自动改写源代码。';
  $('#note-tag').value=annotation?.tag==='TODO'?'INTENT':annotation?.tag||'INTENT';$('#note-tag').disabled=source;$('#note-summary').value=annotation?.summary||'';$('#note-body').value=annotation?.body||'';$('#note-path').value=annotation?.path??state.selectedPath;$('#note-line').value=annotation?.line||state.selectedLine||1;
  $('#note-anchor-fields').hidden=source;$('#note-body-label').hidden=source;$('#note-error').textContent='';$('#note-dialog').showModal();$('#note-summary').focus();
}
function openTask(){$('#task-form').reset();$('#task-paths').value=state.selectedPath;$('#task-error').textContent='';$('#task-dialog').showModal();$('#task-title').focus();}
async function refresh(force=false){
  if(state.busy){state.refreshQueued=state.refreshQueued||force;return;}state.busy=true;
  try{
    let snap;if(!state.token){const data=await request('/api/bootstrap');state.token=data.token;snap=data.snapshot;}else snap=await request('/api/snapshot');
    const changed=!state.snapshot||snap.revision!==state.snapshot.revision;state.snapshot=snap;state.failures=0;$('#connection').textContent='● 已连接 · 本地实时索引';
    renderHeader();
    const editing=document.querySelector('dialog[open]')||document.activeElement?.tagName==='TEXTAREA';
    if((changed||force)&&!editing){renderTree();renderContent();if(state.selectedPath){try{state.source=await request('/api/source?path='+encodeURIComponent(state.selectedPath));}catch{state.source=null;}}renderInspector();}
    if(!$('#project-paths').children.length){for(const file of snap.files){const option=el('option');option.value=file.path;$('#project-paths').append(option);}}
  }catch(e){state.failures++;$('#connection').textContent='连接中断';error(e.message);}finally{state.busy=false;if(state.refreshQueued){state.refreshQueued=false;queueMicrotask(()=>refresh(true));}}
}
$('#note-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;$('#note-error').textContent='';
  try{
    if(state.edit?.origin==='source')await mutate('edit_source_annotation',{id:state.edit.id,summary:$('#note-summary').value,expectedHash:state.edit.fileHash});
    else await mutate('annotation_upsert',{id:state.edit?.id,expectedRevision:state.edit?.revision,tag:$('#note-tag').value,summary:$('#note-summary').value,body:$('#note-body').value,path:$('#note-path').value.trim(),line:Number($('#note-line').value)});
    $('#note-dialog').close();toast('指导已保存，Agent 下次查询即可读取');error('');await refresh(true);
  }catch(e){$('#note-error').textContent=e.message+(e.code==='CONFLICT'||e.code==='STALE'?' 请保留当前文字，关闭后刷新再核对。':'');}finally{submit.disabled=false;}
});
$('#task-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;
  try{await mutate('task_create',{title:$('#task-title').value,description:$('#task-description').value,paths:$('#task-paths').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),dependsOn:$('#task-dependencies').value.split(',').map(s=>s.trim()).filter(Boolean)});$('#task-dialog').close();state.tab='coordination';toast('任务已创建，等待 Agent 认领');await refresh(true);}catch(e){$('#task-error').textContent=e.message;}finally{submit.disabled=false;}
});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>document.getElementById(b.dataset.close).close());
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{state.tab=b.dataset.tab;renderHeader();renderContent();});
for(const b of document.querySelectorAll('[data-tag]'))b.addEventListener('click',()=>{state.tag=b.dataset.tag;renderHeader();renderTree();renderContent();});
$('#search').addEventListener('input',event=>{state.query=event.target.value.trim().toLowerCase();if(state.snapshot){renderTree();renderContent();}});
$('#new-note').addEventListener('click',()=>openNote());$('#annotate-file').addEventListener('click',()=>openNote());$('#refresh').addEventListener('click',()=>{error('');refresh(true);});
await refresh(true);
if(state.snapshot){const first=state.snapshot.annotations.find(a=>a.tag==='CORE'&&a.path)||state.snapshot.annotations.find(a=>a.path);if(first)await selectFile(first.path,first.line);}
setInterval(()=>{if(!document.hidden&&state.failures<10)refresh();},2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});

for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>refresh(true));
