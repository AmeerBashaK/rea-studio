// SPDX-License-Identifier: AGPL-3.0-only
const path=require('node:path'),{spawn}=require('node:child_process');
function validate(p){
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.executable!=='string'||!path.isAbsolute(p.executable)||!Array.isArray(p.args)||p.args.length>64||p.args.some(a=>typeof a!=='string'||a.length>4000||a.includes('\0')))throw Error('Provide a name, absolute executable path and JSON array of arguments.');
 if(!/\.exe$/i.test(p.executable))throw Error('Choose an .exe. For Node-based tools choose node.exe and provide the CLI script path as an argument.');
 return {name:p.name.trim(),executable:p.executable,args:p.args};
}
class AgentRunner{
 constructor(){this.child=null;}
 run(profile,prompt,cwd){
  const p=validate(profile);if(this.child)throw Error('An agent is already running.');
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>100000)throw Error('Enter a prompt under 100,000 characters.');
  return new Promise((resolve,reject)=>{
   const child=spawn(p.executable,p.args,{cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});this.child=child;
   let stdout='',stderr='',bytes=0,reason='';
   const stop=why=>{reason=why;this.cancel();};
   const timer=setTimeout(()=>stop('Agent exceeded the five-minute limit.'),300000);
   const collect=(text,error)=>{bytes+=Buffer.byteLength(text);if(bytes>2*1024*1024){stop('Agent output exceeded 2 MB.');return;}if(error)stderr+=text;else stdout+=text;};
   child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
   child.stdout.on('data',s=>collect(s,false));child.stderr.on('data',s=>collect(s,true));
   child.stdin.on('error',()=>{});
   child.on('error',e=>{clearTimeout(timer);if(this.child===child)this.child=null;reject(e);});
   child.on('close',code=>{clearTimeout(timer);if(this.child===child)this.child=null;resolve({code,stdout,stderr,reason:reason|| (this.cancelled?'Stopped by user.':''),provider:p.name});this.cancelled=false;});
   this.cancelled=false;child.stdin.end(prompt+'\n');
  });
 }
 cancel(){const child=this.child;if(child?.pid&&!child.stopping){child.stopping=true;this.cancelled=true;const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});killer.on('error',()=>child.kill());}}
}
module.exports={AgentRunner,validate};
