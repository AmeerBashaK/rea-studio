// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const folder=await fs.mkdtemp(path.resolve(__dirname,'../verification/focused-'));
 const sample=path.join(folder,'sample.exe');
 const bytes=await fs.readFile(path.resolve(__dirname,'../verification/native-x64.exe'));
 await fs.writeFile(sample,bytes);
 const app=await _electron.launch({executablePath:require('electron'),args:[__dirname,'--user-data-dir='+path.join(folder,'profile')],timeout:60000});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  await app.evaluate(({dialog},sample)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[sample]});},sample);
  await page.click('#openFile');await page.click('#runWorkflow');
  await page.waitForFunction(()=>current?.data?.schema==='studio-native/1');
  const original=await page.evaluate(()=>current.id);
  const snapshot=await page.evaluate(async id=>JSON.stringify(await window.rea.result(id)),original);
  const changed=Buffer.from(bytes);changed[544]=0xc3;await fs.writeFile(sample,changed);
  await page.click('[data-tab="native"]');await page.fill('#nativeAddress','140001020');await page.click('#nativeAnalyzeAddress');
  await page.waitForFunction(()=>current?.data?.code==='native_input_error');
  assert.match(await page.locator('#result').textContent(),/SHA-256 changed/);
  assert.equal(await page.evaluate(()=>current.parentId),original);
  assert.equal(await page.evaluate(async id=>JSON.stringify(await window.rea.result(id)),original),snapshot);
  await fs.writeFile(sample,bytes);
  // Cancel immediately after the actual worker starts; no worker stubs or sleeps.
  const cancelled=await page.evaluate(async id=>{const run=await window.rea.focus({id,address:'0x140001020'});await window.rea.cancel();return run.id;},original);
  await page.waitForFunction(id=>current?.id===id,cancelled);
  assert.equal(await page.evaluate(()=>current.cancelled),true);
  assert.equal(await page.evaluate(()=>current.parentId),original);
  assert.equal(await page.evaluate(async id=>JSON.stringify(await window.rea.result(id)),original),snapshot);
  const restarted=await page.evaluate(async id=>(await window.rea.focus({id,address:'0x140001020'})).id,original);
  await page.waitForFunction(id=>current?.id===id,restarted);
  assert.equal(await page.evaluate(()=>current.code),0);
  assert.equal(await page.evaluate(()=>current.data.functions[0].address),'0x140001020');
  await page.click('[data-tab="native"]');await page.click('#nativeSeedToggle');
  await page.locator('#nativeFunctions .native-function').filter({hasText:'0x140001000'}).click();
  assert.equal(await page.locator('#nativeAddress').inputValue(),'0x140001000');
  assert.match(await page.locator('#nativeFunctions').textContent(),/Not decoded in this result/);
  await page.reload();await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  const saved=await page.evaluate(async ids=>Promise.all(ids.map(id=>window.rea.result(id))),[original,cancelled,restarted]);
  assert.equal(saved[0].data.subject.sha256,saved[2].data.subject.sha256);
  assert.equal(saved[1].cancelled,true);assert.equal(saved[2].parentId,original);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(folder,'verification.json'),JSON.stringify({passed:true,original,cancelled,restarted,checks:['input replacement rejected','original record unchanged','worker cancelled','restart succeeded','records survived reload']},null,2));
  console.log('PASS: file replacement rejected, original evidence unchanged, actual worker cancelled, restart successful, history persisted, no renderer errors.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
