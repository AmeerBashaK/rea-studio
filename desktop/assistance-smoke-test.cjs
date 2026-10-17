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
 const sourceFile=path.join(profile,'snippet.js');await fs.writeFile(sourceFile,'const value = 42;\nconsole.log(value);\n');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sourceFile);
 await page.click('#openFile');await page.locator('#files button').filter({hasText:'snippet.js'}).click();
 await page.locator('#sourceText').filter({hasText:'console.log(value)'}).waitFor();
 await page.evaluate(()=>{const text=document.querySelector('#sourceText').firstChild,range=document.createRange();range.setStart(text,text.textContent.indexOf('console'));range.setEnd(text,text.textContent.indexOf('console')+7);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await page.click('#explainSelection');assert.match(await page.locator('#agentPrompt').inputValue(),/"firstLine": 2/);
 assert.match(await page.locator('#agentPrompt').inputValue(),/console.log\(value\)/);
 assert.match(await page.locator('#agentOutput').textContent(),/received: Explain this/);
 const priorOutput=await page.locator('#agentOutput').textContent();
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
 await page.click('#agentClaude');assert.equal(await page.locator('#agentName').inputValue(),'Echo test');
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:['C:\\Tools\\claude.exe']});});
 await page.click('#agentClaude');assert.equal(await page.locator('#agentName').inputValue(),'Claude Code explanations');
 assert.equal(await page.locator('#agentProfiles').evaluate(e=>e.selectedIndex),-1);
 assert.deepEqual(JSON.parse(await page.locator('#agentArgs').inputValue()),require('./agent-presets.js').create('claude','').args);
 assert.equal(await page.locator('#agentOutput').textContent(),priorOutput);
 await page.screenshot({path:path.join(profile,'ai-tools.png')});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#agentName').value==='Echo test');assert.deepEqual(errors,[]);
 console.log('PASS explanations, JSON export, agent profile persistence and real CLI stdin/output');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
