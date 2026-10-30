import {sourceHero} from './weapon-hero-variants.js';
// Source-bound burst clocks, independent sweep fields, and embedded clone rush.
import {targetPositions,aimDirection} from './targeting.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
import {sampleGraphPath} from './graph-action.js';
import {nativeApexFlight} from './native-grenade-operations.js';
import {UnityRand} from './native-random.js';
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]),clamp=x=>Math.max(0,Math.min(1,x));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const rows=v=>Object.fromEntries((v||[]).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const rotate=(v,deg)=>{const a=deg*Math.PI/180;return [v[0]*Math.cos(a)+v[2]*Math.sin(a),v[1],v[2]*Math.cos(a)-v[0]*Math.sin(a)];};
export function reindeerActionModules(index,options,native,plans,style){
 const effects=new Map(index.effects.filter(e=>!e.unavailable).map(e=>[e.preset,e])),hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin);
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const installed=new Set(Object.values(native.options||{}).filter(o=>ids.has(o.Id)).map(o=>o.BattleActionName));
 const selected=native.weapons?.[options.weapon],basicNames=(style.ManualBattleActions||[]).filter(n=>!n.startsWith('Role')),result=[];
 for(const plan of plans.filter(p=>p.behavior==='source-reindeer-action')){
  if(plan.category==='basic'&&!basicNames.includes(plan.action)||plan.category==='role'&&!(style.ManualBattleActions||[]).includes(plan.action)||plan.category==='cwp'&&selected?.action!==plan.action||plan.category==='support'&&!installed.has(plan.action))continue;
  const original=native.actions[plan.action];if(!original)throw Error('Missing source action '+plan.action);
  const option=Object.values(native.options||{}).find(o=>o.Id===original.OptionId&&ids.has(o.Id)),a={...original},presets={...rows(a.PresetInfo),...rows(option?.PresetInfo)};
  if(plan.operation==='native-apex-grenade')Object.assign(presets,{grenade:a.GrenadePreset,trail:a.TrailPreset,explosion:a.ExplosionPreset});
  const initial=(options.actorPosition||[0,0,0]).slice(),targets=targetPositions(options,options.direction),target=targets[0],forward=aimDirection(options,options.direction,initial),height=options.boundsSize?.[1]??.75,center=add(initial,[0,height/2,0]),r=plan.constants;
  const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
  let end=plan.end,path=[{time:0,position:initial.slice()},{time:end,position:initial.slice()}],clips=[],spinePath=[],alpha=[],directionPath=[];
  const tracks=[],trace={action:plan.action,operation:plan.operation,impacts:[],boundaries:'60Hz flat-stage preview; no invented obstacle, event zone, or living party members'};
  function clip(key,at=0,track='Base',extra={}){const row=(track==='Emotion'?a.EmotionInfo||[]:a.AnimationInfo||[]).find(c=>c.Name===key);if(!row)return;
   for(const c of clips)if(c.track===track&&c.end==null)c.end=at;
   clips.push({name:track==='Emotion'&&!row.Animation.startsWith('[emo]')?'[emo]'+row.Animation:row.Animation,start:at,speed:row.Scale??1,loop:!!row.Loop,track,...(row.TargetDuration?{targetDuration:row.TargetDuration}:{}),...extra});}
  function fx(key,at,position,extra={}){
   const e=effects.get(presets[key]);if(!e)throw Error('Missing source effect '+presets[key]+' for '+plan.action);
   const direction=extra.graphDirection||forward,pool=nativePoolEventTransform(e,{nativePoolTransform:extra.directed?'directional':'direct',directed:!!extra.directed},direction),life=e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration;
   const link={delay:at,end,anchor:'feet',graphPosition:add(position,pool.offset),graphDirection:direction,graphPath:path,graphOwnerAtBirth:sampleGraphPath(path,at),directed:pool.directed,rotationType:pool.rotationType,rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2],fxEnd:at+life,...extra};
   if(link.motionPath)link.motionPath=link.motionPath.map(p=>({...p,position:add(p.position,pool.offset)}));
   const t={effect:e,at:0,link};tracks.push(t);return t;
  }
  function dispose(t,time){t.link.triggeredDisposeAt=time;t.link.fxEnd=t.effect.dispose==='TriggeredTimeLimit'?time+(t.effect.poolTimeLimit??t.effect.duration):t.effect.dispose==='TimeLimit'?t.link.delay+(t.effect.poolTimeLimit??t.effect.duration):time;}
  const times=(limit,bounds=[])=>[...new Set([0,limit,...bounds,...Array.from({length:Math.ceil(limit*60)+1},(_,f)=>Math.min(limit,f/60))])].filter(t=>t>=0&&t<=limit).sort((a,b)=>a-b);
  const make=()=>({id:plan.category==='basic'?'basic-'+(basicNames.indexOf(plan.action)+1):plan.id,label:plan.label,actor:{end,clips,graphPath:path,spinePath,alpha,directionPath},tracks,duration:Math.max(end,trace.sequenceEnd||0,...tracks.map(t=>t.link.fxEnd)),source:plan.source,sourceTrace:trace,random:{implementation:'UnityEngine.Random',stateBefore,stateAfter:rng.getState(),choices:[]}});
  if(plan.operation==='native-apex-grenade'){
   const at=a.GrenadeThrowTiming,arrival=a.GrenadeArrivalTiming,flight=nativeApexFlight({start:center,end:target,duration:arrival-at,apex:a.GrenadePeakHeight,rotation:a.GrenadeRotationMultiplier,at});
   const grenade=fx('grenade',at,center,{motionPath:flight.path,eulerPath:flight.eulerPath,eulerMask:[false,true,false]});grenade.link.fxEnd=arrival;
   dispose(fx('trail',at,center,{motionPath:flight.path}),arrival);fx('explosion',arrival,target);
   a.AnimationKeys?.forEach((name,i)=>clips.push({name,start:a.AnimationTimings?.[i]||0,end:a.AnimationRemoveTimes?.[i]??end,speed:a.AnimationTimeScales?.[i]??1,loop:a.AnimationLoops?.[i]||false,track:'Base'}));
   a.EmotionKeys?.forEach((name,i)=>clips.push({name:name.startsWith('[emo]')?name:'[emo]'+name,start:a.EmotionTimings?.[i]||0,end,speed:1,track:'Emotion'}));
   spinePath=buildNativeRecoilPath([{at,distance:r.recoilDistance,height:r.recoilHeight,duration:r.recoilDuration,angle:r.recoilAngle}],forward,end);
   trace.flight={start:center,arrival,gravity:flight.gravity,velocity:flight.velocity,impact:target};
  }else if(plan.operation==='timed-gun-burst'){
   a.AnimationTiming.forEach((at,i)=>clip(a.AnimationKey[i],at,'Upper'));
   for(const at of a.HitTiming){fx('fire',at,add(add(center,forward,r.fireOffset),[0,r.fireHeight,0]),{directed:true});if(option)for(const [i,point]of targets.entries()){const d=dist(point,initial),along=(point[0]-initial[0])*forward[0]+(point[2]-initial[2])*forward[2];if(d<=option.Range&&d<=a.Radius&&(d<1e-8||along/d>=Math.cos(a.Angle*Math.PI/360))){fx('hit',at,add(point,[0,(options.targetHeight??height)/2,0]));trace.impacts.push({at,target:i});}}}
   const recoils=a.HitTiming.map((at,i)=>({at:at+r.recoilAtOffset,distance:r.recoilDistance,height:r.recoilHeight,angle:0,duration:a.HitTiming[Math.min(a.HitTiming.length-1,i+1)]-a.HitTiming[Math.max(0,i-1)]})).filter(e=>e.duration>0);
   spinePath=buildNativeRecoilPath(recoils,forward,Math.max(end,...recoils.map(e=>e.at+e.duration)));
   trace.hitTimings=a.HitTiming;trace.ammoContract='three source combo actions; no weapon-magazine counter is consumed by this Lua';
  }else if(plan.operation==='persistent-spin'){
   clip(forward[0]<0?'action_rev':'action',0,'Upper');
   const spin=fx('spin',0,add(center,[0,height*r.heightSizeMultiplier,0]),{graphFollow:true});dispose(spin,end);
   for(const [i,point]of targets.entries())if(dist(point,add(initial,[0,0,.5]))<=a.Radius){fx('hit',a.HitTiming,add(point,[0,(options.targetHeight??height)/2,0]));trace.impacts.push({at:a.HitTiming,target:i});}
   trace.staminaContract=plan.staminaContract;
  }else if(plan.operation==='linear-charge'){
   const start=a.DashTiming,stop=start+a.DashDuration,dt=1/60,size=a.Size,ownerRadius=options.ownerRadius??.275,targetRadius=options.targetRadius??.275;
   let position=initial.slice(),previous=0,hitAt=null,moving=true;path=[];
   for(const time of times(end,[start,stop])){
    if(moving&&time>start&&previous<stop){
     const local=add(target,position,-1),along=local[0]*forward[0]+local[2]*forward[2],side=local[0]*forward[2]-local[2]*forward[0],step=a.DashSpeed*(Math.min(stop,time)-Math.max(start,previous));
     if(Math.abs(side)<=size[2]/2+targetRadius&&Math.abs(along)<=size[0]/2+targetRadius){hitAt=time;moving=false;end=Math.min(end,time+a.ActionDuration-a.DashDuration-a.DashTiming);}
     else position=add(position,forward,Math.max(0,Math.min(step,along-ownerRadius-targetRadius)));
    }
    path.push({time,position:position.slice()});previous=time;
   }
   path=path.filter(p=>p.time<=end);if(path.at(-1).time<end)path.push({time:end,position:position.slice()});
   if(Math.abs(forward[0])>=Math.abs(forward[2]))clip('dash',start,'Upper');
   const dash=fx('dash',start,add(sampleGraphPath(path,start),[0,height/2,0]),{directed:true,graphFollow:true});dispose(dash,end);
   if(hitAt!=null){fx('hit',hitAt,add(add(sampleGraphPath(path,hitAt),[0,height/2,0]),forward,r.hitForward));trace.impacts.push({at:hitAt,buff:a.BuffName});}
   trace.charge={start,stop,speed:a.DashSpeed,sourceMaxDistance:a.DashDuration*a.DashSpeed,hitAt};
  }else if(plan.operation==='target-scan-sequences'){
   clip('cast');clip('cast',0,'Emotion');fx('cast',0,initial);fx('fire',0,initial);fx('screen',end+r.screenDelay,initial,{screen:true});
   const jumpDuration=end*r.jumpDurationScale;spinePath=times(end,[jumpDuration]).map(time=>({time,position:[0,time<jumpDuration?r.jumpHeight*Math.sin(Math.PI*time/jumpDuration):0,0]}));
   const point=dist(target,initial)<=a.SearchRange?[target[0],0,target[2]]:add(initial,forward,a.SearchRange);
   a.HitSeqTimings.forEach((at,i)=>{
    fx('range',at,point);fx(i%2===0?'ground_hit_r':'ground_hit_l',at,point);
    for(let scan=1;scan<=Math.round(r.scanDuration/r.scanTerm);scan++){
     const elapsed=scan*r.scanTerm,progress=1-r.scanTimeMultiplier*elapsed/r.scanDuration,noiseRange=a.DamageRadius*Math.cos(Math.abs(progress)*Math.PI*.5),noise=(rng.nextFloat()*2-1)*noiseRange;
     const p=add(add(point,rotate([0,0,1],a.HitSeqAngles[i]),progress*a.DamageRadius),rotate([0,0,1],a.HitSeqAngles[i]+90),noise);
     fx('ground_hit',at+elapsed,p);
    }
    for(const relativeAt of a.HitTimings)trace.impacts.push({at:at+relativeAt,position:point.slice()});
   });
   a.SleighSeqTimings.forEach((at,i)=>fx('sleigh'+(i+1),at,point));
   trace.sequenceEnd=a.TotalDuration;trace.sleighTimings=a.SleighSeqTimings;trace.scanTimings=a.HitSeqTimings;
  }else if(plan.operation==='expanding-sleigh-field'){
   clip('cast');fx('cast',0,center,{graphFollow:true});fx('shoot',a.ShootTiming,center,{directed:true});
   const spawn=a.ShootTiming+a.HitDelay,death=spawn+a.ReduceTiming+a.ReduceDuration,stop=spawn+a.ExpandDuration;
   const motion=times(death,[spawn,stop,spawn+a.ReduceTiming]).filter(t=>t>=spawn).map(time=>({time,position:add(center,forward,a.BaseLength+(a.MaxLength-a.BaseLength)*clamp((time-spawn)/a.ExpandDuration)-r.offset)}));
   for(const key of ['proj','trail'])dispose(fx(key,spawn,motion[0].position,{directed:true,motionPath:motion}),death);
   fx('screen',spawn,initial,{screen:true});
   trace.field={spawn,death,stop,start:motion[0].position,finish:motion.at(-1).position,baseLength:a.BaseLength,maxLength:a.MaxLength,reduceAt:spawn+a.ReduceTiming,reduceDuration:a.ReduceDuration,mainDamageScale:a.MainDamageScale,maxHit:a.MaxHit};
   trace.collisionSamples=times(death,[spawn,stop,spawn+a.ReduceTiming]).filter(t=>t>=spawn).map(time=>{const elapsed=time-spawn,expand=a.BaseLength+(a.MaxLength-a.BaseLength)*clamp(elapsed/a.ExpandDuration),reduce=a.MaxLength*clamp((elapsed-a.ReduceTiming)/a.ReduceDuration);return {time,position:add(center,forward,reduce),length:expand-reduce};});
  }else if(plan.operation==='clone-rush'){
   const side=[Math.sign(target[0]-initial[0])||1,0,0],first=add(target,side,-r.firstDistance),last=add(target,side,r.lastDistance);
   const lerp=(a,b,t)=>add(a,add(b,a,-1),clamp(t));
   path=times(end,[r.blinkAt,r.firstAt,r.dashAt,a.HitTiming,r.throughAt,r.fadeAt,r.returnAt]).map(time=>({time,position:time<r.blinkAt?initial.slice():time<r.firstAt?lerp(initial,first,(time-r.blinkAt)/(r.firstAt-r.blinkAt)):time<r.dashAt?first.slice():time<a.HitTiming?lerp(first,target,(time-r.dashAt)/(a.HitTiming-r.dashAt)):time<r.throughAt?lerp(target,last,(time-a.HitTiming)/(r.throughAt-a.HitTiming)):time<r.returnAt?last.slice():lerp(last,initial,(time-r.returnAt)/r.returnDuration)}));
   const clonePath=[...path.filter(p=>p.time<=r.throughAt),{time:end,position:last.slice()}];
   clip('cast');alpha=[{at:0,from:1,value:0,duration:.05},{at:r.fadeAt,from:0,value:1,duration:.05}];directionPath=[{time:0,position:[0,0,-1]}];
   const scream=fx('clone',0,initial,{motionPath:clonePath,skeletonIdle:'scream',skeletonView:'front',skeletonAlpha:[{at:0,from:0,to:1,duration:.05}]});scream.link.fxEnd=r.blinkAt;
   const dashClone=fx('clone',r.firstAt,first,{motionPath:clonePath,skeletonIdle:'dash',skeletonView:'side',skeletonFlip:side[0]<0,skeletonAlpha:[{at:0,from:0,to:0},{at:r.dashAt-r.firstAt,from:1,to:1},{at:r.fadeAt-r.firstAt,from:1,to:0,duration:.05}]});dashClone.link.fxEnd=r.fadeAt+.05;
   fx('roar',0,add(initial,[0,height/2,0]),{motionPath:clonePath.map(p=>({...p,position:add(p.position,[0,height/2,0])}))});fx('blink',r.blinkAt,add(initial,[0,height/2,0]));fx('cast',r.firstAt,add(first,[0,height/2,0]));
   const dash=fx(side[0]<0?'dash':'dash_rev',r.dashAt,add(first,[0,height/2,0]),{directed:true,graphDirection:side,motionPath:clonePath.map(p=>({...p,position:add(p.position,[0,height/2,0])}))});dispose(dash,r.fadeAt);
   fx('hit',a.HitTiming+.02,add(target,[0,height/2,0]));trace.impacts.push({at:a.HitTiming,target:0,buff:a.BuffName});trace.clone={first,last,side,blinkAt:r.blinkAt,visibleAgainAt:r.dashAt,fadeAt:r.fadeAt,returnAt:r.returnAt};
  }else throw Error('Unknown source choreography '+plan.operation);
  const m=make();result.push(m);
  if(plan.operation==='persistent-spin'){
   const cycles=plan.continuousCycles,period=end,continuation={...m,id:'basic-continuous',label:'连续普攻（三轮）',actor:{...m.actor,end:period*cycles,clips:m.actor.clips.map(c=>({...c,end:period*cycles})),graphPath:[{time:0,position:initial},{time:period*cycles,position:initial}]},tracks:[],sourceTrace:{...trace,cycles,continuousAnimation:true},duration:period*cycles};
   for(let cycle=0;cycle<cycles;cycle++)for(const t of m.tracks)continuation.tracks.push({...t,at:cycle*period+(t.at||0)});
   continuation.duration=Math.max(continuation.actor.end,...continuation.tracks.map(t=>t.at+t.link.fxEnd));result.push(continuation);
  }
 }
 const combo=result.filter(m=>m.sourceTrace?.operation==='timed-gun-burst');
 if(combo.length>1){
  const tracks=[],clips=[],path=[],spinePath=[];let at=0;
  for(const m of combo){tracks.push(...m.tracks.map(t=>({...t,at:at+t.at})));clips.push(...m.actor.clips.map(c=>({...c,start:at+c.start,end:at+(c.end??m.actor.end)})));path.push(...m.actor.graphPath.map(p=>({...p,time:at+p.time})));spinePath.push(...m.actor.spinePath.map(p=>({...p,time:at+p.time})));at+=m.actor.end;}
  result.push({id:'basic-combo',label:'整套普攻',actor:{end:at,clips,graphPath:path,spinePath},tracks,duration:Math.max(at,...tracks.map(t=>t.at+t.link.fxEnd)),sourceTrace:{actions:combo.map(m=>m.sourceTrace.action)}});
 }
 return result;
}
