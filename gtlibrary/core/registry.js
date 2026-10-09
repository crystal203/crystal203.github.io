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
  global.GTRegistry={normalize,resolve,route};
})(globalThis);
