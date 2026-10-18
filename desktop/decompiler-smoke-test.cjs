// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.resolve('verification/decompiler-desktop-'));
 const fixture=path.join(profile,'fixture.exe');await fs.copyFile(path.resolve('verification/compiler-pbhossxj/fixture-64-O0.exe'),fixture);
 const app=await _electron.launch({executablePath:process.env.REA_TEST_EXE||require('electron'),args:[...(process.env.REA_TEST_EXE?[]:[__dirname]),'--user-data-dir='+profile],timeout:60000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
  await page.click('[data-tab="decompiler"]');await page.locator('#decompilerStatus').filter({hasText:'Select a local'}).waitFor();
  const ghidra=path.resolve('verification/tools/ghidra_12.1.4_PUBLIC'),java='C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.4.101-hotspot\\bin\\java.exe';
  await page.fill('#ghidraFolder',ghidra);await page.fill('#ghidraJava',java);await page.click('#saveDecompiler');await page.locator('#toast').filter({hasText:'Decompiler setup saved'}).waitFor();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
  await page.click('#openFile');await page.click('#runWorkflow');await page.waitForFunction(()=>current?.data?.schema==='studio-native/1');
  await page.click('[data-tab="native"]');await page.locator('#nativeFunctions button').filter({hasText:'0x401000'}).click();
  const invalid=await page.evaluate(async()=>{try{await window.rea.decompile({id:nativeResult.id,address:'0x1'});return 'accepted';}catch(e){return e.message;}});assert.match(invalid,/Choose a function/);
  await page.click('#decompileSelected');
  const end=Date.now()+40000;let started=false;
  while(Date.now()<end){const entries=await fs.readdir(path.join(profile,'decompilations'),{recursive:true}).catch(()=>[]);if(entries.some(f=>String(f).endsWith('application.log'))){started=true;break;}await new Promise(r=>setTimeout(r,100));}
  assert.equal(started,true);await page.click('#stopDecompiler');await page.locator('#pseudocode').filter({hasText:'cancelled'}).waitFor({timeout:30000});
  await page.click('[data-tab="native"]');await page.click('#decompileSelected');await page.locator('#pseudocode').filter({hasText:'return'}).waitFor({timeout:120000});assert.match(await page.locator('#pseudocode').textContent(),/0x13579bd/);assert.match(await page.locator('#decompilerProvenance').textContent(),/Ghidra 12.1.4/);
  const files=(await fs.readdir(path.join(profile,'decompilations'))).filter(f=>f.endsWith('.json'));assert.equal(files.length,1);const report=JSON.parse(await fs.readFile(path.join(profile,'decompilations',files[0]),'utf8'));assert.equal(report.status,'complete');assert.equal(BigInt(report.address),0x401000n);assert.ok(report.analysisId);
  await page.screenshot({path:path.join(profile,'pseudocode.png')});
  await fs.appendFile(fixture,'replacement');await page.click('[data-tab="native"]');await page.click('#decompileSelected');await page.locator('#pseudocode').filter({hasText:'Input hash mismatch'}).waitFor({timeout:30000});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#ghidraFolder').value.length>0);assert.equal(await page.locator('#ghidraFolder').inputValue(),ghidra);assert.deepEqual(errors,[]);
  console.log('PASS desktop real Ghidra setup persistence, selected-function guard, cancellation, restart, pseudocode/provenance/save and replacement rejection. '+profile);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
