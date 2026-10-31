import {effectLookup} from './effect-lookup.js';
import {buildSourceMines,buildSourceBombs} from './source-mine-entities.js';
import {targetPositions,aimDirection} from './targeting.js';
import {createHomingTrajectory} from './native-projectile.js';
import {sampleNativeRecoil} from './native-character-motion.js';
import {UnityRand} from './native-random.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k),length=v=>Math.hypot(...v);
const unit=v=>{const n=length(v);return n?v.map(x=>x/n):[1,0,0];};
const rotate=(v,degrees)=>{const r=degrees*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};

// Contracts are recovered from Lua source operations. No character names are
// used to select an action, animation, entity, trajectory or timing here.
export function sourceProjectileModules(index,options,native,plans,style){
 const effects=effectLookup(index.effects);
 const hero=options.heroAppearance||options.appearance||options.profile.defaultSkin;
 const weapon=native.weapons?.[options.weapon]||{};
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const myth=(native.heroClasses?.[hero]||'').endsWith('_myth'),basics=(style.ManualBattleActions||[]).filter(n=>n.startsWith('Manual'));
 const result=[];
 function build(inputPlan,rounds=1,isBreak=false,variant='normal',actorStart){
  let plan={...inputPlan};const original=native.actions[plan.action];let a={...original};
  const special=list(original.OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).find(o=>o?.IsSpecial),specialMyth=special&&ids.has(special.MythOptionId)?byId.get(special.MythOptionId):null;
  if(plan.bonus&&variant==='bonus'){
   a={...a,...special,...specialMyth,AnimationInfo:[...list(a.AnimationInfo),...list(special?.AnimationInfo)]};
   plan={...plan,end:a.ActionDuration,magazine:null,staminaCost:0,mythProjectileSource:'none',aimOffsets:plan.bonus.aimOffsets,
    clips:[{key:plan.bonus.castAnimation,fallbackKey:'cast_fallback',track:'Base',start:0,end:a.ShootTiming},{key:plan.bonus.shootAnimation,fallbackKey:'shoot_fallback',track:'Base',start:a.ShootTiming}],
    shots:[{at:a.ShootTiming,index:0}],recoilByFacing:Object.fromEntries(Object.entries(plan.bonus.recoilByFacing).map(([k,v])=>[k,{...v,at:a.ShootTiming}])),
    sourceMoves:[{at:a.ShootTiming,duration:original.DashDuration,speed:original.DashSpeed,sign:-1}]};
  }
  let presets=fields(a.PresetInfo);
  const overrides=list(a.MythOptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(Boolean);
  if(overrides.length&&plan.mythProjectileSource==='action-field')a.ProjectileInfo=a.MythProjectileInfo;
  for(const o of overrides)for(const key of plan.mythParameterFields||[])if(o[key]!=null)a[key]=o[key];
  if(overrides.length&&plan.mythPresetSource==='action')presets={...presets,...fields(a.MythPresetInfo)};
  if(plan.mythProjectileSource==='option')for(const o of overrides)if(o.ProjectileInfo)a.ProjectileInfo=o.ProjectileInfo;
  // parse_action_and_myth_param consumes the ACTION's MythPresetInfo.
  // A separate source call applies active non-special weapon option presets.
  const weaponOptions=['active-non-special-option','active-option','active-special-option'].includes(plan.optionPresetSource)?list(original.OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).filter(o=>o&&(plan.optionPresetSource==='active-option'||plan.optionPresetSource==='active-special-option'&&o.IsSpecial||plan.optionPresetSource==='active-non-special-option'&&!o.IsSpecial)):[];
  for(const o of weaponOptions)presets={...presets,...fields(o.PresetInfo)};
  if(plan.mythOptionPresetSource==='special-option'&&specialMyth)presets={...presets,...fields(specialMyth.PresetInfo)};
  if(plan.mythOptionPresetSource==='cwp-option')for(const o of overrides.filter(o=>o.IsCwpOption))presets={...presets,...fields(o.PresetInfo)};
  const initial=(actorStart||options.actorPosition||[0,0,0]).slice(),aim=aimDirection(options,options.direction,initial),forward=plan.directionMode==='assistant-fourway'?(Math.abs(aim[0])>=Math.abs(aim[2])?[Math.sign(aim[0]),0,0]:[0,0,Math.sign(aim[2])]):aim,targets=targetPositions(options,options.direction);
  const height=options.centerHeight??.375,center=add(initial,[0,height,0]);
  const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
  const choices=[],tracks=[],clips=[],spinePath=[],trace={shots:[],falls:[],impacts:[],nativeRecoil:plan.nativeRecoil||null};
  const end=plan.end*rounds,path=[{time:0,position:initial.slice()},{time:end,position:initial.slice()}];
  const facing=Math.abs(forward[0])>=Math.abs(forward[2])?forward[0]<0?'left':'right':forward[2]<0?'front':'back',sideFacing=facing==='left'||facing==='right';
  if(plan.recoilByFacing)plan.nativeRecoil=plan.recoilByFacing[sideFacing?'side':facing]||plan.recoilByFacing.vertical;
  if(plan.roleJump){
   const id=plan.action+':stick',selected=options.choiceOverrides?.[id]==='moving'?'moving':'stationary';choices.push({id,selected,nativeSelected:'stationary',overridden:selected==='moving',options:[{key:'stationary',preset:'无摇杆输入',assetName:'无摇杆输入'},{key:'moving',preset:'沿预览方向输入摇杆',assetName:'沿预览方向输入摇杆'}]});
   if(selected==='moving'){const j=plan.roleJump;plan.nativeRecoil=null;plan.clips=[{key:'cast',track:'Base',start:0}];plan.sourceMoves=[{at:j.at,duration:j.dashDuration,speed:j.speed,sign:1}];plan.spine=[{at:j.at,duration:j.duration,height:j.height,aerialDuration:j.aerial}];plan.events=[{key:'fire',at:j.at,anchor:'center',offsetVector:j.offsets[facing],directionVector:unit(j.directions[facing]),follow:true,followSpine:true},{key:'jump',at:j.at,anchor:'feet'},{key:'trail',at:j.at,anchor:'center',follow:true,followSpine:true,until:plan.end},{key:'fx_end',at:j.at+j.duration,anchor:'feet'}];}
  }
  const jumpAt=time=>{let height=0;for(const j of plan.spine||[]){const t=time-j.at,flight=j.duration-(j.aerialDuration||0),half=flight/2;if(t<0||t>=j.duration)continue;height+=j.height*(t<half?Math.sin(Math.PI*t/flight):t<=half+(j.aerialDuration||0)?1:Math.sin(Math.PI*(t-(j.aerialDuration||0))/flight));}return height;};
  const motionAt=time=>{let p=initial.slice();for(const m of plan.sourceMoves||[]){const u=Math.max(0,Math.min(1,(time-m.at)/m.duration));p=add(p,forward,m.speed*m.duration/2*u*(2-u)*(m.sign||1));}return p;};
  if(plan.sourceMoves){path.length=0;for(let frame=0;frame<=Math.ceil(end*60);frame++){const time=Math.min(end,frame/60);path.push({time,position:motionAt(time)});}}
  const aimOffsets=plan.aimOffsets?.[{back:'up',front:'down'}[facing]||facing];
  const rotateOffset=v=>rotate(v,-Math.atan2(forward[2],forward[0])*180/Math.PI);
  const poolLimit=preset=>{const p=plan.poolRules?.[preset];return p?.timeLimit>0?p.timeLimit:null;};
  const naturalLife=effect=>effect.dispose==='TimeLimit'?(poolLimit(effect.preset)??effect.duration):effect.duration;
  function effect(preset,at,position,link={}){
   const e=effects.get(preset);if(!e)throw Error('Missing source-pattern effect '+preset+' in '+plan.action);
   const t={effect:e,at:0,link:{delay:at,end,clips:[],anchor:'feet',graphPosition:position.slice(),graphDirection:forward,graphPath:path,graphOwnerAtBirth:initial.slice(),directed:false,fxEnd:at+naturalLife(e),...link}};
   tracks.push(t);return t;
  }
  function actorClips(offset,breaking=false){
   for(const c of (breaking?plan.breakClips||plan.clips:plan.clips)||[]){const key=!options.exclusiveWeapon&&c.fallbackKey?c.fallbackKey:c.key;const r=list(c.track==='Emotion'?a.EmotionInfo:a.AnimationInfo).find(r=>r.Name===key);if(!r)continue;
    clips.push({name:r.Animation,start:offset+c.start,end:offset+(c.end??plan.end),track:c.track,speed:r.Scale??1,loop:!!r.Loop,...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})});
   }
  }
  function projectile(at,shot={}){
   const spec=native.projectiles[list(a.ProjectileInfo)[shot.index||0]?.Name];if(!spec)throw Error('Missing source-pattern projectile in '+plan.action);
   const destination=add(targets[0],[0,height,0]),direction=rotate(forward,shot.angle||0),owner=add(motionAt(at),[0,height,0]);
   const start=plan.aimOffsets?add(owner,options.exclusiveWeapon?unit(add(direction,rotateOffset(aimOffsets.shoot))):direction,options.exclusiveWeapon?(variant==='bonus'?plan.bonus.shootOffset:a.ShootOffset):1):add(add(owner,direction,shot.offset??weapon.shootOffset??.5),rotate(direction,-90),shot.side||0),trajectory=createHomingTrajectory({position:start,direction,speed:spec.Speed,accel:spec.Accel||0,angularSpeed:0,target:destination});
   const cannonDistance=shot.cannon?Math.min(length(add(targets[0],initial,-1)),spec.Speed*spec.Lifetime):0,cannonDuration=cannonDistance/spec.Speed;
   const motion=[],life=shot.cannon?cannonDuration:spec.Lifetime;let stop=life,hit=false,hitAt,hitPosition;
   for(let frame=0;frame<=Math.ceil(life*60);frame++){
    const t=Math.min(life,frame/60),position=shot.cannon?add(start,direction,spec.Speed*t):trajectory(t);if(shot.cannon)position[1]+=29.4*.5*t*(cannonDuration-t);motion.push({time:at+t,position});
    if(!shot.cannon&&!hit&&length(add(position,destination,-1))<=(spec.HitBoxWidth||0)/2+.275){hit=true;hitAt=at+t;hitPosition=position.slice();if(spec.PenetrateType!=='All'){stop=t;break;}}
   }
   const last=motion.at(-1).position,death=at+stop;
   if(shot.muzzle!==false&&spec.ShootEffectPreset){const muzzle=plan.aimOffsets?add(owner,options.exclusiveWeapon?unit(add(direction,rotateOffset(aimOffsets.fire))):direction,options.exclusiveWeapon?(variant==='bonus'?plan.bonus.muzzleOffset:1.2):1):add(start,direction,shot.muzzleOffset||0);effect(spec.ShootEffectPreset,at,muzzle,{directed:true,graphFollow:!!plan.aimOffsets});}
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(r=>r.PresetName)].filter(Boolean)){
    const e=effects.get(preset);if(!e)throw Error('Missing source-pattern projectile effect '+preset);
    const tail=e.dispose==='TriggeredTimeLimit'?(poolLimit(preset)??e.duration):0;
    effect(preset,at,start,{directed:true,motionPath:motion,triggeredDisposeAt:death,fxEnd:death+tail});
   }
   if(hit&&spec.HitPreset)effect(spec.HitPreset,hitAt,hitPosition);
   if(hit&&shot.hitKey&&presets[shot.hitKey])effect(presets[shot.hitKey],hitAt,destination);
   if(spec.ExpirePreset)effect(spec.ExpirePreset,death,last);
   if(spec.Exploding&&spec.ExplosionPreset)effect(spec.ExplosionPreset,death,last);
   trace.shots.push({at,death,hit,hitAt,start,last,projectile:spec.Name,index:shot.index||0});
   return {death,hit,last};
  }
  if(plan.pattern==='independent-mines'){
   actorClips(0);trace.entities=buildSourceMines({a,at:a.ShootTiming,initial,center,forward,targets,extraMines:list(original.OptionId).some(id=>ids.has(id)&&!byId.get(id)?.IsSpecial),effect,presets,poolLimit,effects});
   for(let frame=0;frame<=Math.ceil(end*60);frame++){const time=Math.min(end,frame/60);spinePath.push({time,...sampleNativeRecoil(time,[plan.nativeRecoil],forward)});}
  }else if(plan.pattern==='companion-beam'){
   actorClips(0);effect(presets.cast,0,add(center,forward,plan.beamOffset),{fxEnd:plan.beamTiming,graphFollow:true});
   effect(presets.laser,plan.beamTiming,add(center,forward,plan.beamOffset),{directed:true,graphFollow:true});effect(presets.screen,plan.beamTiming,initial,{screen:true});
   for(const [i,c]of plan.companions.entries()){
    const id=plan.action+':companion'+i,override=options.choiceOverrides?.[id],key=c.keys.includes(override)?override:c.keys[0];
    choices.push({id,selected:key,nativeSelected:c.keys[0],overridden:key===override,options:c.keys.map(key=>({key,preset:presets[key],assetName:effects.get(presets[key])?.assetName||presets[key]}))});
    const facing=Math.abs(forward[0])>=Math.abs(forward[2])?forward[0]<0?'left':'right':forward[2]<0?'front':'back';
    effect(presets[key],0,add(add(initial,forward,c.backOffset),rotate(forward,c.sideAngle)),{skeletonClips:[{name:plan.companionAnimation,start:0,end:plan.end,track:'Base',loop:true,speed:1}],skeletonIdle:'idle',skeletonView:facing==='left'||facing==='right'?'side':facing,skeletonFlip:facing==='left',
     ...(key!==c.keys[0]&&c.skin?{skeletonSkin:c.skin}:{}),skeletonAlpha:[{at:0,from:0,to:1,duration:plan.fadeIn}],fxEnd:plan.end});
   }
  }else if(plan.pattern==='deployed-battery'){
   const k=plan.keys,deploy=a.DeployTiming,shots=list(a.ShootTiming),lastHit=shots.at(-1)+a.HitDelay,fieldEnd=deploy+lastHit;
   actorClips(0);effect(presets[k.deploy],0,add(initial,[0,plan.deployHeight,0]));
   effect(presets[k.screen],deploy,initial,{screen:true});
   const bodyClips=shots.map((t,i)=>({name:plan.bodyAnimation,start:t,end:shots[i+1]??lastHit,track:plan.bodyTrack,speed:1,loop:false}));
   effect(presets[k.body],deploy,initial,{skeletonIdle:'idle',skeletonClips:bodyClips,
    skeletonAlpha:[{at:0,from:0,to:1,duration:plan.fadeIn},{at:lastHit,from:1,to:0,duration:plan.fadeOut}],
    fxEnd:fieldEnd+plan.fadeOut});
   effect(presets[k.range],deploy,initial);
   let previous;
   for(const [i,t]of shots.entries()){
    const at=deploy+t,fall=at+a.HitDelay-plan.fallLead,impact=at+a.HitDelay,n=i%plan.variantCount+1,format=s=>s.replace('%d',n);
    effect(presets[k.fire],at,add(initial,[0,plan.fireHeight,0]));effect(presets[format(k.shoot)],at,add(initial,[0,plan.fireHeight,0]),{nativeStageShadowPosition:false});
    // Native search is a cylinder around the placed entity. An out-of-range
    // preview target must not move the battery's attacks beyond its search.
    let target=targets.find(p=>Math.hypot(p[0]-initial[0],p[2]-initial[2])<=a.AttackRange&&Math.abs(p[1]-initial[1])<=plan.searchHeight);
    const fallback=!target;
    if(!target){
     const last=previous?add(previous,initial,-1):rotate([1,0,0],rng.nextFloat()*360);
     const angle=rng.nextFloat()*plan.randomAngleSpan+plan.randomAngleMin,radius=rng.nextFloat()*(a.AttackRange-plan.minRandomRadius)+plan.minRandomRadius;
     target=add(initial,unit(rotate(last,angle)),radius);target[1]=0;
    }
    previous=target.slice();effect(presets[format(k.fall)],fall,target,{nativeStageShadowPosition:false});effect(presets[format(k.impact)],impact,target);
    trace.shots.push({at,variant:n});trace.falls.push({at:fall,position:target.slice(),fallback});trace.impacts.push({at:impact,position:target.slice()});
   }
   trace.entity={position:initial.slice(),spawn:deploy,fieldEnd,end:fieldEnd+plan.fadeOut,independentClock:true};
  }else{
   let marker;
   if(plan.grantBuff&&special){
    const buff=(specialMyth||special)[plan.grantBuff.nameField]||special[plan.grantBuff.nameField],duration=plan.buffRules?.[buff]?.duration;
    if(duration>0&&presets[plan.grantBuff.key]){effect(presets[plan.grantBuff.key],plan.grantBuff.at,center,{graphFollow:true,fxEnd:plan.grantBuff.at+duration});if(presets[plan.grantBuff.endKey])effect(presets[plan.grantBuff.endKey],plan.grantBuff.at+duration,center,{graphFollow:true});}
   }
   if(plan.collisionHit){const c=plan.collisionHit;for(const target of targets){const delta=add(target,initial,-1),distance=delta[0]*forward[0]+delta[2]*forward[2],side=Math.abs(delta[0]*forward[2]-delta[2]*forward[0]);if(distance>=0&&distance<=a[c.lengthField]&&side<=a[c.widthField]/2)effect(presets[c.key],c.at,add(target,[0,height,0]));}}
   if(plan.pattern==='independent-bombs')trace.bombs=buildSourceBombs({a,plan,initial,center,forward,targets,myth:overrides.length>0,effect,presets,rng,effects,poolLimit});
   if(plan.pattern==='aim-field'){
    const d=Math.min(7,Math.max(.3,length(add(targets[0],initial,-1)))),h=options.exclusiveWeapon?1+2/d:1+4/a.SearchRange,aim=unit(add(options.exclusiveWeapon?forward:[0,0,0],[0,0,h]));
    const fireOffset=facing==='back'?[.35,0,.9]:facing==='front'?[options.exclusiveWeapon?-.2:.2,0,.9]:add(aim,rotateOffset([.2,0,0]),1/.8).map(v=>v*.8);
    effect(presets[plan.fireKey],plan.fireTiming,add(center,fireOffset),{directed:true,graphDirection:sideFacing?aim:[0,0,1]});
    const distance=length(add(targets[0],initial,-1)),target=distance>a.SearchRange?add(initial,forward,a.SearchRange):targets[0];effect(presets[plan.fieldKey],plan.fieldTiming,target);
    plan.recoils=[];for(let at=plan.fireTiming+.1;at<plan.fieldTiming+1e-9;at+=.1)plan.recoils.push({at,direction:plan.recoilDirection,distance:plan.recoilDistance,height:0,duration:plan.recoilDuration,angle:plan.recoilAngle});
   }
   if(plan.ownershipBuff&&weaponOptions.length&&presets[plan.ownershipBuff.key]){
    const owner=overrides.find(o=>o.IsCwpOption)||weaponOptions[0],duration=plan.buffRules?.[owner[plan.ownershipBuff.nameField]]?.duration;
    if(!(duration>0))throw Error('Missing source ownership buff lifetime');
    effect(presets[plan.ownershipBuff.key],0,center,{graphFollow:true,fxEnd:duration});
   }
   for(let shot=0;shot<rounds;shot++){
    const offset=plan.end*shot,breaking=!!plan.breakShots&&(isBreak||rounds>1&&shot===rounds-1);actorClips(offset,breaking);
    for(const e of plan.events){const at=offset+e.at,owner=motionAt(at),position=e.anchor?.startsWith('target')?add(targets[0],[0,(e.anchor==='targetGround'?0:height)+(e.height||0),0]):add(owner,[0,(e.anchor==='feet'?0:height)+(e.height||0)+(e.followSpine?jumpAt(at):0),0]);
     effect(presets[e.key],at,add(position,e.offsetVector||[0,0,0]),{graphFollow:!!e.follow,screen:!!e.screen,directed:!!e.directed,graphDirection:e.directionVector||forward,
      ...(e.followSpine?{graphPath:path.map(p=>({time:p.time,position:add(p.position,[0,jumpAt(p.time),0])})),graphOwnerAtBirth:add(owner,[0,jumpAt(at),0])}:{}),
      ...(plan.hideWeapon?{hideWeaponUntil:plan.end}: {}),...(e.until!=null?{fxEnd:offset+e.until}:{}),...e.link});}
    if(plan.aimOffsets){
     const key=variant==='bonus'?plan.bonus.castKey:'cast',base=variant==='bonus'?1:.9,start=add(center,forward,base),pos=options.exclusiveWeapon?add(start,rotateOffset(aimOffsets.fire)):start;
     const aim=add(center,options.exclusiveWeapon?unit(add(forward,rotateOffset(aimOffsets.fire))):forward,options.exclusiveWeapon?1:base);effect(presets[key],offset,pos,{directed:true,fxEnd:offset+a.ShootTiming,motionPath:[{time:offset,position:pos},{time:offset+1/60,position:aim},{time:offset+a.ShootTiming,position:aim}]});if(variant==='normal')rng.nextFloat();
    }
    if(plan.pattern==='target-drain'){
     const active=Array.from(ids).map(id=>byId.get(id)).filter(Boolean),special=active.find(o=>o.SearchRange>0),range=special?.SearchRange??a[plan.searchField];
     const regular=weaponOptions.find(o=>o.MaxTarget),upgraded=regular&&active.find(o=>o.Id===regular.MythOptionId),count=(upgraded||regular)?.MaxTarget||1;
     const selected=targets.filter(p=>length(add(p,initial,-1))<=range).sort((a,b)=>length(add(a,initial,-1))-length(add(b,initial,-1))).slice(0,breaking?1:count);
     const keys=selected.length||breaking?plan.castAlternates:plan.emptyAlternates;effect(presets[keys[shot%keys.length]],offset,center,{graphFollow:true});
     for(const target of selected)effect(presets[plan.hitKey],offset,add(target,[0,height,0]));
     const extra=(target,at)=>{const chance=(upgraded||regular)?.[plan.extraHit.probabilityField];if(chance!=null&&rng.nextFloat()<=chance&&presets[plan.extraHit.key])effect(presets[plan.extraHit.key],at,add(target,[0,height,0]));};
     if(breaking){if(plan.breakVoiceRandom)rng.nextFloat();const p=projectile(offset+a.ShootTiming,plan.breakShots[0]);if(p.hit)extra(targets[0],p.death);}
     else for(const target of selected){
      extra(target,offset+plan.drainAt);const start=add(target,[0,height,0]),direction=unit(add(center,start,-1)),duration=length(add(center,start,-1))/(range/(plan.healAt-plan.drainAt)),at=offset+plan.drainAt,death=at+duration,motion=[{time:at,position:start},{time:death,position:center}];
      for(const key of plan.drainKeys){const preset=presets[key],e=effects.get(preset),tail=e.dispose==='TriggeredTimeLimit'?(poolLimit(preset)??e.duration):0;effect(preset,at,start,{motionPath:motion,graphDirection:direction,directed:key===plan.drainKeys[1],triggeredDisposeAt:death,fxEnd:death+tail});}
      trace.impacts.push({at:death,drain:true,position:center.slice()});
     }
    }
    if(plan.pattern==='scheduled-projectiles'){
     const shots=breaking?plan.breakShots:plan.shots;for(const event of shots){if(plan.cartridgeRandom)rng.nextFloat();projectile(offset+event.at,event);}
     if(plan.muzzleBones){const spec=native.projectiles[list(a.ProjectileInfo)[breaking?1:0]?.Name];for(const bone of plan.muzzleBones)effect(spec.ShootEffectPreset,offset,center,{bone,directionBone:bone,boneOffset:plan.muzzleOffset,graphFollow:true});}
    }
    if(plan.pattern==='direct-projectile'){
     const p=projectile(offset+a[plan.shootField]);
     if(plan.ownershipMarker&&weaponOptions.length&&p.hit&&!marker&&presets[plan.ownershipMarker])marker=effect(presets[plan.ownershipMarker],p.death,targets[0]);
    }
   }
   for(let frame=0;frame<=Math.ceil(end*60);frame++){
    const time=Math.min(end,frame/60);let y=0;
    for(let round=0;round<rounds;round++)y+=jumpAt(time-round*plan.end);
    const recoils=Array.from({length:rounds},(_,round)=>{const breaking=!!plan.breakShots&&(isBreak||rounds>1&&round===rounds-1);return (plan.recoils||(plan.nativeRecoil?[breaking?plan.breakRecoil:plan.nativeRecoil]:[])).map(e=>({...e,at:round*plan.end+e.at}));}).flat();
    const recoil=sampleNativeRecoil(time,recoils,forward);
    spinePath.push({time,position:[recoil.position[0],y+recoil.position[1],recoil.position[2]],angle:recoil.angle});
   }
   if(marker)marker.link.fxEnd=Math.max(end,...tracks.filter(t=>t!==marker).map(t=>t.link.fxEnd));
  }
  const duration=Math.max(end,...tracks.map(t=>t.link.fxEnd));
  return {actor:{end,clips,graphPath:path,spinePath},tracks,duration,source:plan.source,sourceTrace:trace,
   ...(plan.magazine?{magazine:{count:rounds,period:plan.end,sourceGate:plan.magazine.sourceGate}}:{}),
   random:{implementation:'UnityEngine.Random',stateBefore,stateAfter:rng.getState(),choices}};
 }
 for(const p of plans){
  if(p.behavior!=='source-projectile-pattern'||p.exclusive&&!options.exclusiveWeapon||p.mythOnly&&!myth)continue;
  let id=p.id;
  if(p.category==='basic'){const i=basics.indexOf(p.action);if(i<0)continue;id='basic-'+(i+1);}
  else if(p.category==='role'&&!(style.ManualBattleActions||[]).includes(p.action)&&!Array.from(ids).some(id=>byId.get(id)?.BattleActionName===p.action))continue;
  const special=p.bonus&&list(native.actions[p.action].OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).find(o=>o?.IsSpecial),gated=special&&Number(options.buffScores?.[special[p.bonus.buffField]])>0;
  result.push({id,label:p.label,...build(p,1,false,gated?'bonus':'normal')});
  if(p.bonus){const special=list(native.actions[p.action].OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).find(o=>o?.IsSpecial);if(special)result.push({id:'basic-bonus',label:'角色技能强化射击',...build(p,1,false,'bonus')});}
  if(p.breakShots)result.push({id:'basic-last',label:'末发攻击',...build(p,1,true)});
  if(p.magazine){const count=p.staminaCost?Math.ceil((native.battleDefaults?.maxStamina||200)/p.staminaCost):weapon.magazineSize;if(!Number.isInteger(count)||count<1)throw Error('Source magazine requires weapon capacity');if(gated){
    const first=build(p,1,false,'bonus'),next=build(p,count,false,'normal',first.actor.graphPath.at(-1).position),offset=first.actor.end;
    const tracks=[...first.tracks,...next.tracks.map(t=>({...t,at:offset+(t.at||0)}))],actor={end:offset+next.actor.end,clips:[...first.actor.clips,...next.actor.clips.map(c=>({...c,start:offset+c.start,end:offset+c.end}))],graphPath:[...first.actor.graphPath,...next.actor.graphPath.map(v=>({...v,time:offset+v.time}))],spinePath:[...first.actor.spinePath,...next.actor.spinePath.map(v=>({...v,time:offset+v.time}))]};
    result.push({id:'basic-magazine',label:'全弹夹连贯攻击',actor,tracks,duration:Math.max(first.duration,offset+next.duration),sourceTrace:{shots:[...first.sourceTrace.shots,...next.sourceTrace.shots.map(v=>({...v,at:offset+v.at,death:offset+v.death}))]},magazine:{count:count+1,staminaShots:count,bonusShots:1,sourceGate:p.magazine.sourceGate},source:p.source});
   }else result.push({id:'basic-magazine',label:'全弹夹连贯攻击',...build(p,count)});}
 }
 const combos=plans.filter(p=>p.combo&&basics.includes(p.action));
 if(combos.length>1){let offset=0;const tracks=[],clips=[],graphPath=[],spinePath=[],shots=[];
  for(const p of combos){const m=build(p);tracks.push(...m.tracks.map(t=>({...t,at:offset+(t.at||0)})));clips.push(...m.actor.clips.map(c=>({...c,start:offset+c.start,end:offset+c.end})));graphPath.push(...m.actor.graphPath.map(v=>({...v,time:offset+v.time})));spinePath.push(...m.actor.spinePath.map(v=>({...v,time:offset+v.time})));shots.push(...m.sourceTrace.shots.map(v=>({...v,at:offset+v.at,death:offset+v.death})));offset+=m.actor.end;}
  result.push({id:'basic-combo',label:'普攻连贯',actor:{end:offset,clips,graphPath,spinePath},tracks,duration:Math.max(offset,...tracks.map(t=>t.at+t.link.fxEnd)),sourceTrace:{shots}});
 }
 return result;
}
