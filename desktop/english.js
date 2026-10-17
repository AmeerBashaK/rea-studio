// SPDX-License-Identifier: AGPL-3.0-only
(function(root){
 function instruction(i){
  const m=String(i.mnemonic||'').toLowerCase(),o=String(i.operands||'');
  const rules={mov:'Copy a value into a register or memory location.',movzx:'Copy a smaller unsigned value and fill extra bits with zeros.',movsx:'Copy a smaller signed value while preserving its sign.',lea:'Calculate an address or arithmetic expression without reading memory at that address.',push:'Place a value on the stack, a temporary last-in-first-out storage area.',pop:'Take the top value off the stack.',call:'Call another routine; it may return here afterwards.',ret:'Return control to the caller.',jmp:'Continue execution at another location.',cmp:'Compare values and update condition flags; do not store the subtraction result.',test:'Check bits and update condition flags without storing the bitwise result.',add:'Add values and store the result.',sub:'Subtract values and store the result.',xor:'Combine bits: each result bit is 1 when the input bits differ.',and:'Keep bits that are 1 in both inputs.',or:'Set bits that are 1 in either input.',nop:'Perform no ordinary data operation.',int3:'Trigger a debugger breakpoint trap.',leave:'Restore the stack frame before returning.'};
  let english=rules[m];
  if(!english&&/^j/.test(m))english='Jump only when this instruction’s processor condition is satisfied. The exact condition depends on '+m+'.';
  return {method:'instruction-glossary/1',certainty:english?'instruction-level only':'unsupported',english:english||'No verified plain-English explanation is available for this instruction.',operands:o,limitation:'Describes an instruction, not the purpose of the program. Register values, types and surrounding context may be unknown.'};
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
