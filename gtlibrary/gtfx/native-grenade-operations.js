// Registered native grenade flight and pool operations. A flat preview floor
// replaces the game's Field tile query; all timing/velocity comes from source.
import {buildNativeRecoilPath} from './native-character-motion.js';
import {facingVectors} from './targeting.js';
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const list=x=>Array.isArray(x)?x:x==null?[]:[x];
const rows=x=>Object.fromEntries(list(x).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const unit=x=>{const n=Math.hypot(x[0],x[2]);return n?[x[0]/n,0,x[2]/n]:[1,0,0];};

// CalculatorFreeFall.SetParameters/GetDistance/GetProgress, normal (no bounce)
// path. timeScale is assigned by Grenade.ShootInner, not an animation guess.
export function nativeGrenadeFlight({start,end,velocity=10,gravity=20,timeScale=1.25,spin=false,at=0}){
 const nativeDuration=velocity/gravity+Math.sqrt(velocity**2/gravity**2+2*Math.max(0,start[1])/gravity),duration=nativeDuration/timeScale;
 const path=[],eulerPath=[],sign=(end[0]-start[0]||end[2]-start[2])>=0?-1:1;
 for(let frame=0;frame<=Math.ceil(duration*60);frame++){
  const time=Math.min(duration,frame/60),u=Math.min(1,time*timeScale/nativeDuration),p=add(start,add(end,start,-1),u);
  p[1]=Math.max(0,start[1]+velocity*time*timeScale-gravity*(time*timeScale)**2/2);
  path.push({time:at+time,position:p});
  if(spin)eulerPath.push({time:at+time,position:[0,sign*360*time,0]});
 }
 return {path,eulerPath,duration,position:path.at(-1).position};
}

// CalcGravity uses the positive root that reaches the supplied apex and final
// elevation in exactly T. This is separate from CalculatorFreeFall's v/g path.
export function nativeApexFlight({start,end,apex=3,duration=.8,rotation=1,at=0}){
 const dy=end[1]-start[1],gravity=(4*apex-2*dy+4*Math.sqrt(apex*apex-apex*dy))/duration**2,velocity=Math.sqrt(2*gravity*apex);
 if(!Number.isFinite(gravity))throw Error('Native apex below the selected target elevation');
 const path=[],eulerPath=[],sign=(end[0]-start[0]||end[2]-start[2])>=0?-1:1;
 for(let frame=0;frame<=Math.ceil(duration*60);frame++){
  const time=Math.min(duration,frame/60),u=time/duration,p=add(start,add(end,start,-1),u);
  // Native horizontal delta has y=0: vertical displacement is the parabola.
  p[1]=start[1]+velocity*time-gravity*time*time/2;
  path.push({time:at+time,position:p});eulerPath.push({time:at+time,position:[0,sign*360*u*rotation,0]});
 }
 return {path,eulerPath,duration,position:end.slice(),gravity,velocity};
}

export function buildNativeGrenadeAction({plan,a,presets,effects,options,native,initial,forward,target,isBreak,ids,byId}){
 const rule=plan.nativeGrenade,original=native.actions[plan.action];a={...a};presets={...presets};
 // Manual ctor explicitly reads its equipped option and its myth upgrade.
 const mergeOption=id=>{if(!ids.has(id))return;const o=byId.get(id);if(!o)return;a={...a,...o,Name:original.Name};};
 if(rule.parameterOptionField){for(const id of list(original[rule.parameterOptionField])){mergeOption(id);const o=byId.get(id);if(o)mergeOption(o.MythOptionId);}}
 const ascent=ids.has(original[rule.ascentOptionField]);
 if(ascent){mergeOption(original[rule.ascentOptionField]);presets={...presets,...rows(original.AscentPresetInfo)};}
 const field=(key,defaultValue)=>ascent&&original[key+'Ascent']!=null?original[key+'Ascent']:a[key]??defaultValue;
 const end=rule.kind==='manual'?field(rule.periodField,rule.defaultPeriod):original.ActionDuration??original.Duration??plan.end;
 const tracks=[],clips=[],stationary=[{time:0,position:initial.slice()},{time:end,position:initial.slice()}];
 function effect(preset,at,position,extra={}){
  if(!preset)return null;const e=effects.get(preset);if(!e)throw Error('Missing native grenade effect '+preset+' in '+plan.action);
  const track={effect:e,at:0,link:{delay:at,end,clips:[],anchor:'feet',graphPosition:position.slice(),graphDirection:forward,graphPath:stationary,graphOwnerAtBirth:initial.slice(),graphFollow:false,directed:false,fxEnd:at+e.duration,...extra}};
  tracks.push(track);return track;
 }
 function clip(key,track='Base',until=end){const r=list(track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(r)clips.push({name:r.Animation,start:0,end:until,speed:r.Scale??1,loop:!!r.Loop,track});}
 let direction=unit(add(target,initial,-1)),recoil=[],flight;
 if(rule.kind==='manual'){
  const suffix=isBreak&&field(rule.staminaBreakField)==='SuperGrenade'?rule.breakSuffix:'';
  const inRange=Math.hypot(target[0]-initial[0],target[2]-initial[2])<=rule.autoAimRange;
  if(!inRange)direction=facingVectors[options.direction]||forward;
  const dest=inRange?target.slice():add(initial,direction,field('MaxDistance'+suffix,5)),offset=native.weapons?.[options.weapon]?.shootOffset??0;
  const start=add(initial,direction,offset);
  flight=nativeGrenadeFlight({start,end:dest,...rule});
  effect(field(rule.grenadeField+suffix),0,start,{motionPath:flight.path,fxEnd:flight.duration});
  effect(field(rule.explosionField+suffix),flight.duration,flight.position);
  effect(field(rule.groundField+suffix),flight.duration,[flight.position[0],0,flight.position[2]]);
  // Native shoot pool is constant, independent of the flask's custom pool.
  effect(rule.shootPreset,0,start,{graphFollow:true});
  clips.push({name:rule.animation,start:0,end:Math.min(end,rule.animationEnd),speed:1,loop:false,track:'Base'});
  recoil=[{at:0,direction,...(isBreak?rule.breakRecoil:rule.recoil)}];
 }else if(rule.kind==='apex'){
  const at=field(rule.throwField,0),arrival=field(rule.arrivalField,.4),start=initial.slice();
  flight=nativeApexFlight({start,end:target.slice(),duration:arrival-at,apex:field(rule.apexField,3),rotation:field(rule.rotationField,1),at});
  effect(field(rule.grenadeField),at,start,{motionPath:flight.path,eulerPath:flight.eulerPath,eulerMask:[false,true,false],fxEnd:arrival});
  effect(field(rule.trailField),at,start,{motionPath:flight.path,fxEnd:arrival});
  effect(field(rule.explosionField),arrival,target);
  for(const [i,name]of list(original.AnimationKeys).entries())clips.push({name,start:list(original.AnimationTimings)[i]??0,end:list(original.AnimationRemoveTimes)[i]??end,speed:list(original.AnimationTimeScales)[i]??1,loop:!!list(original.AnimationLoops)[i],track:'Base'});
  recoil=[{at,direction,...rule.recoil}];
 }else if(rule.kind==='area'){
  const delta=add(target,initial,-1),distance=Math.hypot(delta[0],delta[2]),dest=add(initial,unit(delta),Math.min(distance,field('MaxDistance',5)));
  flight=nativeGrenadeFlight({start:initial.slice(),end:dest,...rule});
  effect(presets[rule.grenadeKey],0,initial,{motionPath:flight.path,eulerPath:flight.eulerPath,eulerMask:[false,true,false],fxEnd:flight.duration});
  effect(presets[rule.shootKey],0,initial,{graphFollow:true});
  effect(presets[rule.screenKey],0,initial,{screen:true});
  effect(presets[rule.cloudKey],flight.duration,flight.position);
  clip(rule.animationKey);clip(rule.emotionKey,'Emotion');
 }else throw Error('Unknown native grenade recipe '+rule.kind);
 const spine=buildNativeRecoilPath(recoil,forward,end);
 return {actor:{end,clips,graphPath:stationary,spinePath:spine},tracks,
  duration:Math.max(end,...tracks.map(t=>t.link.fxEnd)),source:plan.source,nativeGrenade:{kind:rule.kind,flightDuration:flight.duration,impact:flight.position}};
}
