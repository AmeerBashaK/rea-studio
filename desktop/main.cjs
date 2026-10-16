// SPDX-License-Identifier: AGPL-3.0-only
const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs/promises'), path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
app.setAppUserModelId('local.rea.studio');
let win,root=null,target=null,active=null;
// A profile has one writer for analysis history and project annotations.
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
app.on('second-instance',()=>{
  if(win&&!win.isDestroyed()){
    if(win.isMinimized())win.restore();
    win.show();win.focus();
  }
});
const engine=app.isPackaged?path.join(process.resourcesPath,'engine'):path.resolve(__dirname,'../rea');
const node=app.isPackaged?path.join(process.resourcesPath,'runtime','node.exe'):'C:\\Program Files\\nodejs\\node.exe';
const cli=path.join(engine,'scripts','rea.mjs');
const nativeBinary=app.isPackaged?path.join(process.resourcesPath,'studio-native','studio-native.exe'):path.resolve(__dirname,'../desktop-resources/studio-native/studio-native.exe');
const {ResultStore}=require('./result-store.cjs');
const results=()=>new ResultStore(store());
const store=()=>path.join(app.getPath('userData'),'analyses');
const emit=data=>{if(win&&!win.isDestroyed())win.webContents.send('event',data);};
const blocked=new Set(['setup','update','uninstall','mcp','completions']);
let commands=[];
async function call(args){return (await exec(node,[cli,...args],{cwd:engine,windowsHide:true,maxBuffer:8*1024*1024})).stdout;}
const engineInfo=require('./engine-info.cjs').createEngineInfo(call);
async function confined(relative){
  if(!root)throw Error('Open a folder or file first.');
  const resolved=await fs.realpath(path.resolve(root,relative||'.'));
  const rel=path.relative(root,resolved);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('This file is outside the open workspace.');
  return resolved;
}
async function record(id){return results().view(id);}
async function cancel(){if(active&&active.child.exitCode===null&&active.child.signalCode===null){active.cancelled=true;if(active.child.pid)await exec('taskkill.exe',['/PID',String(active.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});}}
app.whenReady().then(async()=>{
  if(!primaryInstance)return;
  await fs.mkdir(store(),{recursive:true});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File',submenu:[{label:'Open folder…',accelerator:'CmdOrCtrl+O',click:()=>emit({type:'open'})},{type:'separator'},{role:'quit'}]},
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}
  ]));
  win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,backgroundColor:'#101218',title:'REA Studio',icon:path.join(__dirname,'icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('close',e=>{if(active){e.preventDefault();cancel().then(()=>{active=null;win.close();});}});
  await win.loadFile('index.html');
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('info',async()=>{
  let help='',version='unavailable';
  try{({help,version}=await engineInfo());}catch{}
  commands=[...help.matchAll(/^  ([a-z][a-z0-9-]+)\s{2,}(.+)$/gm)].map(m=>({name:m[1],description:m[2]})).filter(c=>!blocked.has(c.name));
  const nativeAvailable=await fs.access(nativeBinary).then(()=>true,()=>false);
  if(nativeAvailable)commands.unshift({name:'native-analyze',description:'Built-in x86/x64 PE disassembly, functions and references'});
  return {version,commands,engine,nativeAvailable,appVersion:app.getVersion()};
});
ipcMain.handle('choose',async(_e,kind)=>{
  const result=await dialog.showOpenDialog(win,{properties:kind==='folder'?['openDirectory']:['openFile']});
  if(result.canceled)return null;
  target=await fs.realpath(result.filePaths[0]);root=(await fs.stat(target)).isDirectory()?target:path.dirname(target);
  return {target,root,name:path.basename(target)};
});
ipcMain.handle('files',async(_e,relative)=>{
  const dir=await confined(relative);
  return (await fs.readdir(dir,{withFileTypes:true})).filter(f=>!['node_modules','.git'].includes(f.name)).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)).slice(0,400).map(f=>({name:f.name,directory:f.isDirectory(),relative:path.relative(root,path.join(dir,f.name))}));
});
ipcMain.handle('read',async(_e,relative)=>{
  const file=await confined(relative),s=await fs.stat(file);
  if(s.size>1024*1024)return 'Preview unavailable: file exceeds 1 MB. Use an analysis workflow to inspect it.';
  const bytes=await fs.readFile(file);
  if(bytes.includes(0))return 'Binary file • '+s.size.toLocaleString()+' bytes\n\nUse Artifact inspection to explore this file.';
  return bytes.toString('utf8');
});
async function runAnalysis(args,focus=null){
  if(active)throw Error('An analysis is already running.');
  if(!Array.isArray(args)||!args.length||args.some(a=>typeof a!=='string'||a.includes('\0'))||!commands.some(c=>c.name===args[0]))throw Error('Choose a supported REA command.');
  if(args.some(a=>['--mcp','--update'].includes(a)))throw Error('This option is not available in the desktop console.');
  const native=args[0]==='native-analyze';
  if(native&&(args.length<2||args.length>3||(args.length===3&&args[2]!=='--json')))throw Error('Use native-analyze "C:\\path\\file.exe"');
  const id=require('node:crypto').randomUUID(),started=new Date().toISOString(),runTarget=focus?args[1]:target;
  const child=spawn(native?nativeBinary:node,native?[args[1],...(focus?['--address',focus.address,'--expected-sha256',focus.sha256]:[])]:[cli,...args],{cwd:root||engine,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const job={child,id,cancelled:false};active=job;
  let timedOut=false;
  const watchdog=native?setTimeout(()=>{timedOut=true;cancel();},90000):null;
  let stdout='',stderr='',pending='',overflow=false;
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(Buffer.byteLength(stdout)>32*1024*1024&&!overflow){overflow=true;cancel();}});
  child.stderr.on('data',chunk=>{const text=chunk.toString();stderr=(stderr+text).slice(-200000);pending=(pending+text).slice(-200000);let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);try{const v=JSON.parse(line);emit({type:'progress',...v.rea_progress});}catch{emit({type:'log',text:line});}}});
  let spawnError='';child.on('error',e=>{spawnError=e.message;});
  child.on('close',async code=>{
    if(watchdog)clearTimeout(watchdog);
    let data=null;try{data=JSON.parse(stdout);}catch{}
    const item={id,parentId:focus?.parentId||null,requestedAddress:focus?.address||null,started,finished:new Date().toISOString(),args,target:runTarget,code,cancelled:job.cancelled,data,stdout,stderr,error:timedOut?'Native analysis exceeded the 90-second worker limit.':overflow?'Result exceeded the 32 MB desktop limit. Narrow the command scope.':spawnError};
    try{await results().save(item);if(data?.schema==='studio-native/1')item.stdout='';await fs.writeFile(path.join(store(),id+'.meta'),JSON.stringify({id,started,args,code,cancelled:job.cancelled}));}catch(e){item.error+=' Could not save history: '+e.message;}
    active=null;let display=item;try{display=await results().view(id);}catch{}emit({type:'done',item:display});
  });
  return {id};
}
ipcMain.handle('run',(_e,args)=>runAnalysis(args));
ipcMain.handle('focus',async(_e,{id,address})=>{
  if(typeof address!=='string'||!/^0x[0-9a-f]{1,16}$/i.test(address))throw Error('Enter a valid hexadecimal virtual address.');
  const item=await results().summary(id);
  if(item.code!==0||item.cancelled||item.error||item.data?.schema!=='studio-native/1'||!/^[a-f0-9]{64}$/.test(item.data.subject?.sha256)||typeof item.data.subject.path!=='string')throw Error('Select a successful native analysis first.');
  return runAnalysis(['native-analyze',item.data.subject.path],{parentId:id,address,sha256:item.data.subject.sha256});
});
async function annotationPath(id){
  const item=await results().summary(id);
  if(item.data?.schema!=='studio-native/1'||!/^[a-f0-9]{64}$/.test(item.data.subject.sha256))throw Error('This result does not support native annotations.');
  const dir=path.join(app.getPath('userData'),'projects');await fs.mkdir(dir,{recursive:true});
  return {file:path.join(dir,item.data.subject.sha256+'.json'),item};
}
ipcMain.handle('annotations',async(_e,id)=>{const {file}=await annotationPath(id);try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}});
const annotationWrites=new Map();
async function changeAnnotation(id,address,patch){
  const {file,item}=await annotationPath(id);
  if(!item.data.functions.some(f=>f.address===address))throw Error('Invalid function annotation.');
  const previous=annotationWrites.get(file)||Promise.resolve();
  const write=previous.catch(()=>{}).then(async()=>{
    let values={};try{values=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    values[address]={...values[address],...patch,updated:new Date().toISOString()};
    const temporary=file+'.'+require('node:crypto').randomUUID()+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(values,null,2));await fs.rename(temporary,file);return values;
  });
  annotationWrites.set(file,write);
  const clear=()=>{if(annotationWrites.get(file)===write)annotationWrites.delete(file);};
  write.then(clear,clear);return write;
}
ipcMain.handle('annotate',async(_e,{id,address,name,comment})=>{
  if(typeof name!=='string'||name.length>120||typeof comment!=='string'||comment.length>4000)throw Error('Invalid function annotation.');
  return changeAnnotation(id,address,{name:name.trim(),comment});
});
ipcMain.handle('bookmark',async(_e,{id,address,bookmarked})=>{
  if(typeof bookmarked!=='boolean')throw Error('Invalid bookmark state.');
  return changeAnnotation(id,address,{bookmarked});
});
ipcMain.handle('cancel',cancel);
ipcMain.handle('history',async()=>{
  const names=(await fs.readdir(store())).filter(n=>n.endsWith('.json'));
  const rows=[];
  for(const n of names){try{const meta=path.join(store(),n.replace(/\.json$/,'.meta'));let v;try{v=JSON.parse(await fs.readFile(meta,'utf8'));}catch{const old=JSON.parse(await fs.readFile(path.join(store(),n),'utf8'));v={id:old.id,started:old.started,args:old.args,code:old.code,cancelled:old.cancelled};await fs.writeFile(meta,JSON.stringify(v));}rows.push(v);}catch{}}
  return rows.filter(Boolean).sort((a,b)=>b.started.localeCompare(a.started)).slice(0,50);
});
ipcMain.handle('native-function',(_e,{id,index})=>results().function(id,index));
ipcMain.handle('native-locate',(_e,{id,address})=>results().locate(id,address));
ipcMain.handle('native-related',(_e,{id,index,offset})=>results().related(id,index,offset));
ipcMain.handle('native-page',(_e,{id,...options})=>results().page(id,options));
ipcMain.handle('result',(_e,id)=>record(id));
ipcMain.handle('export',async(_e,id)=>{
  const item=await results().summary(id),out=await dialog.showSaveDialog(win,{defaultPath:'rea-'+item.args[0]+'.json',filters:[{name:'JSON evidence',extensions:['json']}]});
  if(out.canceled)return false;
  await results().export(id,out.filePath);return true;
});
