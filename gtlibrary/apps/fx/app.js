import {weaponChoices,equipmentProfile,sourceExclusiveWeapon,shieldAllowedForWeapon,preferredWeaponSelection} from '../../gtfx/equipment-selection.js';
import {hasCostumeEffects} from '../../gtfx/costume-overrides.js';
import {groupCharacters,resolveCharacter,mergeCharacterIndexes,appearanceKind,mergeNativeCharacterPacks,nativeForAppearance} from '../../gtfx/character-catalog.js';
import {targetPosition as resolveTarget,resolveFacing} from '../../gtfx/targeting.js';
import {pickGround} from '../../gtfx/target-picking.js';
import {FxCharacterPlayer} from '../../gtfx/character-player.js';
import {FxActionPlayer} from '../../gtfx/action-player.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {profiles} from '../../gtfx/character-link.js';
import {FxRuntime} from '../../gtfx/core.js';
import {outputSize,nearestResize} from '../../gtfx/gif-sizing.js';
import {ExportRegion,regionCapturePlan} from '../../gtfx/export-region.js';
const $=id=>document.getElementById(id);
let manifestUrl,effectGeneration=0,loadedEffect=null,disposed=false;
let mediaAbort=null;
let runtime,catalog,index,character,effect,playing=false,time=0,last=performance.now(),queue=null,gap=0,generation=0,exporting=false,cancelled=false,worker=null,downloadUrl=null,measuring=false,nativePlan=null;
let avatarImage=null,avatarFrames={},portraitImage=null,portraitFrames={},registry,weaponCatalog={},weaponNames={},nativeActions,nativePlans,baseNativeActions,baseNativePlans,modules=[],mode='effect',selectedModule=null;
const exportRegion=new ExportRegion({canvas:$('canvas'),box:$('export-region'),select:$('region-select'),clear:$('region-clear'),settings:$('region-settings'),fields:Object.fromEntries(['x','y','w','h'].map(k=>[k,$('region-'+k)])),isLocked:()=>exporting||measuring||!effect,onSelect:()=>{playing=false;queue=null;drag=null;sample();$('canvas').focus();},onChange:()=>{nativePlan=null;refreshNativeSize();}});
function selectedRegionPlan(){return exportRegion.region?regionCapturePlan(runtime,exportRegion.region,$('size').value,Number($('native-scale').value)):null;}
function showRegionDimensions(){
  if(!effect||!exportRegion.region){$('region-dimensions').textContent='';return;}
  try{const {dimensions}=selectedRegionPlan();$('region-dimensions').textContent='选区导出 '+dimensions.width+' × '+dimensions.height+' px';}catch(e){$('region-dimensions').textContent=e.message;}
}
for(const side of ['top','bottom']){
 const button=$('fold-'+side),workspace=document.querySelector('.workspace');
 const setFold=folded=>{workspace.classList.toggle(side+'-folded',folded);button.setAttribute('aria-expanded',String(!folded));button.textContent=(side==='top'?'角色与目标':'导出与设置')+(folded?' ▾':' ▴');};
 setFold(side==='bottom');
 try{const saved=localStorage.getItem('gtfx.fold.'+side);if(saved!==null)setFold(saved==='1');}catch{}
 button.onclick=()=>{if(exporting||measuring)return;const folded=!workspace.classList.contains(side+'-folded');setFold(folded);try{localStorage.setItem('gtfx.fold.'+side,folded?'1':'0');}catch{}requestAnimationFrame(()=>{runtime?.resize();if(effect)sample();});};
}
const importedProfiles={};
const profileFor=id=>importedProfiles[id]||profiles[id];
function selectedProfile(){const profile=profileFor(character?.id);return profile?equipmentProfile(nativeActions,profile,$('appearance').value,heroAppearance(),$('weapon').value,weaponCatalog):null;}
const heroAppearance=()=>nativeActions?.costumes?.[$('appearance').value]?$('skill-form').value||profileFor(character?.id)?.defaultSkin:$('appearance').value;
const nativeWeapon=(profile,appearance)=>profile?.weaponByAppearance?.[appearance]||(nativeActions?.costumes?.[appearance]?profile?.weaponByAppearance?.[heroAppearance()]:null)||profile?.weapon;
function appearanceOption(text,value,appearance=value){
 const special=hasCostumeEffects(nativeActions,appearance),option=new Option((special?'✦ ':'')+text,value);
 option.dataset.appearanceKind=special?'special':appearanceKind(character,appearance);
 option.classList.toggle('special-fx',special);option.title=special?'专属特效':({base:'原始',myth:'开花',ascent:'进阶'}[option.dataset.appearanceKind]||'');return option;
}
function refreshAppearanceColor(id){
 const select=$(id);select.classList.toggle('special-fx',!!select.selectedOptions[0]?.classList.contains('special-fx'));select.dataset.appearanceKind=select.selectedOptions[0]?.dataset.appearanceKind||'';
}
const weaponLabel=code=>weaponNames[code]?`${weaponNames[code]} / ${code}`:code;
function refreshWeapons(profile,previous=''){
 const hero=heroAppearance(),equipped=preferredWeaponSelection(nativeActions,profile,hero,previous),choices=weaponChoices(nativeActions,profile,hero,weaponCatalog);
 $('weapon').replaceChildren(...choices.filter(w=>w.preferred).map(w=>{const o=new Option(`专属 · ${weaponLabel(w.code)}`,w.code);o.dataset.weaponType=w.weaponType;o.dataset.sourceAction=w.action||'';return o;}),new Option('不装备',''),
  ...choices.filter(w=>!w.preferred).map(w=>{const o=new Option(weaponLabel(w.code),w.code);o.dataset.weaponType=w.weaponType;o.dataset.sourceAction=w.action||'';return o;}));
 $('weapon').value=choices.some(w=>w.code===equipped)?equipped:'';
}

function refreshShields(profile,reset=false){
 const allowed=shieldAllowedForWeapon(nativeActions,selectedProfile()||profile,heroAppearance()),prior=reset?'':$('shield').value;
 $('shield-choice').hidden=!allowed;
 const names=allowed?weaponCatalog.shield||[]:[];
 $('shield').replaceChildren(new Option('不装备',''),...names.map(code=>new Option(weaponLabel(code),code)));
 $('shield').value=names.includes(prior)?prior:reset&&allowed&&names.includes('basic_shield')?'basic_shield':'';
}
function refreshSkillForms(profile,reset=false){
 const appearance=$('appearance').value,source=nativeForAppearance(nativeActions,appearance),forms=source?.profile?.forms||profile?.forms||[],prior=reset?'':$('skill-form').value;
 $('skill-form').replaceChildren(...forms.map(f=>appearanceOption(f.label,f.hero)));
 $('skill-form').value=forms.find(f=>f.hero===appearance)?.hero||forms.find(f=>f.hero===prior)?.hero||forms[0]?.hero||'';
 refreshAppearanceColor('skill-form');
 $('skill-form-choice').hidden=!nativeActions?.costumes?.[appearance]||forms.length<2;
}
let targetPoint=null,summonPoint=[0,0,0],summonPicked=false,secondaryTargets=[],pickMode=null,choiceOverrides={};
function previewDirection(){return resolveFacing($('direction').value,resolveTarget({targetPosition:targetPoint,targetDistance:Number($('target-distance').value)},'right'));}
function syncTargets(){
 $('summon-x').value=String(Number(summonPoint[0].toFixed(3)));$('summon-z').value=String(Number(summonPoint[2].toFixed(3)));
 const p=resolveTarget({targetPosition:targetPoint,targetDistance:Number($('target-distance').value)},previewDirection());
 $('target-x').value=String(Number(p[0].toFixed(3)));$('target-z').value=String(Number(p[2].toFixed(3)));
 $('secondary-targets').replaceChildren(...secondaryTargets.map((p,i)=>{const b=document.createElement('button');b.type='button';b.textContent='副目标 '+(i+1)+' ('+p[0].toFixed(1)+', '+p[2].toFixed(1)+') ×';b.title='移除此副目标';b.disabled=exporting||measuring;b.onclick=()=>{if(exporting||measuring)return;secondaryTargets.splice(i,1);syncTargets();rebuildTargets();};return b;}));
}
function setPickMode(value){pickMode=value;drag=null;$('pick-main').setAttribute('aria-pressed',String(value==='main'));$('pick-secondary').setAttribute('aria-pressed',String(value==='secondary'));$('pick-summon').setAttribute('aria-pressed',String(value==='summon'));$('canvas').style.cursor=value?'crosshair':'';}
async function rebuildTargets(){if(exporting||measuring||!index||mode!=='module')return;queue=null;await selectModule(true,true);}
function moduleOptions(){const profile=selectedProfile();return {direction:previewDirection(),weapon:$('weapon').value,weaponEquipped:!!$('weapon').value,shield:$('shield').value,summoned:$('summoned').checked,summonPosition:summonPicked?summonPoint.slice():null,summonDirection:$('summon-direction').value,targetDistance:targetPoint?Math.hypot(targetPoint[0],targetPoint[2]):Number($('target-distance').value),targetPosition:targetPoint?.slice()||null,secondaryTargets:secondaryTargets.map(p=>p.slice()),skin:$('skin').value,appearance:$('appearance').value,heroAppearance:heroAppearance(),exclusiveWeapon:!profile||sourceExclusiveWeapon(nativeActions,profile,$('appearance').value,heroAppearance(),$('weapon').value),seed:Number($('seed').value)>>>0,choiceOverrides:{...choiceOverrides},profile};}
async function importedCharacter(id){const response=await GTResources.fetch(new URL('../../gtfx/assets/native-characters/'+id+'.json',location.href));return response.ok?response.json():null;}
function refreshModules(wanted=$('module').value){
 modules=actionModules(character.id,index,moduleOptions(),nativeActions,nativePlans);$('module').replaceChildren(...modules.map(m=>new Option(m.label,m.id)));
 if(modules.length)$('module').value=modules.some(m=>m.id===wanted)?wanted:modules[0].id;
}
function message(text=''){$('message').textContent=text;$('message').hidden=!text;}
function error(e){message(e.message||String(e));playing=false;update();}
async function json(url){const response=await GTResources.fetch(url);if(!response.ok)throw new Error('文件读取失败：'+url);return response.json();}
function avatar(char,portrait=null){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=40;canvas.className='avatar';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',portrait?.name||char.name);canvas.title=portrait?portrait.name+' · '+({base:'原版',myth:'开花',ascent:'觉醒',special:'特殊时装',supercostume:'超级时装',costume:'时装'}[portrait.kind]||''):char.name;
  const draw=()=>{const context=canvas.getContext('2d'),entry=portrait?portraitFrames[portrait.key]:avatarFrames[char.id],image=portrait?portraitImage:avatarImage;
    context.clearRect(0,0,40,40);
    if(!entry||!image){context.fillStyle='#93aee6';context.font='19px system-ui';context.textAlign='center';context.fillText(char.name[0]||'·',20,27);return;}
    const r=entry.frame,w=entry.rotated?r.h:r.w,h=entry.rotated?r.w:r.h,scale=Math.min(36/w,36/h);
    context.save();context.imageSmoothingEnabled=false;context.translate(20,20);if(entry.rotated)context.rotate(-Math.PI/2);context.drawImage(image,r.x,r.y,r.w,r.h,-r.w*scale/2,-r.h*scale/2,r.w*scale,r.h*scale);context.restore();};
  draw();return canvas;
}
async function loadAvatars(){
  try{const [data,image,portraits,pimage]=await Promise.all([json('../../resources/previews/fx.json'),GTResources.image('../../resources/previews/fx.webp'),json('../../resources/previews/portraits.json'),GTResources.image('../../resources/previews/portraits.webp')]);
    if(disposed)return;avatarFrames=data.frames;avatarImage=image;portraitFrames=portraits.frames;portraitImage=pimage;renderCharacters();
  }catch(error){console.debug('列表头像暂不可用',error);}
}
function renderCharacters(){
  const query=$('search').value.trim().toLowerCase(),list=GTFavorites.order(catalog.characters.filter(c=>c.name.toLowerCase().includes(query)||c.id.toLowerCase().includes(query)||c.key?.toLowerCase().includes(query)||c.aliases?.some(a=>a.toLowerCase().includes(query))),char=>['fx/character',char.id]);
  $('characters').replaceChildren(...list.map(char=>{const button=document.createElement('button');button.className='character'+(character?.id===char.id?' active':'');button.title=char.id;button.setAttribute('aria-pressed',String(character?.id===char.id));
    const name=document.createElement('span');name.className='name';name.textContent=char.name;const portraits=document.createElement('span');portraits.className='character-portraits';portraits.append(...(char.portraits?.length?char.portraits.map(p=>avatar(char,p)):[avatar(char)]));button.append(name,portraits);button.onclick=()=>selectCharacter(char);return GTFavorites.row(button,'fx/character',char.id,char.name);}));
}
function label(e){
  let name=e.assetName.replace(/^fx_(?:cwp_)?/,'');
  const key=(character.key||character.id).replace(/_\d+$/,'');
  for(const prefix of [character.id,key])if(name.startsWith(prefix+'_'))name=name.slice(prefix.length+1);
  const terms={basic:'普攻',linkatk:'连锁',last:'专武',explosion:'爆炸',dash:'冲刺',screenfx:'屏幕',proj:'弹体',bullet:'弹体',hit:'命中',cast:'施放',charge:'蓄力',loop:'循环',start:'开始',end:'结束',chainhold:'链条束缚',slash:'斩击',hookshot:'钩锁','1st':'第一段','2nd':'第二段','3rd':'第三段','4th':'第四段',trail:'轨迹',contrail:'尾迹',support:'辅助',buff:'增益',debuff:'减益',myth:'开花',box:'盒子',car:'汽车',duck:'鸭子',stone:'石块'};
  return name.split('_').map(part=>terms[part]||part).join(' · ')+(e.unavailable?'（'+e.unavailable+'）':'');
}
async function selectCharacter(char,sourceId=null){
  if(exporting||measuring)return;choiceOverrides={};$('variant-controls').hidden=true;++effectGeneration;runtime.loadGeneration=(runtime.loadGeneration||0)+1;const current=++generation;character=char;playing=false;queue=null;effect=null;selectedModule=null;
  runtime.modulePlayer.clear();runtime.characterPlayer.clear();runtime.clear();
  GTBridge.selection({character:char.id});$('sidebar').classList.remove('open');$('current-character').textContent=char.name;renderCharacters();message('加载中');$('effect').disabled=true;
  const imported=char.nativeAggregation==='appearance-source'?mergeNativeCharacterPacks(char,await Promise.all(char.members.map(m=>importedCharacter(m.id)))):await importedCharacter(char.id);if(current!==generation)return;
  nativeActions=imported||baseNativeActions;nativePlans=imported?.plans?{...baseNativePlans,[char.id]:imported.plans}:baseNativePlans;
  if(imported?.profile)importedProfiles[char.id]=imported.profile;
  const profile=profileFor(char.id);mode=profile?'module':'effect';$('play-mode').value=mode;
  if(profile){
    $('appearance').replaceChildren(...profile.appearances.map(code=>{
      const source=GTRegistry.resolve(registry,{resource:code});
      return appearanceOption(source?.name&&source.name!==code?`${source.name} / ${code}`:code,code);
    }));
    const requested=char.members.find(m=>m.id===sourceId)?.key,member=imported?.nativeMembers?.find(m=>m.id===sourceId)?.pack.profile.appearances[0];$('appearance').value=profile.appearances.includes(requested)?requested:member||profile.appearances[0];$('skin').replaceChildren(new Option(profile.defaultSkin,profile.defaultSkin));
    refreshAppearanceColor('appearance');refreshSkillForms(profile,true);refreshWeapons(profile);refreshShields(profile,true);$('summoned-choice').hidden=!Object.keys(nativeActions.summonables||{}).length;$('summoned').checked=true;summonPoint=[0,0,0];summonPicked=false;$('pick-summon').hidden=$('summoned-choice').hidden;$('summon-position-fields').hidden=$('summoned-choice').hidden;$('summon-direction-choice').hidden=$('summoned-choice').hidden;setPickMode(null);
  }
  for(const id of ['replay','play','step','all','export'])$(id).disabled=true;
  runtime.characterPlayer.clear();runtime.clear();
  try{
    manifestUrl=new URL('../../resources/fx/'+char.index,location.href);
    const data=mergeCharacterIndexes(char,await Promise.all(char.members.map(member=>json(new URL('../../resources/fx/'+member.index,location.href)))));
    if(current!==generation)return;
    // ObjectPoolSpec.Direction is the prefab's local forward axis. Several
    // older manifests defaulted it to +Z, including +X facing projectiles.
    index={...data,effects:data.effects.map(e=>{const direction=nativeActions.presetDirections?.[e.preset];return direction?{...e,direction}:e;})};
    loadedEffect=null;++effectGeneration;refreshModules('');
    if(new URLSearchParams(location.search).has('effect'))mode='effect';if(!modules.length)mode='effect';$('play-mode').value=mode;updateMode();
    $('material-appearance').replaceChildren(new Option('全部',''),...char.members.map(m=>appearanceOption(GTRegistry.resolve(registry,{resource:m.key,character:m.id})?.name||m.key||m.id,m.id,m.key)));
    $('material-appearance').value=sourceId&&sourceId!==char.id?sourceId:'';refreshAppearanceColor('material-appearance');refreshEffectOptions();
    $('effect').disabled=false;$('all').disabled=false;
    const desiredEffect=new URLSearchParams(location.search).get('effect');const initial=index.effects.findIndex(e=>!e.unavailable&&(!$('material-appearance').value||e.resourceCharacters.includes($('material-appearance').value))&&(desiredEffect?e.id===desiredEffect:e.preset===profile?.preferredEffect||e.assetName===profile?.preferredEffect));const first=initial>=0?initial:index.effects.findIndex(e=>!e.unavailable&&(!$('material-appearance').value||e.resourceCharacters.includes($('material-appearance').value))&&(e.systems.length||e.statics?.length));
    if(mode==='module')await selectModule();else if(first>=0)await selectEffect(first);else message('没有可播放素材');
    const url=new URL(location.href);url.searchParams.set('character',char.id);history.replaceState(null,'',url);
  }catch(e){if(current===generation)error(e);}
}
function refreshEffectOptions(){
 const source=$('material-appearance').value;
 $('effect').replaceChildren(...index.effects.flatMap((e,i)=>{
  if(source&&!e.resourceCharacters.includes(source))return [];
  const option=new Option(label(e),String(i));option.title=e.assetName;option.dataset.favoriteId=e.id;option.disabled=!!e.unavailable;return [option];
 }));
}
$('material-appearance').onchange=()=>{if(exporting||measuring)return;refreshAppearanceColor('material-appearance');refreshEffectOptions();const first=[...$('effect').options].find(o=>!o.disabled);if(first)selectEffect(Number(first.value));};
function updateMode(){
 $('material-appearance-choice').hidden=mode!=='effect'||(character?.members.length||0)<2;
 $('module-choice').hidden=mode!=='module';$('effect-choice').hidden=mode!=='effect';$('all').hidden=mode==='module';
 $('variant-controls').hidden=mode!=='module'||!selectedModule?.random?.choices?.length;
 $('character-controls').hidden=mode!=='module';$('fold-top').hidden=mode!=='module';if(mode!=='module')setPickMode(null);
}
async function selectEffect(position,auto=true){
  let requested;
  try{
    $('download-gif').hidden=true;$('export-status').textContent='';nativePlan=null;const selected=index.effects[position];if(!selected||selected.unavailable)return;
    const current=requested=++effectGeneration;playing=false;effect=null;selectedModule=null;$('variant-controls').hidden=true;runtime.modulePlayer.clear();runtime.characterPlayer.clear();message('加载中');
    for(const id of ['replay','play','step','export','all'])$(id).disabled=true;
    if(loadedEffect!==selected){await runtime.load(index,p=>GTResources.url(p,manifestUrl),{effect:selected,loadImage:p=>GTResources.image(p)});if(current!==effectGeneration||disposed)return;loadedEffect=selected;}
    if(current!==effectGeneration||disposed)return;effect=selected;$('all').disabled=false;
        $('effect').value=String(position);const definition=runtime.characterPlayer.effectDefinition(effect);runtime.build(definition,Number($('seed').value)>>>0);

    runtime.autoFit();
    GTBridge.selection({character:character.id,effect:effect.id});
    time=0;gap=0;playing=auto;$('seek').max=runtime.duration;$('end').value=runtime.duration.toFixed(3);$('start').value='0';$('duration').textContent=runtime.duration.toFixed(3)+' s';$('zoom').value='1';
    for(const id of ['replay','play','step','export'])$(id).disabled=false;

    $('layers').replaceChildren(...effect.systems.map((system,i)=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;label.append(check,system.name);check.onchange=()=>{check.checked?runtime.excluded.delete(i):runtime.excluded.add(i);sample();refreshNativeSize();};return label;}));
    message(effect.systems.length||effect.statics?.length?'':'仅有游戏脚本');sample();refreshNativeSize();
  }catch(e){if(!disposed&&requested===effectGeneration)error(e);}
}
function refreshVariants(module){
 const choices=module.random?.choices||[],container=$('variant-controls');
 container.hidden=mode!=='module'||!choices.length;
 container.replaceChildren(...choices.map((choice,i)=>{
  const row=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');
  caption.textContent=choices.length>1?'变体 '+(i+1):'变体';select.setAttribute('aria-label',caption.textContent);
  select.append(new Option('随机',''),...choice.options.map(o=>new Option(label({assetName:o.assetName}).split(' · ').at(-1),o.key)));
  select.value=choice.overridden?choice.selected:'';
  select.onchange=async()=>{if(exporting||measuring)return;const t=time,wasPlaying=playing;
   if(select.value)choiceOverrides[choice.id]=select.value;else delete choiceOverrides[choice.id];
   await selectModule(wasPlaying,true);time=Math.min(t,runtime.duration);sample();};
  row.append(caption,select);return row;
 }));
}
async function selectModule(auto=true,preserveView=false){
 const savedView=preserveView?{center:runtime.viewCenter.clone(),size:runtime.viewSize,zoom:runtime.zoom}:null;
 let requested;
 try{
  const id=$('module').value,profile=selectedProfile();if(!profile)return;
  const current=requested=++effectGeneration;playing=false;effect=null;selectedModule=null;$('variant-controls').hidden=true;runtime.modulePlayer.clear();runtime.characterPlayer.clear();message('加载中');
  for(const key of ['replay','play','step','export','all'])$(key).disabled=true;
  const selected=actionModules(character.id,index,moduleOptions(),nativeActions,nativePlans).find(m=>m.id===id);
  if(!selected)throw Error('攻击模组没有可播放素材');
  await runtime.load(index,p=>GTResources.url(p,manifestUrl),{effect:selected.tracks.map(t=>t.effect),loadImage:p=>GTResources.image(p)});
  if(current!==effectGeneration||disposed)return;loadedEffect=null;
  const skinInfo=await runtime.characterPlayer.load($('appearance').value,previewDirection(),$('skin').value,{...profile,weaponByAppearance:{...profile.weaponByAppearance,[$('appearance').value]:nativeWeapon(profile,$('appearance').value)}},$('weapon').value,$('shield').value);
  if(current!==effectGeneration||disposed||!skinInfo)return;
  $('skin').replaceChildren(...skinInfo.skins.map(name=>new Option(name,name)));$('skin').value=skinInfo.skin;
  for(const key of ['appearance','direction','skin','weapon','shield','summoned','summon-direction','target-distance','show-target'])$(key).disabled=false;
  const module=actionModules(character.id,index,moduleOptions(),nativeActions,nativePlans).find(m=>m.id===id);
  const first=module.tracks[0]?.effect||index.effects[0],root=first.nodes.find(n=>n.id===first.root);
  const definition={...first,id:'module:'+module.id,assetName:'module_'+character.id+'_'+module.id,nodes:[root],systems:[],statics:[],skeletons:[],scripts:[],duration:module.duration};
  runtime.build(definition,Number($('seed').value)>>>0);
  const options={...moduleOptions(),direction:previewDirection(),weapon:$('weapon').value,centerHeight:.375,showTarget:$('show-target').checked};
  runtime.characterPlayer.configure(module.actor,options,definition);runtime.characterPlayer.moduleMode=true;runtime.characterPlayer.module=module;
  await runtime.characterPlayer.prepareDirectionViews(module);if(current!==effectGeneration||disposed)return;
  runtime.characterPlayer.prepareBoneTracks(module);runtime.group.visible=false;runtime.modulePlayer.load(module,options);runtime.duration=module.duration;
  selectedModule=module;refreshVariants(module);effect=definition;runtime.frameCharacter();
  if(savedView){runtime.viewCenter.copy(savedView.center);runtime.viewSize=savedView.size;runtime.zoom=savedView.zoom;runtime.setView(runtime.topView);runtime.resize();}
  syncTargets();
  $('module').value=id;
  $('layers').replaceChildren();
  GTBridge.selection({character:character.id,action:module.id});
  time=0;gap=0;playing=auto;$('seek').max=runtime.duration;$('end').value=runtime.duration.toFixed(3);$('start').value='0';$('duration').textContent=runtime.duration.toFixed(3)+' s';$('zoom').value=String(runtime.zoom);
  for(const key of ['replay','play','step','export'])$(key).disabled=false;
  message('');sample();refreshNativeSize();
 }catch(e){if(!disposed&&requested===effectGeneration)error(e);}
}
function update(){$('export-replay').disabled=!effect||exporting||measuring;$('region-select').disabled=!effect||exporting||measuring;showRegionDimensions();$('play').textContent=playing?'暂停':'播放';$('seek').value=selectedModule?.continuous?time%runtime.duration:time;$('time').textContent=time.toFixed(3);}
function sample(){if(effect)runtime.sample(time);update();}
function tick(now){
  if(disposed)return;
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!document.hidden&&effect&&playing&&!exporting&&!measuring){
    if(gap>0){gap-=dt;if(gap<=0){if(queue?.length)selectEffect(queue.shift());else if(queue){queue=null;playing=false;}else time=0;}}
    else{time+=dt*Number($('speed').value);if(time>=runtime.duration&&!(selectedModule?.continuous&&$('loop').checked)){time=runtime.duration;if(queue||$('loop').checked)gap=.25;else playing=false;}}
    sample();
  }
  requestAnimationFrame(tick);
}
function workerRequest(data,transfer=[]){return new Promise((resolve,reject)=>{worker.onmessage=e=>{e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data);};worker.onerror=e=>reject(new Error(e.message||'GIF 编码失败'));worker.postMessage(data,transfer);});}
function exportTimes(){
  const start=Number($('start').value),end=Number($('end').value),fps=Number($('fps').value),speed=Number($('speed').value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>runtime.duration+.001)throw new Error('请检查导出起止时间');
  const frames=Math.ceil((end-start)/speed*fps);if(frames>1800)throw new Error('导出最多 1800 帧，请缩短范围');
  return {start,end,fps,speed,times:Array.from({length:frames},(_,i)=>Math.min(end-1e-6,start+i*speed/fps))};
}
function showNativeDimensions(){
  if(!nativePlan)return;
  try{const size=outputSize(nativePlan,Number($('native-scale').value));$('native-dimensions').textContent=`${size.width} × ${size.height} px`;$('native-dimensions').title=`原始：${nativePlan.width} × ${nativePlan.height} px；${nativePlan.pixelsPerUnit} px / Unity 单位`;}catch(e){$('native-dimensions').textContent='—';}
}
async function refreshNativeSize(){
  showRegionDimensions();
  const native=$('size').value==='native';$('native-scale-label').hidden=$('native-dimensions').hidden=!native;
  if(!native||!effect||exporting||measuring)return;
  if(exportRegion.region){
    try{const {captureSize,dimensions}=selectedRegionPlan();$('native-dimensions').textContent=dimensions.width+' × '+dimensions.height+' px';$('native-dimensions').title='选区原始尺寸：'+captureSize.width+' × '+captureSize.height+' px';}catch(e){$('native-dimensions').textContent='—';}
    return;
  }
  let times;try{times=exportTimes().times;}catch(e){nativePlan=null;$('native-dimensions').textContent='—';return;}
  const oldTime=time,oldPlaying=playing;measuring=true;playing=false;cancelled=false;
  const disabled=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');disabled.forEach(el=>el.disabled=true);
  $('native-dimensions').textContent='计算中';$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;update();
  try{nativePlan=await runtime.measureNative(times,{onProgress:value=>$('progress').value=value,isCancelled:()=>cancelled});showNativeDimensions();}
  catch(e){nativePlan=null;$('native-dimensions').textContent='—';if(!cancelled)message(e.message);}
  finally{measuring=false;disabled.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;time=oldTime;playing=oldPlaying;runtime.resize();sample();}
}
async function exportGif(){
  if(exporting||measuring||!effect)return;
  let config;try{config=exportTimes();if($('size').value==='native')outputSize({width:1,height:1},Number($('native-scale').value));}catch(e){message(e.message);return;}
  const {start,end,fps,speed,times}=config,oldTime=time,oldPlaying=playing;exporting=true;playing=false;cancelled=false;update();
  const disabled=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');disabled.forEach(el=>el.disabled=true);
  $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;$('export').textContent='导出中';message('');
  try{
    const native=$('size').value==='native',transparent=$('background').value==='transparent';let captureSize=Number($('size').value),dimensions={width:captureSize,height:captureSize};
    const cropPlan=selectedRegionPlan();
    if(cropPlan){captureSize=cropPlan.captureSize;dimensions=cropPlan.dimensions;}
    else if(native){nativePlan=await runtime.measureNative(times,{onProgress:value=>$('progress').value=value*.25,isCancelled:()=>cancelled});captureSize=nativePlan;dimensions=outputSize(nativePlan,Number($('native-scale').value));showNativeDimensions();}
    if(cancelled)throw new Error('已取消');
    worker=new Worker(new URL('../../gtfx/gif-worker.js',import.meta.url),{type:'module'});
    await workerRequest({type:'start',...dimensions,transparent,threshold:Number($('threshold').value)});
    for(let i=0;i<times.length;i++){
      if(cancelled)throw new Error('已取消');
      const rgba=runtime.captureFrame(times[i],captureSize,transparent?null:$('color').value);
      const elapsed=i/fps,remaining=(end-start)/speed-elapsed,frameDuration=Math.min(1/fps,remaining),delay=Math.max(10,Math.round((elapsed+frameDuration)*100)*10-Math.round(elapsed*100)*10);
      await workerRequest({type:'frame',index:i,rgba:rgba.buffer,delay},[rgba.buffer]);$('progress').value=(native ? .25 : 0)+(i+1)/times.length*(native ? .75 : 1);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const result=await workerRequest({type:'finish'});if(cancelled)throw new Error('已取消');
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([result.bytes],{type:'image/gif'}));
    const a=$('download-gif');a.hidden=false;a.href=downloadUrl;a.textContent='保存 GIF';a.download=effect.assetName+(native?`_${dimensions.width}x${dimensions.height}`:'')+(transparent?'_transparent':'_matte')+'.gif';a.click();$('export-status').textContent='导出完成 · '+dimensions.width+' × '+dimensions.height+' px';
  }catch(e){if(!cancelled)message(e.message);}
  finally{worker?.terminate();worker=null;exporting=false;disabled.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;time=oldTime;playing=oldPlaying;runtime.resize();sample();}
}
$('show-target').onchange=()=>{if(runtime.characterPlayer.options)runtime.characterPlayer.options.showTarget=$('show-target').checked;sample();};
for(const id of ['appearance','skill-form','direction','skin','weapon','shield','summoned','summon-direction','target-distance'])$(id).onchange=()=>{
 if(exporting||measuring||!index)return;
 if(id==='appearance'||id==='skill-form'){
  const profile=profileFor(character.id),previous=$('weapon').value;if(id==='appearance'){refreshAppearanceColor('appearance');refreshSkillForms(profile);}else refreshAppearanceColor('skill-form');
  refreshWeapons(profile,previous);refreshShields(profile);
 }
 if(id==='weapon')refreshShields(profileFor(character.id));
 if(id==='target-distance'){
  const distance=Math.max(0,Number($('target-distance').value)||0);$('target-distance').value=String(distance);
  if(targetPoint){const n=Math.hypot(targetPoint[0],targetPoint[2]);targetPoint=n?targetPoint.map(v=>v*distance/n):resolveTarget({targetDistance:distance},previewDirection());}
 }
 syncTargets();
 queue=null;if(mode==='module'){if(id==='appearance'||id==='skill-form'||id==='weapon'||id==='shield'||id==='summoned'||id==='summon-direction')refreshModules();selectModule();}
};
$('pick-main').onclick=()=>{if(!exporting&&!measuring)setPickMode(pickMode==='main'?null:'main');};
$('pick-summon').onclick=()=>{if(!exporting&&!measuring)setPickMode(pickMode==='summon'?null:'summon');};
$('reset-summon').onclick=()=>{if(exporting||measuring)return;summonPoint=[0,0,0];summonPicked=false;syncTargets();rebuildTargets();};
for(const id of ['summon-x','summon-z'])$(id).onchange=()=>{if(exporting||measuring)return;const x=$('summon-x').valueAsNumber,z=$('summon-z').valueAsNumber;if(!Number.isFinite(x)||!Number.isFinite(z)){syncTargets();return;}if(summonPicked&&x===summonPoint[0]&&z===summonPoint[2])return;summonPicked=true;summonPoint=[x,0,z];syncTargets();rebuildTargets();};
$('pick-secondary').onclick=()=>{if(!exporting&&!measuring)setPickMode(pickMode==='secondary'?null:'secondary');};
$('clear-secondary').onclick=()=>{if(exporting||measuring)return;secondaryTargets=[];syncTargets();rebuildTargets();};
for(const id of ['target-x','target-z'])$(id).onchange=()=>{if(exporting||measuring)return;const x=$('target-x').valueAsNumber,z=$('target-z').valueAsNumber;if(!Number.isFinite(x)||!Number.isFinite(z)){syncTargets();return;}if(targetPoint?.[0]===x&&targetPoint?.[2]===z)return;targetPoint=[x,0,z];$('target-distance').value=String(Number(Math.hypot(x,z).toFixed(3)));syncTargets();rebuildTargets();};
$('canvas').addEventListener('keydown',e=>{if(e.key==='Escape')setPickMode(null);});
$('search').oninput=renderCharacters;$('menu').onclick=()=>$('sidebar').classList.toggle('open');
$('effect').onchange=()=>{queue=null;selectEffect(Number($('effect').value));};
$('module').onchange=()=>{queue=null;selectModule();};
$('play-mode').onchange=()=>{mode=$('play-mode').value;queue=null;updateMode();if(mode==='module')selectModule();else selectEffect(Number($('effect').value));};
$('play').onclick=()=>{queue=null;gap=0;if(time>=runtime.duration)time=0;playing=!playing;sample();};
$('replay').onclick=()=>{queue=null;time=0;gap=0;playing=true;sample();};
$('step').onclick=()=>{queue=null;gap=0;playing=false;time=Math.min(runtime.duration,time+1/60);sample();};
$('seek').oninput=()=>{queue=null;gap=0;playing=false;time=Number($('seek').value);sample();};
$('all').onclick=()=>{queue=[...$('effect').options].filter(o=>!o.disabled).map(o=>Number(o.value));if(queue.length)selectEffect(queue.shift());};
$('fit').onclick=()=>{if(runtime.modulePlayer.active)runtime.frameCharacter();else runtime.autoFit();$('zoom').value='1';sample();};
$('zoom').oninput=()=>{runtime.zoom=Number($('zoom').value);runtime.resize();sample();};
$('seed').onchange=async()=>{const t=time,wasPlaying=playing;await (mode==='module'?selectModule(wasPlaying):selectEffect(Number($('effect').value),wasPlaying));time=Math.min(t,runtime.duration);sample();};
$('view').onchange=()=>{runtime.setView($('view').value==='top');sample();refreshNativeSize();};
$('size').onchange=refreshNativeSize;$('native-scale').oninput=()=>{if(exportRegion.region)refreshNativeSize();else showNativeDimensions();};
for(const id of ['start','end','fps','speed'])$(id).onchange=refreshNativeSize;
$('grid').onchange=()=>{runtime.grid.visible=$('grid').checked;sample();};
function setPreviewBackground(){const solid=$('preview-background').value==='color';$('preview-color').hidden=!solid;$('stage').classList.toggle('checker',!solid);runtime.setBackground(solid?'color':'checker',$('preview-color').value);sample();}
$('preview-background').onchange=setPreviewBackground;$('preview-color').oninput=setPreviewBackground;
$('background').onchange=()=>{$('color').hidden=$('background').value==='transparent';};
$('stage').onwheel=e=>{e.preventDefault();if(exporting||measuring||exportRegion.drag)return;runtime.zoom=Math.min(6,Math.max(.25,runtime.zoom*Math.exp(-e.deltaY*.001)));$('zoom').value=runtime.zoom;runtime.resize();sample();};
let drag;
$('canvas').onpointerdown=e=>{if(exporting||measuring||exportRegion.drawing||!effect)return;
 if(pickMode&&mode==='module'&&e.button===0){
  e.preventDefault();$('canvas').focus();const p=pickGround(runtime.camera,$('canvas').getBoundingClientRect(),e.clientX,e.clientY);if(!p)return;
  if(pickMode==='main'){targetPoint=p;$('target-distance').value=String(Number(Math.hypot(p[0],p[2]).toFixed(3)));setPickMode(null);}
  else if(pickMode==='summon'){summonPicked=true;summonPoint=p;setPickMode(null);}
  else{const main=resolveTarget(moduleOptions(),previewDirection());if([main,...secondaryTargets].some(q=>Math.hypot(q[0]-p[0],q[2]-p[2])<.05))return;secondaryTargets.push(p);}
  syncTargets();rebuildTargets();return;
 }
drag={x:e.clientX,y:e.clientY};$('canvas').setPointerCapture(e.pointerId);};
$('canvas').onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,scale=runtime.viewSize/runtime.zoom/$('canvas').clientHeight,pitch=(runtime.topView?89.999:runtime.cameraConfig.pitchDeg)*Math.PI/180,comp=runtime.camera.nativeViewportScale();runtime.viewCenter.x-=dx*scale;runtime.viewCenter.y+=dy*scale*Math.cos(pitch)*comp;runtime.viewCenter.z-=dy*scale*Math.sin(pitch)*comp;drag={x:e.clientX,y:e.clientY};runtime.setView(runtime.topView);sample();};
$('canvas').onpointerup=()=>{drag=null;};$('canvas').onpointercancel=()=>{drag=null;};
async function exportMedia(){
 if(exporting||measuring||!effect)return;
 const format=$('media-format').value;if(format==='gif')return exportGif();
 let config;try{config=exportTimes();}catch(e){message(e.message);return;}
 const oldTime=time,oldPlaying=playing;exporting=true;playing=false;cancelled=false;mediaAbort=new AbortController();
 const locked=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');locked.forEach(el=>el.disabled=true);
 $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;$('export').textContent='导出中';update();message('');
 try{
  const native=$('size').value==='native',transparent=$('background').value==='transparent';let captureSize=Number($('size').value),dimensions={width:captureSize,height:captureSize};
  const cropPlan=selectedRegionPlan();
  if(cropPlan){captureSize=cropPlan.captureSize;dimensions=cropPlan.dimensions;}
  else if(native){nativePlan=await runtime.measureNative(config.times,{onProgress:p=>$('progress').value=p*.2,isCancelled:()=>cancelled});dimensions=outputSize(nativePlan,Number($('native-scale').value));captureSize=nativePlan;showNativeDimensions();}
  const {exportAnimation}=await import('../../core/animation-export.js'),{offerDownload}=await import('../../core/export-utils.js');
  const result=await exportAnimation({format,...dimensions,frames:config.times.length,fps:config.fps,duration:(config.end-config.start)/config.speed,transparent,background:$('color').value,signal:mediaAbort.signal,getFrame:i=>{const rgba=runtime.captureFrame(config.times[i],captureSize);return nearestResize(rgba,typeof captureSize==='object'?captureSize.width:captureSize,typeof captureSize==='object'?captureSize.height:captureSize,dimensions.width,dimensions.height);},onProgress:p=>$('progress').value=(native?.2:0)+p*(native?.8:1)});
  if(!cancelled){offerDownload($('download-gif'),result.blob,effect.assetName+'.'+result.extension);$('export-status').textContent=`导出完成 · ${result.width} × ${result.height} px`;}
 }catch(e){if(!cancelled&&e.name!=='AbortError')message(e.message);}
 finally{exporting=false;mediaAbort=null;locked.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;time=oldTime;playing=oldPlaying;if(!disposed){runtime.resize();sample();}}
}

$('export').onclick=exportMedia;$('cancel').onclick=()=>{cancelled=true;mediaAbort?.abort();};
$('media-format').onchange=()=>{const video=['mp4','mov'].includes($('media-format').value);$('background').querySelector('option[value=transparent]').disabled=video;if(video)$('background').value='color';$('color').hidden=$('background').value==='transparent';$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;};
$('export-replay').onclick=async()=>{
 if(!effect||exporting||measuring)return;
 const trace=runtime.getReplayTrace(),canvas=runtime.renderer.domElement;
 trace.preview={version:1,mode,time,directionMode:$('direction').value,appearance:$('appearance').value,skin:$('skin').value,weapon:$('weapon').value,shield:$('shield').value,summoned:$('summoned').checked,summonPosition:summonPicked?summonPoint.slice():null,summonDirection:$('summon-direction').value,
  direction:previewDirection(),topView:runtime.topView,cameraConfig:runtime.cameraConfig,
  cameraWorld:runtime.camera.matrixWorld.toArray(),projection:runtime.camera.projectionMatrix.toArray(),
  viewCenter:runtime.viewCenter.toArray(),viewSize:runtime.viewSize,zoom:runtime.zoom,
  viewport:[canvas.clientWidth,canvas.clientHeight],drawingBuffer:[canvas.width,canvas.height],
  manifest:manifestUrl.href,cacheVersion:globalThis.GT_CACHE_VERSION||null};
 const {downloadBlob}=await import('../../core/export-utils.js');
 downloadBlob(new Blob([JSON.stringify(trace,null,2)],{type:'application/json'}),character.id+'-'+(selectedModule?.id||effect.preset)+'-replay.json');
};
async function init(){try{runtime=new FxRuntime($('canvas'));runtime.characterPlayer=new FxCharacterPlayer(runtime);runtime.modulePlayer=new FxActionPlayer(runtime);runtime.grid.visible=false;runtime.setBackground('checker');new ResizeObserver(()=>{if(!exporting&&!measuring){runtime.resize();exportRegion.render();sample();}}).observe($('stage'));runtime.resize();[catalog,weaponCatalog,weaponNames,nativeActions,nativePlans]=await Promise.all([json('../../resources/fx/catalog.json'),json('../../gtfx/assets/weapon-types.json'),json('../../gtatlas/assets/items.zh.json'),json('../../gtfx/assets/native-actions.json'),json('../../gtfx/assets/native-action-plans.json')]);baseNativeActions=nativeActions;baseNativePlans=nativePlans;registry=await GTRegistry.load();catalog={...catalog,characters:groupCharacters(catalog,await json('../../gtfx/assets/character-groups.json'))};renderCharacters();const desired=new URL(location.href).searchParams.get('character')||'hana';const selected=resolveCharacter(catalog.characters,desired);if(selected)await selectCharacter(selected,desired);else message('当前索引没有对应角色：'+desired);if(!disposed)loadAvatars();}catch(e){error(e);}requestAnimationFrame(tick);}
init();

window.addEventListener("gt-dispose",()=>{disposed=true;++generation;++effectGeneration;cancelled=true;mediaAbort?.abort();worker?.terminate();if(downloadUrl)URL.revokeObjectURL(downloadUrl);runtime?.dispose();});
