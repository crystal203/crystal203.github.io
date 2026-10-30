import {effectLookup} from './effect-lookup.js';
import {aimDirection,targetPositions} from './targeting.js';
import {stepHomingProjectile} from './native-projectile.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const dir=(a,b)=>{const n=dist(a,b);return n?b.map((v,i)=>(v-a[i])/n):[1,0,0];};
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
// All identities below are source action types or declarative plan operations.
export function projectileActionModules(index,options,native,plans,style){
 const effects=effectLookup(index.effects);
 const ids=new Set([...(native.heroOptionIds?.[options.heroAppearance||options.appearance]||native.heroOptionIds?.[options.profile.defaultSkin]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const override=(a,key='MythOptionId')=>ids.has(a[key])?{...a,...byId.get(a[key]),Name:a.Name}:a;
 const targets=targetPositions(options,options.direction).map(p=>[p[0],.375,p[2]]),forward=aimDirection(options,options.direction),offset=native.weapons?.[options.weapon]?.shootOffset??.5;
 const modules=[];
 const add=(tracks,preset,at,link={})=>{if(!preset)return;const effect=effects.get(preset);if(!effect)throw Error('Missing projectile effect: '+preset);tracks.push({effect,at:0,link:{delay:at,end:0,clips:[],anchor:'center',fxEnd:at+effect.duration,...link}});};
 const animation=(a,key,start=0)=>{const r=list(a.AnimationInfo).find(r=>r.Name===key);return r?{name:r.Animation,start,speed:r.Scale??1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})}:null;};
 const finish=(id,label,actor,tracks)=>{for(const t of tracks)t.link.end=actor.end;modules.push({id,label,actor,tracks,duration:Math.max(actor.end,...tracks.map(t=>t.link.fxEnd))});};
 function shot(tracks,p,start,destination,at,{angle=0,homing=false,life=p.Lifetime,muzzle=true}={}){
  if(!p)throw Error('Missing projectile source');
  const base=dir(start,destination),r=angle*Math.PI/180,d=[base[0]*Math.cos(r)+base[2]*Math.sin(r),0,base[2]*Math.cos(r)-base[0]*Math.sin(r)];
  let state={position:start.slice(),direction:d,speed:p.Speed},elapsed=0,hit=false;
  const path=[{time:at,position:start.slice()}],step=1/60;
  for(let frame=0;frame<3600&&elapsed<life-1e-9;frame++){
   const dt=Math.min(step,life-elapsed),remaining=dist(state.position,destination);
   if(remaining<=state.speed*dt){elapsed+=homing?dt:remaining/state.speed;path.push({time:at+elapsed,position:destination.slice()});hit=true;break;}
   state=stepHomingProjectile(state,dt,{accel:p.Accel||0,angularSpeed:homing?p.HomingAngularSpeed||0:0,target:destination});elapsed+=dt;path.push({time:at+elapsed,position:state.position.slice()});
  }
  const end=path.at(-1).position;
  const motion={anchor:'projectile',motionPath:path,graphDirection:d,fxEnd:at+elapsed};
  if(muzzle)add(tracks,p.ShootEffectPreset,at,{graphPosition:start,graphDirection:d});
  add(tracks,p.PresetName,at,motion);
  for(const extra of list(p.ExtraPoolInfo))add(tracks,extra.PresetName,at,motion);
  add(tracks,p.ExplosionPreset,at+elapsed,{graphPosition:end,directed:false});
  if(hit)add(tracks,p.HitPreset,at+elapsed,{graphPosition:end,directed:false});
  return {at:at+elapsed,position:end,hit};
 }
 for(const name of style.ManualBattleActions||[]){
  const original=native.actions[name];if(!name.startsWith('ManualGrenadeLauncher:'))continue;
  const a=override(original,'ManualMythOptionId'),option=ids.has(original.OptionId)?byId.get(original.OptionId):null;
  // EnhancedCwpMythOptionId changes only DpsMultiplier, after ProjectileName
  // was read from the equipped option (.ctor 0x8ae5228-0x8ae532c).
  const enhancedMultiplier=(ids.has(original.EnhancedCwpMythOptionId)?byId.get(original.EnhancedCwpMythOptionId):option)?.DpsMultiplier;
  const recoil=at=>({at,direction:forward,distance:.30000001192092896,height:.20000000298023224,duration:.2750000059604645,angle:8});
  // Native StartAttack emits immediately; OnUpdateFrameAttack ends at .25 s.
  for(const [id,label,key,extra] of [['basic-1','普通射击',a.ProjectileName,null],['basic-2','弹匣终结射击',original.SuperProjectileName,null],...(option?.ProjectileName?[['basic-enhanced','专武强化射击',a.ProjectileName,option.ProjectileName]]:[])]){
   const tracks=[],start=forward.map(v=>v*offset);start[1]=.375;
   shot(tracks,native.projectiles[key],start,targets[0],0);
   if(extra)shot(tracks,native.projectiles[extra],start,targets[0],0);
   const isFinal=key===original.SuperProjectileName;
   finish(id,label,{end:.25,clips:[{name:'rifle_shoot',start:0,speed:1,targetDuration:.25,loop:false}],...(isFinal?{spinePath:buildNativeRecoilPath([recoil(0)],forward,.2750000059604645)}:{})},tracks);
   modules.at(-1).nativeLauncher={projectile:key,enhancedProjectile:extra,enhancedMultiplier:extra?enhancedMultiplier:null,staminaBreak:isFinal};
  }
  const magazineSize=native.weapons?.[options.weapon]?.magazineSize;
  if(Number.isInteger(magazineSize)&&magazineSize>0){
   const tracks=[],clips=[],sequence=[],start=forward.map(v=>v*offset);start[1]=.375;
   // ManualDiscreteStamina AttackState advances unscaled dt. This launcher's
   // OnUpdateFrameAttack ends at .25 s (0x8ae649c), independent of ShootTerm.
   // GetAttackType selects the extra shot at cooldown <= 0 (0x8ae57cc);
   // StartAttack resets that cooldown to 3 s (0x8ae5ebc).
   const period=.25,cooldown=3;let nextEnhancedAt=0;
   for(let round=0;round<magazineSize;round++){
    const at=round*period,final=round===magazineSize-1;
    const projectile=final?original.SuperProjectileName:a.ProjectileName;
    const enhanced=!!option?.ProjectileName&&at>=nextEnhancedAt;
    shot(tracks,native.projectiles[projectile],start,targets[0],at);
    if(enhanced){shot(tracks,native.projectiles[option.ProjectileName],start,targets[0],at);nextEnhancedAt=at+cooldown;}
    clips.push({name:'rifle_shoot',start:at,speed:1,targetDuration:period,loop:false});
    sequence.push({time:at,round:round+1,remaining:magazineSize-round-1,projectile,enhancedProjectile:enhanced?option.ProjectileName:null});
   }
   const recoilEnd=(magazineSize-1)*period+.2750000059604645;
   finish('basic-magazine','整弹匣连射（'+magazineSize+' 发）',{end:magazineSize*period,clips,spinePath:buildNativeRecoilPath([recoil((magazineSize-1)*period)],forward,recoilEnd)},tracks);
   modules.at(-1).duration=Math.max(modules.at(-1).duration,recoilEnd);
   modules.at(-1).nativeLauncher={enhancedMultiplier,staminaBreakRound:magazineSize};
   modules.at(-1).attackSequence=sequence;
  }
 }
 for(const plan of plans){
  if(!plan.behavior||plan.exclusive&&!options.exclusiveWeapon)continue;
  const a=override(native.actions[plan.action]),tracks=[];
  if(plan.behavior==='paired-homing'){
   const p=native.projectiles[list(a.ProjectileInfo)[0]?.Name];if(!p)throw Error('Missing paired projectile');
   const angle=Math.min(plan.spin,Math.min(Math.hypot(targets[0][0],targets[0][2])/p.Speed,p.Lifetime)*p.HomingAngularSpeed*.5);
   let end=0;
   for(const sign of [1,-1]){
    const before=tracks.length,result=shot(tracks,p,[0,.375,0],targets[0],0,{angle:sign*angle,homing:true,life:60,muzzle:false});end=Math.max(end,result.at);
    // Lua owns one shared explosion when the pair reaches the target.
    if(sign<0)tracks.splice(before,tracks.length-before,...tracks.slice(before).filter(t=>t.effect.preset!==p.ExplosionPreset));
   }
   finish(plan.id,plan.label,{end:Math.max(a.Duration||0,end),clips:[animation(a,plan.animation)].filter(Boolean)},tracks);
  }else if(plan.behavior==='redirect-projectile'){
   const p=native.projectiles[a.ProjectileName],presets=fields(a.PresetInfo),ready=a.PrepareDuration||0;
   add(tracks,presets.ready,0,{directed:false,fxEnd:ready});
   const start=forward.map(v=>v*offset);start[1]=.375;
   let result=shot(tracks,p,start,targets[0],ready),used=new Set([0]);
   add(tracks,presets.screen,result.at,{screen:true,directed:false});
   for(let n=0;result.hit&&n<a.LimitGuide;n++){
    const candidates=targets.map((p,i)=>({p,i,d:dist(p,result.position)})).filter(t=>!used.has(t.i)&&t.d<=a.RefreshDistance).sort((a,b)=>a.d-b.d);
    const next=candidates[0];if(!next)break;used.add(next.i);
    const q={...p,Speed:a.RefreshSpeed,Lifetime:a.RefreshDistance/a.RefreshSpeed,ShootEffectPreset:null};
    result=shot(tracks,q,result.position,next.p,result.at+a.RefreshDuration,{muzzle:false});
   }
   finish(plan.id,plan.label,{end:Math.max(a.ActionDuration||0,ready),clips:[animation(a,'ready'),animation(a,'shoot',ready)].filter(Boolean)},tracks);
  }
 }
 return modules;
}
