import {sourceProjectileModules} from './script-projectile-patterns.js';
import {scriptActionModules} from './script-actions.js';
// The weak-jab native branch plays the attack immediately, stretched to
// ActionDuration-.05, rather than the separate boong_attack_ready animation.
export function batch5CActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-batch5-c'&&p.batch5Operation==='native-weak-deathfist');
 if(!selected.length)return commonWeaponSkillModules(index,options,native,plans,style);

 const actions={...native.actions},expanded=[];
 for(const p of selected){
  const a=native.actions[p.action],targetDuration=a.ActionDuration-.05000000074505806;
  if(!(a.ActionDuration-a.StayDuration-.05000000074505806<p.nativeJabDuration))throw Error('Unsupported native DeathFist animation branch');
  const eventAt=p.nativeJabSfxTime/p.nativeJabDuration*targetDuration;
  actions[p.action]={...a,__deathFistAttackDuration:targetDuration,AnimationInfo:[{Name:'attack',Animation:a.AnimationName,TargetDuration:targetDuration},{Name:'emotion',Animation:'[emo]'+a.EmotionName}]};
  expanded.push({...p,behavior:'timeline',meleeTimeline:true,
   clips:[{key:'attack',at:0,targetDurationField:'__deathFistAttackDuration',track:'Upper'},{animation:'[emo]'+a.EmotionName,at:eventAt,loop:true,track:'Emotion'}],
   moves:[{op:'dash',at:a.DashStartWithStay===false?0:a.StayDuration,duration:a.DashDuration,speed:a.DashDistanceCap/a.DashDuration,stopOffset:a.NoDashDistance??.15000000596046448}],
   events:[{op:'effect',preset:'fx_m_gauntlet_dash',at:0,anchor:'feet',follow:true,directed:true,nativePoolTransform:'directional',nativePoolLifetime:true,spineEvent:{animationKey:'attack',nameField:'SpineEventName',targetDurationField:'__deathFistAttackDuration'}}],spine:[]});
 }
 const modules=scriptActionModules(index,options,{...native,actions},expanded,style);
 for(const m of modules)m.sourceTrace={operation:'native-weak-deathfist',animationBranch:'attack-duration-over-remaining-window',sourceJabDuration:selected[0].nativeJabDuration,sourceSfxTime:selected[0].nativeJabSfxTime,attackTargetDuration:native.actions[selected[0].action].ActionDuration-.05000000074505806,callback:'actual native Spine sfx',movement:'native manual MeleeShortDash, source maxSpeed=DashDistanceCap/DashDuration; default DashStartWithStay=true; standard deceleration'};
 return [...modules,...commonWeaponSkillModules(index,options,native,plans,style)];
}

function commonWeaponSkillModules(index,options,native,plans,style){
 const weapon=native.weapons?.[options.weapon],plan=plans.find(p=>p.behavior==='source-batch5-c'&&p.category==='cwp'&&p.action===weapon?.action);
 if(!plan)return [];
 const raw=native.actions[plan.action];let a,projectiles={...native.projectiles},shots=[],clips=[],end,trace={operation:plan.batch5Operation},recoils=[];
 if(plan.batch5Operation==='native-machinegun-arrow'){
  const level=options.weaponSkillLevel??1,rank=level-1,value=key=>raw[key+'Base']+rank*(raw[key+'Add']||0),period=value('ShootCycle'),columns=value('Columns'),spread=value('SpreadAngle'),projectile=native.projectiles.machinegun_arrow;
  if(!projectile)throw Error('Missing fixed native MachineGunArrow projectile');end=value('ShootDuration');
  a={...raw,ProjectileInfo:[{Name:'machinegun_arrow'}],AnimationInfo:[{Name:'shoot',Animation:'bow_attack',Loop:true,TargetDuration:period}],EmotionInfo:[{Name:'emotion',Animation:'[emo]mad',Loop:true}]};
  for(let round=1;round*period<end-1e-9;round++){const at=Math.max(.15000000596046448,round*period);for(let column=0;column<columns;column++)shots.push({at,index:0,offset:.5,angle:(column-(columns-1)/2)*spread,muzzle:false});recoils.push({at,distance:.07,height:0,duration:.2,angle:0});}
  clips=[{key:'shoot',start:0,track:'Upper'},{key:'emotion',start:0,track:'Emotion'}];trace={...trace,period,columns,spread,rounds:shots.length/columns,fixedProjectile:'machinegun_arrow',shootOffset:.5};
 }else if(plan.batch5Operation==='native-bombbullet-sequence'){
  const child=native.actions[raw.BattleActionSequence[0]];if(!child)throw Error('Missing native BombBullet sequence child');const presets=Object.fromEntries(child.PresetInfo.map(p=>[p.Name,p.Preset])),name='native-sequence:'+child.Name;
  projectiles[name]={Name:name,Speed:child.Speed,Lifetime:child.LifeTime,HitBoxWidth:child.Size[0],PenetrateType:'None',PresetName:presets.shoot,ExtraPoolInfo:[{PresetName:presets.trail}],Exploding:true,ExplosionPreset:presets.explosion};
  a={...child,Name:raw.Name,ProjectileInfo:[{Name:name}]};end=child.ActionDuration;shots=[{at:child.PrepareDuration,index:0,offset:child.ShootOffset??0,muzzle:false}];clips=[{key:'ready',start:0,track:'Base'}];trace={...trace,child:child.Name,prepare:child.PrepareDuration,speed:child.Speed,lifetime:child.LifeTime,collisionSize:child.Size,explosionRadius:child.ExplosionRadius,sourceStage:'Native linear missile with source-sized collision against preview target; one hit/expiry explosion'};
 }else return [];
 const p={...plan,behavior:'source-projectile-pattern',pattern:'scheduled-projectiles',exclusive:false,end,shots,clips,recoils,events:[]},synthetic={...native,actions:{...native.actions,[plan.action]:a},projectiles};
 const modules=sourceProjectileModules(index,options,synthetic,[p],style);for(const m of modules){m.sourceTrace={...m.sourceTrace,...trace};for(const t of m.tracks){const path=t.link.motionPath;if(path?.length>1){const delta=path[1].position.map((x,i)=>x-path[0].position[i]),length=Math.hypot(...delta);if(length)t.link.graphDirection=delta.map(x=>x/length);}}}return modules;
}

