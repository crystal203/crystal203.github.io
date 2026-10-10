/* Shared searchable viewer resources and the atlas directory; metadata only. */
(function(global){
 const source=document.currentScript.src;let pending;
 function load(){
  if(global.parent!==global){try{if(global.parent.GTResourceCatalog)return global.parent.GTResourceCatalog.load();}catch{}}
  if(!pending)pending=GTResources.fetch(new URL('../resources/search-index.json',source)).then(r=>{if(!r.ok)throw Error('资源搜索索引读取失败');return r.json();}).catch(e=>{pending=null;throw e;});
  return pending;
 }
 function search(items,query){
  const q=query.trim().toLowerCase();if(!q)return [];
  const score=e=>{const names=[e.id,e.name,...(e.aliases||[])].map(v=>String(v).toLowerCase());return names.some(n=>n===q)?3:names.some(n=>n.startsWith(q))?2:names.some(n=>n.includes(q))?1:0;};
  return items.map((e,i)=>({e,i,score:score(e)})).filter(r=>r.score).sort((a,b)=>b.score-a.score||a.i-b.i).map(r=>r.e);
 }
 global.GTResourceCatalog={load,search};
})(globalThis);
