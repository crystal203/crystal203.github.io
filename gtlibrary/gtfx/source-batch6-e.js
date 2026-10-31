import {sourceHero} from './weapon-hero-variants.js';
import {scriptActionModules} from './script-actions.js';
import {aimDirection,targetPositions} from './targeting.js';
import {UnityRand} from './native-random.js';
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),length=v=>Math.hypot(...v);
export function batch6EActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-batch6-e');if(!selected.length)return [];
 const actions={...native.actions},projectiles={...native.projectiles},expanded=[],initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0],hooks=[];
 const fx=(key,at=0,extra={})=>({op:'effect',key,at,anchor:'center',nativePoolLifetime:true,nativePoolTransform:extra.directed===false?'direct':'directional',...extra});
 for(const p of selected){const a={...actions[p.action]},op=p.batch6Operation,clips=[],events=[],moves=[],spine=[];let extra={};
 if(op==='ManualDesertElvenArchery'){
  for(const row of a.ProjectileInfo){const q=projectiles[row.Name];if(!q?.PresetName)throw Error('Missing materialized native archery projectile '+row.Name);projectiles[row.Name]={...q,HitBoxWidth:q.HitBoxWidth*(q.P2w??1),HitBoxHeight:q.HitBoxHeight*(q.P2w??1),PenetrateType:q.PenetrateType==='Enemy'?'All':q.PenetrateType};}const duration=options.heldDuration??2;
  const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),activeIds=new Set(native.heroOptionIds?.[hero]||[]),passive=activeIds.has(a.OptionId)&&Object.values(native.options||{}).find(o=>o.Id===a.OptionId&&o.IsSpecial),variants=[{held:false},{held:true},...(passive?[{held:true,enhanced:true}]:[])];
  for(const {held,enhanced}of variants){const period=a.ShootTerm/(enhanced?1+passive.AttackSpeedScale:1);const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const end=enhanced?passive.OptionDuration:held?duration:period,events=[],choices=[],recoils=[];for(let at=0;at<end-1e-8;at+=period){const sample=rng.nextFloat(),which=sample<=a.Probability?1:0,info=a.ProjectileInfo[which];choices.push({at,index:which,sample});if(!which)recoils.push({at,duration:.275,distance:.2,height:.2,angle:8});for(let col=0;col<info.Columns;col++)events.push({op:'projectile',at,index:which,offset:info.Offset,height:-.375,directional:true,directionAngle:(col-(info.Columns-1)/2)*info.SpreadAngle,nativePoolTransform:'directional'});}
   expanded.push({...p,behavior:'timeline',end,variantId:enhanced?'basic-role-enhanced':held?'basic-continuous':'basic-1',label:enhanced?'角色技后加速射击':held?'持续射击':p.label,disableCombo:true,sourceProjectilePools:true,clips:[{key:'action',at:0,track:'Upper',loop:true}],events,moves:[],spine:[],nativeAim:{bone:'b.aim',originHeight:0,windows:[{at:0,end}]},nativeShotChoices:choices,nativeRecoils:recoils,nativeCondition:enhanced?{afterAction:passive.BattleActionName,duration:passive.OptionDuration}:undefined,resolvedParameters:{action:{...a,AnimationInfo:a.AnimationInfo.map(r=>({...r,TargetDuration:period}))},presets:{}}});}
  continue;
 }else if(op==='RoleDesertArrow'){
  const option=options.exclusiveWeapon&&Object.values(native.options||{}).find(o=>o.Id===a.OptionId),projectile=option?.ProjName||a.ProjName,distance=Math.hypot(target[0]-initial[0],target[2]-initial[2]),speed=Math.min(a.DashSpeed,2*Math.max(0,a.DashPivotDist-distance)/a.DashDuration);
  a.ProjectileInfo=[{Name:projectile}];clips.push({key:'action',at:0,track:'Upper',loop:true});events.push(fx('jump',0,{anchor:'feet',directed:false}),{op:'projectile',at:a.ShootTiming,offset:0,height:-.375,followSpine:true,targetGround:true,nativePoolTransform:'directional'});spine.push({at:0,duration:a.DashDuration,height:1.5});if(speed)moves.push({op:'dash',at:0,duration:a.DashDuration,speed,sign:-1,free:true});extra.sourceProjectilePools=true;extra.nativeAim={bone:'b.aim',originHeight:0,windows:[{at:0,end:p.end}]};extra.roleDashSpeed=speed;
 }else if(op==='DancingArcherSupport'){
  extra.animationArrays=true;for(const [i,preset]of a.EffectPresetNames.entries())events.push({op:'effect',preset,at:a.EffectCreateTimings[i],anchor:'target',directed:false,nativePoolLifetime:true,nativePoolTransform:'direct',scale:(i?a.EffectScale2:a.EffectScale1)?.[0]??1,offsetVector:i?a.EffectOffset2:undefined});
  const q=projectiles[a.ProjName];for(const preset of [q.PresetName,...(q.ExtraPoolInfo||[]).map(r=>r.PresetName)].filter(Boolean))events.push({op:'effect',preset,at:0,anchor:'feet',directed:false,nativePoolTransform:'direct',until:q.Lifetime,link:{graphDirection:[0,0,0]}});
 }else if(op==='CwpDancingArcherDesertRain'){
  const jump=p.end*.333,fire=p.end*.556,land=p.end*.667;clips.push({key:'fire',at:fire,end:land},{key:'land',at:land});events.push(fx('action',0,{anchor:'feet',directed:false,follow:true,followSpine:true}),fx('fire',fire,{anchor:'feet',directed:false,follow:true,followSpine:true}),fx('screen',p.end,{screen:true,directed:false}),fx('area',p.end,{anchor:'targetGround',directed:false,triggerDisposeAt:p.end+a.AreaLifeTime}));spine.push({at:jump,duration:p.end*.667,height:2});extra.independentFieldEnd=p.end+a.AreaLifeTime;
 }else if(op==='AkayukiSlash'){
  const at=.048,dash=.2,reverse=!!a.IsReverse,right=options.direction==='right'||options.direction==='back',preset=reverse!==right?'Manual_KatanaSlash_Simple':'Manual_KatanaSlash_Simple_Flip';
  clips.push({animation:a.AnimationName,at:0,speed:a.AnimationDuration/.3});moves.push({op:'dash',at,duration:dash,speed:a.DashSpeed,stopOffset:.3});events.push({op:'effect',preset,at,anchor:'feet',offset:.25,fourWay:true,follow:true,nativePoolLifetime:true,nativePoolTransform:'directional'});
 }else if(op==='AkayukiBatto'){
  const at=.1,active=options.exclusiveWeapon&&Object.values(native.options||{}).find(o=>o.Id===a.OptionId);
  clips.push({animation:'katana_batto',at:0,end:at,speed:5},{animation:'katana_batto_end',at,speed:active?3.5:1},{animation:'[emo]sleep_deep',at,loop:true,track:'Emotion'});
  moves.push({op:'dash',at:.01,duration:.05,speed:120,free:true});
  events.push({op:'effect',preset:'FX_Dash_Smoke',at:0,anchor:'feet',directed:false,nativePoolLifetime:true,nativePoolTransform:'direct'},{op:'effect',preset:'FX_Dash_Trail',at:0,anchor:'feet',follow:true,until:at,nativePoolTransform:'directional'},{op:'effect',preset:'FX_Dash_Simple',at,anchor:'feet',nativePoolLifetime:true,nativePoolTransform:'directional'});
  if(active?.FinalSlashPreset)events.push({op:'effect',preset:active.FinalSlashPreset,at,offset:a.FrontOffset,anchor:'feet',nativePoolLifetime:true,nativePoolTransform:'directional'});
 }else if(op==='CwpAkayukiAkaoni'){
  const start=.55,duration=a.SlashTerm*3,rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);
  clips.push({key:'ready',at:0},{key:'ready',at:0,track:'Emotion'});events.push(fx('ready',0,{anchor:'feet',directed:false}));extra.alpha=[{at:0,value:1},{at:start,from:1,value:.2,duration:.25},{at:start+a.SlashDuration,from:.2,value:1,duration:a.ActionDuration-start-a.SlashDuration}];
  const center=add(initial,forward,a.Radius);
  for(let i=0;i<Math.trunc(a.SlashDuration/a.SlashTerm+1e-7);i++){
   const at=start+i*a.SlashTerm,angle=a.AngleList[i]*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),dir=[forward[0]*c+forward[2]*sn,0,forward[2]*c-forward[0]*sn],point=add(center,[(rng.nextFloat()-.5)*a.Radius*.7,0,(rng.nextFloat()-.5)*a.Radius*.7]),begin=add(point,dir,-a.Radius*1.5),end=add(point,dir,a.Radius*1.5),motion=[{time:at,position:begin},{time:at+duration,position:end}],post=a.PostfixList[i];
   events.push(fx('slash',at,{anchor:'feet',link:{graphPosition:point,graphDirection:dir}}));
   for(const key of ['oni'+post,'shadow'+post])events.push(fx(key,at,{anchor:'feet',directed:false,until:at+duration,link:{motionPath:motion,rootScaleX:dir[0]<0?-1:1}}));
  }
 }else if(op==='ManualKatanaSlash'){
  const at=a.ActionDuration*(a.AttackType==='Thrust'?.1:.16),dash=Math.floor((a.ActionDuration*.9-at)*10+1e-6)/10;
  clips.push({key:'action',at:0},{key:'slash',at});moves.push({op:'dash',at,duration:dash,speed:a.DashSpeed,stopOffset:.3,free:a.AttackType==='Thrust'});
  events.push(fx('slash',at,{offset:a.AttackType==='Thrust'?.3:.25,fourWay:a.AttackType!=='Thrust',follow:true}));
 }else if(op==='RoleHookTaunt'){
  const life=a.Range/30,start=Math.max(options.boundsSize?.[0]??.55,options.boundsSize?.[2]??.55)*.5+.5,center=add(initial,[0,.375,0]),at=a.HookTiming,toPath=[];
  for(let i=0;i<=24;i++){const elapsed=life*i/24;toPath.push({time:at+elapsed,position:add(center,forward,start+(a.Range-start)*(elapsed/life)**4)});}
  const hitDistance=Math.max(0,length(add(target,initial,-1))-(options.targetRadius??.275)),hitAt=at+life*Math.max(0,Math.min(1,(hitDistance-start)/(a.Range-start)))**.25,dead=length(add(target,initial,-1))<=a.Range?hitAt+.1:a.ActionDuration;
  toPath.push({time:dead,position:add(center,forward,hitDistance)});clips.push({key:'action',at:0,end:at},{key:'hook',at},{key:'hook',at,track:'Emotion'});
  events.push(fx('hook',at,{directed:false,until:dead}));hooks.push({action:p.action,toPath,center,dead});
  const active=options.exclusiveWeapon&&Object.values(native.options||{}).find(o=>o.Id===a.OptionId);
  if(active){a.PresetInfo=[...a.PresetInfo,...active.PresetInfo];events.push(fx('glow',at,{until:dead,link:{motionPath:toPath}}),fx('trail',at,{until:dead,link:{motionPath:toPath}}));if(length(add(target,initial,-1))<=a.Range)events.push(fx('explosion',hitAt,{anchor:'target',directed:false}));}
 }else if(op==='TankerSupport'){
  extra.animationArrays=true;for(const [i,key]of a.EffectPresetNames.entries())events.push({op:'effect',preset:key,at:a.EffectCreateTimings[i],anchor:a.EffectAnchors[i]==='Party'?'center':'target',follow:!!a.EffectFollowingTargets[i],directed:false,nativePoolLifetime:true,nativePoolTransform:'direct',scale:(i?a.EffectScale2:a.EffectScale1)?.[0]??1});
 }else if(op==='CwpAdmiral'){
  const timings=options.exclusiveWeapon?a.MainTiming:a.SubTiming,rangeAt=timings[0]/30,fireAt=timings[1]/30,rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);
  extra.end=Math.max(a.ActionDuration,fireAt);clips.push({key:options.exclusiveWeapon?'cwp':'cwpbackup',at:0});events.push(fx(options.exclusiveWeapon?'screen':'screenfallback',0,{screen:true,directed:false}),fx('range',rangeAt,{anchor:'feet',directed:false,follow:true}));
  const inRange=length(add(target,initial,-1))<=a.SearchRange;
  for(let i=0;i<a.LimitFire;i++){const radius=inRange?.2+rng.nextFloat()*.9:1+rng.nextFloat()*(a.SearchRange-1),angle=inRange?rng.nextFloat()*360:rng.nextFloat()*180*(i%2===1?180:0),r=angle*Math.PI/180,base=inRange?target:initial,position=add(base,[Math.sin(r)*radius,0,Math.cos(r)*radius]);events.push(fx('explosion',fireAt+i*a.FireTerm,{anchor:'feet',directed:false,link:{graphPosition:position}}));}
 }else continue;
 actions[p.action]=a;expanded.push({...p,behavior:'timeline',meleeTimeline:true,clips,events,moves,spine,...extra});
 }
 const modules=scriptActionModules(index,options,{...native,actions,projectiles},expanded,style);
 for(const m of modules){const p=expanded.find(p=>p.variantId===m.id||p.category===m.id),op=p?.batch6Operation;if(p?.nativeShotChoices){m.sourceTrace={operation:op,shots:p.nativeShotChoices,staminaConsumer:false,nativeCondition:p.nativeCondition};m.nativeCondition=p.nativeCondition;}
  if(op==='RoleDesertArrow'){const a=actions[p.action],side=Math.abs(forward[0])>=Math.abs(forward[2]);if(side)m.actor.spinePath=m.actor.spinePath.map(row=>({...row,angle:row.time<a.DashDuration?(forward[0]>0?360:-360)*(1-(1-row.time/a.DashDuration)**4):0}));m.sourceTrace={operation:op,dashSpeed:p.roleDashSpeed,shoot:a.ShootTiming,jumpHeight:1.5};}
  if(op==='CwpDancingArcherDesertRain'){const end=p.end,jump=end*.333,land=end*.667,sign=forward[0]<0?-1:1;const dir=Math.abs(forward[0])>=Math.abs(forward[2])?[Math.sign(forward[0]),0,0]:[forward[2]>0?1:-1,0,0];m.actor.directionPath=[{time:0,position:dir}];m.actor.spinePath=m.actor.spinePath.map(row=>({...row,angle:row.time<jump?0:row.time<land?sign*90*Math.min(1,(row.time-jump)/(end*.333)):row.time<end?sign*360*Math.min(1,(row.time-land)/(end*.222)):0}));m.sourceTrace={operation:op,jump,fire:end*.556,land,areaStart:end,areaEnd:end+actions[p.action].AreaLifeTime};}
 }


 for(const h of hooks){const m=modules.find(m=>m.id==='role');if(!m)continue;const track=m.tracks.find(t=>t.effect.preset===actions[h.action].PresetInfo.find(r=>r.Name==='hook').Preset),effect=track.effect,script=effect.scripts.find(s=>s.type==='HookShot'),chain=effect.nodes.find(n=>n.name==='chain'),head=effect.nodes.find(n=>n.name==='head');if(!script||!chain||!head)throw Error('Missing native HookShot source nodes');track.link.nativeHookFromTo={fromPath:[{time:0,position:h.center}],toPath:h.toPath,headNode:head.id,chainNode:chain.id,headLength:script.fields.HeadLength,chainUnitLength:script.fields.chainUnitLength,chainScale:[chain.scale.x,chain.scale.y,chain.scale.z],headScale:[head.scale.x,head.scale.y,head.scale.z],headOffset:head.position.z};}
 return modules;
}
