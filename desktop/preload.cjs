// SPDX-License-Identifier: AGPL-3.0-only
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('rea',{
  info:()=>ipcRenderer.invoke('info'), choose:kind=>ipcRenderer.invoke('choose',kind),
  files:relative=>ipcRenderer.invoke('files',relative), read:relative=>ipcRenderer.invoke('read',relative),
  run:args=>ipcRenderer.invoke('run',args), cancel:()=>ipcRenderer.invoke('cancel'),
  history:()=>ipcRenderer.invoke('history'), result:id=>ipcRenderer.invoke('result',id),
  nativeFunction:value=>ipcRenderer.invoke('native-function',value),
  nativeLocate:value=>ipcRenderer.invoke('native-locate',value),
  nativeRelated:value=>ipcRenderer.invoke('native-related',value),
  nativePage:value=>ipcRenderer.invoke('native-page',value),
  focus:value=>ipcRenderer.invoke('focus',value),
  export:id=>ipcRenderer.invoke('export',id),
  bookmark:value=>ipcRenderer.invoke('bookmark',value),
  annotations:id=>ipcRenderer.invoke('annotations',id),annotate:value=>ipcRenderer.invoke('annotate',value),
  onEvent:fn=>{ipcRenderer.on('event',(_e,data)=>fn(data));}
});
