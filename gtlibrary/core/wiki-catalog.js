/* Shared, small wiki index. Character details and media load only on selection. */
(function(global){
  const source=document.currentScript.src;
  let pending;
  function load(){
    if(global.parent!==global){try{if(global.parent.GTWikiCatalog)return global.parent.GTWikiCatalog.load();}catch{}}
    if(!pending)pending=GTResources.fetch(new URL('../gtwiki/data/catalog.json',source).href)
      .then(r=>{if(!r.ok)throw Error('角色图鉴目录读取失败：'+r.status);return r.json();})
      .catch(e=>{pending=null;throw e;});
    return pending;
  }
  function resolve(catalog,selection){
    if(!selection)return null;
    for(const value of [selection.hero,selection.resource,selection.name,selection.character,selection.skin,selection.query]){
      const code=String(value||'').replace(/^spine:(?:character|illust):|^atlas:(?:characters|portraits):/,'');
      const id=catalog.aliases[value]||catalog.aliases[code]||code;
      const hero=catalog.heroes.find(h=>h.id===id);
      if(hero)return hero;
    }
    return null;
  }
  function enrich(catalog,registry){
    if(!registry)return;
    for(const entity of Object.values(registry.entities)){
      const hero=resolve(catalog,entity)||entity.aliases?.map(name=>resolve(catalog,{name})).find(Boolean);
      if(hero)entity.wiki={hero:hero.id};
    }
  }
  global.GTWikiCatalog={load,resolve,enrich};
})(globalThis);
