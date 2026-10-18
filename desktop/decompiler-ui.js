// SPDX-License-Identifier: AGPL-3.0-only
async function refreshDecompiler(){const state=await window.rea.decompilerStatus();$('#ghidraFolder').value=state.settings.ghidra;$('#ghidraJava').value=state.settings.java;$('#decompilerStatus').textContent=state.message;}
refreshDecompiler().catch(e=>toast(e.message));
agentAction('#pickGhidra',async()=>{const p=await window.rea.decompilerPick('ghidra');if(p)$('#ghidraFolder').value=p;});
agentAction('#pickGhidraJava',async()=>{const p=await window.rea.decompilerPick('java');if(p)$('#ghidraJava').value=p;});
agentAction('#saveDecompiler',async()=>{await window.rea.decompilerSave({ghidra:$('#ghidraFolder').value,java:$('#ghidraJava').value});await refreshDecompiler();toast('Decompiler setup saved.');});
agentAction('#stopDecompiler',()=>window.rea.decompilerStop());
agentAction('#decompileSelected',async()=>{
 if(!nativeResult||!nativeFunction)throw Error('Select a native function first.');
 const request={id:nativeResult.id,address:nativeFunction.address};tab('decompiler');$('#decompileSelected').disabled=true;$('#stopDecompiler').disabled=false;
 $('#decompilerProvenance').textContent='Decompiling '+request.address+' locally…';$('#pseudocode').textContent='Waiting for Ghidra…';
 try{const r=await window.rea.decompile(request);$('#decompilerProvenance').textContent=r.engine+' '+r.engineVersion+' · '+r.address+' · '+r.status+' · report '+r.reportId+' · '+(r.message||'');$('#pseudocode').textContent=r.status==='complete'?r.code:'No pseudocode returned. '+(r.message||r.status);}
 catch(e){$('#decompilerProvenance').textContent='Decompilation stopped or failed.';$('#pseudocode').textContent=e.message;}
 finally{$('#decompileSelected').disabled=false;$('#stopDecompiler').disabled=true;}
});
