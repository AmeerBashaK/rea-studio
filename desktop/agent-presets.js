// SPDX-License-Identifier: AGPL-3.0-only
(function(root){
 function create(id,executable){
  if(id!=='claude')throw Error('Unknown AI tool preset.');
  return {name:'Claude Code explanations',executable,args:['-p','--input-format','text','--output-format','text','--tools','','--disallowedTools','mcp__*']};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReaAgentPresets=api;
})(typeof globalThis!=='undefined'?globalThis:this);
