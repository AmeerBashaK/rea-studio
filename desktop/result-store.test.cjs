// SPDX-License-Identifier: AGPL-3.0-only
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {ResultStore}=require('./result-store.cjs');
async function setup(){const root=await fs.mkdtemp(path.resolve(__dirname,'../verification/store-'));return {root,store:new ResultStore(root)};}
function sample(){const data={schema:'studio-native/1',subject:{sha256:'a'.repeat(64)},functions:[{address:'0x1000',name:'test',instructions:Array.from({length:450},(_,i)=>({address:'0x'+(4096+i).toString(16),operands:'example operand '.repeat(20)})),blocks:[]}],references:Array.from({length:450},(_,i)=>({source:i,target:i+1}))};return {id:randomUUID(),code:0,data,stdout:JSON.stringify(data),args:['native-analyze'],parentId:randomUUID()};}
test('new records preserve all evidence without duplicate raw JSON',async()=>{
 const {root,store}=await setup(),item=sample();await store.save(item);
 const manifest=await store.summary(item.id);assert.equal(manifest.storage.version,1);assert.equal(manifest.stdout,'');assert.equal(manifest.data.functions[0].instructions,undefined);
 const loaded=await store.read(item.id);assert.deepEqual(loaded.data,item.data);assert.equal(loaded.parentId,item.parentId);
 assert.ok((await fs.stat(store.file(item.id))).size<JSON.stringify(item).length/10);
 const output=path.join(root,'export.json');await store.export(item.id,output);assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),item.data);
});
test('pages preserve boundaries, counts and EOF without reading other functions',async()=>{
 const {store}=await setup(),item=sample();await store.save(item);
 const refs=await store.page(item.id,{collection:'references',offset:195,limit:20});assert.deepEqual(refs.items,item.data.references.slice(195,215));assert.equal(refs.total,450);
 assert.equal((await store.page(item.id,{collection:'references',offset:449,limit:200})).items.length,1);
 assert.deepEqual((await store.page(item.id,{collection:'references',offset:999})).items,[]);
 const instructions=await store.page(item.id,{collection:'instructions',functionIndex:0,offset:198,limit:10});assert.deepEqual(instructions.items,item.data.functions[0].instructions.slice(198,208));
 assert.equal((await store.page(item.id,{collection:'functions'})).items[0].instructionCount,450);
});
test('legacy history remains unchanged and export preserves original stdout',async()=>{
 const {root,store}=await setup(),item=sample();await fs.writeFile(store.file(item.id),JSON.stringify(item));
 assert.deepEqual(await store.read(item.id),item);assert.equal((await store.page(item.id,{collection:'instructions',offset:449})).items.length,1);
 const output=path.join(root,'legacy-export.json');await store.export(item.id,output);assert.equal(await fs.readFile(output,'utf8'),item.stdout);
});
test('invalid page requests and paths rejected, records cannot be overwritten',async()=>{
 const {store}=await setup(),item=sample();await store.save(item);
 for(const options of [{collection:'references',offset:-1},{collection:'references',limit:201},{collection:'instructions',functionIndex:1},{collection:'../../private'}])await assert.rejects(store.page(item.id,options));
 await assert.rejects(store.read('../outside'));await assert.rejects(store.save(item),/already exists/);
 assert.deepEqual((await store.read(item.id)).data,item.data);
});
test('incomplete parts are not a saved record, missing committed chunks fail explicitly',async()=>{
 const {root,store}=await setup(),item=sample();await fs.mkdir(path.join(root,item.id+'.parts'));
 await assert.rejects(store.read(item.id),{code:'ENOENT'});
 const complete=sample();await store.save(complete);await fs.unlink(store.chunk(complete.id,'function-0'));
 await assert.rejects(store.read(complete.id),{code:'ENOENT'});
});

test('failed streaming export preserves the previous destination',async()=>{
 const {root,store}=await setup(),item=sample();await store.save(item);
 const output=path.join(root,'existing.json');await fs.writeFile(output,'previous evidence');
 await fs.unlink(store.chunk(item.id,'references-1'));
 await assert.rejects(store.export(item.id,output),{code:'ENOENT'});
 assert.equal(await fs.readFile(output,'utf8'),'previous evidence');
 assert.equal((await fs.readdir(root)).filter(n=>n.endsWith('.tmp')).length,0);
});

test('renderer views omit instructions, blocks, references and stdout for old and new records',async()=>{
 const {store}=await setup();
 for(const legacy of [false,true]){
  const item=sample();if(legacy)await fs.writeFile(store.file(item.id),JSON.stringify(item));else await store.save(item);
  const view=await store.view(item.id);assert.equal(view.paged,true);assert.equal(view.stdout,'');assert.equal(view.data.references,undefined);
  assert.equal(view.data.functions[0].instructions,undefined);assert.equal(view.data.functions[0].blocks,undefined);assert.equal(view.data.functions[0].instructionCount,450);
  assert.deepEqual(await store.function(item.id,0),item.data.functions[0]);assert.equal(await store.locate(item.id,'0x100a'),0);assert.equal(await store.locate(item.id,'0x9999'),-1);
 }
});
test('related references page through matches across chunk boundaries',async()=>{
 const {store}=await setup(),item=sample();item.data.references=item.data.references.map((r,i)=>({...r,source:i%2?'other':'0x1000'}));await store.save(item);
 const first=await store.related(item.id,0),last=await store.related(item.id,0,200);
 assert.equal(first.total,225);assert.equal(first.items.length,200);assert.equal(last.items.length,25);
 assert.deepEqual([...first.items,...last.items],item.data.references.filter(r=>r.source==='0x1000'));
 await assert.rejects(store.related(item.id,0,-1));
});


test('reference search filters before paging in legacy and chunked records',async()=>{
 const {store}=await setup();
 for(const legacy of [true,false]){
  const item=sample();item.data.references=item.data.references.map((r,i)=>({...r,source:'0x1000',target:null,label:i%2?'Other':'KERNEL32!ReadFile',kind:'call'}));
  if(legacy)await fs.writeFile(store.file(item.id),JSON.stringify(item));else await store.save(item);
  const a=await store.related(item.id,0,0,'  READFILE  '),b=await store.related(item.id,0,200,'readfile');
  assert.equal(a.total,225);assert.equal(a.items.length,200);assert.equal(b.items.length,25);
  assert.equal((await store.related(item.id,0,0,'unresolved')).total,450);
  assert.equal((await store.related(item.id,0,0,'0x1000')).total,450);
  assert.equal((await store.related(item.id,0,0,'call')).total,450);
  assert.equal((await store.related(item.id,0,0,'[.*]')).total,0);
  await assert.rejects(store.related(item.id,0,0,'x'.repeat(201)),/Invalid reference search/);
  await assert.rejects(store.related(item.id,0,0,{}),/Invalid reference search/);
 }
});
