import {effectLookup} from './effect-lookup.js';
// Source-native orbit interpolation and launched card lifetime. No actor IDs.
import {aimDirection,targetPositions} from './targeting.js';
import {createHomingTrajectory} from './native-projectile.js';
import {sampleGraphPath} from './graph-action.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((x,i)=>x+k*b[i]);
const rotate=(v,a)=>{const r=a*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
const clamp=v=>Math.max(0,Math.min(1,v));
export function nativeTwinAngle(spec,distance,rule){
 const dist=Math.max(distance-Math.cos(rule.maximumAngle*Math.PI/180)*rule.muzzleOffset+rule.backOffset,0);
 const duration=spec.Accel?(Math.sqrt(spec.Speed**2+2*spec.Accel*dist)-spec.Speed)/spec.Accel:dist/spec.Speed;
 return Math.min(rule.maximumAngle,Math.min(duration,spec.Lifetime)*spec.HomingAngularSpeed/2);
}
export function nativeCardOrbitAngle(rule,shootTimes,cardIndex,time,firstIndex){
 const n=shootTimes.length,i=cardIndex+1,target=(1-i/n)*360;
 if(time<=rule.orbitStart){const duration=rule.initTerm*(n-i);return duration>0?target*clamp((time-rule.initTerm*i)/duration):0;}
 const first=firstIndex??Math.min(n,shootTimes.filter(t=>t<time).length+1),count=n-first+1,index=i-first+1;
 const extra=(360-360/n)*first+(index===1?0:(360/count-360/n)*(index-1));
 return target-extra*clamp((time-rule.orbitStart)/(shootTimes[first-1]-rule.orbitStart));
}
export function buildNativeCardOrbit(rule,shootTimes,cardIndex,center,forward){
 const born=rule.initTerm*(cardIndex+1),death=shootTimes[cardIndex],times=new Set([born,rule.orbitStart,death]);
 for(let frame=Math.ceil(born*60);frame<=Math.ceil(death*60);frame++)times.add(Math.min(death,frame/60));
 for(const at of shootTimes)if(at>born&&at<death)times.add(at);
 const motionPath=[],directionPath=[];
 const push=(time,first)=>{const direction=rotate(forward,nativeCardOrbitAngle(rule,shootTimes,cardIndex,time,first));motionPath.push({time,position:add(center,direction,rule.radius)});directionPath.push({time,position:direction});};
 for(const time of [...times].filter(t=>t>=born&&t<=death).sort((a,b)=>a-b)){
  push(time);const boundary=shootTimes.findIndex(t=>Math.abs(t-time)<1e-9);if(boundary>=0&&boundary<cardIndex)push(time,boundary+2);
 }
 return {born,death,motionPath,directionPath};
}
export function orbitCardActionModules(index,options,native,plans,style){
 const effects=effectLookup(index.effects);
 const hero=options.heroAppearance||options.appearance||options.profile.defaultSkin,weapon=native.weapons?.[options.weapon];
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const basics=style.ManualBattleActions||[],result=[],basicPlans=[];
 function build(plan){
  const a=native.actions[plan.action],initial=(options.actorPosition||[0,0,0]).slice(),height=options.centerHeight??.375,center=add(initial,[0,height,0]),forward=aimDirection(options,options.direction,initial),target=add(targetPositions(options,options.direction)[0],[0,height,0]);
  const active=list(a[plan.mythOptionListField||'MythOptionId']).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(Boolean),myth=active.some(o=>!o.IsCwpOption);
  const presets={...fields(a.PresetInfo),...(myth?fields(a.MythPresetInfo):{})},projectileRows=myth&&a.MythProjectileInfo||a.ProjectileInfo;
  const end=plan.end,tracks=[],clips=[],spinePath=[],trace={shots:[],cards:[],damageTimings:[]},choices=[];
  const path=[{time:0,position:initial.slice()},{time:Math.max(end,...list(a.ShootTiming)),position:initial.slice()}];
  function clip(key,track='Base',stop=end){const r=list(track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(r)clips.push({name:r.Animation,start:0,end:Math.min(stop,r.RemoveAfter??Infinity),track,speed:r.Scale??1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})});}
  function rule(preset){return plan.poolRules?.[preset]||{dispose:effects.get(preset)?.dispose||'None',timeLimit:effects.get(preset)?.poolTimeLimit??effects.get(preset)?.duration??0};}
  function natural(preset){const p=rule(preset),e=effects.get(preset);return p.dispose==='TimeLimit'?p.timeLimit:e?.duration||0;}
  function disposedEnd(preset,born,trigger){const p=rule(preset);return p.dispose==='TriggeredTimeLimit'?trigger+p.timeLimit:p.dispose==='TimeLimit'?born+p.timeLimit:trigger;}
  function effect(preset,at,position,link={}){const e=effects.get(preset);if(!e)throw Error('Missing native orbit effect '+preset+' in '+plan.action);const t={effect:e,at:0,link:{action:a.Name,delay:at,end,clips:[],anchor:'feet',graphPosition:position.slice(),graphDirection:forward,directed:false,graphPath:path,graphOwnerAtBirth:initial.slice(),fxEnd:at+natural(preset),...link}};tracks.push(t);return t;}
  function projectile(spec,at,start,direction,{homing=false,muzzle=true,hasTarget=true}={}){
   if(!spec)throw Error('Missing native orbit projectile in '+plan.action);
   const trajectory=createHomingTrajectory({position:start,direction,speed:spec.Speed,accel:spec.Accel||0,angularSpeed:homing?spec.HomingAngularSpeed||0:0,target});
   const motionPath=[],directionPath=[];let hit=false,stop=spec.Lifetime,last=start,previous=start;
   for(let f=0;f<=Math.ceil(spec.Lifetime*60);f++){const elapsed=Math.min(spec.Lifetime,f/60),position=trajectory(elapsed),delta=add(position,previous,-1),len=Math.hypot(...delta);motionPath.push({time:at+elapsed,position});directionPath.push({time:at+elapsed,position:len?delta.map(x=>x/len):direction.slice()});previous=position;last=position;
    if(hasTarget&&spec.PenetrateType!=='All'&&Math.hypot(...add(position,target,-1))<=(spec.HitBoxWidth||0)/2+.275){hit=true;stop=elapsed;break;}}
   const death=at+stop;if(muzzle&&spec.ShootEffectPreset)effect(spec.ShootEffectPreset,at,add(start,direction,plan.muzzleOffset));
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(r=>r.PresetName)].filter(Boolean))effect(preset,at,start,{directed:true,graphDirection:direction,motionPath,directionPath,triggeredDisposeAt:death,fxEnd:disposedEnd(preset,at,death)});
   if(hit&&spec.HitPreset)effect(spec.HitPreset,death,last);if(spec.ExpirePreset)effect(spec.ExpirePreset,death,last);if(spec.Exploding&&spec.ExplosionPreset)effect(spec.ExplosionPreset,death,last);
   trace.shots.push({at,death,hit,start,direction,homing,projectile:spec.Name});
  }
  if(plan.pattern==='single-ground-cast'){
   clip('action');const ground=target.slice();ground[1]-=height;effect(presets.cast,0,ground);trace.damageTimings=list(a.HitAreaTimings);
  }else if(plan.pattern==='aimed-twin-shot'){
   clip('action','Upper');clip('action','Emotion');const spec=native.projectiles[list(projectileRows)[0]?.Name],at=a.ShootTiming;
   const id=a.Name+':target',hasTarget=options.choiceOverrides?.[id]!=='none';choices.push({id,selected:hasTarget?'target':'none',nativeSelected:'target',overridden:!hasTarget,options:[{key:'target',preset:'有目标',assetName:'有目标'},{key:'none',preset:'无目标',assetName:'无目标'}]});
   if(a.ComboIndex===plan.twinComboIndex){const angle=nativeTwinAngle(spec,hasTarget?Math.hypot(target[0]-center[0],target[2]-center[2]):1,plan);for(const sign of [1,-1]){const direction=rotate(forward,sign*angle);projectile(spec,at,hasTarget?center:add(center,direction,.5),hasTarget?direction:forward,{homing:hasTarget,hasTarget});}trace.twinAngle=angle;
   }else projectile(spec,at,center,forward,{hasTarget});
  }else if(plan.pattern==='staged-orbit-launch'){
   clip(options.exclusiveWeapon?'cast':'castbackup','Upper');
   for(let f=0;f<=Math.ceil(end*60);f++){const time=Math.min(end,f/60);spinePath.push({time,position:[0,options.exclusiveWeapon&&time<plan.jump.duration?plan.jump.height*Math.sin(Math.PI*time/plan.jump.duration):0,0]});}
   const follow=path.flatMap(p=>[{time:p.time,position:p.position}]);for(const p of spinePath)follow.push({time:p.time,position:add(initial,p.position)});follow.sort((a,b)=>a.time-b.time);
   effect(presets.cast,0,center,{graphPath:follow,graphFollow:true});effect(presets.screen,0,initial,{screen:true});
   const times=list(a.ShootTiming);
   for(let i=0;i<times.length;i++){
    const orbit=buildNativeCardOrbit(plan,times,i,center,forward),mode=i%2+1;
    for(const key of ['proj'+mode,'trail'+mode]){const preset=presets[key];effect(preset,orbit.born,orbit.motionPath[0].position,{directed:true,graphDirection:orbit.directionPath[0].position,motionPath:orbit.motionPath,directionPath:orbit.directionPath,uniformScalePath:[{time:orbit.born,position:[plan.prelaunchScale,plan.prelaunchScale,plan.prelaunchScale]},{time:orbit.death,position:[plan.prelaunchScale,plan.prelaunchScale,plan.prelaunchScale]},{time:orbit.death,position:[1,1,1]}],triggeredDisposeAt:orbit.death,fxEnd:disposedEnd(preset,orbit.born,orbit.death)});}
    trace.cards.push({index:i,born:orbit.born,death:orbit.death,mode});projectile(native.projectiles[list(projectileRows)[mode-1]?.Name],times[i],add(center,forward,plan.shootOffset),forward,{muzzle:false});
   }
  }else throw Error('Unknown native orbit pattern '+plan.pattern);
  return {actor:{end,clips,graphPath:path,spinePath},tracks,duration:Math.max(end,...tracks.map(t=>t.link.fxEnd)),nativeOrbitTrace:trace,random:{choices},source:plan.source};
 }
 for(const plan of plans){if(plan.behavior!=='source-orbit-cards'||plan.exclusive&&!options.exclusiveWeapon)continue;let id=plan.id,label=plan.label;if(plan.category==='basic'){const i=basics.indexOf(plan.action);if(i<0)continue;id='basic-'+(i+1);label='普攻第 '+(i+1)+' 段';basicPlans.push(plan);}result.push({id,label,...build(plan)});}
 if(basicPlans.length>1){const tracks=[],clips=[],graphPath=[],spinePath=[],trace=[];let time=0;for(const name of basics){const plan=basicPlans.find(p=>p.action===name);if(!plan)continue;const m=build(plan);tracks.push(...m.tracks.map(t=>({...t,at:time})));clips.push(...m.actor.clips.map(c=>({...c,start:c.start+time,end:c.end+time})));graphPath.push(...m.actor.graphPath.map(p=>({...p,time:p.time+time})));spinePath.push(...m.actor.spinePath.map(p=>({...p,time:p.time+time})));trace.push(m.nativeOrbitTrace);time+=m.actor.end;}result.push({id:'basic-combo',label:'普攻连贯',actor:{end:time,clips,graphPath,spinePath},tracks,duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd)),nativeOrbitTrace:trace});}
 return result;
}
