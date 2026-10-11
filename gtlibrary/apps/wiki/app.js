import {SpinePreview,drawSprite,portrait} from '../../gtwiki/media.js';
import {AwakeningTree} from '../../gtwiki/awakening.js';
import {levelValue,heroStats,weaponStats} from '../../gtwiki/stats.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const colors={火:'#e4a17d',水:'#80b9df',土:'#a7bc81',光:'#dfc777',暗:'#b69edb',虚:'#adb5c4'};
let catalog,hero,currentSummary,selectedPixel,heroAbort,loadToken=0,disposed=false,element=params.get('element')||'';
let weaponRenderers=[];
const illustPreview=new SpinePreview($('illust-stage')),pixelPreview=new SpinePreview($('pixel-stage'),{pixel:true});
const awakeningTree=new AwakeningTree($('awakening-tree'),$('awakening-count'));
const preferences=matchMedia('(prefers-reduced-motion: reduce)');
illustPreview.paused=pixelPreview.paused=preferences.matches;
function plain(value){return String(value||'').replace(/\\n/g,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\[(?:c|C|\/?c|\/?C|[a-fA-F0-9]{6}|-)\]/g,'').trim();}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function number(value){return Number(value).toLocaleString('zh-CN',{maximumFractionDigits:4});}
function empty(target,message){target.replaceChildren(node('p',message,'empty-panel'));}
function spriteBox(sprite){const box=node('span',undefined,'sprite-holder');if(sprite){const c=node('canvas');c.setAttribute('aria-label',sprite.name);box.append(c);drawSprite(c,sprite).catch(()=>box.replaceChildren(node('span','预览暂不可用','sprite-missing')));}else box.append(node('span','未收录缩略图','sprite-missing'));return box;}
function descriptor(value){return value?catalog.assets[value.key]:null;}
function selection(){
  if(!hero||disposed)return;
  GTBridge.selection({hero:hero.id,stage:$('stats-stage').value,costume:selectedPixel?.code||'',illust:$('illust-select').value,direction:$('pixel-direction').value,
    weapon:$('skill-set').value,level:$('hero-level').value,weaponLevel:$('weapon-level').value,q:$('hero-search').value,role:$('role-filter').value,element,rarity:$('star-filter').value});
}
function setTag(text,className){$('hero-tags').append(node('span',text,className));}
function filter(){
  if(!catalog)return;
  const q=$('hero-search').value.trim().toLowerCase(),role=$('role-filter').value,stars=$('star-filter').value;
  const matches=catalog.heroes.filter(h=>(!element||h.element===element)&&(!role||h.role===role)&&(!stars||h.stars===Number(stars))&&
    (!q||[h.name,h.shortName,h.englishName,h.originId,...h.aliases].some(v=>String(v).toLowerCase().includes(q))));
  $('hero-count').textContent=matches.length+' / '+catalog.heroes.length+' 位角色';
  $('hero-list').replaceChildren();
  if(!matches.length){$('hero-list').append(node('p','没有匹配的角色，请调整筛选。','empty-list'));return;}
  const frag=document.createDocumentFragment();
  for(const h of matches){
    const b=node('button',undefined,'hero-card');b.type='button';b.dataset.hero=h.id;b.style.setProperty('--element',colors[h.element]);b.setAttribute('aria-current',String(hero?.id===h.id));
    const frame=node('span',undefined,'portrait-frame'),canvas=node('canvas');canvas.setAttribute('aria-hidden','true');frame.append(canvas);
    const title=node('span'),small=node('small');title.append(node('strong',h.name));small.append(node('span',h.element+' · '+h.role,'element-label'),node('span','★'.repeat(h.stars),'stars'));title.append(small);b.append(frame,title);frag.append(b);
    b.onclick=()=>loadHero(h);portrait(canvas,h.portrait).catch(()=>{});
  }
  $('hero-list').append(frag);
}
function renderProfile(){
  const fields=$('profile-fields');fields.replaceChildren();
  const measure=(values,unit)=>values?.length?values.map(v=>typeof v==='number'&&v>0?number(v)+' '+unit:'未记载').join(' / '):'未记载';
  for(const [label,value] of [['职业',hero.role],['属性',hero.element],['种族',hero.tribes.join(' / ')||'未记载'],['年龄',measure(hero.profile.Age,'岁')],['身高',measure(hero.profile.Height,'cm')],['体重',measure(hero.profile.Weight,'kg')],['可用装备',hero.weaponsAllowed.join(' / ')||'未记载']]){
    const cell=node('div');cell.append(node('dt',label),node('dd',value));fields.append(cell);
  }
  $('hero-description').textContent=plain(hero.description);$('hero-description').hidden=!hero.description;
  $('hero-introduction').textContent=plain(hero.introduction);$('hero-introduction').hidden=!hero.introduction;
}
function skillCard(skill){
  const row=node('div',undefined,'skill');if(skill.kind)row.append(node('span',skill.kind,'skill-kind'));
  row.append(node('h4',plain(skill.name)));
  if(skill.trigger||skill.connect){const chain=node('span',undefined,'ailment-tag');chain.append(ailment(skill.trigger||'全部'),node('span','→'),ailment(skill.connect||'—'));row.append(chain);}
  else if(skill.ailment){const tag=node('span',undefined,'ailment-tag');tag.append(ailment(skill.ailment));row.append(tag);}
  row.append(node('p',plain(skill.description)));
  return row;
}
function ailment(name){const span=node('span',undefined,'ailment-state'),icon={'击倒':'down','击飞':'air','重伤':'poison','全部':'all'}[name];if(icon){const c=node('canvas');c.setAttribute('aria-hidden','true');span.append(c);drawSprite(c,{sheet:'MainUiS3',name:'combo_ic_'+icon+'_00'}).catch(()=>{c.remove();});}span.append(node('span',name));return span;}
function defaultStage(){return hero.stages.find(s=>s.label==='开花')||hero.stages.find(s=>s.label==='晋升')||hero.stages.filter(s=>s.label.endsWith('星')).at(-1)||hero.stages[0];}
function currentStage(){return hero.stages.find(s=>String(s.id)===$('stats-stage').value)||hero.stages[0];}
function renderStatValues(){
  const s=heroStats(currentStage().stats,levelValue($('hero-level').value,catalog.levelCaps.Character));
  $('stat-values').replaceChildren();
  for(const [label,value] of [['生命',s.Hp],['攻击倍率',s.Atk],['防御',s.Def],['恢复能力',s.Recovery]]){
    const cell=node('div',undefined,'stat-value');cell.append(node('span',label),node('strong',number(label==='攻击倍率'?Number(value.toFixed(4)):Math.floor(value))));$('stat-values').append(cell);
  }
}
function renderStats(){
  const stage=currentStage();renderStatValues();
  const sets=stage.skillSets||[{number:1,skills:stage.skills,party:stage.party}],saved=params.get('weapon')||$('skill-set').value;
  $('skill-set').replaceChildren(...sets.map(set=>{const w=hero.weapons.find(w=>w.number===set.number),o=node('option',w?.name||'默认');o.value=set.number;return o;}));
  if(sets.some(s=>String(s.number)===saved))$('skill-set').value=saved;
  $('skill-set').hidden=sets.length<2;renderSkills();
}
function renderSkills(){
  const stage=currentStage(),set=stage.skillSets?.find(s=>String(s.number)===$('skill-set').value)||{skills:stage.skills,party:stage.party};
  $('hero-skills').replaceChildren(...set.skills.filter(s=>s.description).map(s=>{const row=skillCard(s);row.classList.add('panel');return row;}));
  $('party-values').replaceChildren(...(set.party||[]).map(p=>{const row=node('div',undefined,'party-value');row.append(node('span',p.name),node('strong','+'+number(p.max??p.base)+p.unit));if(p.max!==null&&p.max!==undefined){row.append(node('small',p.maxLabel),node('small','当前形态 · 未觉醒 +'+number(p.base)+p.unit));}else row.append(node('small','未觉醒'));return row;}));
  if(!$('party-values').childElementCount)$('party-values').append(node('span','—','note'));
  awakeningTree.select(hero,stage,Number($('skill-set').value)||1);
}
function openAsset(value){
  const d=descriptor(value);if(d)GTBridge.navigate('spine',{name:d.name,folder:d.folder},{...(value.skin?{skin:value.skin}:{})});
}
function renderIllust(){
  const row=hero.illustrations.find(r=>r.asset.key===$('illust-select').value);
  illustPreview.load(descriptor(row?.asset),row?.asset.skin);$('illust-open').disabled=!row;
  $('illust-zoom').value='100';selection();
}
function setPixel(row,{initial=false}={}){
  selectedPixel=row;$('pixel-name').textContent=hero.stages.includes(row)?hero.shortName+' · '+row.label:row.name;
  const d=descriptor(row.asset);
  for(const o of $('pixel-direction').options)o.disabled=!!d&&!d.variants[o.value];
  $('pixel-direction').disabled=!d||Object.keys(d.variants).length<2;
  if(d&&!d.variants[$('pixel-direction').value])$('pixel-direction').value=Object.keys(d.variants).find(v=>['front','back','side'].includes(v))||'front';
  pixelPreview.load(d,row.asset?.skin,$('pixel-direction').value);$('pixel-open').disabled=!d;
  for(const b of document.querySelectorAll('.appearance-card'))b.setAttribute('aria-pressed',String(b.dataset.appearance===String(row.id)));
  if(hero.stages.includes(row)){
    $('stats-stage').value=String(row.id);renderStats();
    const illustration=hero.illustrations.find(i=>i.stage===row.id),current=hero.illustrations.find(i=>i.asset.key===$('illust-select').value);
    if(!params.has('illust')&&(illustration||current?.stage)){$('illust-select').value=(illustration||hero.illustrations[0])?.asset.key||'';if(!initial)renderIllust();}
    for(const select of document.querySelectorAll('.weapon-variant')){const wanted=row.label==='开花'?'开花':'普通';if([...select.options].some(o=>o.text===wanted)){select.value=[...select.options].find(o=>o.text===wanted).value;select.dispatchEvent(new Event('change'));}}
  }
  selection();
}
function appearanceCard(row,stage){
  const b=node('button',undefined,'appearance-card');b.type='button';b.dataset.appearance=row.id;b.setAttribute('aria-pressed','false');
  b.append(spriteBox(row.sprite),node('strong',stage?row.label:row.name),node('small',stage?'★'.repeat(row.stars):row.type));
  b.onclick=()=>setPixel(row);return b;
}
function renderAppearance(){
  $('appearance-count').textContent=hero.stages.length+' 种形态 · '+hero.costumes.length+' 套时装';
  $('evolution-list').replaceChildren(...hero.stages.map(s=>appearanceCard(s,true)));
  $('costume-list').replaceChildren(...hero.costumes.map(c=>appearanceCard(c,false)));
  if(!hero.costumes.length)empty($('costume-list'),'暂无时装');
  const costume=hero.costumes.find(c=>c.code===params.get('costume'));
  const stage=hero.stages.find(s=>String(s.id)===params.get('stage'))||defaultStage();
  setPixel(costume||stage,{initial:true});
}
function renderWeapons(){
  weaponRenderers=[];
  $('weapon-count').textContent=hero.weapons.length+' 件专属武器';$('weapon-list').replaceChildren();
  if(!hero.weapons.length){empty($('weapon-list'),'暂无专属武器');return;}
  const range=(a,b,unit='')=>number(a)+(a===b?'':'–'+number(b))+unit;
  function affixes(card,label,rows){if(!rows?.length)return;const group=node('div',undefined,'weapon-affixes');group.append(node('h5',label));for(const r of rows){const line=node('p');line.append(node('span',r.name),node('strong','+'+range(r.min,r.max,r.unit)));group.append(line);}card.append(group);}
  for(const w of hero.weapons){
    const card=node('section',undefined,'panel weapon-card'),select=node('select',undefined,'weapon-variant'),body=node('div');select.setAttribute('aria-label',w.name+'版本');
    select.append(...w.variants.map(v=>{const o=node('option',v.label);o.value=v.id;return o;}));select.hidden=w.variants.length<2;card.append(select,body);
    const render=()=>{
      const v=w.variants.find(v=>String(v.id)===select.value)||w.variants[0],head=node('div',undefined,'weapon-heading'),name=node('div');body.replaceChildren();
      name.append(node('h4',w.name),node('p',w.type+' · '+'★'.repeat(v.stars)));head.append(spriteBox(v.sprite),name);body.append(head);
      const stats=node('dl',undefined,'weapon-stats');for(const r of weaponStats(v,levelValue($('weapon-level').value,catalog.levelCaps.Weapon))){const cell=node('div');cell.append(node('dt',r.name),node('dd',range(...r.values,r.unit)));stats.append(cell);}body.append(stats);
      affixes(body,'主词条',v.mainOptions);affixes(body,'副词条 · '+range(...v.subCount)+' 项',v.subOptions);
      if(v.effects.length){const group=node('div',undefined,'weapon-effects');group.append(node('h5','专属效果'));for(const effect of v.effects)group.append(skillCard({...effect,name:''}));body.append(group);}
      if(v.skill){
        const s=v.skill,group=skillCard({...s,kind:'武器技能'}),table=node('table',undefined,'weapon-skill-table'),heading=node('tr');heading.append(node('th',''),...s.levels.map(l=>node('th','Lv.'+l)));table.append(heading);
        for(const [label,values,unit] of [['攻击',s.damage,'% 每秒伤害'],['恢复时间',s.cooldown,'秒']])if(values){const row=node('tr');row.append(node('th',label),...values.map(value=>node('td',number(value)+unit)));table.append(row);}group.append(table);body.append(group);
      }
      affixes(body,'满突破',v.limitBreak);affixes(body,'铭刻 · 固定',v.engrave);
      if(v.engraveRandom.length){const group=node('div',undefined,'weapon-affixes');group.append(node('h5','铭刻 · 随机'));for(const r of v.engraveRandom){const line=node('p');line.append(node('span',r.name),node('strong',r.values.map(value=>number(value)).join(' / ')+r.unit));group.append(line);}body.append(group);}
      if(v.sprite){const b=node('button','查看武器原图 ↗');b.onclick=()=>GTBridge.navigate('atlas',{resource:'atlas:items:'+v.sprite.name},{sheet:'items',query:v.sprite.name});body.append(b);}
    };select.onchange=render;weaponRenderers.push(render);render();
    $('weapon-list').append(card);
  }
}
async function loadHero(summary){
  const token=++loadToken;heroAbort?.abort();heroAbort=new AbortController();
  currentSummary=summary;hero=null;selectedPixel=null;illustPreview.abort?.abort();pixelPreview.abort?.abort();illustPreview.clear();pixelPreview.clear();
  $('skill-set').value=params.get('weapon')||'1';
  $('page-status').hidden=false;$('page-status').replaceChildren(node('span','正在读取 '+summary.name+'…'));$('hero-detail').hidden=true;
  try{
    const r=await GTResources.fetch(new URL('gtwiki/data/'+summary.file,GTResources.root).href,{signal:heroAbort.signal});if(!r.ok)throw Error('角色信息读取失败：'+r.status);
    const data=await r.json();if(token!==loadToken||disposed)return;hero=data;
    document.documentElement.style.setProperty('--element',colors[hero.element]);
    $('hero-name').textContent=hero.name;$('hero-english').textContent=hero.englishName;$('hero-tags').replaceChildren();
    setTag(hero.element+'属性','element-tag');setTag(hero.role);setTag('初始 '+'★'.repeat(summary.stars),'rarity-tag');if(hero.title)setTag(hero.title);
    renderProfile();$('stats-stage').replaceChildren(...hero.stages.map(s=>{const o=node('option',s.label);o.value=s.id;return o;}));
    $('stats-stage').value=params.get('stage')||String(defaultStage().id);if(!$('stats-stage').value)$('stats-stage').value=defaultStage().id;renderStats();
    $('illust-select').replaceChildren(...hero.illustrations.map(row=>{const o=node('option',row.name);o.value=row.asset.key;return o;}));
    if(!hero.illustrations.length){$('illust-select').append(node('option','暂无立绘'));$('illust-select').disabled=true;}else{$('illust-select').disabled=false;if(hero.illustrations.some(r=>r.asset.key===params.get('illust')))$('illust-select').value=params.get('illust');}
    $('hero-story').replaceChildren(...(plain(hero.story)||'未记载').split(/\n\s*\n/).map(p=>node('p',p)));
    renderWeapons();$('hero-detail').hidden=false;$('page-status').hidden=true;
    renderAppearance();renderIllust();filter();$('detail-scroll').scrollTop=0;
    for(const key of ['stage','costume','illust','weapon'])params.delete(key);
  }catch(e){if(token===loadToken&&e.name!=='AbortError'){const b=node('button','重试');b.onclick=()=>loadHero(summary);$('page-status').replaceChildren(node('span','角色资料读取失败。'),b);}}
}
$('hero-search').value=params.get('q')||'';$('role-filter').value=params.get('role')||'';$('star-filter').value=params.get('rarity')||'';$('pixel-direction').value=params.get('direction')||'front';
for(const input of [$('hero-search'),$('role-filter'),$('star-filter')])input.addEventListener(input.tagName==='INPUT'?'input':'change',()=>{filter();selection();});
$('reset-filters').onclick=()=>{$('hero-search').value='';$('role-filter').value='';$('star-filter').value='';element='';renderElements();filter();selection();};
function renderElements(){
  $('element-filter').replaceChildren();for(const value of ['',...Object.keys(colors)]){const b=node('button',value||'全部');b.type='button';b.style.setProperty('--element',colors[value]||'#93aee6');b.setAttribute('aria-pressed',String(element===value));b.onclick=()=>{element=value;renderElements();filter();selection();};$('element-filter').append(b);}
}
$('stats-stage').onchange=()=>{const stage=hero.stages.find(s=>String(s.id)===$('stats-stage').value);setPixel(stage);};
for(const [id,key,render] of [['hero-level','Character',()=>renderStatValues()],['weapon-level','Weapon',()=>weaponRenderers.forEach(render=>render())]]){
  $(id).value=params.get(id==='hero-level'?'level':'weaponLevel')||'100';
  $(id).oninput=()=>{if(hero&&$(id).value&&$(id).validity.valid){render();selection();}};
  $(id).onchange=()=>{$(id).value=levelValue($(id).value,catalog.levelCaps[key]);if(hero){render();selection();}};
}
$('illust-select').onchange=renderIllust;
$('skill-set').onchange=()=>{renderSkills();selection();};
$('illust-retry').onclick=()=>hero&&renderIllust();$('pixel-retry').onclick=()=>selectedPixel&&setPixel(selectedPixel);
$('pixel-direction').onchange=()=>selectedPixel&&setPixel(selectedPixel);
$('illust-open').onclick=()=>openAsset(hero.illustrations.find(r=>r.asset.key===$('illust-select').value)?.asset);
$('pixel-open').onclick=()=>openAsset(selectedPixel?.asset);
$('illust-zoom').oninput=()=>{illustPreview.zoom=Number($('illust-zoom').value)/100;illustPreview.fit();};
$('illust-reset').onclick=()=>illustPreview.reset();
$('illust-stage').addEventListener('preview-zoom',e=>{$('illust-zoom').value=Math.round(e.detail*100);});
function pause(button,preview,label){button.textContent=preview.paused?'播放'+label:'暂停'+label;button.setAttribute('aria-pressed',String(preview.paused));button.onclick=()=>{preview.paused=!preview.paused;pause(button,preview,label);};}
pause($('illust-pause'),illustPreview,'动画');pause($('pixel-pause'),pixelPreview,'');
$('copy-link').onclick=async()=>{
  if(!hero)return;
  const p=new URLSearchParams({view:'wiki',hero:hero.id,stage:$('stats-stage').value,direction:$('pixel-direction').value,weapon:$('skill-set').value,level:$('hero-level').value,weaponLevel:$('weapon-level').value});
  if(selectedPixel?.code)p.set('costume',selectedPixel.code);if($('illust-select').value&&hero.illustrations.length)p.set('illust',$('illust-select').value);
  const url=new URL('../../index.html',location.href);url.hash=p.toString();
  try{await navigator.clipboard.writeText(url.href);$('copy-link').textContent='链接已复制';setTimeout(()=>{$('copy-link').textContent='复制角色链接';},1800);}catch{$('copy-link').textContent='请复制浏览器地址栏链接';}
};
// Anchor navigation stays inside the wiki iframe; the parent URL keeps the character route.
for(const a of document.querySelectorAll('.section-nav a'))a.onclick=e=>{e.preventDefault();$(a.hash.slice(1)).scrollIntoView({behavior:preferences.matches?'instant':'smooth',block:'start'});};
window.addEventListener('gt-dispose',()=>{disposed=true;loadToken++;heroAbort?.abort();illustPreview.dispose();pixelPreview.dispose();awakeningTree.dispose();});
window.addEventListener('pagehide',()=>{if(!disposed){disposed=true;heroAbort?.abort();illustPreview.dispose();pixelPreview.dispose();awakeningTree.dispose();}});
async function start(){
  try{
    catalog=await GTWikiCatalog.load();if(disposed)return;
    for(const [id,key] of [['hero-level','Character'],['weapon-level','Weapon']]){const max=catalog.levelCaps[key];$(id).max=max;$(id).value=levelValue($(id).value,max);$(id+'-range').textContent='1–'+max;}
    renderElements();filter();
    const requested=Object.fromEntries(params),selected=GTWikiCatalog.resolve(catalog,requested);
    if(!selected&&(requested.hero||requested.resource||requested.name)){$('page-status').textContent='未找到指定角色，请从左侧目录选择。';return;}
    await loadHero(selected||catalog.heroes.find(h=>h.id==='plitvice')||catalog.heroes[0]);
  }catch(e){const b=node('button','重试');b.onclick=start;$('page-status').replaceChildren(node('span','角色目录读取失败。'),b);$('hero-count').textContent='目录加载失败';}
}
start();
