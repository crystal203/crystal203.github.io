import {sourceHero} from './weapon-hero-variants.js';
// Expand source fan contracts to the established generic timeline renderer.
import {scriptActionModules} from './script-actions.js';
import {aimDirection,targetPositions,facingVectors} from './targeting.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const rotate=(v,d)=>{const r=d*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
const rows=v=>Object.fromEntries(list(v).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));

export function fanActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-fan-actions'&&(!p.exclusive||options.exclusiveWeapon));if(!selected.length)return [];
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const initial=(options.actorPosition||[0,0,0]).slice(),center=add(initial,[0,.375,0]),forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),radius=(options.targetBoundsSize?.[0]??.55)/2;
 const effects=new Map(index.effects.filter(e=>!e.unavailable).map(e=>[e.preset,e])),compiled=[],traces=new Map();
 for(const plan of selected){
  const a=native.actions[plan.action],r=plan.nativeFan,option=ids.has(a.OptionId)&&byId.get(a.OptionId),presets={...rows(a.PresetInfo),...rows(option?.PresetInfo)},end=a.ActionDuration??a.Duration;
  const events=[],clips=[],trace={action:plan.action,kind:r.kind,sourceSha256:plan.sourceSha256,shots:[],hits:[],partyMembers:[{kind:'owner',position:initial.slice()}],moves:[],staminaConsumer:false};
  const p={...plan,behavior:'timeline',end,clips,events,moves:[],nativeRecoils:[],disableCombo:false};delete p.nativeFan;
  const effect=(preset,at,position,{directed=false,disposeAt=null,immediate=false,scale=1,...link}={})=>{
   if(!preset)throw Error('Missing source fan preset for '+plan.action);
   const e=effects.get(preset);if(!e)throw Error('Missing source fan effect '+preset);
   const life=e.poolTimeLimit??e.duration,fxEnd=disposeAt==null?at+life:immediate?disposeAt:e.dispose==='TriggeredTimeLimit'?disposeAt+life:e.dispose==='TimeLimit'?at+life:disposeAt;
   events.push({op:'effect',preset,at,anchor:'feet',offsetVector:add(position,initial,-1),directed,nativePoolTransform:directed?'directional':'direct',nativePoolLifetime:true,uniformScale:scale,
    link:{graphPosition:position.slice(),fxEnd,...(disposeAt!=null?{triggeredDisposeAt:disposeAt}:{}),...link}});
   return events.at(-1);
  };
  const passive=(target,at)=>{if(option&&presets[r.passiveHitKey]){effect(presets[r.passiveHitKey],at,add(target,[0,.375,0]));trace.hits.push({at,position:target.slice(),passive:true,optionId:a.OptionId});}};
  const sampleTimes=last=>{const times=new Set([0,last]);for(let i=0;i<=Math.ceil(last*60);i++)times.add(Math.min(last,i/60));return [...times].sort((a,b)=>a-b);};
  if(r.kind==='wave'||r.kind==='party-heal-projectile'){
   const role=r.kind==='party-heal-projectile',info=list(!role&&option?.ProjectileInfo||a.ProjectileInfo)[0],spec=native.projectiles[info.Name],at=role?0:a.HitTiming;
   // Lowest-HP API excludes self and full HP. This preview has only owner and
   // hostile targets, so its nil fallback uses the actor's four-way look.
   const direction=role?(facingVectors[options.direction]||forward):forward,start=add(center,direction,info.Offset??0),death=at+spec.Lifetime;
   const motion=sampleTimes(spec.Lifetime).map(t=>({time:at+t,position:add(start,direction,spec.Speed*t+(spec.Accel||0)*t*t/2)})),growth=Math.max(0,(spec[r.projectileGrowth.parameter]?.[r.projectileGrowth.index]??1)-1),scales=motion.map(pt=>{const scale=1+Math.max(0,Math.min(1,(pt.time-at)/spec.Lifetime))*growth;return {time:pt.time,position:[scale,scale,scale]};});
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(r=>r.PresetName)].filter(Boolean))effect(preset,at,start,{directed:true,disposeAt:death,motionPath:motion,graphDirection:direction,uniformScalePath:scales});
   if(!role){
    effect(spec.ShootEffectPreset,at,add(center,direction,r.muzzleOffset));
    if(info.ShootEffectType==='EachShoot')effect(spec.ShootEffectPreset,at,start,{directed:true});
    for(const target of targets){const delta=add(target,start,-1),along=delta[0]*direction[0]+delta[2]*direction[2],side=Math.abs(delta[0]*direction[2]-delta[2]*direction[0]),maxWidth=spec.HitBoxWidth/2*(1+growth);if(along<0||side>radius+maxWidth||along>spec.Speed*spec.Lifetime+radius+maxWidth)continue;
     const hit=at+Math.ceil(Math.max(0,along-radius-spec.HitBoxWidth/2)/(spec.Speed+spec.HitBoxWidth/2*growth/spec.Lifetime)*60-1e-9)/60;trace.hits.push({at:hit,position:target.slice(),projectile:spec.Name});passive(target,hit);
    }
   }
   trace.shots.push({at,death,start,direction,projectile:spec.Name,penetrate:spec.PenetrateType,allyHitType:spec.AllyHitType,enemyHitType:spec.EnemyHitType,growth:{from:1,to:1+growth,path:scales,source:r.projectileGrowth},...(role?{target:null,targetSelection:r.targetSelection}:{} )});
   if(role)trace.roleContract={role:a.Role,coolTime:a.CoolTime,useCount:a.UseCount,healMultiplier:a.HealMultiplier,selfMultiplier:a.SelfMultiplier,cureDebuffs:true};
   clips.push({key:r.animationKey,at:0,end,track:r.track});p.nativeRecoils.push({at:0,distance:r.recoil[0],height:r.recoil[1],duration:role?r.recoilDefaultDuration:a.HitTiming,angle:8});
  }else if(r.kind==='expanding-box'){
   clips.push({key:r.animationKey,at:0,end,track:r.track});p.nativeRecoils.push({at:0,distance:r.recoil[0],height:r.recoil[1],duration:a.HitTiming,angle:8});
   effect(presets[r.fieldKey],a.HitTiming,center,{directed:true});
   for(const target of targets){const d=add(target,initial,-1),along=d[0]*forward[0]+d[2]*forward[2],side=Math.abs(d[0]*forward[2]-d[2]*forward[0]);if(along<0||along>a.Length+radius||side>a.Width/2+radius)continue;
    const first=a.HitTiming+Math.ceil(Math.max(0,along-radius)/a.Length*r.boxExpand*60-1e-9)/60;let nextPassive=-Infinity;
    for(let i=0;i<r.boxMaxHits;i++){const at=first+i*r.boxHitTerm;if(at>end)continue;trace.hits.push({at,position:target.slice(),box:true});if(option&&at>nextPassive){passive(target,at);nextPassive=at+option.CoolTime;}}
   }
  }else if(r.kind==='eased-three-return'){
   clips.push({key:options.exclusiveWeapon?r.animationKey:r.fallbackKey,at:0,end},{key:r.emotionKey,at:0,end,track:'Emotion'});
   effect(presets[r.castKey],0,center);effect(presets[r.screenKey],0,initial,{screen:true});
   const distance=a.InclusionRadius-r.maxRadius,span=Math.hypot(...add(rotate([0,0,1],a.Angle*.5),[0,0,1],-1))*distance,offset=r.maxRadius/span*a.Angle*.5,cycle=(a.BoomerangLifeTime-a.CastTime)/2,returnAt=cycle+a.CastTime,disposeAt=(Math.floor(a.BoomerangLifeTime*60+1e-9)+1)/60;
   trace.boomerangs=[];trace.collisions=[];
   for(const angle of [0,a.Angle*.5-offset,-a.Angle*.5+offset]){
    const dir=rotate(forward,angle),destination=add(center,dir,distance),motion=[],scales=[],times=new Set([a.CastTime,returnAt,a.BoomerangLifeTime,disposeAt]);for(let i=0;i<=Math.ceil(disposeAt*60);i++)if(i/60>=a.CastTime)times.add(i/60);
    for(const time of [...times].sort((a,b)=>a-b)){const returning=time>returnAt,t=Math.max(0,Math.min(1,(time-(returning?returnAt:a.CastTime))/cycle)),progress=returning?t*t*t:1-(1-t)**3,pos=returning?add(destination,add(center,destination,-1),progress):add(center,add(destination,center,-1),progress),scale=returning?r.maxRadius+(r.minRadius-r.maxRadius)*progress:r.minRadius+(r.maxRadius-r.minRadius)*progress;motion.push({time,position:pos});scales.push({time,position:[scale,scale,scale]});}
    effect(presets[r.bodyKey],a.CastTime,center,{disposeAt,immediate:true,motionPath:motion,uniformScalePath:scales});effect(presets[r.trailKey],a.CastTime,center,{disposeAt,motionPath:motion});trace.boomerangs.push({angle,destination,motion,scales,disposeAt});
   }
   effect(presets[r.endKey],disposeAt,center);trace.independentTail=true;trace.returnAt=returnAt;trace.disposedAt=disposeAt;
   // The source resets collision ownership once at return, with at most one
   // damage per phase. Preserve the annular pie hole rather than testing each
   // visual fan separately, which would triple damage on the center fan.
   for(const [index,target]of targets.entries()){
    const delta=add(target,initial,-1),distance=Math.hypot(delta[0],delta[2]),cos=distance?(delta[0]*forward[0]+delta[2]*forward[2])/distance:1,cast=distance<=a.CastRadius+radius;
    if(cast)trace.collisions.push({target:index,at:a.CastTime,phase:'cast',scale:a.DamageScale});if(cos<Math.cos(a.Angle*.5*Math.PI/180)&&distance>radius)continue;
    for(const returning of [false,true])for(let frame=Math.floor((returning?returnAt:a.CastTime)*60)+1;frame/60<=a.BoomerangLifeTime+1e-9;frame++){
     const time=frame/60;if(!returning&&time>=returnAt)break;const t=(time-(returning?returnAt:a.CastTime))/cycle,progress=returning?t*t*t:1-(1-t)**3,coverage=returning?1-progress:progress,outer=coverage*a.InclusionRadius,hole=returning?(coverage>.25||time+1/60<a.BoomerangLifeTime?coverage*a.ExclusionRadius:0):(progress<.25||time-a.CastTime<1/60?0:progress*a.ExclusionRadius);
     if(distance-radius<=outer&&distance+radius>=hole){if(returning||!cast)trace.collisions.push({target:index,at:time,phase:returning?'return':'out',scale:returning?1-a.DamageScale:a.DamageScale});break;}
    }
   }
  }else if(r.kind==='party-heal-support'){
   p.animationArrays=true;
   for(const [i,preset]of a.EffectPresetNames.entries())effect(preset,a.EffectCreateTimings[i],initial,{graphFollow:!!a.EffectFollowingTargets[i]});
   trace.heals=a.HealTimings.map((at,i)=>({at,multiplier:a.HealModifiers[i],target:'real party members including owner'}));trace.buff={at:a.BuffTiming,name:a.BuffName,target:a.BuffTarget};
  }else throw Error('Unsupported source fan operation '+r.kind);
  trace.triggerPassives=Array.from(ids).map(id=>byId.get(id)).filter(o=>o?.Class==='OnTriggerBattleActionPassive'&&o.BattleActionName===a.Name).map(o=>({at:0,optionId:o.Id,targetType:o.TargetType,healCalcType:o.HealCalcType,healRatio:o.HealRatio,visiblePreset:null}));
  traces.set(plan.action,trace);compiled.push(p);
 }
 const modules=scriptActionModules(index,options,native,compiled,style);
 for(const m of modules){if(m.id==='basic-combo')m.sourceTrace={actions:compiled.filter(p=>p.category==='basic').map(p=>traces.get(p.action)),staminaConsumer:false};else{const plan=compiled.find(p=>p.category==='basic'?'basic-'+((style.ManualBattleActions||[]).filter(n=>n.startsWith('Manual')).indexOf(p.action)+1)===m.id:p.id===m.id);m.sourceTrace=traces.get(plan?.action);}}
 return modules;
}
