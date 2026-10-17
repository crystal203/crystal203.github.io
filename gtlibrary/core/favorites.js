/* Local, shared favorites. Ordering is a stable partition of matching results. */
(function(global){
  'use strict';
  const storageKey='gtlibrary.favorites.v1';
  let saved=new Set(),observer,stopped=false;const scoped=new Map();
  function read(){try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');return new Set(Array.isArray(value)?value.filter(key=>typeof key==='string'):[]);}catch{return null;}}
  saved=read()||saved;
  const key=(scope,id)=>JSON.stringify([String(scope),String(id)]);
  function reindex(){scoped.clear();for(const value of saved){try{const entry=JSON.parse(value);if(!Array.isArray(entry)||entry.length!==2)continue;const [scope,id]=entry;if(!scoped.has(scope))scoped.set(scope,new Set());scoped.get(scope).add(id);}catch{}}}
  reindex();
  const has=(scope,id)=>scoped.get(String(scope))?.has(String(id))||false;
  function idsFor(node){
    const id=node.dataset.favoriteId??node.value;
    if(!node.dataset.favoriteAliases)return [id];
    try{const aliases=JSON.parse(node.dataset.favoriteAliases);return [id,...(Array.isArray(aliases)?aliases.filter(value=>typeof value==='string'):[])];}catch{return [id];}
  }
  const nodeHas=(scope,node)=>idsFor(node).some(id=>has(scope,id));
  function paint(button){
    const on=nodeHas(button.dataset.favoriteScope,button);
    button.textContent=on?'★':'☆';button.setAttribute('aria-pressed',String(on));
    button.title=(on?'取消收藏：':'收藏：')+(button.dataset.favoriteLabel||button.dataset.favoriteId);button.setAttribute('aria-label',button.title);
  }
  function changed(){
    for(const button of document.querySelectorAll('button.gt-favorite'))paint(button);
    for(const select of document.querySelectorAll('select[data-favorites-ready]'))refreshSelect(select,false);
    global.dispatchEvent(new CustomEvent('gt-favorites-change'));
  }
  function setIds(scope,ids,on){
    const latest=read();if(latest)saved=latest;
    for(const id of ids){const value=key(scope,id);if(on)saved.add(value);else saved.delete(value);}
    try{localStorage.setItem(storageKey,JSON.stringify([...saved]));}catch{/* Keep working when browser storage is unavailable. */}
    reindex();changed();return on;
  }
  const set=(scope,id,on)=>setIds(scope,[id],on);
  function order(items,keyOf){
    if(!scoped.size)return items.slice();
    const favorites=[],other=[];
    for(const item of items){const value=keyOf(item);(Array.isArray(value)&&has(...value)?favorites:other).push(item);}
    return favorites.concat(other);
  }
  function button(scope,id,label){
    const button=document.createElement('button');button.type='button';button.className='gt-favorite';
    button.dataset.favoriteScope=scope;button.dataset.favoriteId=String(id);button.dataset.favoriteLabel=label||String(id);paint(button);return button;
  }
  function row(choice,scope,id,label){
    const container=document.createElement('div');container.className='gt-favorite-row';choice.classList.add('gt-favorite-choice');container.append(choice,button(scope,id,label));return container;
  }
  function keysForEntity(entity){
    const keys=[];
    if(entity.spine)keys.push(['spine/'+entity.spine.folder,entity.spine.name]);
    if(entity.illust)keys.push(['spine/'+entity.illust.folder,entity.illust.name]);
    if(entity.wiki)keys.push(['wiki/hero',entity.wiki.hero]);
    if(entity.audio)keys.push(['audio/clip',entity.audio.clip]);
    if(entity.map)keys.push(['map/map',entity.map.map]);
    if(entity.fx){if(entity.fx.effect)keys.push(['fx/effect',entity.fx.effect]);keys.push(['fx/character',entity.fx.character]);}
    if(entity.atlas)keys.push(entity.atlas.query?['atlas/region/'+entity.atlas.sheet,entity.atlas.query]:['atlas/sheet',entity.atlas.sheet]);
    return keys.filter(([,id])=>id!==undefined&&id!==null);
  }
  const entityKey=entity=>{const keys=keysForEntity(entity);return keys.find(value=>has(...value))||keys[0]||['resource',entity.id];};

  // Native selects retain their values, selection, and original option text.
  // Stars use option.label so existing code comparing option.text still works.
  const selections=new WeakMap(),pending=new Set();let scheduled=false;
  const app=()=>document.body?.dataset.app||location.pathname.match(/\/apps\/([^/]+)\//)?.[1]||'library';
  function scopeFor(select){
    if(select.dataset.favoriteScope)return select.dataset.favoriteScope;
    if(app()==='map'&&select.dataset.field){const scopes={animation:'spine/action/character',expression:'spine/expression/character',sub:'spine/sub/character',skin:'spine/skin',direction:'spine/direction'};if(scopes[select.dataset.field])return scopes[select.dataset.field];}
    const folder=document.getElementById('folderSelector')?.value||'character';
    const scopes={
      spine:{skinSelector:'spine/skin',trackAction:'spine/action/'+folder,trackEmote:'spine/expression/'+folder,trackSub:'spine/sub/'+folder,equipmentSlot:'spine/equipment-slot',
        'sceneProp-skin':'spine/skin','sceneProp-action':'spine/action/character','sceneProp-expression':'spine/expression/character','sceneProp-sub':'spine/sub/character','sceneProp-direction':'spine/direction'},
      atlas:{spritesheetSelect:'atlas/sheet'},fx:{effect:'fx/effect'},audio:{group:'audio/group'},
      wiki:{'illust-select':'wiki/illustration','stats-stage':'wiki/stage','skill-set':'wiki/skill-set'},
      map:{category:'map/category','character-action':'spine/action/character','character-skin':'spine/skin','character-expression':'spine/expression/character','character-sub':'spine/sub/character','scene-preset':'map/scene','presentation-preset':'map/scene'}
    };
    return scopes[app()]?.[select.id];
  }
  function refreshSelect(select,reorder=true){
    if(!select.isConnected)return;
    const scope=scopeFor(select);if(!scope)return;
    let state=selections.get(select);
    if(!state){
      state={button:button(scope,'',''),base:new WeakMap(),serial:0};selections.set(select,state);select.dataset.favoritesReady='true';state.button.classList.add('gt-favorite-select');
      select.addEventListener('change',()=>refreshSelect(select,false));
      select.addEventListener('pointerdown',()=>refreshSelect(select,true));
      select.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End',' '].includes(event.key))refreshSelect(select,true);});
      const parent=select.parentElement,style=getComputedStyle(parent);
      if(parent.tagName!=='LABEL'&&style.display==='flex'&&style.flexDirection==='column'){
        const control=document.createElement('div');control.className='gt-favorite-select-control';select.before(control);control.append(select);
      }
    }
    if(state.button.previousElementSibling!==select)select.after(state.button);
    const options=Array.from(select.options),value=select.value,selected=options.filter(option=>option.selected);
    for(const option of options){
      if(!state.base.has(option))state.base.set(option,state.serial++);
      const on=option.value!==''&&nodeHas(scope,option),label=(on?'★ ':'')+option.text;
      if(option.label!==label)option.label=label;
    }
    if(reorder){
      for(const group of [select,...select.querySelectorAll('optgroup')]){
        const children=Array.from(group.children);if(children.some(node=>node.tagName!=='OPTION'))continue;
        const sorted=children.slice().sort((a,b)=>Number(b.value==='')-Number(a.value==='')||Number(nodeHas(scope,b))-Number(nodeHas(scope,a))||state.base.get(a)-state.base.get(b));
        if(sorted.some((option,index)=>option!==children[index]))group.append(...sorted);
      }
      if(select.multiple)for(const option of options)option.selected=selected.includes(option);else select.value=value;
    }
    const option=select.selectedOptions[0];state.button.dataset.favoriteScope=scope;state.button.dataset.favoriteId=option?.dataset.favoriteId||option?.value||'';state.button.dataset.favoriteLabel=option?.text||'';
    state.button.dataset.favoriteAliases=option?.dataset.favoriteAliases||'';
    state.button.disabled=select.disabled||!option||!option.value||option.disabled;state.button.hidden=select.hidden;paint(state.button);
  }
  function schedule(select){if(!scopeFor(select))return;pending.add(select);if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(stopped)return;for(const select of pending)refreshSelect(select);pending.clear();});}
  function observe(){
    for(const select of document.querySelectorAll('select'))schedule(select);
    observer=new MutationObserver(records=>{
      for(const record of records){
        const owner=record.target.nodeType===1?record.target.closest('select'):record.target.parentElement?.closest('select');
        if(owner)schedule(owner);
        for(const node of record.addedNodes||[])if(node.nodeType===1){if(node.matches('select'))schedule(node);for(const select of node.querySelectorAll('select'))schedule(select);}
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','data-favorite-scope']});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button.gt-favorite');if(!target||target.disabled)return;
    event.preventDefault();event.stopPropagation();const scope=target.dataset.favoriteScope,on=!nodeHas(scope,target);setIds(scope,on?[target.dataset.favoriteId]:idsFor(target),on);
  },true);
  global.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){saved=read()||new Set();reindex();changed();}});
  global.addEventListener('gt-dispose',()=>{stopped=true;observer?.disconnect();pending.clear();},{once:true});
  global.GTFavorites={has,set,order,button,row,key,entityKey,keysForEntity,refreshSelect};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
})(globalThis);
