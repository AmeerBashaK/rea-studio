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
 await page.click('[data-native-mode="references"]');assert.match(await page.locator('#nativeContent').textContent(),/0x140001020/);
 await page.fill('#nativeAddress','140001020');await page.click('#nativeGo');
 assert.match(await page.locator('#nativeContent').textContent(),/0x2a/);
 await page.click('[data-native-mode="strings"]');assert.match(await page.locator('#nativeContent').textContent(),/Hello Studio/);
 await page.click('[data-native-mode="sections"]');assert.match(await page.locator('#nativeContent').textContent(),/\.text/);
 await page.click('[data-native-mode="assembly"]');
 await page.screenshot({path:path.resolve(__dirname,'../verification/studio-native.png')});
 await page.reload();await page.locator('#history button').filter({hasText:'native-analyze'}).first().waitFor({timeout:60000});
 await page.locator('#history button').filter({hasText:'native-analyze'}).first().click();await page.click('[data-tab="native"]');
 await page.locator('#nativeFunctions button').filter({hasText:'entry_reviewed'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: bundled native engine, automatic workflow selection, assembly, call target navigation, CFG blocks, references, strings, sections, saved rename and notes, history reload; no renderer errors.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
