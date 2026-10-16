// SPDX-License-Identifier: AGPL-3.0-only
// Cache only successful upstream discovery; failed attempts can be retried.
function createEngineInfo(call){
  let pending;
  return function info(){
    if(!pending){
      pending=(async()=>{
        const help=await call(['--help']);
        const version=(await call(['--version'])).trim();
        if(!help.trim()||!version)throw Error('Empty engine information');
        return {help,version};
      })().catch(error=>{pending=undefined;throw error;});
    }
    return pending;
  };
}
module.exports={createEngineInfo};
