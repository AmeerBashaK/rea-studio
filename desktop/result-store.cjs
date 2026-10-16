// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs/promises');
const path=require('node:path');
const PAGE=200;
function checkId(id){if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw Error('Invalid analysis ID');}
class ResultStore{
 constructor(root){this.root=root;}
 file(id){checkId(id);return path.join(this.root,id+'.json');}
 chunk(id,name){checkId(id);return path.join(this.root,id+'.parts',name+'.json');}
 async json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
 async summary(id){const item=await this.json(this.file(id));if(item.storage&&item.storage.version!==1)throw Error('Unsupported result storage version');return item;}
 async view(id){
  const item=await this.summary(id);if(item.data?.schema!=='studio-native/1')return item;
  const {references,...header}=item.data;
  const functions=header.functions.map(({instructions,blocks,...f})=>({...f,instructionCount:f.instructionCount??instructions.length}));
  return {...item,stdout:'',paged:true,data:{...header,functions}};
 }
 async function(id,index){
  const item=await this.summary(id);
  if(!Number.isSafeInteger(index)||index<0||index>=item.data?.functions?.length)throw Error('Invalid function index');
  return item.storage?this.json(this.chunk(id,'function-'+index)):item.data.functions[index];
 }
 async locate(id,address){
  if(typeof address!=='string'||!/^0x[0-9a-f]{1,16}$/i.test(address))throw Error('Invalid address');
  const item=await this.summary(id),exact=item.data.functions.findIndex(f=>f.address===address);
  if(exact>=0)return exact;
  for(let i=0;i<item.data.functions.length;i++)if((await this.function(id,i)).instructions.some(row=>row.address===address))return i;
  return -1;
 }
 async related(id,index,offset=0,query=''){
  if(typeof query!=='string'||query.length>200)throw Error('Invalid reference search');
  const needle=query.trim().toLowerCase();
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid page bounds');
  const item=await this.summary(id),f=await this.function(id,index),sources=new Set(f.instructions.map(i=>i.address));
  const totalRefs=item.storage?item.storage.referenceCount:item.data.references.length;
  const items=[];let total=0;
  for(let start=0;start<totalRefs;start+=PAGE){
   const rows=item.storage?await this.json(this.chunk(id,'references-'+start/PAGE)):item.data.references.slice(start,start+PAGE);
   for(const row of rows)if((sources.has(row.source)||row.target===f.address)&&[row.source,row.target||'unresolved',row.kind,row.label].some(value=>String(value??'').toLowerCase().includes(needle))){if(total>=offset&&items.length<PAGE)items.push(row);total++;}
  }
  return {items,total,offset,limit:PAGE};
 }
 async save(item){
  const file=this.file(item.id);await fs.mkdir(this.root,{recursive:true});
  try{await fs.access(file);throw Error('Analysis already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  let stored=item;
  if(item.data?.schema==='studio-native/1'){
   const {functions,references,...header}=item.data;
   if(!Array.isArray(functions)||functions.length>512||!Array.isArray(references)||references.length>200000)throw Error('Invalid native storage bounds');
   await fs.mkdir(path.join(this.root,item.id+'.parts'));
   const summaries=[];
   for(let i=0;i<functions.length;i++){
    const {instructions,blocks,...summary}=functions[i];
    summaries.push({...summary,instructionCount:instructions.length});
    await fs.writeFile(this.chunk(item.id,'function-'+i),JSON.stringify(functions[i]),{flag:'wx'});
   }
   for(let i=0;i<references.length;i+=PAGE)await fs.writeFile(this.chunk(item.id,'references-'+(i/PAGE)),JSON.stringify(references.slice(i,i+PAGE)),{flag:'wx'});
   stored={...item,stdout:'',data:{...header,functions:summaries},storage:{version:1,referenceCount:references.length}};
  }
  // Publish the manifest last. Incomplete parts never appear in history.
  const temporary=file+'.tmp';await fs.writeFile(temporary,JSON.stringify(stored),{flag:'wx'});await fs.rename(temporary,file);
  return stored;
 }
 async page(id,{collection,offset=0,limit=PAGE,functionIndex=0}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>PAGE)throw Error('Invalid page bounds');
  if(!['functions','instructions','references'].includes(collection))throw Error('Invalid collection');
  const item=await this.summary(id);if(item.data?.schema!=='studio-native/1')throw Error('Not a native result');
  let rows;
  if(collection==='functions')rows=item.data.functions;
  if(collection==='instructions'){
   if(!Number.isSafeInteger(functionIndex)||functionIndex<0||functionIndex>=item.data.functions.length)throw Error('Invalid function index');
   rows=(item.storage?await this.json(this.chunk(id,'function-'+functionIndex)):item.data.functions[functionIndex]).instructions;
  }
  if(collection==='references'&&item.storage){
   const total=item.storage.referenceCount;if(!Number.isSafeInteger(total)||total<0||total>200000)throw Error('Invalid reference count');
   const end=Math.min(total,offset+limit),items=[];
   for(let i=offset;i<end;){const index=Math.floor(i/PAGE),part=await this.json(this.chunk(id,'references-'+index));const n=Math.min(end-i,PAGE-i%PAGE);items.push(...part.slice(i%PAGE,i%PAGE+n));i+=n;}
   return {items,total,offset,limit};
  }
  if(collection==='references')rows=item.data.references;
  return {items:rows.slice(offset,offset+limit),total:rows.length,offset,limit};
 }
 async read(id){
  const item=await this.summary(id);if(!item.storage)return item;
  const functions=[];for(let i=0;i<item.data.functions.length;i++)functions.push(await this.json(this.chunk(id,'function-'+i)));
  const references=[];for(let i=0;i<item.storage.referenceCount;i+=PAGE)references.push(...await this.json(this.chunk(id,'references-'+i/PAGE)));
  const {storage,...result}=item;return {...result,data:{...item.data,functions,references}};
 }
 async export(id,file){
  const item=await this.summary(id);
  if(!item.storage){await fs.writeFile(file,item.stdout||JSON.stringify(item,null,2));return;}
  const temporary=file+'.'+require('node:crypto').randomUUID()+'.tmp';
  const output=await fs.open(temporary,'wx');let complete=false;
  try{
   const {functions,...header}=item.data;
   await output.write(JSON.stringify(header).slice(0,-1)+',"functions":[');
   for(let i=0;i<functions.length;i++)await output.write((i?',':'')+await fs.readFile(this.chunk(id,'function-'+i),'utf8'));
   await output.write('],"references":[');
   for(let i=0;i<item.storage.referenceCount;i+=PAGE){const rows=await this.json(this.chunk(id,'references-'+i/PAGE));await output.write((i?',':'')+JSON.stringify(rows).slice(1,-1));}
   await output.write(']}');complete=true;
  }finally{await output.close();if(complete)await fs.rename(temporary,file);else await fs.unlink(temporary);}
 }
}
module.exports={ResultStore};
