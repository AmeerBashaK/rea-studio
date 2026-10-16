// SPDX-License-Identifier: AGPL-3.0-only
const {_electron}=require('../rea/node_modules/playwright-core');
const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const app=await _electron.launch({executablePath:process.env.REA_TEST_EXE||require('electron'),args:process.env.REA_TEST_EXE?[]:[__dirname],timeout:60000});
 try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
 const sample=path.resolve(__dirname,'../verification/native-x64.exe');
 await app.evaluate(({dialog},sample)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[sample]});},sample);
 await page.click('#openFile');await page.locator('[data-command="native-analyze"].selected').waitFor();await page.click('#runWorkflow');
 await page.locator('#result h3').filter({hasText:'Complete · native-analyze'}).waitFor({timeout:60000});
 await page.click('[data-tab="native"]');await page.locator('#nativeFunctions button').first().waitFor();
 await page.locator('#nativeFunctions button').filter({hasText:'0x140001000'}).click();
 assert.match(await page.locator('#nativeContent').textContent(),/call/);
 await page.fill('#annotationName','entry_reviewed');await page.fill('#annotationComment','Verified call to the helper returning 42.');await page.click('#saveAnnotation');
 await page.locator('#toast').filter({hasText:'Function name and notes saved'}).waitFor();
 await page.click('[data-native-mode="graph"]');assert.ok(await page.locator('.basic-block').count()>=3);
 assert.ok(await page.locator('.graph-edge').count()>=2);
 await page.getByRole('button',{name:'Fit graph',exact:true}).click();
 assert.ok(await page.locator('.connected-graph').evaluate(n=>Number(n.style.zoom))<1);
 await page.locator('#nativeContent').screenshot({path:path.resolve(__dirname,'../verification/studio-connected-graph.png')});
 await page.getByRole('button',{name:'100%',exact:true}).click();
 const arrow=page.locator('.graph-edge').first(),destination=(await arrow.getAttribute('aria-label')).split(' to ')[1];
 await arrow.focus();await arrow.press('Enter');await page.waitForFunction(address=>nativeLocation===address,destination);
 assert.equal(await page.evaluate(()=>nativeMode),'assembly');
 await page.click('#nativeBack');await page.waitForFunction(()=>nativeMode==='graph');

 await page.click('[data-native-mode="references"]');assert.match(await page.locator('#nativeContent').textContent(),/0x140001020/);
 await page.fill('#nativeAddress','140001020');await page.click('#nativeGo');
 assert.match(await page.locator('#nativeContent').textContent(),/0x2a/);
 await page.click('#nativeBack');await page.waitForFunction(()=>nativeFunction?.address==='0x140001000');
 assert.equal(await page.evaluate(()=>nativeMode),'references');
 await page.click('#nativeForward');await page.waitForFunction(()=>nativeFunction?.address==='0x140001020');
 assert.equal(await page.evaluate(()=>nativeMode),'assembly');
 await page.click('#nativeBack');await page.waitForFunction(()=>nativeFunction?.address==='0x140001000');
 await page.fill('#nativeAddress','140001005');await page.click('#nativeGo');
 await page.waitForFunction(()=>nativeLocation==='0x140001005');
 assert.equal(await page.locator('#nativeForward').isDisabled(),true);
 await page.click('#nativeBack');await page.waitForFunction(()=>nativeLocation==='0x140001000');
 assert.equal(await page.evaluate(()=>nativeMode),'references');

 await page.click('[data-native-mode="strings"]');assert.match(await page.locator('#nativeContent').textContent(),/Hello Studio/);
 await page.click('[data-native-mode="sections"]');assert.match(await page.locator('#nativeContent').textContent(),/\.text/);
 await page.click('[data-native-mode="assembly"]');
 await page.screenshot({path:path.resolve(__dirname,'../verification/studio-native.png')});
 await page.reload();await page.locator('#history button').filter({hasText:'native-analyze'}).first().waitFor({timeout:60000});
 await page.locator('#history button').filter({hasText:'native-analyze'}).first().click();await page.click('[data-tab="native"]');
 await page.locator('#nativeFunctions button').filter({hasText:'entry_reviewed'}).waitFor();
 // Focused decoding retains an immutable link to the original result.
 assert.equal(await page.evaluate(()=>current.paged),true);
 assert.equal(await page.evaluate(()=>current.data.functions.some(f=>Array.isArray(f.instructions))),false);
 assert.equal(await page.evaluate(()=>current.data.references),undefined);
 const original=await page.evaluate(()=>current.id);
 await page.fill('#nativeAddress','140001040');await page.click('#nativeAnalyzeAddress');
 await page.waitForFunction(()=>current?.data?.scope?.kind==='focused');
 assert.equal(await page.evaluate(()=>current.parentId),original);
 assert.equal(await page.evaluate(()=>current.data.functions[0].address),'0x140001040');
 assert.equal(await page.evaluate(()=>current.data.functions.length),1);
 await page.locator('#nativeCoverage').filter({hasText:'strings were not rescanned'}).waitFor();
 assert.equal(await page.locator('#nativeBack').isDisabled(),true);
 assert.equal(await page.locator('#nativeForward').isDisabled(),true);
 const focused=await page.evaluate(()=>current.id);
 await page.reload();await page.locator('#status').filter({hasText:'Engine ready'}).waitFor({timeout:60000});
 await page.evaluate(async id=>show(await window.rea.result(id)),focused);
 await page.getByRole('button',{name:'Open original analysis',exact:true}).click();
 await page.locator('#nativeFunctions button').filter({hasText:'entry_reviewed'}).waitFor();
 assert.equal(await page.evaluate(()=>current.id),original);
 // An address in headers must fail without replacing the original record.
 await page.fill('#nativeAddress','140000010');await page.click('#nativeAnalyzeAddress');
 await page.waitForFunction(()=>current?.data?.code==='native_input_error');
 assert.match(await page.locator('#result').textContent(),/not backed by executable/);
 assert.equal(await page.evaluate(async id=>(await window.rea.result(id)).code,original),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: bundled native engine, automatic workflow selection, assembly, call target navigation, CFG blocks, references, strings, sections, saved rename and notes, history reload; no renderer errors.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
