// SPDX-License-Identifier: AGPL-3.0-only
(function(root){
function layoutBlocks(blocks,limit=120){
 const shown=blocks.slice(0,limit),known=new Set(shown.map(b=>b.address)),rank=new Map();
 for(const start of shown){
  if(rank.has(start.address))continue;
  const base=rank.size?Math.max(...rank.values())+1:0;
  rank.set(start.address,base);const queue=[start.address];
  for(let i=0;i<queue.length;i++){
   const source=shown.find(b=>b.address===queue[i]);
   for(const edge of source.edges)if(known.has(edge.target)&&!rank.has(edge.target)){rank.set(edge.target,rank.get(source.address)+1);queue.push(edge.target);}
  }
 }
 const groups=new Map();for(const block of shown){const r=rank.get(block.address);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(block);}
 const nodes=[];let y=40,maxColumns=1;
 for(const r of [...groups.keys()].sort((a,b)=>a-b)){
  const group=groups.get(r);maxColumns=Math.max(maxColumns,Math.min(4,group.length));
  for(let start=0;start<group.length;start+=4){const row=group.slice(start,start+4),heights=row.map(block=>Math.max(140,80+Math.min(block.instructions?.length??8,8)*16+block.edges.length*24));row.forEach((block,i)=>nodes.push({address:block.address,x:60+i*340,y,width:280,height:heights[i]}));y+=Math.max(...heights)+70;}
 }
 const positions=new Map(nodes.map(n=>[n.address,n])),edges=[];
 for(const block of shown)for(const edge of block.edges){
  const from=positions.get(block.address),to=positions.get(edge.target);
  let d=null;
  if(to){
   if(to.y>from.y){const x=from.x+140,a=from.y+from.height,b=to.y;d=`M ${x} ${a} C ${x} ${a+40}, ${to.x+140} ${b-40}, ${to.x+140} ${b}`;}
   else{const x=from.x+280,a=from.y+from.height/2,b=to.y+80,lane=Math.max(x,to.x+280)+30;d=`M ${x} ${a} C ${lane} ${a}, ${lane} ${b}, ${to.x+280} ${b}`;}
  }
  edges.push({source:block.address,target:edge.target,kind:edge.kind,path:d,status:to?'visible':edge.target?'outside':'unresolved'});
 }
 return {nodes,edges,width:maxColumns*340+100,height:Math.max(350,y),omitted:Math.max(0,blocks.length-shown.length)};
}
if(typeof module!=='undefined'&&module.exports)module.exports={layoutBlocks};else root.layoutBlocks=layoutBlocks;
})(globalThis);
