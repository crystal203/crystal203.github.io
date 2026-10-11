import {drawSprite} from './media.js';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const clean=s=>String(s||'').replace(/\\n/g,'\n').replace(/<[^>]*>/g,'').replace(/\[(?:c|\/?c|[a-fA-F0-9]{6}|-)\]/gi,'').trim();
function requirement(n,initial=1){const form=n.rank===6?'开花':n.rank===5?'晋升':`${Math.max(initial,n.rank+1)} 星`;return form+(n.limitBreak?` · 突破 ${n.limitBreak} 次`:'');}

export class AwakeningTree{
  constructor(host,count){this.host=host;this.count=count;this.cache=new Map();this.token=0;this.zoom=1;this.pan={x:0,y:0};this.dead=false;}
  async select(hero,stage,weapon){
    const stamp=`${hero.originId}:${stage.id}:${weapon}`;if(this.stamp===stamp)return;this.stamp=stamp;
    const token=++this.token;this.hero=hero;this.stage=stage;this.weapon=weapon;
    this.host.replaceChildren(make('p','正在读取觉醒树…','empty-panel'));
    try{
      let data=this.cache.get(hero.originId);
      if(!data){const r=await GTResources.fetch(new URL(`gtwiki/data/awakening/${hero.originId}.json`,GTResources.root).href);if(!r.ok)throw Error(r.status);data=await r.json();this.cache.set(hero.originId,data);}
      if(token!==this.token||this.dead)return;
      this.data=data;this.render();
    }catch{if(token===this.token&&!this.dead){const b=make('button','重试');b.onclick=()=>{this.stamp='';this.select(hero,stage,weapon);};this.host.replaceChildren(make('p','觉醒树读取失败。','note'),b);}}
  }
  effect(n){const key=this.phase?.rank===6?(this.weapon===2?'mythAlternate':'myth'):(this.weapon===2?'alternate':'normal');return n.effects[key]||n.effects.normal;}
  kind(n){const basic=['attack','defense','hp'].includes(this.effect(n).group);return n.special&&!basic?'special':n.super?'super':'normal';}
  nodeSprite(n){
    // Native atlas names: blue contains the red swords; yellow contains the blue shield.
    const color={attack:'blue',defense:'yellow',hp:'green'}[this.effect(n).group]||'yellow',kind=this.kind(n);
    return kind==='special'?'node_special_on':`node_${kind==='super'?'big':'normal'}_${color}_on`;
  }
  sprite(name,cls){const c=make('canvas',undefined,cls);c.setAttribute('aria-hidden','true');queueMicrotask(()=>drawSprite(c,{sheet:'awakenings',name}).catch(()=>{}));return c;}
  render(){
    const {nodes,circles}=this.data;
    this.host.replaceChildren();this.resize?.disconnect();
    this.phases=[];
    for(const stars of [...new Set(this.hero.stages.filter(s=>s.label.endsWith('星')).map(s=>s.stars))])this.phases.push({id:String(stars),label:`${stars}星`,rank:stars-1,break:false});
    if(nodes.some(n=>n.limitBreak))this.phases.push({id:'break',label:'5星突破',rank:4,break:true});
    if(this.hero.stages.some(s=>s.label==='晋升'))this.phases.push({id:'ascent',label:'晋升',rank:5,break:true});
    if(this.hero.stages.some(s=>s.label==='开花'))this.phases.push({id:'myth',label:'开花',rank:6,break:true});
    const previous=this.lastHero===this.hero.id&&this.lastStage===this.stage.id?this.phase?.id:null;
    const defaultId=this.stage.label==='开花'?'myth':this.stage.label==='晋升'?'ascent':this.stage.stars===5&&nodes.some(n=>n.limitBreak)?'break':String(this.stage.stars);
    this.phase=this.phases.find(p=>p.id===(previous||defaultId))||this.phases.at(-1);this.lastHero=this.hero.id;this.lastStage=this.stage.id;
    const filters=make('div',undefined,'awakening-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','觉醒阶段筛选');
    for(const phase of this.phases){const b=make('button',phase.label);b.type='button';b.dataset.phase=phase.id;b.onclick=()=>{this.phase=phase;this.refresh();};filters.append(b);}
    const label=make('label',undefined,'awakening-new-only'),checkbox=make('input');checkbox.type='checkbox';checkbox.checked=false;checkbox.onchange=()=>this.refresh();label.append(checkbox,make('span','仅看新增'));filters.append(label);this.onlyNew=checkbox;
    this.statistics=make('div',undefined,'awakening-statistics');this.host.append(filters,this.statistics);
    const grid=make('div',undefined,'awakening-layout'),panel=make('div',undefined,'panel awakening-panel'),toolbar=make('div',undefined,'awakening-toolbar');
    this.viewport=make('div',undefined,'awakening-viewport');this.viewport.tabIndex=0;this.viewport.setAttribute('aria-label','觉醒树，可拖动、缩放和使用方向键移动');
    this.scene=make('div',undefined,'awakening-scene');this.viewport.append(this.scene);
    GTResources.image(new URL('gtwiki/ui/awakening-background.png',GTResources.root).href).then(img=>{if(!this.viewport.isConnected||this.dead)return;img.className='awakening-background';img.alt='';this.viewport.prepend(img);}).catch(()=>{});
    const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);this.bounds={x:Math.min(...xs)-120,y:Math.min(...ys)-120,w:Math.max(...xs)-Math.min(...xs)+240,h:Math.max(...ys)-Math.min(...ys)+240};
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('awakening-lines');svg.setAttribute('viewBox',`${this.bounds.x} ${this.bounds.y} ${this.bounds.w} ${this.bounds.h}`);svg.style.cssText=`left:${this.bounds.x}px;top:${this.bounds.y}px;width:${this.bounds.w}px;height:${this.bounds.h}px`;
    const map=new Map(nodes.map(n=>[n.index,n]));
    for(const n of nodes)for(const index of n.connections){const other=map.get(index);if(!other||n.index>index)continue;const line=document.createElementNS(svg.namespaceURI,'line');for(const [k,v] of Object.entries({x1:n.x,y1:n.y,x2:other.x,y2:other.y}))line.setAttribute(k,v);line.setAttribute('class','available');line.dataset.from=n.index;line.dataset.to=other.index;svg.append(line);}
    this.scene.append(svg);
    for(const c of circles){const ring=this.sprite('circle_line_on','awakening-ring');ring.dataset.center=c.center;ring.style.left=c.x+'px';ring.style.top=c.y+'px';this.scene.append(ring);}
    for(const n of nodes){
      const kind=this.kind(n),name=this.nodeSprite(n);
      const b=make('button',undefined,'awakening-node'+(kind==='normal'?'':' '+kind));b.type='button';b.dataset.index=n.index;b.dataset.sprite=name;b.style.left=n.x+'px';b.style.top=n.y+'px';b.append(this.sprite(name));b.onclick=()=>this.show(n);this.scene.append(b);
      if(n.index===0&&this.hero.portrait){const portrait=make('canvas',undefined,'awakening-portrait');b.append(portrait);drawSprite(portrait,this.hero.portrait).catch(()=>portrait.remove());}
    }
    for(const [text,label,action] of [['−','缩小觉醒树',()=>this.scale(.8)],['+','放大觉醒树',()=>this.scale(1.25)],['全览','显示全部觉醒点',()=>this.fit()]]){const b=make('button',text);b.type='button';b.setAttribute('aria-label',label);b.onclick=action;toolbar.append(b);}
    this.info=make('aside',undefined,'panel awakening-info');this.info.setAttribute('aria-live','polite');panel.append(this.viewport,toolbar);grid.append(panel,this.info);this.host.append(grid);
    const details=make('details',undefined,'awakening-list panel'),summary=make('summary','全部觉醒点'),search=make('input');search.type='search';search.placeholder='搜索觉醒效果';search.setAttribute('aria-label','搜索觉醒效果');this.rows=make('div',undefined,'awakening-effect-list');details.append(summary,search,this.rows);this.host.append(details);
    this.list=()=>{const q=search.value.trim();this.rows.replaceChildren();for(const n of this.visibleNodes){const e=this.effect(n);if(q&&!clean(e.name+' '+e.description).includes(q))continue;const b=make('button',undefined,'awakening-effect-row'+(this.added.has(n.index)?' new':''));b.type='button';b.append(make('span',String(n.index+1),'awakening-number'),make('span',clean(e.description)||'效果未记载'),make('small',requirement(n,this.hero.stages[0].stars)));b.onclick=()=>{this.show(n);this.center(n);this.info.scrollIntoView({block:'nearest',behavior:'instant'});};this.rows.append(b);}};search.oninput=this.list;details.addEventListener('toggle',()=>{if(details.open)this.list();});
    this.viewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.viewport.setPointerCapture(e.pointerId);});
    this.viewport.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId)return;this.pan.x+=e.clientX-this.drag.x;this.pan.y+=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.transform();});
    this.viewport.addEventListener('pointerup',()=>{this.drag=null;});this.viewport.addEventListener('pointercancel',()=>{this.drag=null;});this.viewport.addEventListener('lostpointercapture',()=>{this.drag=null;});
    this.viewport.addEventListener('wheel',e=>{e.preventDefault();this.scale(Math.exp(-e.deltaY*.001));},{passive:false});
    this.viewport.addEventListener('keydown',e=>{if(e.target!==this.viewport)return;const moves={ArrowLeft:[-40,0],ArrowRight:[40,0],ArrowUp:[0,-40],ArrowDown:[0,40]};if(moves[e.key]){e.preventDefault();this.pan.x+=moves[e.key][0];this.pan.y+=moves[e.key][1];this.transform();}else if(e.key==='Home'){e.preventDefault();this.fit();}});
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(this.viewport);this.refresh();
  }
  included(n,phase){return !!phase&&n.rank<=phase.rank&&(phase.break||!n.limitBreak);}
  refresh(){
    const nodes=this.data.nodes,previous=this.phases[this.phases.indexOf(this.phase)-1];
    this.totalNodes=nodes.filter(n=>this.included(n,this.phase));this.added=new Set(this.totalNodes.filter(n=>!this.included(n,previous)).map(n=>n.index));
    this.visibleNodes=this.totalNodes.filter(n=>!this.onlyNew.checked||this.added.has(n.index));const visible=new Set(this.visibleNodes.map(n=>n.index));
    this.count.textContent=`${this.totalNodes.length} 个觉醒点 · 新增 ${this.added.size}`;
    for(const b of this.host.querySelectorAll('[data-phase]'))b.setAttribute('aria-pressed',String(b.dataset.phase===this.phase.id));
    for(const b of this.scene.querySelectorAll('.awakening-node')){const index=Number(b.dataset.index),n=nodes.find(n=>n.index===index),e=this.effect(n),name=this.nodeSprite(n),kind=this.kind(n);if(b.dataset.sprite!==name){b.dataset.sprite=name;drawSprite(b.querySelector('canvas'),{sheet:'awakenings',name}).catch(()=>{});}b.classList.toggle('super',kind==='super');b.classList.toggle('special',kind==='special');b.hidden=!visible.has(index);b.classList.toggle('new',this.added.has(index));b.title=`${clean(e.description)}\n${requirement(n,this.hero.stages[0].stars)}`;b.setAttribute('aria-label',`觉醒点 ${index+1} · ${clean(e.description)||clean(e.name)}`);}
    for(const ring of this.scene.querySelectorAll('.awakening-ring'))ring.hidden=!visible.has(Number(ring.dataset.center));
    for(const line of this.scene.querySelectorAll('line'))line.style.display=visible.has(Number(line.dataset.from))&&visible.has(Number(line.dataset.to))?'':'none';
    const framing=this.visibleNodes.length?this.visibleNodes:this.totalNodes,xs=framing.map(n=>n.x),ys=framing.map(n=>n.y);this.bounds={x:Math.min(...xs)-120,y:Math.min(...ys)-120,w:Math.max(...xs)-Math.min(...xs)+240,h:Math.max(...ys)-Math.min(...ys)+240};
    this.summary();this.list();this.show(this.totalNodes.find(n=>this.added.has(n.index))||this.totalNodes[0]);this.fit();
  }
  totals(nodes){const result={gold:0,items:new Map(),stats:new Map()};for(const n of nodes){result.gold+=n.cost.gold;for(const item of n.cost.items){const key=item.sprite.name,entry=result.items.get(key)||{...item,amount:0};entry.amount+=item.amount;result.items.set(key,entry);}const stat=this.effect(n).stat;if(stat){const key=stat.name+'|'+stat.unit,entry=result.stats.get(key)||{...stat,value:0};entry.value+=stat.value;result.stats.set(key,entry);}}return result;}
  itemIcon(sprite){const c=make('canvas');c.setAttribute('aria-hidden','true');queueMicrotask(()=>drawSprite(c,sprite).catch(()=>c.remove()));return c;}
  summary(){
    const nodes=this.totalNodes,increment=nodes.filter(n=>this.added.has(n.index)),total=this.totals(nodes),added=this.totals(increment);this.statistics.replaceChildren();
    const counts=make('div',undefined,'awakening-counts');
    for(const [name,match] of [['普通点',n=>this.kind(n)==='normal'],['大型点',n=>this.kind(n)==='super'],['特殊点',n=>this.kind(n)==='special']]){const row=make('div');row.append(make('span',name),make('strong',String(nodes.filter(match).length)),make('small','新增 '+increment.filter(match).length));counts.append(row);}this.statistics.append(counts);
    const stats=make('div',undefined,'awakening-bonus');for(const [key,s] of total.stats){const row=make('div');row.append(make('span',s.name),make('strong','+'+Number(s.value.toFixed(4))+s.unit),make('small','新增 +'+Number((added.stats.get(key)?.value||0).toFixed(4))+s.unit));stats.append(row);}this.statistics.append(stats);
    const panel=make('div',undefined,'panel awakening-total-cost'),heading=make('div',undefined,'panel-top');heading.append(make('h4','觉醒总消耗'),make('span','累计 / 本阶段新增','note'));panel.append(heading);
    const materials=make('div',undefined,'awakening-materials');
    const row=(name,sprite,amount,extra)=>{const card=make('div',undefined,'awakening-material');card.append(this.itemIcon(sprite),make('span',name),make('strong',amount.toLocaleString('zh-CN')),make('small','新增 '+extra.toLocaleString('zh-CN')));materials.append(card);};
    row('金币',{sheet:'items',name:'gold'},total.gold,added.gold);for(const [key,item] of total.items)row(item.name,item.sprite,item.amount,added.items.get(key)?.amount||0);panel.append(materials);this.statistics.append(panel);
  }
  show(n){
    const e=this.effect(n);this.info.replaceChildren(make('span',`觉醒点 ${n.index+1}`+(this.added.has(n.index)?' · 新增':''),'skill-kind'),make('h4',clean(e.name)),make('p',clean(e.description)||'效果未记载','awakening-description'),make('p',requirement(n,this.hero.stages[0].stars),'note'));
    const costs=make('div',undefined,'awakening-costs');costs.append(make('h5','所需材料'));const gold=make('p');gold.append(this.itemIcon({sheet:'items',name:'gold'}),make('span','金币'),make('strong','× '+n.cost.gold.toLocaleString('zh-CN')));costs.append(gold);
    for(const item of n.cost.items){const row=make('p');row.append(this.itemIcon(item.sprite),make('span',item.name),make('strong','× '+item.amount));costs.append(row);}this.info.append(costs);
    for(const b of this.scene.querySelectorAll('.awakening-node'))b.setAttribute('aria-pressed',String(Number(b.dataset.index)===n.index));
  }
  transform(){this.scene.style.transform=`translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;}
  fit(){if(!this.viewport?.clientWidth)return;const b=this.bounds;this.zoom=Math.min((this.viewport.clientWidth-32)/b.w,(this.viewport.clientHeight-32)/b.h);this.pan={x:this.viewport.clientWidth/2-(b.x+b.w/2)*this.zoom,y:this.viewport.clientHeight/2-(b.y+b.h/2)*this.zoom};this.transform();}
  scale(factor){const next=Math.max(.12,Math.min(2,this.zoom*factor)),ratio=next/this.zoom,c={x:this.viewport.clientWidth/2,y:this.viewport.clientHeight/2};this.pan={x:c.x-(c.x-this.pan.x)*ratio,y:c.y-(c.y-this.pan.y)*ratio};this.zoom=next;this.transform();}
  center(n){this.zoom=Math.max(this.zoom,.75);this.pan={x:this.viewport.clientWidth/2-n.x*this.zoom,y:this.viewport.clientHeight/2-n.y*this.zoom};this.transform();}
  dispose(){this.dead=true;this.token++;this.resize?.disconnect();}
}
