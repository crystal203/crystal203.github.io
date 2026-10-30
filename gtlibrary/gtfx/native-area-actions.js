import {effectLookup} from './effect-lookup.js';
// Source guarded Lua area state machines. Actor state and independent field
// lifetime have separate clocks; preview collision stepping is fixed at 60 Hz.
import {aimDirection,targetPositions} from './targeting.js';
import {sampleNativeRecoil} from './native-character-motion.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const constantPath=(position,end)=>[{time:0,position:position.slice()},{time:end,position:position.slice()}];
const mergeNamed=(base,extra)=>[...new Map([...list(base),...list(extra)].map(r=>[r.Name,r])).values()];

export function nativeAreaActionModules(index,options,native,plans,style){
 const chosen=plans.filter(p=>p.behavior==='source-persistent-area'&&(style.ManualBattleActions||[]).includes(p.action)||p.behavior==='source-accelerated-field'&&options.exclusiveWeapon);
 if(!chosen.length)return [];
 const effects=effectLookup(index.effects);
 const hero=options.heroAppearance||options.appearance||options.profile.defaultSkin;
 const ids=new Set([...(native.heroOptionIds?.[hero]||native.heroOptionIds?.[options.profile.defaultSkin]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),center=add(initial,[0,options.centerHeight??.375,0]);
 const targetRadius=(options.targetBoundsSize?.[0]??.55)/2,result=[];
 function context(plan){
  const original=native.actions[plan.action];let a={...original},presets=fields(original.PresetInfo),cwp;
  if(plan.behavior==='source-persistent-area'){
   // Manual parses the weapon option first, then only IsCwpOption myth rows
   // replace FX. Special/debuff myth parameters do not rewrite action fields.
   cwp=ids.has(original.CwpOptionId)?byId.get(original.CwpOptionId):null;
   if(cwp)presets={...presets,...fields(cwp.PresetInfo)};
   for(const id of list(original.MythOptionId)){
    const o=ids.has(id)&&byId.get(id);if(o?.IsCwpOption){presets={...presets,...fields(o.PresetInfo)};if(cwp)cwp={...cwp,...o};}
   }
  }else{
   const myth=list(original.MythOptionId).map(id=>ids.has(id)&&byId.get(id)).filter(Boolean);
   // parse_action_and_myth_param takes the action's Myth*Info. Its separate
   // apply_myth_option only changes the collision radius.
   if(myth.length){presets={...presets,...fields(original.MythPresetInfo)};a.AnimationInfo=mergeNamed(original.AnimationInfo,original.MythAnimationInfo);a.EmotionInfo=mergeNamed(original.EmotionInfo,original.MythEmotionInfo);for(const o of myth)if(o.DamageRadius!=null)a.DamageRadius=o.DamageRadius;}
  }
  return {a,presets,cwp};
 }
 function builder(plan,actorEnd){
  const tracks=[],clips=[],trace={action:plan.action,sourceSha256:plan.sourceSha256,simulationFps:plan.nativeArea.simulationFps,shots:[],hits:[],optionEvents:[]},path=constantPath(initial,actorEnd);
  function effect(preset,at,position,{directed=false,screen=false,disposeAt=null,motionPath=null,...extra}={}){
   if(!preset)throw Error('Missing source area preset in '+plan.action);
   const e=effects.get(preset);if(!e)throw Error('Missing source area effect '+preset);
   const pool=nativePoolEventTransform(e,{nativePoolTransform:directed?'directional':'direct',directed},forward),offset=pool?.offset||[0,0,0];
   const birth=add(position,offset),lifetime=e.poolTimeLimit??e.duration;
   // DisposeViaType(false): TimeLimit retains birth+TimeLimit; TriggeredTimeLimit
   // starts its timer without stopping emission. None is released immediately.
   const fxEnd=disposeAt==null?at+lifetime:e.dispose==='TriggeredTimeLimit'?disposeAt+lifetime:e.dispose==='TimeLimit'?at+lifetime:disposeAt;
   const link={delay:at,end:actorEnd,clips:[],anchor:'feet',graphPosition:birth,graphDirection:forward,graphPath:path,graphOwnerAtBirth:initial.slice(),directed:pool?.directed??directed,screen,fxEnd,...extra};
   if(pool)Object.assign(link,{rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2],rotationType:pool.rotationType});
   if(motionPath)link.motionPath=motionPath.map(p=>({...p,position:add(p.position,offset)}));
   if(disposeAt!=null)link.triggeredDisposeAt=disposeAt;
   const t={effect:e,at:0,link};tracks.push(t);return t;
  }
  function animation(a,key,at,end,track='Base'){
   const r=list(track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(!r)return;
   const clipEnd=Math.min(end,r.RemoveAfter!=null?at+r.RemoveAfter:Infinity);
   clips.push({name:r.Animation,start:at,end:clipEnd,track,speed:r.Scale??1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{}),...(r.NextAnimation?{nextAnimation:r.NextAnimation}:{})});
  }
  const finish=(extra={})=>({actor:{end:actorEnd,clips,graphPath:path,...extra.actor},tracks,duration:Math.max(actorEnd,...tracks.map(t=>t.link.fxEnd)),source:plan.source,sourceTrace:trace,...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='actor'))});
  return {tracks,clips,trace,path,effect,animation,finish};
 }
 function persistent(plan,count,breakOnly=false){
  const {a,presets,cwp}=context(plan),r=plan.nativeArea,period=a.ActionDuration,end=count*period,b=builder(plan,end),recoils=[],cooldowns=new Map();
  for(let shot=0;shot<count;shot++){
   const at=shot*period,isBreak=breakOnly||count>1&&shot===count-1,hit=at+a.HitTiming;
   b.animation(a,r.animationKey,at,at+period,r.animationTrack);b.animation(a,isBreak?r.breakEmotionKey:r.emotionKey,at,at+period,'Emotion');
   b.effect(presets[isBreak?r.breakFireKey:r.fireKey],at,add(center,forward,r.fireOffset),{directed:true});
   b.effect(presets[isBreak?r.breakProjectileKey:r.projectileKey],hit,center,{directed:true});
   const [distance,height,durationScale]=isBreak?r.recoilBreak:r.recoilNormal;
   recoils.push({at:hit,distance,height,duration:period*durationScale,angle:8,direction:forward});
   const size=isBreak?a.StaminaBreakSizeModifier:1,hitEvents=[];
   targets.forEach((target,index)=>{
    const delta=add(target,initial,-1),along=dot(delta,forward),side=Math.abs(delta[0]*forward[2]-delta[2]*forward[0]);
    if(along < -targetRadius||along > a.DamageLength*size+targetRadius||side>a.DamageWidth*size/2+targetRadius)return;
    const first=Math.max(a.HitTiming,Math.max(0,along-targetRadius)/(a.DamageLength*size)*a.DamageExpandDuration);
    for(let i=0;i<a.MaxHitNum;i++){const t=first+i*a.DamageTerm;if(t<=a.DamageDuration+1e-9)hitEvents.push({at:at+t,target:index});}
   });
   hitEvents.sort((x,y)=>x.at-y.at||x.target-y.target);
   for(const event of hitEvents){b.trace.hits.push(event);if(cwp&&event.at>=(cooldowns.get(event.target)??-Infinity)-1e-9){b.effect(presets[r.optionHitKey],event.at,add(targets[event.target],[0,.375,0]));cooldowns.set(event.target,event.at+cwp.CoolTime);b.trace.optionEvents.push({...event,optionId:a.CwpOptionId,cooldown:cwp.CoolTime,preset:presets[r.optionHitKey],damageMultiplier:cwp.DpsMultiplier});}}
   b.trace.shots.push({at,hitAt:hit,isBreak,staminaBefore:breakOnly?a.StaminaPerAction:(native.battleDefaults?.maxStamina??200)-shot*a.StaminaPerAction,staminaCost:a.StaminaPerAction,firePreset:presets[isBreak?r.breakFireKey:r.fireKey],projectilePreset:presets[isBreak?r.breakProjectileKey:r.projectileKey]});
  }
  const times=new Set([0,end,...recoils.flatMap(e=>[e.at,e.at+e.duration/2,e.at+e.duration])]);for(let f=0;f<=Math.ceil(end*60);f++)times.add(Math.min(end,f/60));
  const spinePath=[...times].sort((a,b)=>a-b).map(time=>({time,...sampleNativeRecoil(time,recoils,forward)}));
  return b.finish({actor:{spinePath},...(count>1?{magazine:{count,cost:a.StaminaPerAction,capacity:native.battleDefaults?.maxStamina??200,period}}:{})});
 }
 function accelerated(plan){
  const {a,presets}=context(plan),r=plan.nativeArea,end=a.ActionDuration,b=builder(plan,end),step=1/r.simulationFps,ground=[initial[0],0,initial[2]],motion=constantPath(ground,end),hits=new Map();
  let elapsed=0,speed=0,position=ground.slice();
  // Resolve the independent clock at the preview's fixed stepping rate; the
  // source uses speed += accel*dt followed by position += speed*dt.
  for(let frame=1;elapsed<=a.ProjectileDuration+1e-9;frame++){
   elapsed=frame*step;
   if(a.WaitDuration<elapsed-1e-9&&elapsed<a.WaitDuration+a.ProjectileAccelDuration-1e-9)speed+=a.ProjectileAccel*step;
   position=add(position,forward,speed*step);const time=end+elapsed;
   motion.push({time,position:position.slice()});
   if(elapsed<=a.DamageDuration+1e-9)targets.forEach((target,index)=>{
    if(Math.hypot(target[0]-position[0],target[2]-position[2])>a.DamageRadius+targetRadius)return;
    const history=hits.get(index)||[];if(history.length>=a.MaxNumHit||history.length&&elapsed-history.at(-1)<a.DamageTerm-1e-9)return;
    history.push(elapsed);hits.set(index,history);b.effect(presets[r.hitKey],time,add(target,[0,.375,0]));b.trace.hits.push({at:time,target:index});
   });
  }
  const disposeAt=end+elapsed;
  b.effect(presets[r.projectileKey],0,ground,{motionPath:motion,disposeAt});
  // is_exclusive_character is true for this equipped native weapon's owner;
  // it is independent of whether the weapon parameter option is awakened.
  const weapon=native.weapons?.[options.weapon],isOwner=weapon?.exclusive!==false;
  if(isOwner)b.effect(presets[r.exclusiveCompanionKey],0,ground,{motionPath:motion,disposeAt});
  b.effect(presets[r.castKey],0,initial);if(presets.screen)b.effect(presets.screen,0,initial,{screen:true});
  b.animation(a,r.animationKey,0,end);b.animation(a,r.emotionKey,0,end,'Emotion');
  b.trace.field={launchAt:end,waitDuration:a.WaitDuration,accel:a.ProjectileAccel,accelDuration:a.ProjectileAccelDuration,duration:a.ProjectileDuration,disposeAt,finalSpeed:speed,finalPosition:position,initialRotation:r.initialRotation,updateRotation:r.updateRotation,independentTail:true};
  b.trace.darken={at:0,alpha:r.darkenAlpha,enterDuration:r.darkenEnterDuration,releaseAt:end+r.darkenExitProjectileTime};
  return b.finish();
 }
 for(const plan of chosen){
  if(plan.behavior==='source-persistent-area'){
   const count=Math.ceil((native.battleDefaults?.maxStamina??200)/native.actions[plan.action].StaminaPerAction),i=(style.ManualBattleActions||[]).indexOf(plan.action)+1;
   result.push({id:'basic-'+i,label:'普通攻击',...persistent(plan,1)},{id:'basic-break',label:'普攻末发',...persistent(plan,1,true)},{id:'basic-magazine',label:'全弹夹连贯攻击',...persistent(plan,count)});
  }else result.push({id:plan.id,label:plan.label,...accelerated(plan)});
 }
 return result;
}
