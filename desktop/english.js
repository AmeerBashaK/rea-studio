// SPDX-License-Identifier: AGPL-3.0-only
(function(root){
 // Intel SDM instruction reference; descriptions are partial, not lifted semantics.
 function operand(text){
  if(/^-?(?:0x[0-9a-f]+|[0-9]+)$/i.test(text))return 'the number '+text;
  if(/^(?:r(?:[0-9]+|ax|bx|cx|dx|si|di|sp|bp)(?:d|w|b)?|e(?:ax|bx|cx|dx|si|di|sp|bp)|[abcd][xhl]|[sd]i|[sb]p|[sd]il|[sb]pl)$/i.test(text))return 'register '+text+' (a small processor storage slot)';
  if(/\[[^\]]+\]/.test(text))return 'memory at '+text+' (the brackets describe its address)';
  return text;
 }
 function instruction(i){
  const m=String(i.mnemonic||'').toLowerCase(),o=String(i.operands||'');
  const rules={mov:'Copy a value into a register or memory location.',movzx:'Copy a smaller unsigned value and fill extra bits with zeros.',movsx:'Copy a smaller signed value while preserving its sign.',lea:'Calculate an address or arithmetic expression without reading memory at that address.',push:'Place a value on the stack, a temporary last-in-first-out storage area.',pop:'Take the top value off the stack.',call:'Call another routine; it may return here afterwards.',ret:'Return control to the caller.',jmp:'Continue execution at another location.',cmp:'Compare values and update condition flags; do not store the subtraction result.',test:'Check bits and update condition flags without storing the bitwise result.',add:'Add values and store the result.',sub:'Subtract values and store the result.',xor:'Combine bits: each result bit is 1 when the input bits differ.',and:'Keep bits that are 1 in both inputs.',or:'Set bits that are 1 in either input.',nop:'Perform no ordinary data operation.',int3:'Trigger a debugger breakpoint trap.',leave:'Restore the stack frame before returning.'};
  let english=rules[m];
  const parts=o.split(',').map(s=>s.trim()),dest=operand(parts[0]||''),src=operand(parts[1]||'');
  if(parts.length===2&&parts.every(Boolean)){
   if(m==='mov')english='Copy '+src+' into '+dest+'.';
   if(m==='lea')english='Calculate the address expression '+parts[1]+' and store it in '+dest+'; do not read the contents at that address.';
   if(m==='add'||m==='sub')english=(m==='add'?'Add ':'Subtract ')+src+(m==='add'?' to ':' from ')+dest+' and store the result in '+parts[0]+'.';
   if(m==='cmp')english='Compare '+dest+' with '+src+' by updating processor status flags; leave both operands unchanged.';
   if(m==='test')english='Check which bits are set in both '+parts[0]+' and '+parts[1]+', updating status flags without changing either operand.';
  }
  if(m==='push'&&o)english='Place the value from '+operand(o)+' on the stack (temporary last-in-first-out storage).';
  if(m==='pop'&&o)english='Take the top stack value and put it in '+operand(o)+'.';
  if(m==='call'&&o)english='Call another routine using '+operand(o)+' as the target; it may return here afterwards.';
  if(m==='jmp'&&o)english='Continue execution using '+operand(o)+' as the target.';
  const conditions={je:'the zero flag is set',jz:'the zero flag is set',jne:'the zero flag is clear',jnz:'the zero flag is clear',jc:'the carry flag is set',jb:'the carry flag is set',jnae:'the carry flag is set',jnc:'the carry flag is clear',jae:'the carry flag is clear',jnb:'the carry flag is clear',jo:'the overflow flag is set',jno:'the overflow flag is clear',js:'the sign flag is set',jns:'the sign flag is clear',jcxz:'the CX register is zero',jecxz:'the ECX register is zero',jrcxz:'the RCX register is zero'};
  if(conditions[m])english='Jump to '+o+' if '+conditions[m]+'; otherwise continue with the next instruction. Status flags are processor indicators, not proof of a particular source-code condition.';
  else if(!english&&/^j/.test(m))english='Conditional jump '+m+' to '+o+'. Its exact condition is not translated by this glossary.';
  return {method:'instruction-glossary/2',certainty:english?'instruction-level only':'unsupported',english:english||'No verified plain-English explanation is available for this instruction.',operands:o,limitation:'Describes an instruction, not the purpose of the program. Register values, types and surrounding context may be unknown.'};
 }
 function field(key){return ({sha256:'A fingerprint of the exact file bytes; changed bytes produce a different fingerprint.',address:'A location in the program’s virtual address space.',offset:'A position measured from the start of the file or collection.',imports:'External routines the program declares it may use.',exports:'Named routines or values exposed to other programs.',strings:'Readable text found in the file; its presence does not prove it is used.',references:'Observed links between instructions and other locations.',functions:'Candidate routines found by analysis; discovery can be incomplete.',coverage:'What the analysis examined and which limits it encountered.',instructions:'Decoded processor operations, in execution-address order.',blocks:'Groups of instructions with control-flow connections.',unresolved:'The target or meaning could not be established.',source:'Where the observed link starts.',target:'Where the observed link points, if known.',bytes:'Original machine-code bytes.',mnemonic:'Short name of the processor operation.',operands:'Registers, constants or memory expressions used by the operation.'})[key]||'Recorded evidence field: '+key+'. Its meaning depends on the surrounding section; no program-purpose inference is made.';}
 function annotated(value,key='Evidence'){
  if(Array.isArray(value))return value.map(v=>annotated(v,key));
  if(value&&typeof value==='object'){
   const out={};for(const [k,v] of Object.entries(value))out[k]=annotated(v,k);
   out._rea_fields=Object.fromEntries(Object.keys(value).map(k=>[k,field(k)]));
   if(typeof value.mnemonic==='string')out._rea_explanation=instruction(value);
   else out._rea_explanation={method:'field-glossary/1',english:field(key)};
   return out;
  }
  return value;
 }
 const api={instruction,field,annotated};if(typeof module==='object')module.exports=api;else root.ReaEnglish=api;
})(globalThis);
