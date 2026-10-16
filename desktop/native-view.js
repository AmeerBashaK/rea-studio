// SPDX-License-Identifier: AGPL-3.0-only
/* Independent native analysis view. All target-derived content is rendered as text. */
let nativeResult=null,nativeFunction=null,nativeNotes={},nativeMode='assembly',nativePage=0;
const nativePageSize=150;
let nativeSeeds=false,nativeListPage=0;
const nativeListSize=100;
function nativeTitle(f){return nativeNotes[f.address]?.name||f.name;}
async function loadNative(item){
 nativeResult=item;nativeFunction=item.data.functions[0]||null;nativeNotes={};nativePage=0;nativeListPage=0;
 $('#nativeSummary').textContent=`${item.data.subject.name} · ${item.data.subject.architecture} · ${item.data.functions.length} function candidates · ${item.data.coverage.instructions.toLocaleString()} instructions · ${(item.data.metrics.elapsed_ms/1000).toFixed(2)}s`;
 $('#nativeSummary').title=item.data.subject.path+' · SHA-256 '+item.data.subject.sha256;
 $('#nativeCoverage').textContent=(item.data.scope?.kind==='focused'?'Focused analysis at '+item.data.scope.requested_address+' · Separate saved result; strings were not rescanned. ':'')+(item.data.coverage.limits.length?item.data.coverage.limits.join(' · '):'Conservative static analysis. Indirect control flow and undiscovered code remain unresolved.');
 try{const notes=await window.rea.annotations(item.id);if(nativeResult?.id!==item.id)return;nativeNotes=notes;}catch(e){toast(e.message);}
 renderNativeFunctions();renderNative();
}
function renderNativeFunctions(){
 const list=$('#nativeFunctions');list.replaceChildren();if(!nativeResult)return;
 const query=$('#nativeSearch').value.toLowerCase();
 const data=nativeResult.data;
 const decoded=new Map(data.functions.map(f=>[f.address,f]));
 const candidates=nativeSeeds?(data.seeds||data.functions):data.functions;
 const rows=candidates.filter(f=>`${nativeTitle(f)} ${f.address}`.toLowerCase().includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/nativeListSize));nativeListPage=Math.min(nativeListPage,pages-1);
 const controls=el('div','assembly-pagination');
 const prev=el('button','','←');prev.setAttribute('aria-label','Previous candidates');prev.disabled=!nativeListPage;prev.onclick=()=>{nativeListPage--;renderNativeFunctions();};
 const next=el('button','','→');next.setAttribute('aria-label','Next candidates');next.disabled=nativeListPage>=pages-1;next.onclick=()=>{nativeListPage++;renderNativeFunctions();};
 controls.append(prev,el('small','',`${rows.length} matches · ${nativeListPage+1}/${pages}`),next);list.append(controls);
 for(const candidate of rows.slice(nativeListPage*nativeListSize,(nativeListPage+1)*nativeListSize)){
  const f=decoded.get(candidate.address);
  const b=el('button','native-function'+(f&&f===nativeFunction?' selected':''));
  b.append(el('strong','',nativeTitle(candidate)),el('small','',`${candidate.address} · ${f?f.instructions.length+' instructions':'Not decoded in this result'}`));
  b.onclick=()=>{if(f){nativeFunction=f;nativePage=0;renderNativeFunctions();renderNative();}else{$('#nativeAddress').value=candidate.address;toast('Candidate selected. Choose Analyze address to decode it in a separate result.');}};
  list.append(b);
 }
 if(!rows.length)list.append(el('p','pad muted','No matching function candidates.'));
}
function navigateNative(address){
 if(!nativeResult)return toast('Run Native disassembly first.');
 if(!address)return toast('This indirect target is unresolved.');
 const found=nativeResult.data.functions.find(f=>f.address===address)||nativeResult.data.functions.find(f=>f.instructions.some(i=>i.address===address));
 if(!found){$('#nativeAddress').value=address;return toast('Target '+address+' is not retained. Use Analyze address to decode it as a separate saved result.');}
 nativeFunction=found;nativeMode='assembly';const index=found.instructions.findIndex(i=>i.address===address);nativePage=Math.max(0,Math.floor(index/nativePageSize));
 renderNativeFunctions();renderNative();const row=document.getElementById('ins-'+address);if(row){row.classList.add('address-focus');row.scrollIntoView({block:'center'});}
}
function addressButton(address,label){const b=el('button','address-link',label||address||'unresolved');b.onclick=()=>navigateNative(address);return b;}
function nativeTable(headers,rows){const table=el('table','native-table');const tr=el('tr');headers.forEach(h=>tr.append(el('th','',h)));const head=el('thead');head.append(tr);table.append(head);const body=el('tbody');for(const cells of rows){const row=el('tr');for(const value of cells){const td=el('td');td.append(typeof value==='object'&&value!==null?value:document.createTextNode(String(value??'—')));row.append(td);}body.append(row);}table.append(body);return table;}
function renderNative(){
 const out=$('#nativeContent');out.replaceChildren();if(!nativeResult)return;
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
 const addresses=new Set(f.instructions.map(i=>i.address));
 const refs=data.references.filter(r=>addresses.has(r.source)||r.target===f.address);
 out.append(nativeTable(['From','To','Kind','Symbol'],refs.map(r=>[addressButton(r.source),r.target?addressButton(r.target):'unresolved',r.kind,r.label||'—'])));return;
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
$('#saveAnnotation').onclick=async()=>{if(!nativeResult||!nativeFunction)return;try{nativeNotes=await window.rea.annotate({id:nativeResult.id,address:nativeFunction.address,name:$('#annotationName').value,comment:$('#annotationComment').value});renderNativeFunctions();renderNative();toast('Function name and notes saved to this binary’s project.');}catch(e){toast(e.message);}};

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
