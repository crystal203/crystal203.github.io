import {batch6CActionModules} from './source-batch6-c.js';
import {batch6AActionModules} from './source-batch6-a.js';
import {batch6BActionModules} from './source-batch6-b.js';
import {batch6RootActionModules} from './source-batch6-root.js';
import {batch5DActionModules} from './source-batch5-d.js';
import {batch5CActionModules} from './source-batch5-c.js';
import {batch5AActionModules} from './source-batch5-a.js';
import {batch5BActionModules} from './source-batch5-b.js';
import {batch4RangedActionModules} from './source-batch4-ranged.js';
import {batch4MeleeActionModules} from './source-batch4-melee.js';
import {batch4SpecialActionModules} from './source-batch4-special.js';
import {batch4RootActionModules} from './source-batch4-root.js';
import {batch3RangedActionModules} from './source-batch3-ranged.js';
import {batch3SupportActionModules} from './source-batch3-support.js';
import {batch3MeleeActionModules} from './source-batch3-melee.js';
import {batch3RootActionModules} from './source-batch3-root.js';
import {effectLookup} from './effect-lookup.js';
import {buildNativeWeaponActions} from './native-weapon-actions.js';
import {nativeForAppearance} from './character-catalog.js';
import {nativeForWeapon} from './weapon-hero-variants.js';
import {selectedWeaponPlans} from './equipment-selection.js';
import {resolveNativeManagerStyle} from './native-manager-operations.js';
import {orbitCardActionModules} from './native-orbit-cards.js';
import {graphStaminaMagazine} from './graph-preview-helpers.js';
import {summonActionModules} from './summon-actions.js';
import {equipmentStyle} from './equipment-options.js';
import {expandManagedStyle} from './managed-actions.js';
import {applyCostumeOverrides} from './costume-overrides.js';
import {scriptActionModules} from './script-actions.js';
import {sourceProjectileModules} from './script-projectile-patterns.js';
import {projectileActionModules} from './projectile-actions.js';
import {targetPosition as resolveTarget,selectActionTargets} from './targeting.js';
import {interpretActionGraph,sampleGraphPath} from './graph-action.js';
import {profiles} from './character-link.js';
import {UnityRand} from './native-random.js';
import {skyBarrageActionModules} from './native-sky-barrage.js';
import {nativeSoundWaveActionModules} from './native-soundwave-actions.js';
import {nativeAreaActionModules} from './native-area-actions.js';
import {nativeFirearmActionModules} from './native-firearm-actions.js';
import {foxBeadActionModules} from './native-foxbead-actions.js';
import {fanActionModules} from './native-fan-actions.js';
import {propRushActionModules} from './native-prop-rush.js';
import {continuousArsenalActionModules} from './native-continuous-arsenal.js';
import {reindeerActionModules} from './source-reindeer-actions.js';
import {batch2ContinuousActionModules} from './source-batch2-continuous.js';
import {batch2MeleeActionModules} from './source-batch2-melee.js';
import {batch2ProjectileMeleeActionModules} from './source-batch2-projectile-melee.js';

// Interprets exported BattleStyle, BattleAction and Projectile records. Action
// exceptions are data in native-action-plans.json, rather than actor branches.
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(row=>row?.Name&&row?.Preset?[[row.Name,row.Preset]]:Object.entries(row||{}).filter(([,v])=>typeof v==='string')));
const duration=a=>a?.ActionDuration??a?.EndTiming??a?.Duration??1;
const clip=(r,start=0)=>({name:r.Animation,start,speed:r.Scale??1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})});
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


export function actionModules(character,index,{nativeManagerMode=null,targetDistance=6,targetPosition=null,secondaryTargets=[],appearance='',heroAppearance='',exclusiveWeapon=true,weaponEquipped=true,shield,summoned=true,summonPosition=null,summonDirection='auto',seed=12345,randomState=null,choiceOverrides={},buffScores={},direction='right',weapon='',profile=profiles[character]}={},native={},plans={}){
 if(!profile)return [];
 const sourceNative=nativeForAppearance(native,appearance,heroAppearance);if(sourceNative!==native){native=sourceNative;plans={...plans,[character]:native.plans};}
 native=nativeForWeapon(native,heroAppearance||appearance||profile.defaultSkin,weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,exclusiveWeapon);
 plans={...plans,[character]:selectedWeaponPlans(native,plans[character]||[],weapon||profile.weaponByAppearance?.[appearance]||profile.weapon)};
 native=applyCostumeOverrides(native,appearance);heroAppearance=heroAppearance||appearance;
 const targeting={targetDistance,targetPosition,secondaryTargets};
 const point=resolveTarget(targeting,direction);targetDistance=Math.hypot(point[0],point[2]);
 const heroClass=native.heroClasses?.[heroAppearance]||native.heroClasses?.[profile.defaultSkin];
 const useMyth=heroClass?.endsWith('_myth');
 const managerStyle=resolveNativeManagerStyle(native,equipmentStyle(native,profile,heroAppearance,weaponEquipped,shield),{...targeting,targetDistance,heroAppearance,appearance,exclusiveWeapon,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,direction,profile,nativeManagerMode},plans[character]||[]);
 const style=expandManagedStyle(native,managerStyle,{buffScores});
 if(!style)return [{id:'idle',label:'待机',actor:{end:1,clips:[]},duration:1,tracks:[]}];
 const actions=native.actions||{},projectiles=native.projectiles||{};let rng;
 const effects=effectLookup(index.effects);
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
  const p=({...fields(a.PresetInfo),...(useMyth?fields(a.MythPresetInfo):{})}),kind=a.AttackType,projectile=spec(a),life=projectile?.Lifetime||0;
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
 const heroOptions=native.heroOptionIds?.[heroAppearance]||native.heroOptionIds?.[profile.defaultSkin]||[];
 const weaponInfo=native.weapons?.[weapon||profile.weaponByAppearance?.[appearance]||profile.weapon];
 const graphOptions={targetDistance,targetPosition,secondaryTargets,direction,exclusiveWeapon,ownerElement:native.heroElements?.[heroAppearance]??native.heroElements?.[profile.defaultSkin],optionIds:[...heroOptions,...(exclusiveWeapon?weaponInfo?.optionIds||[]:[])]};
 const graphAction=(a,extra={})=>{const graph=native.graphs?.[a?.GraphName];if(!graph)throw Error('Missing action graph: '+a?.GraphName);return interpretActionGraph(graph,index,{...graphOptions,action:a,native,...extra});};
 const graphBasics=(style.ManualBattleActions||[]).map(n=>actions[n]).filter(a=>a?.GraphName&&!/^(GraphRole|GraphSupport|GraphTrigger|GraphMyth):/.test(a.Name));
 for(const [i,a] of graphBasics.entries()){result.push({id:`basic-${i+1}`,label:`普攻第 ${i+1} 段`,...graphAction(a)});if(a.Name.startsWith('GraphStamina:'))result.push({id:'basic-break',label:'弹匣终结攻击',...graphAction(a,{breakAttack:true})});}

 // GraphStamina consumes the native character pool, independently of weapon MagazineSize.
 for(const a of graphBasics.filter(a=>a.Name.startsWith('GraphStamina:'))){
  const magazine=graphStaminaMagazine(extra=>graphAction(a,extra),native.battleDefaults?.maxStamina??200);
  if(magazine)result.push(magazine);
 }
 if(graphBasics.length>1){
  let time=0,position=[0,0,0];const tracks=[],clips=[],path=[],spinePath=[],traces=[];
  for(const a of graphBasics){const m=graphAction(a,{initialPosition:position});
   tracks.push(...m.tracks.map(t=>({...t,at:time+t.at})));
   clips.push(...m.actor.clips.map(c=>({...c,start:c.start+time,end:(c.end??m.actor.end)+time})));
   path.push(...m.actor.graphPath.filter(p=>p.time<=m.actor.end+1e-9).map(p=>({...p,time:p.time+time})));
   spinePath.push(...(m.actor.spinePath||[]).map(p=>({...p,time:p.time+time})));
   position=sampleGraphPath(m.actor.graphPath,m.actor.end);traces.push(m.graphTrace);time+=m.actor.end;
  }
  result.push({id:'basic-combo',label:'普攻连贯',actor:{end:time,clips,graphPath:path,spinePath},tracks,duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd)),graphTrace:traces});
 }
 const installedActions=Object.values(native.options||{}).filter(o=>graphOptions.optionIds.includes(o.Id)).map(o=>o.BattleActionName);
 const graphRoles=[...new Set([...(style.ManualBattleActions||[]),...installedActions])].map(n=>actions[n]).filter(a=>a?.Name.startsWith('GraphRole:'));
 const graphSupports=Object.values(actions).filter(a=>a.Name.startsWith('GraphSupport:'));
 const graphMyths=useMyth?Object.values(actions).filter(a=>a.Name.startsWith('GraphMyth:')):[];
 for(const [id,label,rows] of [['role','角色技能',graphRoles],['support','连锁技能',graphSupports],['myth','开花技能',graphMyths],['cwp','专武技能',exclusiveWeapon&&weaponInfo?.action?[actions[weaponInfo.action]].filter(a=>a?.GraphName):[]]]){
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
  if(plan.behavior||plan.augmentAction||result.some(m=>m.id===plan.id))continue;
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
  const p={...fields(action.PresetInfo),...(useMyth?fields(action.MythPresetInfo):{}),...fields(native.options?.[plan.option]?.PresetInfo)};
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
       const frame=e.phaseFrameField?(list(action[e.phaseFrameField])[e.phaseIndex||0]??0)/(native.frameRate||30):0;
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
       if(link.anchor==='target'&&action.LimitTarget>1){for(const p of selectActionTargets(action,targeting,direction))put(tracks,action,preset,0,{...link,targetPosition:p});}
       else put(tracks,action,preset,0,link);
      }
     }
    }
   });
  }
 }
 const orbit=orbitCardActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const nativeWeapons=buildNativeWeaponActions(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,style);
 const sky=skyBarrageActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[]);
 const areas=nativeAreaActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const firearms=nativeFirearmActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const arsenals=continuousArsenalActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch3Ranged=batch3RangedActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch3Support=batch3SupportActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch3Melee=batch3MeleeActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch5C=batch5CActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch5D=batch5DActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch6C=batch6CActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch6A=batch6AActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch6B=batch6BActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch6Root=batch6RootActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch5A=batch5AActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch5B=batch5BActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch4Ranged=batch4RangedActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch4Melee=batch4MeleeActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch4Special=batch4SpecialActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch4Root=batch4RootActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch3Root=batch3RootActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch2Continuous=batch2ContinuousActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch2Melee=batch2MeleeActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const batch2ProjectileMelee=batch2ProjectileMeleeActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const reindeer=reindeerActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const props=propRushActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const fans=fanActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const foxbeads=foxBeadActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const soundwaves=nativeSoundWaveActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const sourced=sourceProjectileModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const scripted=scriptActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const typed=projectileActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,weapon:weapon||profile.weaponByAppearance?.[appearance]||profile.weapon,profile},native,plans[character]||[],style);
 const moduleIds=new Set(),combined=[...batch6C,...batch6A,...batch6B,...batch6Root,...batch5D,...batch5C,...batch5A,...batch5B,...batch4Ranged,...batch4Melee,...batch4Special,...batch4Root,...batch3Ranged,...batch3Support,...batch3Melee,...batch3Root,...batch2ProjectileMelee,...batch2Melee,...batch2Continuous,...arsenals,...reindeer,...props,...fans,...foxbeads,...firearms,...areas,...soundwaves,...sky,...orbit,...nativeWeapons,...sourced,...scripted,...typed,...result].filter(m=>{if(moduleIds.has(m.id))return false;moduleIds.add(m.id);return true;}).map(m=>({...m,actor:{...m.actor,idleAnimation:style.CustomIdle??profile.idleAnimation}}));
 // A preview exposes both executable native distance branches in one menu.
 // Automatic play still uses the actual distance; explicit alternatives retain
 // their source distance condition and never replace the normal branch.
 const switchable=style.nativeManagers?.find(s=>s.plan.nativeManager.operation==='distanceMagazine'&&s.parameters);
 if(!nativeManagerMode&&switchable){
  const branch=switchable.active?'melee':'ranged',alternatives=actionModules(character,index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,weaponEquipped,shield,summoned,summonPosition,summonDirection,seed,randomState,choiceOverrides,buffScores,weapon,profile,nativeManagerMode:branch},native,plans);
  for(const m of alternatives.filter(m=>/^basic(?:-|$)/.test(m.id)))combined.push({...m,id:'basic-'+branch+'-'+m.id.replace(/^basic-?/,''),label:branch==='melee'?'近战 · '+m.label:m.label,nativeCondition:{...m.nativeCondition,branch,distance:switchable.threshold,comparison:branch==='melee'?'at-most':'greater-than'}});
 }
 return summonActionModules(index,{...targeting,appearance,heroAppearance,direction,exclusiveWeapon,summoned,summonPosition,summonDirection,seed,weapon,profile},native,plans[character]||[],combined);
}
