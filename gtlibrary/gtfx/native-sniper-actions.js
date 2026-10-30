import {sourceHero} from './weapon-hero-variants.js';
// Native persistent dual-mode rifles and support shot reactions.
import {sourceProjectileModules} from './script-projectile-patterns.js';
import {aimDirection,targetPositions} from './targeting.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
import {elasticDebris,nativePoolEventTransform} from './native-melee-operations.js';
import {sampleGraphPath} from './graph-action.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v],add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const rows=v=>Object.fromEntries(list(v).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
function context(index,options,native,module){
 const effects=new Map(index.effects.filter(e=>!e.unavailable).map(e=>[e.preset,e])),initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),path=module.actor.graphPath,centerAt=at=>add(sampleGraphPath(path,at),[0,options.centerHeight??.375,0]);
 function effect(preset,at,position,{directed=false,scale=[1,1,1],...extra}={}){
  const e=effects.get(preset);if(!e)throw Error('Missing native rifle effect '+preset);const pool=nativePoolEventTransform(e,{nativePoolTransform:directed?'directional':'direct',directed},forward),t={effect:e,at:0,link:{delay:at,end:module.actor.end,anchor:'feet',graphPosition:pool?add(position,pool.offset):position,graphDirection:forward,graphPath:path,graphOwnerAtBirth:initial.slice(),directed:pool?.directed??directed,fxEnd:at+(e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration),rootScaleX:scale[0]*(pool?.scale[0]??1),rootScaleY:scale[1]*(pool?.scale[1]??1),rootScaleZ:scale[2]*(pool?.scale[2]??1),rotationType:pool?.rotationType??'Default',...extra}};module.tracks.push(t);return t;
 }
 return {initial,forward,path,centerAt,effect};
}
export function appendNativeRifleReactions(index,options,native,module,rule,mode=0){
 const {forward,centerAt,effect}=context(index,options,native,module),offset=native.weapons?.[options.weapon]?.shootOffset??.5;
 for(const shot of module.sourceTrace.shots){
  const at=shot.at,center=centerAt(at),feet=sampleGraphPath(module.actor.graphPath,at);
  effect(rule.jumpPreset,at,feet,{scale:[.5,.5,.5]});
  effect(rule.trailPreset,at,add(center,[0,-.015,0]),{directed:true,scale:[1,1,rule.supportReaction?1:1+mode*.5]});
  if(rule.supportReaction)effect(rule.muzzlePreset,at,add(add(feet,[0,.6,0]),forward,offset),{directed:true});
  const debris=elasticDebris({start:center,direction:forward.map(v=>-v),...rule.cartridge}),shift=arr=>arr.map(p=>({...p,time:p.time+at}));
  effect(rule.cartridgePreset,at,center,{motionPath:shift(debris.path),eulerPath:shift(debris.eulerPath),eulerMask:[false,true,false],colorPath:shift(debris.colorPath),fxEnd:at+debris.total});
  effect(rule.jumpPreset,at+debris.bounceAt,debris.bouncePosition,{scale:[.4,.4,.4]});
  if(!rule.supportReaction)effect(rule.jumpPreset,at+rule.reloadAt[mode],sampleGraphPath(module.actor.graphPath,at+rule.reloadAt[mode]),{scale:[.7,.7,.7]});
 }
 module.duration=Math.max(module.duration,...module.tracks.map(t=>t.link.fxEnd));
}
export function buildNativePersistentRifle(index,options,native,plan,style,convert){
 const rule=plan.nativeFirearm,a=native.actions[plan.action],initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),weapon=native.weapons?.[options.weapon]||{},offset=weapon.shootOffset??.5;
 const target=targets.find(t=>Math.hypot(t[0]-initial[0],t[2]-initial[2])<=7),prepare=target?rule.prepareTarget:rule.prepareDefault,result=[];
 for(let mode=0;mode<rule.projectileNames.length;mode++)for(const count of [1,3]){
  const projectile=convert(native.projectiles[rule.projectileNames[mode]]),period=prepare+rule.cooldown[mode],end=count*period,lastShot=(count-1)*period+prepare;
  const synthetic={...native,actions:{...native.actions,[plan.action]:{...a,ActionDuration:end,AnimationInfo:[],ProjectileInfo:[{Name:projectile.Name}]}},projectiles:{...native.projectiles,[projectile.Name]:projectile}};
  const p={behavior:'source-projectile-pattern',category:'basic',id:'basic',label:'普通攻击',action:plan.action,pattern:'scheduled-projectiles',poolRules:Object.fromEntries(index.effects.filter(e=>e.poolTimeLimit>0).map(e=>[e.preset,{timeLimit:e.poolTimeLimit}])),end,clips:[],shots:Array.from({length:count},(_,i)=>({at:i*period+prepare,index:0,offset})),events:[],sourceMoves:Array.from({length:count},(_,i)=>({at:i*period+prepare,duration:rule.dash.duration,speed:rule.dash.speed,sign:-1})),source:plan.source};
  const m=sourceProjectileModules(index,options,synthetic,[p],style)[0],shots=m.sourceTrace.shots,path=[],clips=[],spinePath=buildNativeRecoilPath(shots.map(s=>({at:s.at,...rule.recoil})),forward,end);
  // Every new prepare state re-aims at the current target. Explicit three-shot
  // preview keeps the native independent cooldown; no magazine is invented.
  for(let f=0;f<=Math.ceil(end*60);f++){const time=Math.min(end,f/60);let d=0;for(const shot of shots){const u=Math.max(0,Math.min(1,(time-shot.at)/rule.dash.duration));d-=rule.dash.speed*rule.dash.duration/2*u*(2-u);}path.push({time,position:add(initial,forward,d)});}
  for(const shot of shots)for(const dt of [0,rule.dash.duration]){const time=shot.at+dt;let d=0;for(const s of shots){const u=Math.max(0,Math.min(1,(time-s.at)/rule.dash.duration));d-=rule.dash.speed*rule.dash.duration/2*u*(2-u);}path.push({time,position:add(initial,forward,d)});}
  path.sort((a,b)=>a.time-b.time);
  for(const shot of shots){const begin=shot.at-prepare;clips.push({name:rule.shootAnimation,start:begin,end:shot.at,track:'Base',speed:0,loop:false},{name:rule.shootAnimation,start:shot.at,end:shot.at+rule.reloadAt[mode],track:'Base',speed:rule.shootScale,loop:false},{name:rule.reloadAnimation,start:shot.at+rule.reloadAt[mode],end:shot.at+rule.reloadEnd[mode],track:'Base',speed:rule.reloadScale[mode],loop:false});}
  m.id=mode===0?(count===1?'basic-1':'basic-continuous'):(count===1?'basic-mode2':'basic-mode2-continuous');m.label=(mode===0?'穿透射击':'强力射击')+(count>1?' · 连续3次':'');m.actor={...m.actor,end,clips,graphPath:path,spinePath,nativeAim:{bone:'b.aim',originHeight:options.centerHeight??.375,direction:forward,windows:shots.map(s=>({at:s.at-prepare,end:s.at+rule.reloadEnd[mode]}))}};
  m.nativeWeapon={type:rule.operation,mode,projectile:projectile.Name,prepare,cooldown:rule.cooldown[mode],period,sourceItemId:weapon.sourceItemId,consumesStamina:false};m.sourceTrace.reloads=shots.map(s=>({at:s.at+rule.reloadAt[mode],end:s.at+rule.reloadEnd[mode],scale:rule.reloadScale[mode]}));m.sourceTrace.actionEnd=lastShot+rule.reloadEnd[mode];m.sourceTrace.previewStage='explicit persistent cycles on a level floor, per-shot locked aim; no stamina consumer';
  appendNativeRifleReactions(index,options,native,m,rule,mode);
  // C# OnHit triggers the equipped Lua option for both labels; the option
  // itself spawns its explosion at the provided target position.
  const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon.optionIds||[]:[])]),option=Object.values(native.options||{}).find(o=>o.Id===a.OptionId&&ids.has(o.Id));
  if(option){const {effect}=context(index,options,native,m),presets=rows(option.PresetInfo);for(const shot of shots)if(shot.hit){const body=m.tracks.find(t=>t.effect.preset===projectile.PresetName&&Math.abs(t.link.delay-shot.at)<1e-8);effect(presets.explosion,shot.hitAt,sampleGraphPath(body.link.motionPath,shot.hitAt));}if(ids.has(option.SpecialOptionId)&&end>=option.RequireTime)effect(presets.buff,option.RequireTime,add(initial,[0,options.centerHeight??.375,0]),{graphFollow:true,fxEnd:end});m.sourceTrace.equippedOption={id:option.Id,specialActive:ids.has(option.SpecialOptionId),ownerBuffAt:ids.has(option.SpecialOptionId)?option.RequireTime:null};}
  m.duration=Math.max(end,m.duration,...m.tracks.map(t=>t.link.fxEnd));result.push(m);
 }
 return result;
}
export function buildNativeTargetedBlast(index,options,native,plan){
 const a=native.actions[plan.action],r=plan.nativeFirearm,end=a.ActionDuration,initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),target=targets.find(t=>Math.hypot(t[0]-initial[0],t[2]-initial[2])<=a[r.rangeField])||add(initial,forward,a[r.rangeField]),presets=rows(a.PresetInfo),row=list(a.AnimationInfo).find(v=>v.Name===r.castKey);
 const m={id:plan.id,label:plan.label,actor:{end,clips:[{name:row.Animation,start:0,end,track:'Base',speed:row.Scale??1,loop:!!row.Loop}],graphPath:[{time:0,position:initial},{time:end,position:initial}],nativeAim:{bone:'b.aim',originHeight:options.centerHeight??.375,direction:forward,windows:[{at:0,end}]}},tracks:[],duration:end,source:plan.source,sourceTrace:{operation:r.operation,target,hitAt:a[r.hitField]}},c=context(index,options,native,m);
 c.effect(presets[r.castKey],0,c.centerAt(0),{graphFollow:true});c.effect(presets[r.screenKey],0,initial,{screen:true});const ready=c.effect(presets[r.readyKey],0,target),e=ready.effect;ready.link.fxEnd=e.dispose==='TriggeredTimeLimit'?end+(e.poolTimeLimit??e.duration):e.dispose==='TimeLimit'?(e.poolTimeLimit??e.duration):end;
 c.effect(presets[r.explosionKey],a[r.hitField],target);m.duration=Math.max(end,...m.tracks.map(t=>t.link.fxEnd));return m;
}
