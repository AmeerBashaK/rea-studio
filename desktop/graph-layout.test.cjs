// SPDX-License-Identifier: AGPL-3.0-only
const {test}=require('node:test'),assert=require('node:assert/strict');
const {layoutBlocks}=require('./graph-layout.js');
const block=(address,targets=[])=>({address,edges:targets.map(target=>({target,kind:'branch'}))});
test('diamond branches and join keep every edge attached to a real block',()=>{
 const g=layoutBlocks([block('a',['b','c']),block('b',['d']),block('c',['d']),block('d')]);
 assert.equal(g.nodes.length,4);assert.equal(g.edges.length,4);assert.ok(g.edges.every(e=>e.status==='visible'&&e.path));
 for(const a of g.nodes)for(const b of g.nodes)if(a!==b)assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
});
test('loops and self edges terminate and remain visible',()=>{
 const g=layoutBlocks([block('a',['a','b']),block('b',['a'])]);
 assert.equal(g.nodes.length,2);assert.equal(g.edges.length,3);assert.ok(g.edges.every(e=>e.path&&!e.path.includes('NaN')));
});
test('unresolved targets, outside targets and capped nodes are explicit',()=>{
 const g=layoutBlocks([block('a',[null,'external','b']),block('b')],1);
 assert.equal(g.omitted,1);assert.deepEqual(g.edges.map(e=>e.status),['unresolved','outside','outside']);assert.ok(g.edges.every(e=>e.path===null));
 const large=layoutBlocks(Array.from({length:130},(_,i)=>block(String(i),[String(i+1)])));
 assert.equal(large.nodes.length,120);assert.equal(large.omitted,10);
});
