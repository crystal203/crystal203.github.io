const $=id=>document.getElementById(id),views=['atlas','spine','fx','map'],titles={atlas:'图集',spine:'像素动画',fx:'特效',map:'地图'};
let registry=null,mapEntities=[],resourceEntities=[];
function rebuildSearch(){
 const people=registry?Object.values(registry.entities):[],keys=new Set();
 const key=e=>e.kind==='atlasRegion'||e.kind==='atlasSheet'?JSON.stringify(['atlas',e.atlas]):e.kind==='spine'?JSON.stringify(['spine',e.spine]):JSON.stringify(['fx',e.fx]);
 for(const e of people){if(e.atlas)keys.add(JSON.stringify(['atlas',e.atlas]));if(e.spine)keys.add(JSON.stringify(['spine',e.spine]));}
 searchItems=[...people,...mapEntities,...resourceEntities.filter(e=>!keys.has(key(e)))];
}

function resolveSelection(value){
 if(value?.view==='map'||value?.map)return mapEntities.find(e=>e.id===value.map||e.id===value.resource)||null;
 return resourceEntities.find(e=>e.id===value?.resource)||(registry?GTRegistry.resolve(registry,value):null)||resourceEntities.find(e=>e.atlas?.sheet===value?.sheet&&e.atlas?.query===(value.query||value.name))||null;
}
let active=null,frame=null,entity=null,route=null;
const states={};let searchItems=[];
function readRoute(){const params=new URLSearchParams(location.hash.slice(1));const result=Object.fromEntries(params);result.view=views.includes(result.view)?result.view:'atlas';return result;}
function encode(state){const params=new URLSearchParams();for(const key of ['view','resource','name','folder','character','sheet','query','effect','map','category'])if(state[key])params.set(key,state[key]);return params.toString();}
function navigate(state){if(state)location.hash=encode(state);}
function renderContext(){
  $('context').textContent=entity?entity.name+' · '+entity.id:'浏览全部资源';
  $('related').replaceChildren();
  if(entity)for(const view of (entity.map?['map']:views.filter(v=>v!=='map'))){const b=document.createElement('button'),target=GTRegistry.route(entity,view);b.textContent=titles[view]+(target?'':' · 暂无');b.disabled=!target;b.title=target?'打开关联的'+titles[view]:'索引中没有对应资源';b.onclick=()=>navigate(target);$('related').append(b);}
}
function open(){
  const next=readRoute();if(route&&encode(next)===encode(route))return;
  if(active&&route)states[active]={...route};
  route=next;active=next.view;entity=resolveSelection(next);renderContext();
  document.title=(entity?entity.name+' · ':'')+titles[active]+' | 坎公资源库';
  for(const b of document.querySelectorAll('nav button')){b.setAttribute('aria-current',b.dataset.view===active?'page':'false');}
  if(frame){try{frame.contentWindow.GTBridge?.dispose();}catch{}frame.remove();}
  $('status').hidden=false;$('status').textContent='正在打开'+titles[active]+'…';
  frame=document.createElement('iframe');frame.title=titles[active]+'工作区';
  const url=new URL('apps/'+active+'/index.html',location.href);
  for(const [key,value] of Object.entries(next))if(key!=='view')url.searchParams.set(key,value);
  frame.src=url.href;frame.onload=()=>{$('status').hidden=true;};
  $('workspace').append(frame);
}
for(const b of document.querySelectorAll('nav button'))b.onclick=()=>{
  if(active===b.dataset.view)return;
  const related=GTRegistry.route(entity,b.dataset.view);
  if(entity&&!related){$('status').textContent='当前角色没有对应的'+titles[b.dataset.view]+'，已打开全部资源。';}
  const saved=states[b.dataset.view];navigate(saved&&(!entity||entity.map||b.dataset.view==='map'||saved.resource===entity.id)?saved:related||{view:b.dataset.view});
};
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.channel!=='gt-library')return;
  const data=event.data;
  if(data.type==='navigate'){if(!registry)return;const target=GTRegistry.route(GTRegistry.resolve(registry,data.selection),data.view);if(target)navigate({...target,...data.params});return;}
  if(data.type==='selection'){
    const selected=resolveSelection({view:active,...data.selection});entity=selected;
    route={view:active,...data.selection,...(selected?{resource:selected.id}:{resource:''})};
    history.replaceState(null,'','#'+encode(route));renderContext();
    document.title=(entity?entity.name+' · ':'')+titles[active]+' | 坎公资源库';
  }
});
function search(){
  const q=$('library-search').value.trim().toLowerCase();$('results').replaceChildren();if(!q){$('results').hidden=true;return;}
  const matched=GTResourceCatalog.search(searchItems,q);
  const info=document.createElement('p');info.textContent=matched.length?'找到 '+matched.length+' 项，显示前 40 项':'未找到资源，可在各功能中选择图集或上传本地文件。';$('results').append(info);
  for(const e of matched.slice(0,40)){const b=document.createElement('button'),text=document.createElement('span'),code=document.createElement('small'),kinds=document.createElement('span');text.textContent=e.name;code.textContent=e.id;text.append(code);kinds.className='kinds';kinds.textContent=views.filter(v=>e[v]).map(v=>titles[v]).join(' · ');b.append(text,kinds);b.onclick=()=>{navigate(GTRegistry.route(e,e[active]?active:views.find(v=>e[v])));$('results').hidden=true;};$('results').append(b);}
  $('results').hidden=false;
}
$('search-form').onsubmit=e=>{e.preventDefault();search();};let timer;$('library-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(search,180);};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('results').hidden=true;});document.addEventListener('click',e=>{if(!e.target.closest('#results,#search-form'))$('results').hidden=true;});
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
window.addEventListener('hashchange',open);open();
GTRegistry.load().then(value=>{
  registry=value;rebuildSearch();entity=resolveSelection(route);renderContext();
  if($('library-search').value)search();
}).catch(error=>{$('context').textContent=error.message;});
// Register after the workspace starts; never precache the entire resource library.
if('serviceWorker' in navigator&&location.protocol==='https:'){
  const register=()=>navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).catch(error=>console.debug('资源缓存未启用',error));
  if('requestIdleCallback' in window)requestIdleCallback(register,{timeout:2000});else setTimeout(register,0);
}

GTMapCatalog.load().then(c=>{const directory=GTMapCatalog.navigation(c);mapEntities=c.maps.map(m=>({id:m.id,name:m.title||m.name,aliases:[m.group,m.id,...directory.path(m.category).flatMap(n=>[n.label,...(n.aliases||[])])],map:{map:m.id,category:m.category}}));rebuildSearch();entity=resolveSelection(route);renderContext();if($("library-search").value)search();}).catch(e=>console.debug(e));

GTResourceCatalog.load().then(c=>{resourceEntities=c.entities;rebuildSearch();entity=resolveSelection(route);renderContext();if($("library-search").value)search();}).catch(e=>{console.debug(e);$('context').textContent='部分资源索引读取失败，请刷新重试。';});
