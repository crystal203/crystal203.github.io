/* Pure identity and routing helpers. Does not load images, skeletons or effects. */
(function(global){
  function normalize(name){return String(name||'').replace(/^illust_/,'').replace(/_(?:front|back|side|tentacle)$/,'').replace(/_\d+$/,'');}
  function resolve(registry, selection){
    if(!selection)return null;
    const names=[selection.resource,selection.name,selection.character].filter(Boolean);
    for(const name of names){const id=registry.aliases[name]||registry.aliases[normalize(name)];if(id&&registry.entities[id])return registry.entities[id];}
    return null;
  }
  function route(entity,view){
    if(!entity)return {view};
    const target=entity[view];if(!target)return null;
    return {view,resource:entity.id,...target};
  }
  let pending;
  function load(){
    if(global.GTLibraryRegistry)return Promise.resolve(global.GTLibraryRegistry);
    if(global.parent!==global){try{if(global.parent.GTRegistry)return global.parent.GTRegistry.load().then(value=>(global.GTLibraryRegistry=value));}catch{}}
    if(!pending)pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script'),url=new URL('../resources/registry.js',source);
      if(global.GT_CACHE_VERSION)url.searchParams.set('gtv',global.GT_CACHE_VERSION);
      script.src=url.href;
      script.onload=()=>global.GTLibraryRegistry?resolve(global.GTLibraryRegistry):reject(new Error('Missing registry'));
      script.onerror=()=>{pending=null;script.remove();reject(new Error('人物索引加载失败，请刷新重试。'));};
      document.head.append(script);
    });
    return pending;
  }
  const source=document.currentScript.src;
  global.GTRegistry={normalize,resolve,route,load};
})(globalThis);
