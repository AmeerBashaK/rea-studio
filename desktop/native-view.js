// SPDX-License-Identifier: AGPL-3.0-only
/* Independent native analysis view. All target-derived content is rendered as text. */
let nativeResult=null,nativeFunction=null,nativeNotes={},nativeMode='assembly',nativePage=0;
const nativePageSize=150;
let nativeSeeds=false,nativeListPage=0,nativeSelection=0,nativeRender=0,nativeReferencePage=0;
let nativeBookmarksOnly=false;
const nativeListSize=100;
let nativeTrail=[],nativeTrailIndex=-1,nativeLocation=null;
function rememberNativeView(){
 if(nativeTrailIndex>=0&&nativeFunction)nativeTrail[nativeTrailIndex]={index:nativeResult.data.functions.findIndex(f=>f.address===nativeFunction.address),address:nativeLocation||nativeFunction.address,mode:nativeMode,page:nativePage,referencePage:nativeReferencePage,listPage:nativeListPage};
}
function nativeHistoryButtons(){
 if(!$('#nativeBack'))return;
 $('#nativeBack').disabled=nativeTrailIndex<=0;
 $('#nativeForward').disabled=nativeTrailIndex<0||nativeTrailIndex>=nativeTrail.length-1;
}
async function moveNativeHistory(delta){
 const position=nativeTrailIndex+delta;if(position<0||position>=nativeTrail.length)return;
 rememberNativeView();const saved={...nativeTrail[position]};await selectNative(saved.index,saved.address,{restore:saved,position});
}
function nativeTitle(f){return nativeNotes[f.address]?.name||f.name;}
async function loadNative(item){
 nativeTrail=[];nativeTrailIndex=-1;nativeLocation=null;nativeHistoryButtons();
 nativeResult=item;nativeFunction=null;nativeSelection++;nativeRender++;nativeNotes={};nativePage=0;nativeListPage=0;
 $('#nativeSummary').textContent=`${item.data.subject.name} · ${item.data.subject.architecture} · ${item.data.functions.length} function candidates · ${item.data.coverage.instructions.toLocaleString()} instructions · ${(item.data.metrics.elapsed_ms/1000).toFixed(2)}s`;
 $('#nativeSummary').title=item.data.subject.path+' · SHA-256 '+item.data.subject.sha256;
 $('#nativeCoverage').textContent=(item.data.scope?.kind==='focused'?'Focused analysis at '+item.data.scope.requested_address+' · Separate saved result; strings were not rescanned. ':'')+(item.data.coverage.limits.length?item.data.coverage.limits.join(' · '):'Conservative static analysis. Indirect control flow and undiscovered code remain unresolved.');
 try{const notes=await window.rea.annotations(item.id);if(nativeResult?.id!==item.id)return;nativeNotes=notes;}catch(e){toast(e.message);}
 renderNativeFunctions();if(item.data.functions.length)await selectNative(0);else renderNative();
}
function renderNativeFunctions(){
 const list=$('#nativeFunctions');list.replaceChildren();if(!nativeResult)return;
 const query=$('#nativeSearch').value.toLowerCase();
 const data=nativeResult.data;
 const decoded=new Map(data.functions.map(f=>[f.address,f]));
 const candidates=nativeSeeds?(data.seeds||data.functions):data.functions;
 const rows=candidates.filter(f=>(!nativeBookmarksOnly||nativeNotes[f.address]?.bookmarked)&&`${nativeTitle(f)} ${f.address}`.toLowerCase().includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/nativeListSize));nativeListPage=Math.min(nativeListPage,pages-1);
 const controls=el('div','assembly-pagination');
 const prev=el('button','','←');prev.setAttribute('aria-label','Previous candidates');prev.disabled=!nativeListPage;prev.onclick=()=>{nativeListPage--;renderNativeFunctions();};
 const next=el('button','','→');next.setAttribute('aria-label','Next candidates');next.disabled=nativeListPage>=pages-1;next.onclick=()=>{nativeListPage++;renderNativeFunctions();};
 controls.append(prev,el('small','',`${rows.length} matches · ${nativeListPage+1}/${pages}`),next);list.append(controls);
 for(const candidate of rows.slice(nativeListPage*nativeListSize,(nativeListPage+1)*nativeListSize)){
  const f=decoded.get(candidate.address);
  const b=el('button','native-function'+(f&&f.address===nativeFunction?.address?' selected':''));
  b.append(el('strong','',(nativeNotes[candidate.address]?.bookmarked?'★ ':'')+nativeTitle(candidate)),el('small','',`${candidate.address} · ${f?(f.instructionCount??f.instructions?.length??0)+' instructions':'Not decoded in this result'}`));
  b.onclick=()=>{if(f){selectNative(data.functions.indexOf(f));}else{$('#nativeAddress').value=candidate.address;toast('Candidate selected. Choose Analyze address to decode it in a separate result.');}};
  list.append(b);
 }
 if(!rows.length)list.append(el('p','pad muted','No matching function candidates.'));
}
async function selectNative(index,address=null,options={}){
 rememberNativeView();
 const previous=nativeFunction;
 const item=nativeResult,token=++nativeSelection;nativeRender++;nativeFunction=null;nativeReferencePage=0;
 $('#nativeContent').textContent='Loading function…';$('#saveAnnotation').disabled=true;updateBookmarkButton();
 try{
  const f=item.paged?await window.rea.nativeFunction({id:item.id,index}):item.data.functions[index];
  if(nativeResult?.id!==item.id||token!==nativeSelection)return;
  nativeFunction=f;nativeLocation=address||f.address;
  if(options.restore){nativeTrailIndex=options.position;nativeMode=options.restore.mode;nativePage=options.restore.page;nativeReferencePage=options.restore.referencePage;nativeListPage=options.restore.listPage;}
  else{
   if(options.mode)nativeMode=options.mode;
   nativePage=address?Math.max(0,Math.floor(f.instructions.findIndex(i=>i.address===address)/nativePageSize)):0;
   if(nativeTrail[nativeTrailIndex]?.address!==nativeLocation){
    nativeTrail=nativeTrail.slice(0,nativeTrailIndex+1);nativeTrail.push({index,address:nativeLocation});
    if(nativeTrail.length>100)nativeTrail.shift();nativeTrailIndex=nativeTrail.length-1;
   }
  }
  rememberNativeView();nativeHistoryButtons();
  renderNativeFunctions();renderNative();
  const row=document.getElementById('ins-'+address);if(row){row.classList.add('address-focus');row.scrollIntoView({block:'center'});}
 }catch(e){if(token===nativeSelection){nativeFunction=previous;renderNative();nativeHistoryButtons();toast('Could not load function: '+e.message);}}
}
async function navigateNative(address){
 if(!nativeResult)return toast('Run Native disassembly first.');
 if(!address)return toast('This indirect target is unresolved.');
 const item=nativeResult,token=++nativeSelection;
 try{
  const index=item.paged?await window.rea.nativeLocate({id:item.id,address}):item.data.functions.findIndex(f=>f.address===address||f.instructions.some(i=>i.address===address));
  if(nativeResult?.id!==item.id||token!==nativeSelection)return;
  if(index<0){$('#nativeAddress').value=address;return toast('Target '+address+' is not retained. Use Analyze address to decode it as a separate saved result.');}
  await selectNative(index,address,{mode:'assembly'});
 }catch(e){toast(e.message);}
}
function addressButton(address,label){const b=el('button','address-link',label||address||'unresolved');b.onclick=()=>navigateNative(address);return b;}
function nativeTable(headers,rows){const table=el('table','native-table');const tr=el('tr');headers.forEach(h=>tr.append(el('th','',h)));const head=el('thead');head.append(tr);table.append(head);const body=el('tbody');for(const cells of rows){const row=el('tr');for(const value of cells){const td=el('td');td.append(typeof value==='object'&&value!==null?value:document.createTextNode(String(value??'—')));row.append(td);}body.append(row);}table.append(body);return table;}
function renderNative(){
 updateBookmarkButton();
 rememberNativeView();nativeHistoryButtons();
 const renderToken=++nativeRender;const out=$('#nativeContent');out.replaceChildren();if(!nativeResult)return;
 const data=nativeResult.data,f=nativeFunction;
 document.querySelectorAll('[data-native-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.nativeMode===nativeMode));
 $('#nativeFunctionTitle').textContent=f?nativeTitle(f):'No function selected';
 $('#annotationName').value=f?(nativeNotes[f.address]?.name||''):'';$('#annotationComment').value=f?(nativeNotes[f.address]?.comment||''):'';$('#saveAnnotation').disabled=!f;
 if(nativeMode==='imports'){out.append(nativeTable(['Module','Symbol','IAT address'],data.imports.map(i=>[i.module,i.name,i.address])));return;}
 if(nativeMode==='strings'){const input=el('input');input.placeholder='Filter retained strings…';input.setAttribute('aria-label','Filter native strings');const results=el('div');const update=()=>{const selected=data.strings.filter(s=>s.text.toLowerCase().includes(input.value.toLowerCase()));results.replaceChildren(el('p','native-note',`${selected.length} retained matches. Showing up to 500.`),nativeTable(['Address / offset','Encoding','Text'],selected.slice(0,500).map(s=>[s.address||s.offset,s.encoding,s.text+(s.truncated?'…':'')])));};input.oninput=update;out.append(input,results);update();return;}
 if(nativeMode==='sections'){out.append(nativeTable(['Section','Address','File offset','Raw bytes','Permissions'],data.sections.map(s=>[s.name,s.address,s.offset,s.size.toLocaleString(),(s.executable?'X ':'')+(s.writable?'W':'R')])));return;}
 if(!f){out.append(el('p','muted','No function candidates were decoded. Inspect sections, imports and strings, or use a different engine.'));return;}
 out.append(el('p','native-note',`${f.address} · Basis: ${f.basis}${f.limit_reached?' · Analysis limit reached':''}${f.decode_failures.length?' · Undecodable paths: '+f.decode_failures.length:''}`));
 if(nativeMode==='references'){
 const item=nativeResult,index=data.functions.findIndex(row=>row.address===f.address);
 const draw=page=>{
  if(renderToken!==nativeRender||nativeResult?.id!==item.id)return;
  const controls=el('div','assembly-pagination'),prev=el('button','','← Previous references'),next=el('button','','Next references →');
  prev.disabled=!nativeReferencePage;next.disabled=page.offset+page.limit>=page.total;
  prev.onclick=()=>{nativeReferencePage--;renderNative();};next.onclick=()=>{nativeReferencePage++;renderNative();};
  controls.append(prev,el('span','',`${page.total} references · Page ${nativeReferencePage+1}`),next);
  out.append(controls,nativeTable(['From','To','Kind','Symbol'],page.items.map(r=>[addressButton(r.source),r.target?addressButton(r.target):'unresolved',r.kind,r.label||'—'])));
 };
 if(item.paged)window.rea.nativeRelated({id:item.id,index,offset:nativeReferencePage*200}).then(draw).catch(e=>{if(renderToken===nativeRender)out.append(el('p','error',e.message));});
 else{const addresses=new Set(f.instructions.map(i=>i.address)),rows=data.references.filter(r=>addresses.has(r.source)||r.target===f.address);draw({items:rows.slice(nativeReferencePage*200,(nativeReferencePage+1)*200),total:rows.length,offset:nativeReferencePage*200,limit:200});}
 return;
 }
 if(nativeMode==='graph'){
 const graph=el('div','block-graph');const byAddress=new Map(f.instructions.map(i=>[i.address,i]));
 for(const block of f.blocks){const card=el('article','basic-block');card.append(el('h3','',block.address));
 const pre=el('pre');pre.textContent=block.instructions.slice(0,12).map(addr=>{const i=byAddress.get(addr);return `${i.mnemonic.padEnd(8)} ${i.operands}`;}).join('\n');if(block.instructions.length>12)pre.textContent+='\n… '+(block.instructions.length-12)+' more instructions';card.append(pre);
 const edges=el('div','block-edges');if(!block.edges.length)edges.append(el('span','','■ return / stop'));for(const edge of block.edges)edges.append(addressButton(edge.target,`${edge.kind==='branch'?'↗':'↓'} ${edge.kind}: ${edge.target||'unresolved'}`));card.append(edges);graph.append(card);}
 out.append(el('p','native-note','Basic blocks and their outgoing edges. Click a destination to inspect its instructions.'),graph);return;
 }
 const pages=Math.max(1,Math.ceil(f.instructions.length/nativePageSize));nativePage=Math.min(nativePage,pages-1);
 const controls=el('div','assembly-pagination');const prev=el('button','','← Previous');prev.disabled=!nativePage;prev.onclick=()=>{nativePage--;renderNative();};const next=el('button','','Next →');next.disabled=nativePage>=pages-1;next.onclick=()=>{nativePage++;renderNative();};controls.append(prev,el('span','',`Page ${nativePage+1} / ${pages} · ${f.instructions.length} instructions`),next);out.append(controls);
 const table=el('table','native-table assembly-table');const head=el('thead');const header=el('tr');['Address','Bytes','Instruction','References'].forEach(t=>header.append(el('th','',t)));head.append(header);table.append(head);const body=el('tbody');
 for(const ins of f.instructions.slice(nativePage*nativePageSize,(nativePage+1)*nativePageSize)){const row=el('tr');row.id='ins-'+ins.address;row.append(el('td','assembly-address',ins.address),el('td','assembly-bytes',ins.bytes));const text=el('td');text.append(el('b','mnemonic',ins.mnemonic+' '),document.createTextNode(ins.operands));row.append(text);const refs=el('td');for(const ref of ins.references){if(ref.kind==='call'||ref.kind==='branch')refs.append(addressButton(ref.target));else refs.append(el('span','reference-label',ref.label||ref.target));}row.append(refs);body.append(row);}table.append(body);out.append(table);
}
document.querySelectorAll('[data-native-mode]').forEach(b=>b.onclick=()=>{nativeMode=b.dataset.nativeMode;renderNative();});
$('#nativeSearch').oninput=()=>{nativeListPage=0;renderNativeFunctions();};
const seedToggle=el('button','','Show all discovered candidates');seedToggle.id='nativeSeedToggle';seedToggle.setAttribute('aria-pressed','false');seedToggle.onclick=()=>{nativeSeeds=!nativeSeeds;nativeListPage=0;seedToggle.textContent=nativeSeeds?'Show decoded functions only':'Show all discovered candidates';seedToggle.setAttribute('aria-pressed',String(nativeSeeds));renderNativeFunctions();};$('#nativeSearch').after(seedToggle);
$('#nativeGo').onclick=()=>{const input=$('#nativeAddress').value.trim().toLowerCase();if(!/^(0x)?[0-9a-f]+$/.test(input))return toast('Enter a hexadecimal virtual address.');navigateNative('0x'+BigInt(input.startsWith('0x')?input:'0x'+input).toString(16));};
$('#saveAnnotation').onclick=async()=>{if(!nativeResult||!nativeFunction)return;const id=nativeResult.id;try{const notes=await window.rea.annotate({id,address:nativeFunction.address,name:$('#annotationName').value,comment:$('#annotationComment').value});if(nativeResult?.id!==id)return;nativeNotes=notes;renderNativeFunctions();renderNative();toast('Function name and notes saved to this binary’s project.');}catch(e){toast(e.message);}};

$('#nativeAnalyzeAddress').onclick=async()=>{
 if(busy)return;
 if(!nativeResult)return toast('Run Native disassembly first.');
 const input=$('#nativeAddress').value.trim();
 if(!/^(0x)?[0-9a-f]{1,16}$/i.test(input))return toast('Enter a hexadecimal virtual address.');
 const address='0x'+BigInt(/^0x/i.test(input)?input:'0x'+input).toString(16);
 const id=nativeResult.id;
 setBusy(true);$('#progress').textContent='Checking original file and analyzing '+address+'…';
 try{await window.rea.focus({id,address});}catch(e){setBusy(false);toast(e.message);}
};

const nativeBack=el('button','','← Back');nativeBack.id='nativeBack';nativeBack.disabled=true;nativeBack.onclick=()=>moveNativeHistory(-1);
const nativeForward=el('button','','Forward →');nativeForward.id='nativeForward';nativeForward.disabled=true;nativeForward.onclick=()=>moveNativeHistory(1);
$('#nativeGo').before(nativeBack,nativeForward);

function updateBookmarkButton(){
 const button=$('#nativeBookmark');if(!button)return;
 const saved=!!nativeNotes[nativeFunction?.address]?.bookmarked;
 button.disabled=!nativeFunction;button.textContent=saved?'★ Bookmarked':'☆ Bookmark';button.setAttribute('aria-pressed',String(saved));
}
const bookmarkButton=el('button','','☆ Bookmark');bookmarkButton.id='nativeBookmark';bookmarkButton.disabled=true;bookmarkButton.setAttribute('aria-pressed','false');$('#saveAnnotation').after(bookmarkButton);
bookmarkButton.onclick=async()=>{
 if(!nativeResult||!nativeFunction)return;
 const id=nativeResult.id,address=nativeFunction.address,bookmarked=!nativeNotes[address]?.bookmarked;
 bookmarkButton.disabled=true;
 try{const notes=await window.rea.bookmark({id,address,bookmarked});if(nativeResult?.id!==id)return;nativeNotes=notes;renderNativeFunctions();toast(bookmarked?'Function bookmarked.':'Bookmark removed.');}
 catch(e){toast(e.message);}finally{updateBookmarkButton();}
};
const bookmarkFilter=el('button','','Show bookmarks only');bookmarkFilter.id='nativeBookmarkFilter';bookmarkFilter.setAttribute('aria-pressed','false');$('#nativeSearch').after(bookmarkFilter);
bookmarkFilter.onclick=()=>{nativeBookmarksOnly=!nativeBookmarksOnly;nativeListPage=0;bookmarkFilter.textContent=nativeBookmarksOnly?'Show all functions':'Show bookmarks only';bookmarkFilter.setAttribute('aria-pressed',String(nativeBookmarksOnly));renderNativeFunctions();};
