// SPDX-License-Identifier: AGPL-3.0-only
const {test}=require('node:test'),assert=require('node:assert/strict');
const english=require('./english.js'),{AgentRunner,validate}=require('./agent-runner.cjs');
test('explanations preserve evidence values and disclose unknown operations',()=>{
 const source={functions:[{instructions:[{mnemonic:'mov',operands:'eax, 42'},{mnemonic:'unknownxyz'}]}]};
 const output=english.annotated(source);
 assert.equal(output.functions[0].instructions[0].operands,'eax, 42');
 assert.equal(output.functions[0].instructions[1]._rea_explanation.certainty,'unsupported');
 assert.equal(source._rea_explanation,undefined);assert.ok(output._rea_fields.functions);
});
test('agent validates profiles and passes prompts literally over stdin',async()=>{
 assert.throws(()=>validate({name:'bad',executable:'cmd.bat',args:[]}));
 const runner=new AgentRunner();
 const r=await runner.run({name:'test CLI',executable:process.execPath,args:['-e',"let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>process.stdout.write(s));"]},'literal $(no-command) & text',process.cwd());
 assert.equal(r.code,0);assert.equal(r.stdout,'literal $(no-command) & text\n');
});

test('agent cancellation stops a running CLI and allows restart',async()=>{
 const runner=new AgentRunner();
 const pending=runner.run({name:'wait',executable:process.execPath,args:['-e','setInterval(()=>{},1000)']},'wait',process.cwd());
 runner.cancel();const stopped=await pending;assert.equal(stopped.reason,'Stopped by user.');assert.equal(runner.child,null);
 const done=await runner.run({name:'next',executable:process.execPath,args:['-e','process.stdin.resume()']},'done',process.cwd());assert.equal(done.code,0);
});
test('agent failure and output overflow are reported',async()=>{
 const runner=new AgentRunner();
 await assert.rejects(runner.run({name:'missing',executable:require('node:path').join(process.cwd(),'absent-agent.exe'),args:[]},'hello',process.cwd()));
 // Wait for failed-spawn close before checking a separate invocation.
 await new Promise(resolve=>setImmediate(resolve));
 const result=await runner.run({name:'large',executable:process.execPath,args:['-e',"process.stdout.write('x'.repeat(3*1024*1024))"]},'hello',process.cwd());
 assert.match(result.reason,/2 MB/);assert.ok(Buffer.byteLength(result.stdout)<=2*1024*1024);
});

test('English descriptions name operands without guessing program intent',()=>{
 assert.match(english.instruction({mnemonic:'mov',operands:'eax, 0x2a'}).english,/Copy the number 0x2a into register eax/);
 assert.match(english.instruction({mnemonic:'mov',operands:'rax, qword ptr [rbx + 8]'}).english,/memory at qword ptr/);
 assert.match(english.instruction({mnemonic:'lea',operands:'rax, [rbx + 8]'}).english,/do not read the contents/);
 assert.match(english.instruction({mnemonic:'sub',operands:'rsp, 0x20'}).english,/Subtract the number 0x20 from register rsp/);
 assert.match(english.instruction({mnemonic:'jne',operands:'0x1000'}).english,/zero flag is clear/);
 assert.match(english.instruction({mnemonic:'jrcxz',operands:'0x1000'}).english,/RCX register is zero/);
 assert.doesNotMatch(english.instruction({mnemonic:'cmp',operands:'eax, ebx'}).english,/equal/);
 assert.equal(english.instruction({mnemonic:'vzeroupper'}).certainty,'unsupported');
});

test('source selection preserves full lines and exact provenance',()=>{
 const {snippet,prompt}=require('./snippets.js');
 const text='const x = 1;\r\n\r\nconsole.log(x);\r\n';
 const result=snippet(text,text.indexOf('console')+2,text.indexOf('console')+5,'sample.js');
 assert.deepEqual(result.lines,[{line:3,text:'console.log(x);'}]);
 assert.equal(result.firstLine,3);assert.equal(result.lastLine,3);
 assert.match(prompt(result),/EVERY numbered line/);assert.match(prompt(result),/UNTRUSTED SOURCE DATA/);
 assert.equal(snippet('a\nb\nc',0,2,'test').lastLine,1);
 assert.deepEqual(snippet('\na',0,1,'test').lines,[{line:1,text:''}]);
 assert.throws(()=>snippet('a',0,0,'test'),/Select/);
 assert.throws(()=>snippet('x'.repeat(20001),0,1,'test'),/fewer lines/);
});
