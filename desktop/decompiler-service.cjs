// SPDX-License-Identifier: AGPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
class DecompilerService{
 constructor({home,binary,analysis}){Object.assign(this,{home,binary,analysis});this.job=null;}
 async settings(){try{return JSON.parse(await fs.readFile(path.join(this.home,'decompiler-settings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {ghidra:'',java:''};throw e;}}
 async validate(s){
  if(!s||typeof s.ghidra!=='string'||typeof s.java!=='string'||!path.isAbsolute(s.ghidra)||!path.isAbsolute(s.java)||path.basename(s.java).toLowerCase()!=='java.exe')throw Error('Choose a Ghidra release folder and java.exe.');
  for(const file of [s.java,path.join(s.ghidra,'support','LaunchSupport.jar'),path.join(s.ghidra,'Ghidra','Framework','Utility','lib','Utility.jar')])if(!(await fs.stat(file)).isFile())throw Error('Required tool file is missing.');
  return {ghidra:s.ghidra,java:s.java};
 }
 async save(s){const value=await this.validate(s);await fs.mkdir(this.home,{recursive:true});const file=path.join(this.home,'decompiler-settings.json'),temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,file);return value;}
 async status(){const settings=await this.settings();let ready=false,message='Select a local Ghidra installation and Java JDK.';try{await this.validate(settings);await fs.access(this.binary);ready=true;message='Tool files found. Compatibility is checked when decompiling.';}catch{}return {settings,ready,message};}
 kill(){const child=this.job?.child;if(child?.pid&&child.exitCode===null){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});}catch{child.kill();}}}
 async stop(){const job=this.job;if(job){job.cancelled=true;if(job.cancelFile)await fs.writeFile(job.cancelFile,'stop');}}
 async run({id,address}={}){
  if(this.job)throw Error('A decompilation is already running.');
  const job={cancelled:false};this.job=job;
  try{
   if(typeof id!=='string'||typeof address!=='string'||!/^0x[0-9a-f]{1,16}$/i.test(address))throw Error('Select a native function.');
   const item=await this.analysis(id),subject=item.data?.subject;
   if(item.code!==0||item.cancelled||item.error||item.data?.schema!=='studio-native/1'||!subject||!/^[a-f0-9]{64}$/i.test(subject.sha256)||!item.data.functions.some(f=>f.address===address))throw Error('Choose a function from a successful native analysis.');
   const settings=await this.validate(await this.settings());
   const folder=path.join(this.home,'decompilations');await fs.mkdir(folder,{recursive:true});
   const runId=randomUUID();job.cancelFile=path.join(folder,runId+'.cancel');
   if(job.cancelled){await fs.writeFile(job.cancelFile,'stop');throw Error('cancelled');}
   const args=['--ghidra',settings.ghidra,'--java',settings.java,'--target',subject.path,'--expected-sha256',subject.sha256,'--address',address,'--work',path.join(folder,'work'),'--cancel-file',job.cancelFile];
   const output=await new Promise((resolve,reject)=>{
    const child=spawn(this.binary,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});job.child=child;
    let stdout='',stderr='',bytes=0,fatal='';
    const timer=setTimeout(()=>{fatal='Decompiler exceeded the desktop time limit.';this.kill();},210000);
    const collect=(s,isError)=>{bytes+=Buffer.byteLength(s);if(bytes>4*1024*1024){if(!fatal){fatal='Decompiler output exceeded the desktop budget.';this.kill();}return;}if(isError)stderr+=s;else stdout+=s;};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>collect(s,false));child.stderr.on('data',s=>collect(s,true));
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(fatal)return reject(Error(fatal));let report;try{report=JSON.parse(stdout);}catch{return reject(Error('Invalid worker response. '+stderr.slice(-1000)));}if(job.cancelled)return reject(Error('cancelled'));if(code!==0)return reject(Error(report.error||'Decompiler worker failed.'));resolve(report);});
   });
   if(output.schema!=='studio-decompiler/1'||output.engine!=='Ghidra'||typeof output.engineVersion!=='string'||output.sha256?.toLowerCase()!==subject.sha256.toLowerCase()||typeof output.address!=='string'||!/^0x[0-9a-f]{1,16}$/i.test(output.address)||BigInt(output.address)!==BigInt(address)||!['complete','no-function','failed','timeout','output-limit'].includes(output.status))throw Error('Decompiler report does not match this function/input.');
   if(output.status==='complete'&&(typeof output.code!=='string'||!output.code.trim()||Buffer.byteLength(output.code)>2*1024*1024))throw Error('Invalid pseudocode.');
   if(output.status!=='complete'&&'code' in output)throw Error('Failed result contains pseudocode.');
   const report={...output,analysisId:id,savedAt:new Date().toISOString(),reportId:runId};
   const file=path.join(folder,runId+'.json'),temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(report));await fs.rename(temp,file);return report;
  }finally{if(job.cancelFile)await fs.rm(job.cancelFile,{force:true}).catch(()=>{});if(this.job===job)this.job=null;}
 }
}
module.exports={DecompilerService};
