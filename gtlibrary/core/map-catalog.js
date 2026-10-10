/* Shared metadata and directory navigation; independent of the map renderer. */
(function(global){
 let pending;
 const source=document.currentScript.src;
 function load(){
  if(global.parent!==global){try{if(global.parent.GTMapCatalog)return global.parent.GTMapCatalog.load();}catch{}}
  if(!pending)pending=GTResources.fetch(new URL('../resources/map/catalog.json',source)).then(r=>{if(!r.ok)throw new Error('地图目录读取失败：'+r.status);return r.json();}).then(c=>{if(!Array.isArray(c.maps)||c.maps.length!==c.deployedCount)throw new Error('地图目录格式错误');return c;}).catch(e=>{pending=null;throw e;});
  return pending;
 }
 function navigation(catalog){
  const nodes=new Map((catalog.categories||[]).map(n=>[n.id,n]));
  const children=id=>[...nodes.values()].filter(n=>n.parent===(id==='categories'?null:id)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const path=id=>{const result=[];for(let n=nodes.get(id);n;n=nodes.get(n.parent))result.unshift(n);return result;};
  const label=id=>id==='categories'?'选择分类':id==='all'?'全部地图':nodes.get(id)?.label||id;
  const contains=(id,m)=>id==='categories'||id==='all'||(m.categoryPath||[m.category]).includes(id);
  const matches=(m,q)=>!q||[m.id,m.title,m.group,m.variant,...path(m.category).flatMap(n=>[n.label,...(n.aliases||[])])].some(v=>v?.toLowerCase().includes(q));
  const resolve=(id,map)=>['categories','all'].includes(id)||nodes.has(id)?id:map&&(map.sourceCategory===id||map.category===id)?map.category:'categories';
  const ordered=[];function visit(id){for(const n of children(id)){ordered.push(n);visit(n.id);}}visit('categories');
  return {nodes,children,path,label,contains,matches,resolve,ordered};
 }
 global.GTMapCatalog={load,navigation};
})(globalThis);
