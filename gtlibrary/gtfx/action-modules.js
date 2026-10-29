import {interpretActionGraph,sampleGraphPath} from './graph-action.js';
import {profiles} from './character-link.js';
import {UnityRand} from './native-random.js';

// Interprets exported BattleStyle, BattleAction and Projectile records. Action
// exceptions are data in native-action-plans.json, rather than actor branches.
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(row=>row?.Name&&row?.Preset?[[row.Name,row.Preset]]:Object.entries(row||{}).filter(([,v])=>typeof v==='string')));
const duration=a=>a?.ActionDuration??a?.EndTiming??a?.Duration??1;
const clip=(r,start=0)=>({name:r.Animation,start,speed:r.Scale||1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})});
const travel=(speed,accel,range,life)=>Math.min(life,accel?(Math.sqrt(speed*speed+2*accel*range)-speed)/accel:range/speed);
// Lua random_util.get_random_value delegates to UnityEngine.Random.value.
// Sequence events share one draw for the projectile and all attached prefabs.
function sequenceRandoms(plan,action,rng){
 const rule=plan.randomSequence;if(!rule)return new Map();
 const rounds=list(action[rule.roundField]),steps=list(action[rule.stepField]),events=[],rows=new Map();
 rounds.forEach((at,ri)=>{events.push({at,ri,sync:true});steps.forEach((step,si)=>events.push({at:at+step,ri,si,sync:false}));});
 events.sort((a,b)=>a.at-b.at||Number(b.sync)-Number(a.sync)||b.ri-a.ri||(b.si||0)-(a.si||0));
 const angles=[];
 for(const event of events){
  if(event.sync){angles[event.ri]=rng()*360;continue;}
  const angle=(angles[event.ri]+event.si*rule.angleStep)*Math.PI/180;
  rows.set(event.ri+':'+event.si,{offset:[rule.radius*Math.cos(angle),0,rule.radius*Math.sin(angle)],side:1+rng()});
 }
 return rows;
}


export function actionModules(character,index,{targetDistance=6,appearance='',exclusiveWeapon=true,seed=12345,randomState=null,direction='right',weapon='',profile=profiles[character]}={},native={},plans={}){
 if(!profile)return [];
 const heroClass=native.heroClasses?.[appearance]||native.heroClasses?.[profile.defaultSkin];
 const useMyth=heroClass?.endsWith('_myth');
 const candidates=Object.values(native.styles||{}).filter(s=>s.Class===heroClass&&s.Weapon1===profile.weaponType&&s.ManualBattleActions?.length);
 const style=candidates.find(s=>s.Name===profile.nativeStyle)||candidates.sort((a,b)=>b.ManualBattleActions.length-a.ManualBattleActions.length)[0]||native.styles?.[profile.nativeStyle];
 if(!style)return [];
 const actions=native.actions||{},projectiles=native.projectiles||{};let rng;
 const effects=new Map(index.effects.filter(e=>!e.unavailable).flatMap(e=>[[e.preset,e],[e.assetName,e]]));
 const result=[];
 const put=(tracks,action,preset,at=0,link={})=>{const effect=effects.get(preset);if(effect)tracks.push({effect,at,link:{action:action.Name,end:duration(action),delay:0,anchor:'center',clips:[],...link}});};
 const make=(id,label,action,actor,build)=>{const stream=new UnityRand(seed);if(randomState)stream.setState(randomState);rng=()=>stream.nextFloat();const stateBefore=stream.getState(),tracks=[];build(tracks);if(tracks.length)result.push({id,label,actor,random:{implementation:'UnityEngine.Random',stateBefore,stateAfter:stream.getState()},duration:Math.max(actor.end,...tracks.map(t=>t.at+(t.link.fxEnd??t.link.delay+t.effect.duration))),tracks});};
 const pose=(action,key='action')=>{const rows=list(action.AnimationInfo),row=rows.find(r=>r.Name===key)||rows[0],c=row?clip(row):null;
  const rule=(plans[character]||[]).find(p=>p.augmentAction===action.Name);
  if(c&&rule?.clipSpeed)c.speed=rule.clipSpeed;
  if(c&&rule?.initialRate){c.initialRate=rule.initialRate;c.rateChange=(action[rule.rateChangeField]||0)+(rule.rateChangeOffset||0);}
  return {end:duration(action),clips:c?[c]:[]};};
 const spec=a=>projectiles[list(a.ProjectileInfo)[0]?.Name];
 const basic=(a,tracks,at=0)=>{
  const p=fields(useMyth&&a.MythPresetInfo||a.PresetInfo),kind=a.AttackType,projectile=spec(a),life=projectile?.Lifetime||0;
  const add=(key,delay,link={})=>p[key]&&put(tracks,a,p[key],at,{delay,...link});
  if(a.ProjName&&a.ShootFrame){
   add('action',0,{directed:false});
   const names=list(useMyth&&a.MythProjName||a.ProjName),angles=list(a.Angle),frames=list(a.ShootFrame),fps=native.frameRate||30;
   for(const [i,frame] of frames.entries()){
    const projectile=projectiles[names[i]||names[0]];if(!projectile)continue;
    const shot=frame/fps,angle=angles[i]||0,life=projectile.Lifetime||0,speed=projectile.Speed||0,accel=projectile.Accel||0;
    const motion={delay:shot,angle,anchor:'projectile',projectileSpeed:speed,projectileAccel:accel,projectileUnclamped:projectile.PenetrateType==='All',fxEnd:shot+life};
    if(projectile.ShootEffectPreset)put(tracks,a,projectile.ShootEffectPreset,at,{delay:shot,angle});
    if(projectile.PresetName)put(tracks,a,projectile.PresetName,at,motion);
    for(const extra of list(projectile.ExtraPoolInfo))if(extra.PresetName)put(tracks,a,extra.PresetName,at,motion);
    const hit=travel(speed,accel,targetDistance,life);
    if(projectile.HitPreset&&hit<life)put(tracks,a,projectile.HitPreset,at,{delay:shot+hit,anchor:'target'});
   }
   return;
  }
  if(['slash','whirl','throw'].includes(kind)){
   add('dash',a.DashTiming||0,{anchor:'feet',directed:false});add('slash',a.AttackTiming||0,{rotationType:'Slash',offset:a.Offset||0});add('flame',a.AttackTiming||0);return;
  }
  if(kind==='hook'){
   const hookLife=a.LifeTime||0,hookSpeed=a.Speed||0,hookStart=.5,hookMax=hookSpeed*hookLife;
   const end=(a.ShootTiming||0)+hookLife+(a.DashDuration||0);
   const motion={hookLife,hookSpeed,hookStart,hookShootTiming:a.ShootTiming||0,hookMax};
   add('hook',a.ShootTiming||0,{...motion,hook:true,hideWeaponUntil:duration(a),fxEnd:end});
   add('trail',a.ShootTiming||0,{...motion,anchor:'hook',hideWeaponUntil:duration(a),fxEnd:(a.ShootTiming||0)+hookLife});
   for(const plan of plans[character]||[])if(plan.augmentAction===a.Name)for(const e of plan.events)put(tracks,a,e.preset,at,{...motion,delay:a.ShootTiming||0,anchor:e.anchor||'hook',fxEnd:(a.ShootTiming||0)+hookLife});
   add('explosion',a.LifeTime,{anchor:'target',directed:false});add('dash',a.LifeTime,{anchor:'feet',directed:false});return;
  }
  if(kind==='shoot'||kind==='cross'){
   const launch=kind==='cross'?.5:1,speed=projectile?.Speed||0,accel=projectile?.Accel||0;
   const flight=travel(speed,accel,Math.max(0,targetDistance-launch),life);
   // ManualMilkywayGirlBattleAction.get_shoot_angle uses a projected
   // half-unit muzzle offset and another half unit behind the target.
   const angleRange=Math.max(0,targetDistance-Math.cos((a.ShootAngle||0)*Math.PI/180)*.5+.5);
   const angleFlight=travel(speed,accel,angleRange,life);
   const crossAngle=Math.min(a.ShootAngle||0,angleFlight*(projectile?.HomingAngularSpeed||0)/2);
   if(kind==='shoot')add('cast',.06,{offset:.5,directed:false});
   for(const [i,t] of list(a.ShootTiming).entries())for(const sign of kind==='shoot'?[0,1,-1]:[i%2?-1:1]){
    const angle=sign*(kind==='cross'?crossAngle:a.ShootAngle||0);
    const motion={angle,anchor:'projectile',offset:kind==='cross'?0:launch,projectileSpeed:speed,projectileAccel:accel,homingAngularSpeed:projectile?.HomingAngularSpeed||0,fxEnd:t+flight};
    if(kind==='cross'){motion.projectileOriginAngle=sign*60;motion.projectileOriginDistance=.5;}
    if(kind==='cross')add('cast',t,{angle:sign*60,offset:.5,directed:false});
    if(projectile?.PresetName)put(tracks,a,projectile.PresetName,at,{...motion,delay:t});
    for(const e of list(projectile?.ExtraPoolInfo))if(e.PresetName)put(tracks,a,e.PresetName,at,{...motion,delay:t});
    if(projectile?.ExpirePreset)put(tracks,a,projectile.ExpirePreset,at,{...motion,delay:t+flight,projectileElapsed:flight,fxEnd:t+flight+1});
    if(projectile?.HitPreset)put(tracks,a,projectile.HitPreset,at,{delay:t+flight,anchor:'target'});
   }return;
  }
  const variant=profile.nativeVariantByAppearance?.[appearance]||'attack';
  const rule=(plans[character]||[]).find(p=>p.augmentAction===a.Name);
  const option=Object.values(native.options||{}).find(o=>o.Id===a.OptionId);
  add(variant,0,{referenceDirection:[1,0,0],mirrorZForLeft:true,offset:rule?.fxOffset||0,
   scaleFactor:1+(exclusiveWeapon?option?.ScaleFactorAdd||0:0)});
 };
 const heroOptions=native.heroOptionIds?.[appearance]||native.heroOptionIds?.[profile.defaultSkin]||[];
 const weaponInfo=native.weapons?.[weapon||profile.weaponByAppearance?.[appearance]||profile.weapon];
 const graphOptions={targetDistance,direction,exclusiveWeapon,optionIds:[...heroOptions,...(exclusiveWeapon?weaponInfo?.optionIds||[]:[])]};
 const graphAction=(a,extra={})=>{const graph=native.graphs?.[a?.GraphName];if(!graph)throw Error('Missing action graph: '+a?.GraphName);return interpretActionGraph(graph,index,{...graphOptions,...extra});};
 const graphBasics=(style.ManualBattleActions||[]).map(n=>actions[n]).filter(a=>a?.Name.startsWith('GraphCombo:'));
 for(const [i,a] of graphBasics.entries())result.push({id:`basic-${i+1}`,label:`普攻第 ${i+1} 段`,...graphAction(a)});
 if(graphBasics.length>1){
  let time=0,position=[0,0,0];const tracks=[],clips=[],path=[],traces=[];
  for(const a of graphBasics){const m=graphAction(a,{initialPosition:position});
   tracks.push(...m.tracks.map(t=>({...t,at:time})));
   clips.push(...m.actor.clips.map(c=>({...c,start:c.start+time,end:(c.end??m.actor.end)+time})));
   path.push(...m.actor.graphPath.filter(p=>p.time<=m.actor.end+1e-9).map(p=>({...p,time:p.time+time})));
   position=sampleGraphPath(m.actor.graphPath,m.actor.end);traces.push(m.graphTrace);time+=m.actor.end;
  }
  result.push({id:'basic-combo',label:'普攻连贯',actor:{end:time,clips,graphPath:path},tracks,duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd)),graphTrace:traces});
 }
 const graphRoles=(style.ManualBattleActions||[]).map(n=>actions[n]).filter(a=>a?.Name.startsWith('GraphRole:'));
 const graphSupports=Object.values(actions).filter(a=>a.Name.startsWith('GraphSupport:'));
 for(const [id,label,rows] of [['role','角色技能',graphRoles],['support','连锁技能',graphSupports],['cwp','专武技能',exclusiveWeapon&&weaponInfo?.action?[actions[weaponInfo.action]].filter(a=>a?.GraphName):[]]]){
  rows.forEach((a,i)=>result.push({id:id+(i?'-'+i:''),label,...graphAction(a)}));
 }
 const basics=(style.ManualBattleActions?.length?style.ManualBattleActions:style.BattleActions||[]).filter(n=>n.startsWith('Manual')).map(n=>actions[n]).filter(Boolean);
 for(const [i,a] of basics.entries())make(`basic-${i+1}`,`普攻第 ${i+1} 段`,a,pose(a,['shoot','cross'].includes(a.AttackType)?'cast':'action'),tracks=>basic(a,tracks));
 if(basics.length>1){
  const starts=[];let time=0;for(const a of basics){starts.push(time);time+=duration(a);}
  const actor={end:time,clips:basics.flatMap((a,i)=>pose(a,['shoot','cross'].includes(a.AttackType)?'cast':'action').clips.map(c=>({...c,start:starts[i]})))};
  make('basic-combo','普攻连贯',basics[0],actor,tracks=>basics.forEach((a,i)=>basic(a,tracks,starts[i])));
 }
 if(basics.length===1){
  const repeat=(plans[character]||[]).find(p=>p.augmentAction===basics[0].Name&&p.repeatInterval);
  if(repeat){const a=basics[0],actor=pose(a);actor.end=repeat.repeatInterval*2;
   make('basic-loop','普攻连贯',a,actor,tracks=>{basic(a,tracks);for(const t of tracks)t.link.fxEnd=repeat.repeatInterval;basic(a,tracks,repeat.repeatInterval);});
  }
 }
 // Plans only identify source fields and Lua event kinds. All clock values,
 // projectile physics, prefabs and clips are resolved from native records.
  for(const plan of plans[character]||[]){
  if(plan.augmentAction||result.some(m=>m.id===plan.id))continue;
  if(plan.requiredClass&&heroClass!==plan.requiredClass)continue;
  if(plan.mythOnly&&!useMyth||plan.normalOnly&&useMyth)continue;
  if(plan.exclusive&&!exclusiveWeapon)continue;
  const action=actions[plan.action];if(!action)continue;
  if(plan.sourceArrays){
   const names=list(useMyth&&action.MythEffectPresetNames||action.EffectPresetNames);
   const actor={end:duration(action),clips:list(action.AnimationKeys).map((name,i)=>({name,start:list(action.AnimationTimings)[i]||0,speed:list(action.AnimationTimeScales)[i]||1,loop:!!list(action.AnimationLoops)[i]}))};
   make(plan.id,plan.label,action,actor,tracks=>names.forEach((preset,i)=>put(tracks,action,preset,0,{
    delay:list(action.EffectCreateTimings)[i]||0,
    anchor:list(action.EffectAnchors)[i]==='Target'?'target':'center',directed:false
   })));
   continue;
  }
  const p={...fields(useMyth&&action.MythPresetInfo||action.PresetInfo),...fields(native.options?.[plan.option]?.PresetInfo)};
  const variants=plan.variantByAppearance?[plan.variantByAppearance[appearance]]:plan.variants||[null];
  for(const variant of variants){
   if(plan.variantByAppearance&&variant==null)continue;
   const actor=pose(action,(plan.animation||'cast').replace('{variant}',String(variant)));
   if(plan.actorClips)actor.clips=plan.actorClips.map(c=>{const r=list(action.AnimationInfo).find(a=>a.Name===c.key.replace('{variant}',String(variant)));return r?clip(r,(c.atField?list(action[c.atField])[0]||0:c.at||0)+(c.atOffset||0)):null;}).filter(Boolean);
   if(plan.endField)actor.end=action[plan.endField];
   if(plan.endSumFields)actor.end=plan.endSumFields.reduce((sum,key)=>sum+(action[key]||0),0);
   make(plan.id+(variant==null?'':`-${variant}`),plan.label+(variant==null?'':' · '+variant),action,actor,tracks=>{
    const sequence=sequenceRandoms(plan,action,rng);
    for(const e of plan.events){
     if(e.minVariant!=null&&variant<e.minVariant)continue;
     const key=e.key?.replace('{variant}',String(variant)),shot=spec(action);
     const preset=p[key]||e.preset?.replace('{variant}',String(variant))||(e.projectileKey==='body'?shot?.PresetName:e.projectileKey==='trail'?list(shot?.ExtraPoolInfo)[0]?.PresetName:null);if(!preset)continue;
     const rounds=e.repeatField?list(action[e.repeatField]):[0];
     for(const [ri,round] of rounds.entries()){
      for(const [si,step] of (e.stepField?list(action[e.stepField]):[0]).entries()){
       const frame=e.phaseFrameField?list(action[e.phaseFrameField])[e.phaseIndex||0]/(native.frameRate||30):0;
       const delay=(e.phaseField?list(action[e.phaseField])[e.phaseIndex||0]||0:e.phase||0)+frame+round+step;
       const link={delay,anchor:e.anchor||'center',directed:e.directed??true};
       if(e.targetGround)link.targetGround=true;
       if(e.screen)link.screen=true;
       const random=sequence.get(ri+':'+si);
       if(e.orbit&&random){link.orbitOffset=random.offset;link.targetGround=true;}
       if(e.projectile){const shot=spec(action);Object.assign(link,{anchor:'meteor',meteorHeight:action.DropHeight,meteorSide:random?.side??1,projectileSpeed:shot?.Speed||0,fxEnd:delay+(shot?.Lifetime||.1)});}
       if(e.fly){Object.assign(link,{anchor:'projectile',offset:action.EnergyBallDistance||0,projectileSpeed:action.EnergyBallSpeed||0,projectileUnclamped:true,fxEnd:delay+(action.AttackDuration||1)});}
       if(e.offsetField)link.offset=action[e.offsetField];
       if(e.fxEndField)link.fxEnd=action[e.fxEndField];
       put(tracks,action,preset,0,link);
      }
     }
    }
   });
  }
 }
 return result;
}
