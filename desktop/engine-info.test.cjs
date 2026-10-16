// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngineInfo}=require('./engine-info.cjs');
test('concurrent callers and later reloads share successful discovery',async()=>{
 const calls=[];const info=createEngineInfo(async args=>{calls.push(args[0]);return args[0]==='--help'?'  analyze  Analyze input':'6.5.0\n';});
 const values=await Promise.all([info(),info(),info()]);
 assert.deepEqual(values[0],{help:'  analyze  Analyze input',version:'6.5.0'});
 assert.deepEqual(await info(),values[0]);
 assert.deepEqual(calls,['--help','--version']);
});
test('failed version lookup is shared but retried on next request',async()=>{
 let fail=true;const calls=[];
 const info=createEngineInfo(async args=>{calls.push(args[0]);if(args[0]==='--version'&&fail)throw Error('offline');return args[0]==='--help'?'help':'version';});
 const results=await Promise.allSettled([info(),info()]);
 assert.ok(results.every(r=>r.status==='rejected'));
 fail=false;assert.equal((await info()).version,'version');
 assert.deepEqual(calls,['--help','--version','--help','--version']);
});
test('empty discovery is not cached',async()=>{
 let empty=true;const info=createEngineInfo(async()=>empty?'':'valid');
 await assert.rejects(info(),/Empty/);empty=false;
 assert.equal((await info()).version,'valid');
});
