// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const folder=await fs.mkdtemp(path.resolve(__dirname,'../verification/single-instance-'));
 const profile=path.join(folder,'profile');
 const executablePath=process.env.REA_TEST_EXE||require('electron');
 const args=[...(process.env.REA_TEST_EXE?[]:[__dirname]),'--user-data-dir='+profile];
 let app,other,duplicate;
 try{
  app=await _electron.launch({executablePath,args,timeout:60000});
  const page=await app.firstWindow();
  await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  const sample=path.resolve(__dirname,'../verification/native-x64.exe');
  await app.evaluate(({dialog},sample)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[sample]});},sample);
  await page.click('#openFile');await page.click('#runWorkflow');
  await page.waitForFunction(()=>current?.data?.schema==='studio-native/1');
  const id=await page.evaluate(()=>current.id);
  await page.click('[data-tab="native"]');
  await page.locator('#nativeBookmark:not([disabled])').waitFor();
  await page.fill('#annotationComment','unsaved note survives duplicate launch');
  await app.evaluate(({app,BrowserWindow})=>{
   global.secondLaunches=0;
   app.on('second-instance',()=>global.secondLaunches++);
   BrowserWindow.getAllWindows()[0].minimize();
  });
  duplicate=spawn(executablePath,args,{windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Duplicate app did not exit')),20000);
   duplicate.once('error',e=>{clearTimeout(timer);reject(e);});
   duplicate.once('exit',(code)=>{clearTimeout(timer);code===0?resolve():reject(Error('Duplicate exit '+code));});
  });
  assert.equal(await app.evaluate(()=>global.secondLaunches),1);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),false);
  assert.equal(await page.evaluate(()=>current.id),id);
  assert.equal(await page.locator('#annotationComment').inputValue(),'unsaved note survives duplicate launch');
  await page.click('#saveAnnotation');
  await page.locator('#toast').filter({hasText:'Function name and notes saved'}).waitFor();
  const notes=await page.evaluate(id=>window.rea.annotations(id),id);
  assert.equal(notes['0x140001000'].comment,'unsaved note survives duplicate launch');
  // A separate profile must remain usable for isolated tests and workspaces.
  other=await _electron.launch({executablePath,args:[...(process.env.REA_TEST_EXE?[]:[__dirname]),'--user-data-dir='+path.join(folder,'other-profile')],timeout:60000});
  await (await other.firstWindow()).locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  assert.equal(await app.evaluate(()=>global.secondLaunches),1);
  await other.close();other=null;
  await app.close();app=null;
  // Graceful shutdown releases the lock; saved notes remain available on reopening.
  app=await _electron.launch({executablePath,args,timeout:60000});
  const reopened=await app.firstWindow();
  await reopened.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  const saved=await reopened.evaluate(id=>window.rea.annotations(id),id);
  assert.equal(saved['0x140001000'].comment,'unsaved note survives duplicate launch');
  console.log('Single-instance test passed: duplicate exits, original restored, draft retained, separate profile and reopen work.');
 }finally{
  if(duplicate&&duplicate.exitCode===null)duplicate.kill();
  if(other)await other.close();
  if(app)await app.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
