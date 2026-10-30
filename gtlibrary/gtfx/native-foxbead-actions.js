import {effectLookup} from './effect-lookup.js';
import {sourceHero} from './weapon-hero-variants.js';
// Structural Lua/native recipes; no Hero dispatch. Flat-floor collision uses
// fixed 60 Hz stepping and the native homing implementation.
import {aimDirection,targetPositions} from './targeting.js';
import {stepHomingProjectile} from './native-projectile.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
import {UnityRand} from './native-random.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),len=v=>Math.hypot(...v);
const norm=v=>{const n=len(v);return n?v.map(x=>x/n):[0,0,0];};
const rotate=(v,degrees)=>{const r=degrees*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const fixedPath=(position,end)=>[{time:0,position:position.slice()},{time:end,position:position.slice()}];

export function foxBeadActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-alternating-homing'&&(style.ManualBattleActions||[]).includes(p.action)||p.behavior==='source-radial-spirit-queue'&&options.exclusiveWeapon||p.behavior==='source-party-support-arrays');
 if(!selected.length)return [];
 const effects=effectLookup(index.effects);
 const initial=(options.actorPosition||[0,0,0]).slice(),height=options.centerHeight??.375,center=add(initial,[0,height,0]);
 const forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),targetRadius=(options.targetBoundsSize?.[0]??.55)/2;
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin);
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 function builder(plan,end){
  const tracks=[],clips=[],trace={action:plan.action,sourceSha256:plan.sourceSha256,simulationFps:plan.nativeShot.simulationFps,shots:[],impacts:[]},path=fixedPath(initial,end);
  function effect(preset,at,position,{directed=false,direction=forward,disposeAt=null,motionPath=null,quaternionIdentity=false,...extra}={}){
   if(!preset)return null;
   const e=effects.get(preset);if(!e)throw Error('Missing source recipe effect '+preset+' for '+plan.action);
   const pool=nativePoolEventTransform(e,{nativePoolTransform:directed?'directional':'direct',directed},direction);
   const offset=pool.offset,birth=add(position,offset),life=e.poolTimeLimit??e.duration;
   const fxEnd=disposeAt==null?at+life:e.dispose==='TriggeredTimeLimit'?disposeAt+life:e.dispose==='TimeLimit'?at+life:disposeAt;
   const link={delay:at,end,clips:[],anchor:'feet',graphPosition:birth,graphDirection:direction,graphPath:path,graphOwnerAtBirth:initial.slice(),directed:pool.directed,fxEnd,
    rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2],rotationType:pool.rotationType,...extra};
   // C# BasicSupport directly instantiates quaternion identity and explicitly
   // assigns EffectScale; Lua Instantiate(nil) retains the pool's Rotation.
   if(quaternionIdentity)Object.assign(link,{rootScaleX:1,rootScaleY:1,rootScaleZ:1,eulerPath:[{time:at,position:[0,0,0]}],eulerMask:[true,true,true]});
   if(motionPath){link.motionPath=motionPath.map(p=>({...p,position:add(p.position,offset)}));if(pool.directed&&motionPath.every(p=>p.direction))link.directionPath=motionPath.map(p=>({time:p.time,position:p.direction.slice()}));}
   if(disposeAt!=null)link.triggeredDisposeAt=disposeAt;
   const track={effect:e,at:0,link};tracks.push(track);return track;
  }
  function animation(a,key,at,until=end,track='Base'){
   const row=list(track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(!row)return;
   clips.push({name:row.Animation,start:at,end:until,track,speed:row.Scale??1,loop:!!row.Loop,...(row.TargetDuration?{targetDuration:row.TargetDuration}:{})});
  }
  function projectile(a,index,at,origin,direction,{target=null,explodeOnTimeout=false}={}){
   const info=list(a.ProjectileInfo)[index],spec=native.projectiles[info?.Name];if(!spec)throw Error('Missing source projectile '+info?.Name);
   const start=add(origin,direction,info.Offset??0),motion=[{time:at,position:start.slice(),direction:direction.slice()}];
   let state={position:start.slice(),direction:direction.slice(),speed:spec.Speed},elapsed=0,hit=false,hitTarget=null;
   const targetCenter=target&&add(target,[0,height,0]);
   while(elapsed<spec.Lifetime-1e-9){
    const dt=Math.min(1/plan.nativeShot.simulationFps,spec.Lifetime-elapsed),previous=state.position;
    state=stepHomingProjectile(state,dt,{accel:spec.Accel||0,angularSpeed:target?spec.HomingAngularSpeed||0:0,target:targetCenter});elapsed+=dt;
    motion.push({time:at+elapsed,position:state.position.slice(),direction:state.direction.slice()});
    // Swept segment/cylinder overlap avoids missing a target between frames.
    for(const candidate of targets){const c=add(candidate,[0,height,0]),delta=add(state.position,previous,-1),relative=add(c,previous,-1),den=delta[0]**2+delta[2]**2,u=den?Math.max(0,Math.min(1,(delta[0]*relative[0]+delta[2]*relative[2])/den)):0,nearest=add(previous,delta,u);
     if(Math.hypot(nearest[0]-c[0],nearest[2]-c[2])<=targetRadius+spec.HitBoxWidth/2&&Math.abs(nearest[1]-c[1])<=(spec.HitBoxHeight??spec.HitBoxWidth)/2+height){hit=true;hitTarget=candidate;break;}}
    if(hit)break;
   }
   const death=at+elapsed,last=state.position.slice();
   effect(spec.ShootEffectPreset,at,start,{directed:true,direction});
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(r=>r.PresetName)].filter(Boolean))effect(preset,at,start,{directed:true,direction,motionPath:motion,disposeAt:death});
   if(hit||explodeOnTimeout)effect(spec.ExplosionPreset,death,last);
   if(hit)effect(spec.HitPreset,death,last);
   const shot={at,death,hit,hitTarget,start,last,projectile:spec.Name,direction:direction.slice(),target:target?.slice()||null};trace.shots.push(shot);if(hit||explodeOnTimeout)trace.impacts.push({at:death,position:last.slice(),projectile:spec.Name});return shot;
  }
  return {tracks,clips,trace,path,effect,animation,projectile,finish(extra={}){return {actor:{end,clips,graphPath:path,...extra.actor},tracks,duration:Math.max(end,...tracks.map(t=>t.link.fxEnd)),source:plan.source,sourceTrace:trace,...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='actor'))};}};
 }
 function alternating(plan,count,breakOnly=false,recover=false){
  const a=native.actions[plan.action],r=plan.nativeShot,attackEnd=count*a.ActionDuration,capacity=native.battleDefaults.maxStamina,recoveryStart=Math.max(attackEnd,(count-1)*a.ActionDuration+r.staminaRecovery.delay),end=recover?recoveryStart+capacity/r.staminaRecovery.perSecond:attackEnd,b=builder(plan,end),rng=new UnityRand(options.seed??12345),recoils=[];
  if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
  const option=ids.has(a.OptionId)&&byId.get(a.OptionId),probability=option?.[r.probabilityField];
  let stamina=breakOnly?Math.fround(a.StaminaPerAction):capacity,flag=true;
  b.trace.consumption=[];
  for(let round=0;round<count;round++){
   const at=round*a.ActionDuration,isBreak=stamina<=Math.fround(a.StaminaPerAction),draw=!isBreak&&probability!=null?rng.nextFloat():null,enhanced=isBreak||draw!=null&&draw<=probability,label=enhanced?1:0;
   const p=native.projectiles[a.ProjectileInfo[label].Name],target=targets.find(t=>Math.hypot(t[0]-initial[0],t[2]-initial[2])<=a.SearchRange),targetPos=target||add(initial,forward);
   const dist=Math.max(Math.hypot(targetPos[0]-initial[0],targetPos[2]-initial[2])-Math.cos(r.spin*Math.PI/180)*r.shoot_offset+r.back_offset,0);
   const duration=p.Accel?(Math.sqrt(p.Speed**2+2*p.Accel*dist)-p.Speed)/p.Accel:dist/p.Speed,angle=Math.min(Math.min(duration,p.Lifetime)*p.HomingAngularSpeed/2,r.spin);
   b.animation(a,r.animationKey,at,at+a.ActionDuration);
   for(let column=0;column<(isBreak?2:1);column++){
    const shootDirection=rotate(forward,flag?angle:-angle);flag=!flag;
    const origin=target?center:add(center,shootDirection,r.emptyOriginOffset),direction=target?shootDirection:forward;
    const shot=b.projectile(a,label,at,origin,direction,{target});Object.assign(shot,{round:round+1,column,isBreak,enhanced,angle,random:draw});
   }
   const before=stamina;stamina=Math.max(0,Math.fround(stamina-Math.fround(a.StaminaPerAction)));
   b.trace.consumption.push({at,round:round+1,before,cost:Math.fround(a.StaminaPerAction),after:stamina,isBreak,enhanced,columns:isBreak?2:1});
   if(enhanced)recoils.push({at,distance:.1,height:.1,duration:a.ActionDuration,angle:8});
  }
  b.trace.stamina={capacity,cost:a.StaminaPerAction,remaining:stamina,allowRecoveryDuringAction:false,recovery:r.recovery};
  if(count>1)b.trace.stamina.reload={...r.staminaRecovery,breakAt:(count-1)*a.ActionDuration,actionEnd:attackEnd,recoveryStart,fullAt:recoveryStart+capacity/r.staminaRecovery.perSecond,animation:null};
  if(recover)b.trace.stamina.recoveryPath=[{time:attackEnd,value:0},{time:recoveryStart,value:0},{time:end,value:capacity}];
  return b.finish({actor:{spinePath:buildNativeRecoilPath(recoils,forward,end)},random:{implementation:'UnityEngine.Random',stateBefore,stateAfter:rng.getState()},...(count>1?{magazine:{count,capacity,cost:a.StaminaPerAction,period:a.ActionDuration,source:'LuaDiscreteStaminaAction.UseStamina; no WeaponSpec capacity'}}:{})});
 }
 function radialQueue(plan){
  const a=native.actions[plan.action],r=plan.nativeShot,b=builder(plan,a.ActionDuration),presets=fields(a.PresetInfo),origin=add(initial,[0,r.originHeight,0]),spirit=native.projectiles[a.ProjectileInfo[r.spiritIndex].Name];
  b.animation(a,r.animationKey,0);b.effect(presets[r.castKey],0,center,{graphFollow:true});b.effect(presets[r.screenKey],0,initial,{screen:true});
  const spirits=Array.from({length:a.Columns},(_,i)=>({index:i,position:add(origin,rotate(forward.map(v=>-v),i*360/a.Columns),a.Offset)})),queue=spirits.slice();
  const frame=1/r.simulationFps,unfold=Math.ceil(a.SpiritTiming/frame-1e-9)*frame;
  let elapsed=unfold,clock=0,nextShot=1;
  b.trace.spirits=[];
  for(const obj of queue)obj.path=[{time:0,position:origin.slice()},{time:unfold,position:obj.position.slice()}];
  while(queue.length){
   elapsed+=frame;clock+=frame;
   // Native checks every remaining spirit in reverse before advancing queue.
   for(let i=queue.length-1;i>=0;i--){const obj=queue[i],target=targets.find(t=>Math.hypot(t[0]-obj.position[0],t[2]-obj.position[2])<=spirit.HitBoxWidth+targetRadius);
    if(target){b.effect(native.projectiles[a.ProjectileInfo[r.cannonIndex].Name].ExplosionPreset,elapsed,obj.position);b.trace.impacts.push({at:elapsed,position:obj.position.slice(),spiritContact:true});obj.death=elapsed;obj.contact=true;queue.splice(i,1);}}
   while(clock>=a.ShootTerm-1e-9&&queue.length){
    clock-=a.ShootTerm;const obj=queue.shift(),target=targets.find(t=>Math.hypot(t[0]-obj.position[0],t[2]-obj.position[2])<a.SearchRange+a.Offset),fallback=add(origin,forward,a.Offset*2),destination=target||fallback,direction=norm([destination[0]-obj.position[0],0,destination[2]-obj.position[2]]);
    b.projectile(a,r.cannonIndex,elapsed,obj.position,direction,{explodeOnTimeout:true});obj.death=elapsed;obj.order=nextShot++;obj.target=target?.slice()||null;
   }
   if(elapsed>unfold+(a.Columns+1)*a.ShootTerm+1)throw Error('Unbounded source spirit queue');
  }
  // Rebuild identities in authored angular order. Lifetime ends on explicit
  // Dispose(), independent of actor animation or projectile tail lifetime.
  for(const obj of spirits){
   const position=obj.position,death=obj.death,i=obj.index;
   b.effect(spirit.PresetName,0,origin,{motionPath:[{time:0,position:origin.slice()},{time:unfold,position},{time:death,position}],disposeAt:death});
   b.trace.spirits.push({index:i,position,spawn:0,unfold,disposeAt:death,rotation:'identity',contact:!!obj.contact,shootOrder:obj.order});
  }
  b.trace.independentTail=true;return b.finish();
 }
 function support(plan){
  const a=native.actions[plan.action],b=builder(plan,a.Duration);
  for(const [i,name]of list(a.AnimationKeys).entries())b.clips.push({name,start:list(a.AnimationTimings)[i]||0,end:a.Duration,speed:list(a.AnimationTimeScales)[i]??1,loop:!!list(a.AnimationLoops)[i],track:'Base'});
  b.clips.push({name:plan.nativeShot.emotion,start:0,end:a.Duration,speed:1,loop:true,track:'Emotion'});
  for(const [i,preset]of list(a.EffectPresetNames).entries()){
   const anchor=a.EffectAnchors[i],position=anchor==='Target'?add(targets[0],[0,height,0]):initial;
   b.effect(preset,a.EffectCreateTimings[i],position,{graphFollow:!!a.EffectFollowingTargets[i],quaternionIdentity:true});
  }
  b.trace.damage=list(a.DmgTimings).map(at=>({at,position:add(targets[0],[0,(options.ownerBoundsHeight??.75)/2,0]),radius:a.Radius}));
  b.trace.partyMembers=[{kind:'owner',position:initial.slice()}];b.trace.buff={at:a.BuffTiming,name:a.BuffName,target:a.BuffTarget};return b.finish();
 }
 const modules=[];
 for(const p of selected){
  if(p.behavior==='source-alternating-homing'){
   const a=native.actions[p.action],capacity=native.battleDefaults.maxStamina,count=Math.ceil(capacity/Math.fround(a.StaminaPerAction));
   modules.push({id:'basic-1',label:p.label,...alternating(p,1)},{id:'basic-last',label:'末发攻击',...alternating(p,1,true)},{id:'basic-magazine',label:'全耐力连贯攻击',...alternating(p,count)},{id:'basic-cycle',label:'连射与耐力恢复',...alternating(p,count,false,true)});
  }else modules.push({id:p.id,label:p.label,...(p.behavior==='source-radial-spirit-queue'?radialQueue(p):support(p))});
 }
 return modules;
}
