import {effectLookup} from './effect-lookup.js';
import {buildSupportDashReturn} from './native-staged-motion.js';
import {expandNativeChargePlans} from './native-charge-actions.js';
import {buildJumpStompMotion,buildHammerLeapMotion} from './native-twohand-motion.js';
import {emitNativeWeaponArc} from './native-weapon-arc.js';
import {nativeManagerActionModules} from './native-manager-operations.js';
import {buildProjectedOrbit,buildSideVaultReturn,emitRadialDebris,nativePoolEventTransform} from './native-melee-operations.js';
import {sampleNativeRecoil} from './native-character-motion.js';
import {effectRotation} from './character-link.js';
import {buildNativeGrenadeAction} from './native-grenade-operations.js';
import {appendManagedBuffEffects} from './managed-buff-effects.js';
import {buildMeleeTimeline} from './melee-timeline.js';
import {targetPositions,aimDirection} from './targeting.js';
import {createHomingTrajectory} from './native-projectile.js';
import {sampleGraphPath} from './graph-action.js';
import {UnityRand,nativeScriptRandomInt} from './native-random.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k),length=v=>Math.hypot(...v);
const fourWay=v=>Math.abs(v[0])>=Math.abs(v[2])?[Math.sign(v[0])||1,0,0]:[0,0,Math.sign(v[2])||1];
const unit=v=>{const n=length(v);return n?v.map(x=>x/n):[1,0,0];};
const rotate=(v,degrees)=>{const r=degrees*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};

// Declarative scripts compiled by native_script_plans.py. No resource or
// character identifiers participate in dispatch here.
export function scriptActionModules(index,options,native,plans,style){
 plans=expandNativeChargePlans(plans,options,native);
 const effects=effectLookup(index.effects);
 const ids=new Set([...(native.heroOptionIds?.[options.heroAppearance||options.appearance]||native.heroOptionIds?.[options.profile.defaultSkin]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const myth=(native.heroClasses?.[options.heroAppearance||options.appearance]||native.heroClasses?.[options.profile.defaultSkin]||'').endsWith('_myth');
 const basics=(style.ManualBattleActions||[]).filter(n=>!/^Role|^GraphRole:|^GraphSupport:|^GraphTrigger:|^GraphMyth:/.test(n)),result=[];
 function build(plan,initial=options.actorPosition||[0,0,0],isBreak=false){
  const original=native.actions[plan.action];let a={...original},presets=fields(a.PresetInfo);
  const mythOptions=list(a.MythOptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(Boolean);
  if(mythOptions.length){presets={...presets,...fields(a.MythPresetInfo)};if(a.MythProjectileInfo)a.ProjectileInfo=a.MythProjectileInfo;}
  for(const override of mythOptions){if(plan.mythPresetSource!=='action')presets={...presets,...fields(override.PresetInfo)};a={...a,...override,Name:original.Name};}
  if(plan.resolvedParameters){a=plan.resolvedParameters.action;presets=plan.resolvedParameters.presets;}
  const optionParameters=plan.optionParameterSource==='active-non-special-option'?list(original.OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(o=>o&&!o.IsSpecial):plan.optionParameterSource==='active-ascent-option'?list(original.AscentOptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(Boolean):[];
  const mergeRows=(base,extra)=>[...new Map([...list(base),...list(extra)].map(r=>[r.Name,r])).values()];
  for(const option of optionParameters){const nested=ids.has(option.MythOptionId)?byId.get(option.MythOptionId):null;for(const value of [option,nested].filter(Boolean)){presets={...presets,...fields(value.PresetInfo)};a={...a,...value,Name:original.Name,AnimationInfo:mergeRows(a.AnimationInfo,value.AnimationInfo),EmotionInfo:mergeRows(a.EmotionInfo,value.EmotionInfo)};}}
  const buffEnhanced=!!plan.buffConditionField&&Object.hasOwn(options.buffScores||{},a[plan.buffConditionField]);
  const costumeId=native.costumes?.[options.appearance]?.id,allowed=e=>(!e.whenOptionParameters||optionParameters.length)&&(!e.unlessOptionParameters||!optionParameters.length)&&(e.whenCostumeId==null||e.whenCostumeId===costumeId)&&(e.unlessCostumeId==null||e.unlessCostumeId!==costumeId);
  const activePlan={...plan,moves:(plan.moves||[]).filter(allowed),breakMoves:(plan.breakMoves||[]).filter(allowed)};
  const aimed=aimDirection(options,options.direction,initial),forward=plan.sideDirection?[Math.sign(aimed[0])||(plan.sideDirectionVertical&&aimed[2]<0?-1:1),0,0]:aimed,targets=targetPositions(options,options.direction),target=targets[0],rng=new UnityRand(options.seed??12345);
  const direction4=fourWay(forward),facing=direction4[0]>0?'right':direction4[0]<0?'left':direction4[2]>0?'back':'front';
  if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
  if(plan.nativeGrenade)return buildNativeGrenadeAction({plan,a,presets,effects,options,native,initial,forward,target,isBreak,ids,byId});
  const end=plan.end,tracks=[],clips=[],path=[],spinePath=[],choices=[],projectileHits=[];
  function evaluate(value){
   if(!Array.isArray(value))return value??0;const [op,...args]=value;
   if(op==='field')return a[args[0]]??args[1]??0;if(op==='fieldIndex')return a[args[0]]?.[args[1]]??args[2]??0;if(op==='distance')return length(add(target,initial,-1));
   const x=args.map(evaluate);switch(op){case 'add':return x.reduce((a,b)=>a+b,0);case 'sub':return x[0]-x[1];case 'mul':return x.reduce((a,b)=>a*b,1);case 'div':return x[0]/x[1];case 'max':return Math.max(...x);case 'min':return Math.min(...x);default:throw Error('Unknown timeline expression '+op);}
  }
  let skinPath=[],directionPath=[],spineRotationPath=[];
  if(plan.nativeMotion){const rule=plan.nativeMotion,fn={supportDashReturn:buildSupportDashReturn,projectedOrbit:buildProjectedOrbit,sideVaultReturn:buildSideVaultReturn,jumpStomp:buildJumpStompMotion,hammerLeap:buildHammerLeapMotion}[rule.op];if(!fn)throw Error('Unsupported native motion '+rule.op);const motion=fn({rule,evaluate,initial,target,forward,end,options});path.push(...motion.path);spinePath.push(...motion.spinePath);directionPath=motion.directionPath||[];spineRotationPath=motion.spineRotationPath||[];}else if(plan.meleeTimeline){const timeline=buildMeleeTimeline({plan:activePlan,isBreak,evaluate,initial,target,forward,end});path.push(...timeline.path);spinePath.push(...timeline.spinePath);skinPath=timeline.skinPath;}else{
  let position=initial.slice();const moves=(plan.moves||[]).map(m=>({...m,at:evaluate(m.at),duration:evaluate(m.duration),speed:evaluate(m.speed)}));
  for(let frame=0;frame<=Math.ceil(end*60);frame++){
   const time=Math.min(end,frame/60);
   for(const m of moves){if(time<m.at)continue;if(!m.start){m.start=position.slice();
    if(m.op==='dash'){let distance=m.speed*m.duration/2;if(m.sign!==-1)distance=Math.min(distance,Math.max(0,length(add(target,m.start,-1))-.55));m.end=add(m.start,forward,distance*(m.sign||1));}
    else m.end=m.to==='origin'?initial.slice():add(add(target,forward,evaluate(m.offset)),[0,0,1],m.side||0);}
    const t=Math.max(0,Math.min(1,(time-m.at)/m.duration));position=add(m.start,add(m.end,m.start,-1),m.op==='dash'?t*(2-t):t);
   }
   path.push({time,position:position.slice()});let height=0;
   for(const j of plan.spine||[]){const u=(time-evaluate(j.at))/evaluate(j.duration);if(u>=0&&u<=1)height+=4*j.height*u*(1-u);}
   spinePath.push({time,position:[0,height,0]});
  }
  }
  if(plan.nativeRecoils?.length){const events=plan.nativeRecoils.map(e=>({...e,direction:forward.map(v=>v*(e.directionSign??1))})),last=Math.max(end,...events.map(e=>e.at+e.duration)),base=spinePath.slice(),times=new Set(spinePath.map(p=>p.time));for(let i=0;i<=Math.ceil(last*60);i++)times.add(Math.min(last,i/60));for(const e of events)for(const t of [e.at,e.at+e.duration/2,e.at+e.duration])times.add(t);spinePath.length=0;for(const time of [...times].sort((a,b)=>a-b)){const recoil=sampleNativeRecoil(time,events,forward);spinePath.push({time,position:add(sampleGraphPath(base,time),recoil.position),angle:recoil.angle});}if(last>end)path.push({time:last,position:sampleGraphPath(path,end)});}
  for(const c of ((isBreak?plan.breakClips:plan.clips)||[]).filter(allowed)){let key=options.exclusiveWeapon&&c.exclusiveKey?c.exclusiveKey:!options.exclusiveWeapon&&c.fallbackKey?c.fallbackKey:c.key,r=c.animation||c.animationField?{Animation:c.animation||a[c.animationField],Scale:c.speed??1}:list(c.track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(!r&&c.fallbackAnimationKey){key=c.fallbackAnimationKey;r=list(a.AnimationInfo).find(r=>r.Name===key);}if(!r)continue;
   const start=evaluate(c.at),track=c.track||'Base';for(const previous of clips)if(previous.track===track&&previous.end==null)previous.end=start;
   clips.push({name:r.Animation,start,speed:c.speed??r.Scale??1,loop:c.loop??!!r.Loop,nextAnimation:r.NextAnimation,track,...(c.end!=null?{end:evaluate(c.end)}:{}),...(c.targetDurationField?{targetDuration:a[c.targetDurationField]}:r.TargetDuration?{targetDuration:r.TargetDuration}:{}),...(c.continueTime?{timeOffset:start*(clips.at(-1)?.speed??1)}:{})});
  }
  if(plan.animationArrays)for(const [i,name]of list(a.AnimationKeys).entries())clips.push({name,start:list(a.AnimationTimings)[i]||0,end:list(a.AnimationRemoveTimes)[i]??end,speed:list(a.AnimationTimeScales)[i]??1,loop:!!list(a.AnimationLoops)[i],track:'Base'});
  const locate=(e,at)=>{let p=e.anchor==='origin'?initial.slice():e.anchor==='masterFeet'?[0,0,0]:e.anchor?.startsWith('target')?target.slice():sampleGraphPath(path,at);if(e.positionRule?.type==='targetOrDashEnd'){const rule=e.positionRule,owner=sampleGraphPath(path,at),distance=length(add(target,owner,-1)),dash=evaluate(rule.distance),offset=evaluate(rule.offset),gap=Math.max(0,distance-(options.boundsSize?.[0]??.55));if(distance>Math.min(gap,dash)+offset+evaluate(rule.radius)*rule.hittableScale)p=add(owner,forward,dash+offset);}if(e.maxDistance!=null){const owner=sampleGraphPath(path,at),delta=add(p,owner,-1);p=add(owner,unit(delta),Math.min(length(delta),evaluate(e.maxDistance)));}if(!['feet','targetGround','origin','masterFeet'].includes(e.anchor))p[1]+=.375;p[1]+=evaluate(e.heightByFacing?.[facing]??e.height);if(e.heightBoundsFactor!=null)p[1]+=evaluate(e.heightBoundsFactor)*(options.boundsSize?.[1]??.75)/2;if(e.sideOffset!=null)p=add(p,[forward[2],0,-forward[0]],evaluate(e.sideOffset));const worldOffset=forward[0]<0&&e.negativeOffsetVector||e.offsetVector;if(worldOffset){let offset=worldOffset.map(evaluate);if(e.rotateOffset)offset=rotate(offset,-Math.atan2(forward[2],forward[0])*180/Math.PI);p=add(p,offset);}return add(p,e.fourWay?fourWay(forward):forward,e.sideOffsetOnly&&Math.abs(forward[2])>Math.abs(forward[0])?0:evaluate(e.offsetByFacing?.[facing]??e.offset));};
  function addEffect(preset,at,e={},positionOverride){
   if(!preset&&e.optional)return null;const effect=effects.get(preset);if(!effect)throw Error('Missing timeline effect: '+preset+' in '+plan.action);
   const effectDirection=e.link?.graphDirection||(e.fourWay?fourWay(forward):forward),mirror=e.mirrorXZForNegative&&(effectDirection[0]<0||effectDirection[2]>0)?-1:1;
   let followPath=e.followSpine?path.map(p=>({time:p.time,position:add(p.position,sampleGraphPath(spinePath,p.time))})):path;
   if(e.followUntil!=null){const stop=evaluate(e.followUntil),last=sampleGraphPath(followPath,stop);followPath=[...followPath.filter(p=>p.time<stop),{time:stop,position:last}];}
   const position=positionOverride||add(locate(e,at),e.followSpine?sampleGraphPath(spinePath,at):[0,0,0]),track={effect,at:0,link:{delay:at,end,clips:[],anchor:e.anchor||'center',graphPosition:position,graphDirection:effectDirection,rootScaleX:e.mirrorXByFacing?.includes(facing)||e.mirrorXForNegative&&forward[0]<0?-1:mirror,rootScaleZ:mirror,graphPath:followPath,graphOwnerAtBirth:sampleGraphPath(followPath,at),graphFollow:!!e.follow,directed:e.directed!==false,screen:!!e.screen,bone:e.bone,boneByFacing:e.boneByFacing,directionBone:e.directionBone,boneOffset:e.boneOffset,fourWay:e.fourWay,skeletonSkin:e.skeletonSkin,skeletonAnimation:e.skeletonAnimation,uniformScale:e.uniformScale??1,scaleFactor:myth&&e.mythScale||e.scale||1,fxEnd:e.until!=null?evaluate(e.until):at+effect.duration,...e.link}};
   const pool=nativePoolEventTransform(effect,e,effectDirection);if(pool){track.link.graphPosition=add(position,pool.offset);if(track.link.motionPath)track.link.motionPath=track.link.motionPath.map(p=>({...p,position:add(p.position,pool.offset)}));track.link.rootScaleX*=pool.scale[0];track.link.rootScaleY=pool.scale[1];track.link.rootScaleZ*=pool.scale[2];track.link.rotationType=pool.rotationType;track.link.directed=pool.directed;}
   if(e.nativePoolLifetime&&e.until==null&&effect.dispose==='TimeLimit')track.link.fxEnd=at+(effect.poolTimeLimit??effect.duration);
   if(e.triggerDisposeAt!=null){const trigger=evaluate(e.triggerDisposeAt);track.link.fxEnd=effect.dispose==='TriggeredTimeLimit'?trigger+(effect.poolTimeLimit??effect.duration):effect.dispose==='TimeLimit'?at+(effect.poolTimeLimit??effect.duration):trigger;}
   const euler=forward[0]<0&&e.negativeEuler||e.euler;if(euler){track.link.eulerPath=[{time:0,position:euler}];track.link.eulerMask=[true,true,true];}
   if(e.spineEvent){const row=e.spineEvent.animationField?{Animation:a[e.spineEvent.animationField],Scale:1}:list(a.AnimationInfo).find(r=>r.Name===e.spineEvent.animationKey);if(!row?.Animation)throw Error('Missing source event animation '+(e.spineEvent.animationKey||e.spineEvent.animationField));track.link.spineEvent={animation:row.Animation,event:a[e.spineEvent.nameField],speed:row.Scale??1,rateChangeAt:e.spineEvent.rateChangeAt,speedAfter:e.spineEvent.speedAfter,repeat:e.spineEvent.repeat,occurrenceIndex:e.spineEvent.occurrenceIndex,index:e.spineEvent.index,targetDuration:e.spineEvent.targetDurationField?a[e.spineEvent.targetDurationField]:undefined,clipStart:at,relativeEnd:e.until==null};}
   tracks.push(track);return track;
  }
  function projectile(spec,at,start,direction,destination,{penetrate=spec?.PenetrateType==='All',homing=false,muzzle=true,muzzleAtOwner=false,muzzleOffset=0,nativePoolTransform}={}){
   if(!spec)throw Error('Missing timeline projectile in '+plan.action);
   const trajectory=createHomingTrajectory({position:start,direction,speed:spec.Speed,accel:spec.Accel||0,angularSpeed:homing?spec.HomingAngularSpeed||0:0,target:destination});
   const life=spec.Lifetime,path=[];let hit=false,stop=life,hitAt,hitPosition;
   for(let f=0;f<=Math.ceil(life*60);f++){
    const elapsed=Math.min(life,f/60),position=trajectory(elapsed);path.push({time:at+elapsed,position});
    if(!hit&&(!penetrate||plan.recordProjectileHits)&&length(add(position,destination,-1))<=(spec.HitBoxWidth||0)/2+.275){hit=true;hitAt=at+elapsed;hitPosition=position.slice();if(!penetrate){stop=elapsed;break;}}
   }
   const last=path.at(-1).position;
   if(muzzle&&spec.ShootEffectPreset)addEffect(spec.ShootEffectPreset,at,{link:{graphDirection:direction}},muzzleAtOwner?add(sampleGraphPath(path,0),[0,.375,0]):add(start,direction,muzzleOffset));
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(e=>e.PresetName)].filter(Boolean)){const fx=effects.get(preset),tail=plan.sourceProjectilePools&&fx?.dispose==='TriggeredTimeLimit'?(fx.poolTimeLimit??fx.duration):0;addEffect(preset,at,{nativePoolTransform,link:{motionPath:path,graphDirection:direction,...(plan.sourceProjectilePools?{triggeredDisposeAt:at+stop}:{}),fxEnd:at+stop+tail}},start);}
   if(hit&&spec.HitPreset)addEffect(spec.HitPreset,hitAt,{directed:false},hitPosition);
   if(!hit&&plan.projectileExpireUsesHit&&spec.HitPreset)addEffect(spec.HitPreset,at+stop,{directed:false},last);
   if(spec.ExpirePreset&&(!plan.sourceProjectilePools||!hit))addEffect(spec.ExpirePreset,at+stop,{directed:false},last);
   if(spec.Exploding&&spec.ExplosionPreset)addEffect(spec.ExplosionPreset,at+stop,{directed:false},last);
   return {at:hit?hitAt:at+stop,position:hit?hitPosition:last,death:at+stop,last,hit,path};
  }
  for(const [eventIndex,e] of (isBreak?plan.breakEvents:plan.events).entries()){
   if(e.exclusive&&!options.exclusiveWeapon||!allowed(e)||e.enhancedOnly&&!buffEnhanced)continue;const at=evaluate(e.at);
   if(e.op==='effect'){
    let key=(plan.buffConditionField?buffEnhanced:options.summoned)&&e.enhancedKey?e.enhancedKey:e.key;
    if(forward[0]<0){if(buffEnhanced&&e.negativeEnhancedKey)key=e.negativeEnhancedKey;else if(e.negativeKey)key=e.negativeKey;}
    if(e.directionKeys){const v=fourWay(forward),direction=v[0]>0?'right':v[0]<0?'left':v[2]>0?'back':'front';key=e.directionKeys[direction];}
    if(e.maxRange!=null&&length(add(target,initial,-1))>evaluate(e.maxRange))continue;
    if(e.choices?.length){
     // Consume the native draw even when previewing a specific branch, so later
     // random events keep their original stream and replay remains reproducible.
     const id=plan.action+':'+eventIndex,nativeKey=e.choices[nativeScriptRandomInt(rng,0,e.choices.length)],override=options.choiceOverrides?.[id];
     key=e.choices.includes(override)?override:nativeKey;
     choices.push({id,selected:key,nativeSelected:nativeKey,overridden:key===override,
      options:e.choices.map(key=>({key,preset:presets[key],assetName:effects.get(presets[key])?.assetName||presets[key]}))});
    }
    const eventPreset=e.preset||(e.projectileIndex!=null?native.projectiles[list(a.ProjectileInfo)[e.projectileIndex]?.Name]?.[e.projectileStage]:e.presetField?a[e.presetField]:presets[key]);
    addEffect(eventPreset,at,e);
   }else if(e.op==='weapon-arc'){emitNativeWeaponArc({event:e,a,index,effects,options,initial,forward,addEffect});
   }else if(e.op==='radial-debris'){emitRadialDebris({event:e,evaluate,initial,forward,path,addEffect,presets,rng});
   }else if(e.op==='line-burst'){
    const count=evaluate(e.count),width=evaluate(e.width),total=evaluate(e.length)-width;
    for(let i=0;i<count;i++)addEffect(presets[e.key],at+evaluate(e.delay)+evaluate(e.duration)*i/count,{anchor:'feet',offset:width/2+(count>1?total*i/(count-1):0)});
   }else if(e.op==='projectile'){
    const spec=native.projectiles[list(e.projectileField&&a[e.projectileField]||a.ProjectileInfo)[e.index||0]?.Name],origin=e.fromTarget?target.slice():sampleGraphPath(path,at);origin[1]+=.375+evaluate(e.height);if(e.followSpine)origin[1]+=sampleGraphPath(spinePath,at)[1];
    const start=add(add(origin,rotate(forward,e.originAngle||0),evaluate(e.offset)),rotate(forward,-90),evaluate(e.sideOffset)),dest=target.slice();if(!e.targetGround)dest[1]+=.375;
    const direction=e.directional?rotate(forward,evaluate(e.directionAngle??0)):unit(add(dest,start,-1)),shot=projectile(spec,at,start,direction,dest,{muzzle:e.muzzle!==false,muzzleAtOwner:e.muzzleAtOwner,homing:!!e.homing,muzzleOffset:evaluate(e.muzzleOffset),nativePoolTransform:e.nativePoolTransform});
    if(e.muzzleAtOwner){const t=tracks.findLast(t=>t.effect.preset===spec.ShootEffectPreset);if(t){t.link.graphPosition=origin;t.link.graphFollow=true;t.link.graphOwnerAtBirth=sampleGraphPath(path,at);}}
    if(plan.recordProjectileHits&&shot.hit)projectileHits.push({time:shot.at,target:0,position:shot.position});
    if(e.impact)addEffect(presets[e.impact],shot.at,{anchor:'feet',directed:false},[shot.position[0],0,shot.position[2]]);
    if(shot.hit&&e.hitKey)addEffect(presets[e.hitKey],shot.at,{directed:false},shot.position);
    if(e.ricochet){
     let lastShot=shot,previous=0;const maxHits=(options.exclusiveWeapon?Array.from(ids).map(id=>byId.get(id)?.[e.countField]).find(Boolean):0)||a[e.countField]||e.ricochet,range=spec.Speed*spec.Lifetime+.5*(spec.Accel||0)*spec.Lifetime**2;
     if(shot.hit)projectileHits.push({time:shot.at,target:previous});
     for(let hit=1;lastShot.hit&&hit<maxHits;hit++){
      // Native script excludes only the immediately hit entity; earlier targets
      // can be hit again. Candidate ordering is the preview's target ordering.
      const start=targets[previous].slice();start[1]=lastShot.position[1];
      const next=targets.findIndex((t,i)=>i!==previous&&Math.hypot(t[0]-start[0],t[2]-start[2])<=range);if(next<0)break;
      const dest=targets[next].slice();dest[1]=start[1];
      lastShot=projectile(spec,lastShot.at,start,unit(add(dest,start,-1)),dest,{muzzle:false});previous=next;
      if(lastShot.hit){projectileHits.push({time:lastShot.at,target:next});if(e.hitKey)addEffect(presets[e.hitKey],lastShot.at,{directed:false},lastShot.position);}
     }
    }

   }else if(e.op==='projectile-return'){
    const specs=list(a.ProjectileInfo).map(p=>native.projectiles[p.Name]),start=locate({offset:e.offset},at),dest=add(target,[0,.375,0]),out=projectile(specs[0],at,start,forward,dest,{penetrate:true});
    const back=projectile(specs[1],out.at,out.position,[forward[2],0,-forward[0]],start,{penetrate:true,homing:true,muzzle:false});
    if(specs[1].HitPreset)addEffect(specs[1].HitPreset,back.at,{directed:false},back.position);
   }else if(e.op==='target-line'){
    const start=locate({...e,anchor:'center'},at),destination=target.slice(),delta=add(destination,start,-1),duration=length(delta)/evaluate(e.speed),motion=Array.from({length:Math.ceil(duration*60)+1},(_,i)=>{const elapsed=Math.min(duration,i/60);return {time:at+elapsed,position:add(start,delta,duration?elapsed/duration:1)};});
    for(const key of e.keys)addEffect(presets[key],at,{directed:true,nativePoolLifetime:true,nativePoolTransform:'directional',triggerDisposeAt:at+duration,link:{motionPath:motion,graphDirection:unit(delta)}},start);
    if(e.impact)addEffect(presets[e.impact],at+duration,{anchor:'targetGround',height:e.impactHeight||0,directed:false,nativePoolLifetime:true,nativePoolTransform:'direct'},add(destination,[0,e.impactHeight||0,0]));
   }else if(e.op==='moving-effect'){
    const start=locate(e,at),motion=[];
    for(let i=0;i<=Math.ceil(e.arrival*60);i++){const t=i/60,u=Math.max(0,Math.min(1,(t-e.launch)/(e.arrival-e.launch)));motion.push({time:t,position:add(start,add(target,start,-1),e.ease==='cubic'?u*u*u:u)});}
    addEffect(presets[e.key],at,{...e,link:{motionPath:motion,fxEnd:e.arrival,growUntil:e.growUntil}});
   }else throw Error('Unknown timeline operation '+e.op);
  }
  const buffState=appendManagedBuffEffects({plan,action:a,options,ids,path,spinePath,target,addEffect});
  return {buffState,summon:!!plan.summon,summonOffset:plan.summonOffset,summonDuration:plan.summonDuration,autonomous:!!plan.autonomous,passiveEvents:plan.passiveEvents,targetRange:plan.targetRange,masterRange:plan.masterRange,projectileHits,random:{implementation:'Utils.GetRandomInt / UnityEngine.Random',stateBefore,stateAfter:rng.getState(),choices},actor:{end,clips,graphPath:path,spinePath,...(plan.nativeAim?{nativeAim:{...plan.nativeAim,direction:forward,windows:(plan.nativeAim.windows||[{at:0,end}]).map(w=>({at:evaluate(w.at),end:evaluate(w.end)}))}}:{}),skinPath,directionPath,spineRotationPath,alpha:plan.alpha,buffIdlePath:buffState?.idleAnimation?[{at:0,end:buffState.activeUntil,name:buffState.idleAnimation}]:[]},tracks,duration:Math.max(end,plan.independentFieldEnd||0,...tracks.map(t=>t.link.fxEnd)),source:plan.source};
 }
 const basicPlans=[];
 for(const plan of plans){
  if(plan.behavior!=='timeline'||plan.exclusive&&!options.exclusiveWeapon||plan.mythOnly&&!myth)continue;
  let id=plan.id;
  if(plan.category==='basic'){const i=basics.indexOf(plan.action);if(i<0)continue;id=plan.variantId||'basic-'+(i+1);if(!plan.disableCombo)basicPlans.push(plan);}
  else if(plan.category==='role'&&!(style.ManualBattleActions||[]).includes(plan.action)&&!Array.from(ids).some(id=>byId.get(id)?.BattleActionName===plan.action))continue;
  const module={id,label:plan.label,chargeState:plan.chargeState,nativeCondition:plan.nativeCondition,...build(plan)};result.push(module);
  if(plan.category==='basic'&&plan.staminaCost){
   result.push({id:'basic-break',label:'普攻末发',...build(plan,options.actorPosition||[0,0,0],true)});
   const count=Math.ceil((native.battleDefaults?.maxStamina||200)/plan.staminaCost),tracks=[],clips=[],path=[],spinePath=[],skinPath=[];let time=0,pos=(options.actorPosition||[0,0,0]).slice();
   for(let shot=0;shot<count;shot++){const m=build(plan,pos,shot===count-1);tracks.push(...m.tracks.map(t=>({...t,at:time+(t.at||0)})));clips.push(...m.actor.clips.map(c=>({...c,start:c.start+time,end:(c.end??m.actor.end)+time})));path.push(...m.actor.graphPath.map(p=>({...p,time:p.time+time})));spinePath.push(...m.actor.spinePath.map(p=>({...p,time:p.time+time})));skinPath.push(...(m.actor.skinPath||[]).map(s=>({...s,at:s.at+time,end:s.end+time})));pos=sampleGraphPath(m.actor.graphPath,m.actor.end);time+=m.actor.end;}
   result.push({id:'basic-magazine',label:'全弹夹连贯攻击',actor:{end:time,clips,graphPath:path,spinePath,skinPath},tracks,duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd)),magazine:{count,cost:plan.staminaCost}});
  }
  if(plan.category==='basic'&&plan.continuous){
   result.push({...module,id:'basic-continuous',label:'连续普攻',continuous:{period:plan.end},duration:plan.end,
    actor:{...module.actor,clips:module.actor.clips.map(c=>({...c,end:Infinity,loop:true}))}});
  }
 }
 if(basicPlans.length>1){
  let time=0,pos=(options.actorPosition||[0,0,0]).slice();const tracks=[],clips=[],path=[],spinePath=[],aims=[];
  for(const name of basics){const plan=basicPlans.find(p=>p.action===name);if(!plan)continue;const m=build(plan,pos);if(m.actor.nativeAim)aims.push({...m.actor.nativeAim,windows:m.actor.nativeAim.windows.map(w=>({...w,at:w.at+time,end:w.end+time}))});
   tracks.push(...m.tracks.map(t=>({...t,at:time+(t.at||0)})));clips.push(...m.actor.clips.map(c=>({...c,start:c.start+time,end:(c.end??m.actor.end)+time})));
   path.push(...m.actor.graphPath.map(p=>({...p,time:p.time+time})));spinePath.push(...m.actor.spinePath.map(p=>({...p,time:p.time+time})));
   pos=sampleGraphPath(m.actor.graphPath,m.actor.end);time+=m.actor.end;
  }
  result.push({id:'basic-combo',label:'普攻连贯',actor:{end:time,clips,graphPath:path,spinePath,...(aims.length?{nativeAim:{...aims[0],windows:aims.flatMap(a=>a.windows)}}:{})},tracks,duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd))});
 }
 result.unshift(...nativeManagerActionModules(index,options,native,plans,style));
 if(!options.managedVariant)for(const branch of style.managedBranches||[]){
  if(branch.active)continue;
  const extraStyle={...style,ManualBattleActions:branch.extra.slice(),managedBranches:[]};
  const variants=scriptActionModules(index,{...options,managedVariant:true,buffScores:{...options.buffScores,[branch.buff]:branch.threshold}},native,plans,extraStyle);
  for(const m of variants){
   const basic=/^basic-\d+$/.test(m.id),enhanced=['support','cwp'].includes(m.id)&&plans.some(p=>p.id===m.id&&p.buffConditionField&&native.actions[p.action]?.[p.buffConditionField]===branch.buff);
   if(basic||enhanced)result.push({...m,id:basic?'basic-extra-'+m.id.slice(6):m.id+'-enhanced',label:basic?'强化普攻':'强化'+m.label,nativeCondition:{buff:branch.buff,minimumScore:branch.threshold}});
  }
 }
 const numbered=result.filter(m=>/^basic-\d+$/.test(m.id)).sort((a,b)=>Number(a.id.slice(6))-Number(b.id.slice(6)));let basicIndex=0;
 return result.map(m=>/^basic-\d+$/.test(m.id)?numbered[basicIndex++]:m);
}
