// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=await fs.mkdtemp(path.resolve('verification/assistance-'));
 const app=await _electron.launch({executablePath:require('../desktop/node_modules/electron'),args:[path.resolve('desktop'),'--user-data-dir='+profile]});
 try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
 await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[paths.sample]});dialog.showSaveDialog=async()=>({canceled:false,filePath:paths.export});dialog.showMessageBox=async()=>({response:1});},{sample:path.resolve('verification/native-x64.exe'),export:path.join(profile,'explained.json')});
 await page.click('#openFile');await page.click('#runWorkflow');await page.waitForFunction(()=>current?.data?.schema==='studio-native/1');
 await page.click('[data-tab="native"]');await page.locator('#nativeContent').filter({hasText:'Call another routine'}).waitFor();
 await page.click('[data-tab="workbench"]');await page.click('#exportExplained');await page.locator('#toast').filter({hasText:'Explained JSON exported'}).waitFor();
 const report=JSON.parse(await fs.readFile(path.join(profile,'explained.json'),'utf8'));assert.ok(report.explained.functions[0].instructions[0]._rea_explanation);assert.equal(report.evidence.functions[0].instructions[0]._rea_explanation,undefined);
 await page.click('[data-tab="agents"]');await page.fill('#agentName','Echo test');await page.fill('#agentExe',process.execPath);
 await page.fill('#agentArgs',JSON.stringify(['-e',"let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>console.log('received: '+s));"]));
 await page.click('#agentSave');await page.locator('#toast').filter({hasText:'AI tool saved'}).waitFor();
 await page.fill('#agentPrompt','Explain this');await page.click('#agentContext');assert.match(await page.locator('#agentPrompt').inputValue(),/UNTRUSTED ANALYSIS DATA/);
 await page.click('#agentRun');await page.locator('#agentOutput').filter({hasText:'received: Explain this'}).waitFor();
 await page.reload();await page.waitForFunction(()=>document.querySelector('#agentName').value==='Echo test');assert.deepEqual(errors,[]);
 console.log('PASS explanations, JSON export, agent profile persistence and real CLI stdin/output');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
