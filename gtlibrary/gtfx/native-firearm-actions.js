import {sourceHero} from './weapon-hero-variants.js';
import {buildNativePersistentRifle,appendNativeRifleReactions,buildNativeTargetedBlast} from './native-sniper-actions.js';
// Source-backed firearm recipes. Dispatch uses native operation data.
import {sourceProjectileModules} from './script-projectile-patterns.js';
import {aimDirection,targetPositions} from './targeting.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
import {sampleGraphPath} from './graph-action.js';
import {UnityRand} from './native-random.js';
const poolRules=index=>Object.fromEntries(index.effects.filter(e=>e.poolTimeLimit>0).map(e=>[e.preset,{timeLimit:e.poolTimeLimit}]));
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const rows=v=>Object.fromEntries(list(v).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
function convertedProjectile(p){if(!p?.PresetName)throw Error('Missing materialized native firearm projectile '+p?.Name);return {...p,HitBoxWidth:(p.HitBoxWidth??0)*(p.P2w??1),HitBoxHeight:(p.HitBoxHeight??0)*(p.P2w??1),PenetrateType:p.PenetrateType==='Enemy'?'All':p.PenetrateType};}
function appendBatchProjectileShadows(module,native){
 for(const shot of module.sourceTrace?.shots||[]){
  const spec=native.projectiles[shot.projectile];if(!spec?.UseShadow||spec.InstantiationType&&spec.InstantiationType!=='BatchSprite')continue;
  const body=module.tracks.find(t=>t.effect.preset===spec.PresetName&&Math.abs(t.link.delay-shot.at)<1e-8);if(!body)throw Error('Missing native batch projectile body for shadow');
  // ProjectileBatch.UpdateVerticesNew lowers the same billboard quad to
  // min(tile height + .03, projectileY - .01); flat preview tile height is 0.
  const lower=p=>[p[0],Math.min(.03,p[1]-.01),p[2]],motionPath=body.link.motionPath.map(p=>({...p,position:lower(p.position)}));
  module.tracks.push({...body,link:{...body.link,graphPosition:lower(body.link.graphPosition),motionPath,colorPath:[{time:shot.at,position:[0,0,0,.25]}]},nativeProjectileShadow:{source:'native ARM64 ProjectileBatch 0x6a581b8/0x6a58e04',projectile:spec.Name,tileHeight:0,rgba:[0,0,0,.25]}});
 }
}
function animationRows(a){return list(a.AnimationKeys).map((Animation,i)=>({Name:'clip'+i,Animation,Scale:list(a.AnimationTimeScales)[i]??1,Loop:!!list(a.AnimationLoops)[i]}));}
export function nativeFirearmActionModules(index,options,native,plans,style){
 const output=[],initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),weapon=native.weapons?.[options.weapon]||{},offset=weapon.shootOffset??.5;
 for(const plan of plans){
  if(plan.behavior!=='native-firearm'||plan.exclusive&&!options.exclusiveWeapon)continue;
  if(plan.category==='basic'&&!(style.ManualBattleActions||[]).includes(plan.action))continue;
  const a=native.actions[plan.action],r=plan.nativeFirearm;if(!a)throw Error('Missing native firearm action '+plan.action);
  if(r.operation==='discrete-stamina-projectile'){
   const [normal,last]=r.projectileNames.map(n=>convertedProjectile(native.projectiles[n]));
   const synthetic={...native,actions:{...native.actions,[plan.action]:{...a,ActionDuration:r.period,AnimationInfo:[{Name:'shoot',Animation:r.shootAnimation,Scale:1,Loop:true}],ProjectileInfo:r.projectileNames.map(Name=>({Name}))}},projectiles:{...native.projectiles,[normal.Name]:normal,[last.Name]:last}};
   const pattern={behavior:'source-projectile-pattern',category:'basic',id:'basic',label:plan.label,action:plan.action,pattern:'scheduled-projectiles',poolRules:poolRules(index),end:r.period,clips:[{key:'shoot',track:'Upper',start:0,end:r.period}],shots:[{at:0,index:0,offset}],breakShots:[{at:0,index:1,offset}],events:[],staminaCost:r.staminaCost,magazine:{sourceGate:'ManualDiscreteStamina.IsBreakAttack: stamina <= staminaPerAction; Enter subtracts staminaPerAction'},source:plan.source};
   const modules=sourceProjectileModules(index,options,synthetic,[pattern],style);
   for(const m of modules){
    const shots=m.sourceTrace.shots,final=shots.at(-1).index===1,lastAt=final?shots.at(-1).at:null,actionEnd=m.actor.end;
    // Source scales the selected skeleton's actual shoot animation to .1s.
    for(const clip of m.actor.clips){clip.targetDuration=r.shootTargetDuration;clip.speed=1;}
    const visualEnd=final?Math.max(actionEnd,lastAt+r.reloadAt+r.reloadAnimationDuration,lastAt+r.lastRecoil.duration):actionEnd;
    if(final)m.actor.clips.push({name:r.reloadAnimation,start:lastAt+r.reloadAt,end:visualEnd,track:'Upper',speed:1,loop:true});
    m.actor.end=visualEnd;m.actor.graphPath.push({time:visualEnd,position:initial.slice()});
    m.actor.spinePath=buildNativeRecoilPath(final?[{at:lastAt,...r.lastRecoil}]:[],forward,visualEnd);
    m.actor.nativeAim={bone:'b.aim',originHeight:options.centerHeight??.375,direction:forward,windows:shots.map(s=>({at:s.at,end:s.at+r.period}))};
    m.sourceTrace.shots=shots.map((s,i)=>({...s,staminaBefore:m.id==='basic-last'?r.staminaCost:(native.battleDefaults?.maxStamina||200)-i*r.staminaCost,staminaCost:r.staminaCost,isBreak:s.index===1}));
    m.sourceTrace.actionEnd=actionEnd;m.sourceTrace.reloadAt=final?lastAt+r.reloadAt:null;
    m.nativeWeapon={type:'discrete-stamina-projectile',normal:normal.Name,last:last.Name,shootOffset:offset,capacity:Math.ceil((native.battleDefaults?.maxStamina||200)/r.staminaCost),sourceItemId:weapon.sourceItemId};
    m.duration=Math.max(visualEnd,m.duration);output.push(m);
   }
  }else if(r.operation==='dual-mode-projectile'){output.push(...buildNativePersistentRifle(index,options,native,plan,style,convertedProjectile));
  }else if(r.operation==='targeted-blast'){output.push(buildNativeTargetedBlast(index,options,native,plan));
  }else if(r.operation==='projectile-support'){
   const p=convertedProjectile(native.projectiles[a[r.projectileField]]),end=a.Duration,animationInfo=animationRows(a);
   const synthetic={...native,actions:{...native.actions,[plan.action]:{...a,ActionDuration:end,AnimationInfo:animationInfo,ProjectileInfo:[{Name:p.Name}]}},projectiles:{...native.projectiles,[p.Name]:p}};
   const clips=animationInfo.map((v,i)=>({key:v.Name,start:list(a.AnimationTimings)[i]??0,end:list(a.AnimationRemoveTimes)[i]>=0?list(a.AnimationRemoveTimes)[i]:end,track:'Base'}));
   const pplan={behavior:'source-projectile-pattern',category:'support',id:'support',label:plan.label,action:plan.action,pattern:'scheduled-projectiles',poolRules:poolRules(index),end,clips,shots:list(a[r.timingField]).map(at=>({at,index:0,offset})),events:[],source:plan.source};
   const m=sourceProjectileModules(index,options,synthetic,[pplan],style)[0];
   m.actor.directionPath=[{time:0,position:[Math.sign(forward[0])||1,0,0]}];
   m.actor.nativeAim={bone:'b.aim',originHeight:options.centerHeight??.375,direction:forward,windows:[{at:0,end}]};
   m.nativeWeapon={type:'projectile-support',projectile:p.Name,shootOffset:offset,sourceItemId:weapon.sourceItemId};
   for(const [i,preset]of list(a.EffectPresetNames).entries()){const at=list(a.EffectCreateTimings)[i]??0,e=index.effects.find(e=>e.preset===preset);if(!e)throw Error('Missing native support effect '+preset);const anchor=list(a.EffectAnchors)[i],target=targetPositions(options,options.direction)[0].slice();if(anchor==='TargetCenter')target[1]+=options.centerHeight??.375;else if(anchor!=='Target')throw Error('Unsupported native support effect anchor '+anchor);m.tracks.push({effect:e,at:0,link:{delay:at,end,anchor:'feet',graphPosition:target,directed:false,fxEnd:at+(e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration)}});}
   if(r.supportReaction)appendNativeRifleReactions(index,options,native,m,r);m.duration=Math.max(m.duration,...m.tracks.map(t=>t.link.fxEnd));output.push(m);
  }else if(r.operation==='cone-sequence'){
   const end=a.ActionDuration,presets=rows(a.PresetInfo),effects=new Map(index.effects.filter(e=>!e.unavailable).map(e=>[e.preset,e])),tracks=[],clips=[],times=a[r.timingField],keys=a[r.keysField],lastAt=times.at(-1),dash=r.lastDash;
   const visualEnd=Math.max(end,lastAt+r.lastRecoil.duration),path=[{time:0,position:initial.slice()},{time:lastAt,position:initial.slice()}],finalPosition=add(initial,forward,-dash.speed*dash.duration/2);
   for(let f=1;f<=Math.ceil(dash.duration*60);f++){const t=Math.min(dash.duration,f/60),u=t/dash.duration;path.push({time:lastAt+t,position:add(initial,forward,-dash.speed*dash.duration/2*u*(2-u))});}
   path.push({time:visualEnd,position:finalPosition});
   function clip(key,at,until){const row=list(a.AnimationInfo).find(x=>x.Name===key);if(!row)throw Error('Missing native firearm animation '+key);clips.push({name:row.Animation,start:at,end:until,track:'Base',speed:row.Scale??1,loop:!!row.Loop});}
   function effect(key,at,follow=false,until){const e=effects.get(presets[key]);if(!e)throw Error('Missing native cone effect '+presets[key]);const pool=nativePoolEventTransform(e,{nativePoolTransform:'directional',directed:true},forward),position=add(add(sampleGraphPath(path,at),[0,options.centerHeight??.375,0]),forward,offset),t={effect:e,at:0,link:{delay:at,end,anchor:'feet',graphPosition:pool?add(position,pool.offset):position,graphOwnerAtBirth:initial.slice(),graphPath:path,graphDirection:forward,directed:pool?.directed??true,graphFollow:follow,fxEnd:until??at+(e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration),...(pool?{rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2],rotationType:pool.rotationType}:{})}};tracks.push(t);}
   clip(r.readyKey,0,times[0]);effect(r.readyKey,0,true,end);
   for(const [i,at]of times.entries()){clip(keys[i],at,times[i+1]??end);effect(keys[i],at);}
   const recoils=times.map((at,i)=>({at,...(i===times.length-1?r.lastRecoil:r.recoil)})),spinePath=buildNativeRecoilPath(recoils,forward,visualEnd);
   output.push({id:plan.id,label:plan.label,actor:{end,clips,graphPath:path,spinePath,nativeAim:{bone:'b.aim',originHeight:options.centerHeight??.375,direction:forward,windows:[{at:0,end}]}},tracks,duration:Math.max(visualEnd,...tracks.map(t=>t.link.fxEnd)),source:plan.source,sourceTrace:{operation:r.operation,shots:times.map((at,i)=>({at,key:keys[i],radius:a[r.radiusField][i],angle:a[r.angleField][i]})),lastDash:{at:lastAt,distance:dash.speed*dash.duration/2,end:lastAt+dash.duration},previewStage:'explicit source action and flat-floor backward dash'}});
  }else throw Error('Unsupported native firearm operation '+r.operation);
 }
 for(const m of output){appendBatchProjectileShadows(m,native);appendNativeOnHitPassives(index,options,native,m);}
 return output;
}

// OnHitAppliedStageOption 69b7178 / 69b782c / 69b8378 / 69b8604:
// non-passive owner damage, per-target cooldown before Random.value, sequential
// effect pool selection, zero direction, source target anchor and follow flag.
export function appendNativeOnHitPassives(index,options,native,module){
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),weapon=native.weapons?.[options.weapon]||{},ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon.optionIds||[]:[])]);
 const passives=Object.values(native.options||{}).filter(o=>ids.has(o.Id)&&o.Class==='OnHitPassive'&&o.Probability!=null&&o.TargetEffectPreset?.length);
 if(!passives.length)return;
 const targets=targetPositions(options,options.direction),initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),rng=new UnityRand(options.seed??12345);
 if(module.random?.stateAfter)rng.setState(module.random.stateAfter);else if(options.randomState)rng.setState(options.randomState);
 const stateBefore=rng.getState(),hits=[];
 for(const s of module.sourceTrace?.shots||[]){
  if(s.radius!=null){for(const [i,target]of targets.entries()){const d=add(target,initial,-1),length=Math.hypot(d[0],d[2]),angle=length?Math.acos(Math.max(-1,Math.min(1,(d[0]*forward[0]+d[2]*forward[2])/length)))*180/Math.PI:0;if(length<=s.radius+(options.targetRadius??.275)&&angle<=s.angle/2)hits.push({at:s.at,target:i});}}
  else if(s.hit)hits.push({at:s.hitAt,target:0});
 }
 hits.sort((a,b)=>a.at-b.at||a.target-b.target);
 const events=[],effects=new Map(index.effects.map(e=>[e.preset,e]));
 for(const option of passives){
  // Only the unrestricted noncritical source contract is opted into here.
  // Other consumers must add their exact damage/element/heal contract first.
  if(option.ForCritical||option.TargetElementalType||option.TargetDamageType||option.Radius||option.PartyHealModifier||option.HealRatio)throw Error('Unsupported restricted native OnHitPassive '+option.Name);
  const nextByTarget=new Map();let poolIndex=0;
  for(const hit of hits){
   if(hit.at<(nextByTarget.get(hit.target)??-Infinity)-1e-8)continue;
   const draw=rng.nextFloat(),passed=draw<=option.Probability;events.push({optionId:option.Id,at:hit.at,target:hit.target,draw,passed});if(!passed)continue;
   nextByTarget.set(hit.target,hit.at+(option.CoolTime||0));
   const preset=option.TargetEffectPreset[poolIndex++%option.TargetEffectPreset.length],effect=effects.get(preset);if(!effect)throw Error('Missing native on-hit passive effect '+preset);
   const target=targets[hit.target].slice(),anchor=option.TargetEffectAnchor||'Center';if(anchor==='Center')target[1]+=options.centerHeight??.375;else if(anchor!=='Position')throw Error('Unsupported native passive target anchor '+anchor);
   const pool=nativePoolEventTransform(effect,{nativePoolTransform:'direct',directed:false},forward),at=hit.at;
   module.tracks.push({effect,at:0,link:{delay:at,end:module.actor.end,anchor:'feet',graphPosition:target,graphDirection:[0,0,0],directed:false,graphFollow:false,fxEnd:at+(effect.dispose==='TimeLimit'?effect.poolTimeLimit??effect.duration:effect.duration),...(pool?{rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2]}:{})}});
  }
 }
 module.sourceTrace.onHitPassives={source:'native ARM64 0x69b7178/0x69b782c/0x69b8378/0x69b8604',events,stateBefore,stateAfter:rng.getState(),previewCollision:'preview target geometry, non-passive damage only'};
 module.random={...module.random,implementation:'UnityEngine.Random',stateAfter:rng.getState()};module.duration=Math.max(module.duration,...module.tracks.map(t=>t.link.fxEnd));
}

