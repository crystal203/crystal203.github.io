import {scriptActionModules} from './script-actions.js';
import {targetPositions,aimDirection} from './targeting.js';
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k);
export function batch6CActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-batch6-c');if(!selected.length)return [];
 const actions={...native.actions},expanded=[],initial=options.actorPosition||[0,0,0],target=targetPositions(options,options.direction)[0],forward=aimDirection(options,options.direction,initial),view=options.direction==='left'||options.direction==='right'?'side':options.direction;
 const fx=(preset,at=0,extra={})=>({op:'effect',preset,at,anchor:'feet',nativePoolLifetime:true,nativePoolTransform:'direct',...extra});
 for(const p of selected){const a={...actions[p.action]},op=p.batch6Operation,clips=[],events=[],moves=[],spine=[];let extra={};
 if(op==='ManualClawSlash'||op==='ManualHeadButt'){
  const head=op==='ManualHeadButt',stay=head?a.StayDuration:0,scale=head?a.ActionScale:1.3333333730697632;
  a.AnimationInfo=[{Name:'attack',Animation:a.AnimationName,Scale:scale}];
  if(head){a.AnimationInfo.push({Name:'ready',Animation:a.ReadyAnimationName,Scale:scale});clips.push({key:'ready',at:0,end:stay},{animation:'[emo]'+a.ReadyEmotionName,at:0,end:stay,track:'Emotion'});}
  clips.push({key:'attack',at:stay,track:'Base'});
  events.push(fx(head?a.ReactionPreset:a.ClawPreset,stay,{anchor:'feet',offset:head?.75:0,follow:!head,fourWay:!head,nativePoolTransform:head?'direct':'directional',spineEvent:{animationKey:'attack',nameField:'SpineEventName'}}));
  moves.push({op:'dash',at:stay,duration:a.DashDuration,speed:a.DashDistanceCap/a.DashDuration,stopOffset:a.SafetyDistance});
 }else if(op==='ManualPalmStrike'){
  a.AnimationInfo=[{Name:'attack',Animation:a.AnimationName,Scale:1}];clips.push({key:'attack',at:0});moves.push({op:'dash',at:a.StayDuration||0,duration:a.DashDuration,speed:a.DashDistanceCap/a.DashDuration,stopOffset:a.NoDashDistance??.15});
  events.push(fx(a.PalmPreset,0,{follow:true,fourWay:true,nativePoolTransform:'directional',spineEvent:{animationKey:'attack',nameField:'SpineEventName'}}));if(a.StrongHit)events.push(fx('fx_m_gauntlet_charging',a.DashDuration,{follow:true,nativePoolTransform:'directional'}));
 }else if(op==='RoundAggro'){
  clips.push({animation:'get',at:0,track:'Upper'},{animation:'[emo]mad',at:0,loop:true,track:'Emotion'});events.push(fx(a.AggroPreset,0,{directed:false}));
 }else if(op==='CwpDollGirlDragonTalon'){
  clips.push({key:'ready',at:0});events.push({op:'effect',key:'ready',at:0,anchor:'feet',nativePoolTransform:'direct',directed:false},{op:'effect',key:'strike',at:.5,anchor:'feet',offset:a.Offset,fourWay:true,nativePoolTransform:'directional'});
 }else if(op==='SummonObjectSupport'){
  a.AnimationRemoveTimes=(a.AnimationRemoveTimes||[]).map(v=>v<0?p.end:v);extra.animationArrays=true;
  for(const [i,preset]of (a.EffectPresetNames||[]).entries())events.push(fx(preset,a.EffectCreateTimings[i],{anchor:a.EffectAnchors[i]==='Target'?'targetGround':'feet'}));
  const total=a.ProjSpeed*a.ProjDuration,start=add(target,forward,-total*.5),motion=[{time:0,position:start},{time:a.ProjDuration,position:add(start,forward,total)}];events.push(fx(a.ProjPresetName,0,{nativePoolTransform:'directional',until:a.ProjDuration,link:{motionPath:motion,rootScaleX:a.ProjFlipX&&forward[0]<0?-1:1}}));if(a.ProjSpawnPresetName)events.push(fx(a.ProjSpawnPresetName,0,{nativePoolTransform:'directional',link:{graphPosition:start}}));if(a.ProjEndPresetName)events.push(fx(a.ProjEndPresetName,a.ProjDuration,{nativePoolTransform:'directional',link:{graphPosition:add(start,forward,total)}}));
 }else if(op==='LinearSupport'){
  a.AnimationRemoveTimes=(a.AnimationRemoveTimes||[]).map(v=>v<0?p.end:v);extra.animationArrays=true;
  for(const [i,preset]of a.EffectPresetNames.entries())events.push(fx(preset,a.EffectCreateTimings[i],{anchor:a.EffectAnchors[i]==='Target'?'targetGround':'feet'}));
  const start=add(target,forward,-a.DashSpeed*a.DashDuration*.25),motion=[];
  for(let f=0;f<=Math.ceil(a.Duration*60);f++){const time=Math.min(a.Duration,f/60),u=Math.min(time/a.DashDuration,1);motion.push({time,position:add(start,forward,a.DashSpeed*a.DashDuration*.5*u*(2-u))});}
  for(const preset of a.TrailPresetNames)events.push(fx(preset,a.TrailCreateTiming,{nativePoolTransform:'directional',link:{motionPath:motion}}));
 }else if(op==='ManualGas'){
  const override=options.exclusiveWeapon?Object.values(native.options||{}).find(o=>o.Id===a.OptionId):null,enhance=override?.EnhanceType==='ContinuousEnhance'?override.RequiredTime:Infinity;
  clips.push({animation:a.ShootStateAnimation,at:0,loop:true,track:'Upper'});
  for(const key of ['GasPreset','FiringPreset'])if(a[key])events.push(fx(a[key],0,{follow:true,nativePoolTransform:'directional',until:Math.min(p.end,enhance)}));
  if(enhance<p.end)for(const key of ['GasPreset','FiringPreset'])if(override['Enhance'+key])events.push(fx(override['Enhance'+key],enhance,{follow:true,nativePoolTransform:'directional',until:p.end}));
  const endPreset=enhance<p.end?override.EnhanceEndPreset:a.EndPreset;if(endPreset)events.push(fx(endPreset,p.end,{nativePoolTransform:'directional'}));
 }else if(op==='CwpDragonBoy'){
  const change=a.JumpDuration,stop=change+a.BreathDuration;extra.alpha=options.exclusiveWeapon?[{at:0,value:0},{at:p.end,from:0,value:1,duration:.2}]:[];
  if(!options.exclusiveWeapon)clips.push({key:'castfallback',at:0,track:'Upper',loop:true});
  events.push({op:'effect',key:'dragon',at:0,anchor:'feet',directed:false,nativePoolTransform:'direct',follow:true,triggerDisposeAt:p.end,link:{skeletonView:'front',skeletonIdle:'change_human',skeletonOffsetPath:[{time:0,position:[0,3,0]}],skeletonClips:[{name:'change_dragon',start:0,end:change,speed:.667,track:'Upper'},{name:'breath_loop',start:change,end:stop,speed:1,loop:true,track:'Upper'},{name:'change_human',start:stop,speed:1,track:'Upper'}]}},{op:'effect',key:'screen',at:change,screen:true,directed:false});
  for(const key of ['breath','field','trail'])events.push({op:'effect',key,at:change,anchor:'feet',directed:false,nativePoolTransform:'direct',follow:true,followUntil:stop,triggerDisposeAt:key==='trail'?stop:p.end});
 }else if(op==='CwpPet'){
  const dash=a.DashTiming,stomp=dash+a.DashDuration,slash=a.SlashTiming-.1;
  clips.push({key:'cast',at:0},{key:'dash',at:dash});events.push({op:'effect',key:'screen',at:0,screen:true,directed:false},{op:'effect',key:'cast',at:0,anchor:'center',directed:false,nativePoolTransform:'direct',follow:true,followSpine:true},{op:'effect',key:'dash',at:dash,anchor:'center',follow:true,followSpine:true,nativePoolTransform:'directional',triggerDisposeAt:p.end},{op:'effect',key:'stomp',at:stomp,anchor:'center',directed:false,nativePoolTransform:'direct'},{op:'effect',key:'slash',at:slash,anchor:'feet',fourWay:true,nativePoolTransform:'directional'});
  moves.push({op:'dash',at:dash,duration:a.DashDuration,speed:a.DashSpeed,stopOffset:0});spine.push({at:dash,height:.9,duration:a.DashDuration});
  if(options.exclusiveWeapon)events.push({op:'effect',key:'avatar',at:0,anchor:'feet',follow:true,directed:false,nativePoolTransform:'direct',triggerDisposeAt:p.end,link:{skeletonView:view,skeletonFlip:forward[0]<0,skeletonIdle:'idle',skeletonClips:[{name:'pounce_ready_loop',start:0,end:dash,loop:true,speed:2},{name:'pounce',start:dash,end:slash,speed:3.6},{name:'attack2',start:slash,speed:2}],skeletonAlpha:[{at:0,from:0,to:.8,duration:.2},{at:dash+.1,from:.8,to:0,duration:(p.end-dash)*1.3}]}});
 }else continue;
 actions[p.action]=a;expanded.push({...p,behavior:'timeline',meleeTimeline:true,clips,events,moves,spine,...extra});
 }
 if(!expanded.length)return [];
 return scriptActionModules(index,options,{...native,actions},expanded,style);
}
