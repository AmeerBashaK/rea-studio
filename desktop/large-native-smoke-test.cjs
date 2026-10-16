// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const folder=await fs.mkdtemp(path.resolve(__dirname,'../verification/large-native-'));
 const target=process.execPath;
 const app=await _electron.launch({executablePath:require('electron'),args:[__dirname,'--user-data-dir='+path.join(folder,'profile')],timeout:60000});
 const stop=path.join(folder,'stop'),report=path.join(folder,'memory.json');
 const sampler=spawn(path.resolve(__dirname,'../native-engine/.venv/Scripts/python.exe'),[path.resolve(__dirname,'../native-engine/sample_process_memory.py'),String(app.process().pid),report,stop],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let samplerError='';sampler.stderr.on('data',b=>samplerError+=b);
 const sampled=new Promise((resolve,reject)=>{sampler.on('error',reject);sampler.on('close',code=>code===0?resolve():reject(Error(samplerError||'Sampler failed')));});
 // Attach a rejection handler now; await the same promise during cleanup.
 sampled.catch(()=>{});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  await app.evaluate(({dialog},target)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});},target);
  const started=Date.now();await page.click('#openFile');await page.click('#runWorkflow');
  await page.waitForFunction(()=>current?.data?.schema==='studio-native/1',null,{timeout:120000});
  const elapsed=Date.now()-started;
  assert.equal(await page.evaluate(()=>current.paged),true);
  assert.equal(await page.evaluate(()=>current.data.functions.some(f=>f.instructions)),false);
  const count=await page.evaluate(()=>current.data.functions.length);assert.ok(count>200);
  await page.click('[data-tab="native"]');await page.locator('#nativeFunctions .native-function').first().waitFor();
  assert.equal(await page.locator('#nativeFunctions .native-function').count(),100);
  await page.getByRole('button',{name:'Next candidates',exact:true}).click();await page.getByRole('button',{name:'Next candidates',exact:true}).click();
  assert.equal(await page.locator('#nativeFunctions .native-function').count(),count-200);
  const last=await page.evaluate(()=>current.data.functions.at(-1).address);
  await page.locator('#nativeFunctions .native-function').last().click();await page.waitForFunction(address=>nativeFunction?.address===address,last);
  await page.click('[data-native-mode="graph"]');assert.ok(await page.locator('.basic-block').count()>0);
  await page.click('[data-native-mode="references"]');await page.getByRole('button',{name:'Next references',exact:false}).waitFor();
  const id=await page.evaluate(()=>current.id),first=await page.evaluate(()=>current.data.functions[0].address);
  await page.fill('#nativeAddress',first);await page.click('#nativeGo');await page.waitForFunction(address=>nativeFunction?.address===address,first);
  await page.click('#nativeBack');await page.waitForFunction(address=>nativeFunction?.address===address,last);
  assert.equal(await page.evaluate(()=>nativeMode),'references');assert.equal(await page.evaluate(()=>nativeListPage),2);
  await page.click('#nativeForward');await page.waitForFunction(address=>nativeFunction?.address===address,first);

  await page.reload();await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  await page.locator('#history button').first().click();assert.equal(await page.evaluate(()=>current.id),id);
  const exported=path.join(folder,'export.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);
  await page.click('#export');await page.locator('#toast').filter({hasText:'Evidence exported'}).waitFor();
  const evidence=JSON.parse(await fs.readFile(exported,'utf8'));assert.equal(evidence.functions.length,count);assert.ok(evidence.functions[0].instructions.length>0);
  assert.equal(evidence.subject.sha256,await page.evaluate(()=>current.data.subject.sha256));assert.deepEqual(errors,[]);
  await fs.writeFile(stop,'stop');await sampled;
  const memory=JSON.parse(await fs.readFile(report,'utf8'));
  assert.ok(memory.samples>0&&memory.maximum_process_count>=2);
  const result={target:'Node executable',inputBytes:(await fs.stat(target)).size,functions:count,instructions:evidence.coverage.instructions,elapsedMs:elapsed,...memory};
  await fs.writeFile(path.join(folder,'verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,rows:undefined}));
 }finally{try{await fs.writeFile(stop,'stop');await sampled;}finally{await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
