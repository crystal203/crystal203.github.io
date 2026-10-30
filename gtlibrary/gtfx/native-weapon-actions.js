// Native weapon-driven actions share the source projectile renderer. The selected
// WeaponSpec supplies the projectile, magazine and clock; no actor IDs dispatch.
import {sourceProjectileModules} from './script-projectile-patterns.js';
import {aimDirection,targetPositions} from './targeting.js';
import {buildNativeRecoilPath} from './native-character-motion.js';
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const source='native ARM64 d33d4ff7 ManualRifle 0x8b3a128/0x8b3a614/0x8b3a698/0x8b3aeb0; ManualChargeBow 0x8b1bc9c/0x8b1cb8c/0x8b1d1cc';
function buildNativeWeaponBasics(index,options,native,style){
 const names=(style.ManualBattleActions||[]).filter(n=>['ManualRifle','ManualChargeBow'].includes(n.split(':')[0]));
 if(!names.length)return [];
 const w=native.weapons?.[options.weapon];if(!w?.projectile)throw Error('Missing selected native WeaponSpec projectile: '+options.weapon);
 const raw=native.projectiles[w.projectile];if(!raw)throw Error('Missing native equipped projectile '+w.projectile);
 const original=names[0],rifle=original.split(':')[0]==='ManualRifle',a=native.actions[original];
 const convert=(r,speed=1,scale=1)=>({...r,Speed:r.Speed*speed,...(r.HitBoxWidth?{HitBoxWidth:r.HitBoxWidth*(r.P2w??1)}:{}),PenetrateType:r.PenetrateType==='Enemy'?'All':r.PenetrateType,nativeScale:scale});
 if(rifle){
  const period=w.shootTerm,count=w.magazineSize;if(!(period>0)||!(count>0))throw Error('Missing native rifle period/capacity');
  const last=w.superProjectile&&!a.NoSuperShot?native.projectiles[w.superProjectile]:raw;if(!last)throw Error('Missing equipped super projectile');
  const synthetic={...native,actions:{...native.actions,[original]:{...a,ActionDuration:period,AnimationInfo:[{Name:'shoot',Animation:'rifle_shoot',Scale:.333/period,Loop:true}],ProjectileInfo:[{Name:raw.Name},{Name:last.Name}]}},projectiles:{...native.projectiles,[raw.Name]:convert(raw),[last.Name]:convert(last)}};
  const columns=w.columns??1;if(w.parallel===false&&columns>1)throw Error('Native angular weapon pattern needs an angular source contract');
  const pattern=index=>Array.from({length:columns},(_,i)=>({at:0,index,side:(i-(columns-1)/2)*(w.spreadDistance??.2)}));
  const p={behavior:'source-projectile-pattern',category:'basic',id:'basic',label:'普通攻击',action:original,pattern:'scheduled-projectiles',end:period,clips:[{key:'shoot',track:'Upper',start:0}],shots:pattern(0),breakShots:pattern(1),events:[],magazine:{count:'weapon.magazineSize',sourceGate:'GetSuperShot: count == magazineSize - 1 && superShootHelper != null'},source};
  const modules=sourceProjectileModules(index,options,synthetic,[p],style),forward=aimDirection(options,options.direction,options.actorPosition||[0,0,0]);
  for(const m of modules){const shots=m.sourceTrace.shots;m.actor.spinePath=buildNativeRecoilPath(shots.map(s=>({at:s.at,distance:s.projectile===last.Name&&last!==raw?0:.07,height:0,duration:.2,angle:0})),forward,m.actor.end);m.nativeWeapon={type:'rifle',sourceItemId:w.sourceItemId,normal:raw.Name,last:last.Name,columns};}
  return modules;
 }
 const result=[],levels=a.ChargeDurations||[.5,2],initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),center=add(initial,[0,.375,0]);
 const releases=levels[0]>0?[0,...levels]:levels;
 for(const [i,charge]of releases.entries()){
  const full=charge>=levels.at(-1),src=full&&w.superProjectile?native.projectiles[w.superProjectile]:raw;if(!src)throw Error('Missing charged projectile');
  const shot=convert(src,full?3:2,full?1.5:1),duration=charge+(a.AttackDuration??.3);
  const synthetic={...native,actions:{...native.actions,[original]:{...a,ActionDuration:duration,AnimationInfo:[{Name:'ready',Animation:'bow_attack_ready_start'},{Name:'loop',Animation:'bow_attack_ready_loop',Loop:true},{Name:'attack',Animation:'bow_attack'}],ProjectileInfo:[{Name:src.Name}]}},projectiles:{...native.projectiles,[src.Name]:shot}};
  const p={behavior:'source-projectile-pattern',category:'basic',id:'basic',label:'普通攻击',action:original,pattern:'scheduled-projectiles',end:duration,
   clips:[...(charge>0?[{key:'ready',track:'Upper',start:0,end:Math.min(.133,charge)},...(charge>.133?[{key:'loop',track:'Upper',start:.133,end:charge}]:[])]:[]),{key:'attack',track:'Upper',start:charge,end:duration}],shots:[{at:charge,index:0,offset:w.shootOffset??.4}],events:[],source};
  const m=sourceProjectileModules(index,options,synthetic,[p],style)[0];
  m.id=full?'basic-full-charge':i===0?'basic-1':'basic-charge';m.label=full?'满蓄力射击':charge<levels[0]?'未蓄力射击':'普通射击';
  for(const t of m.tracks)if(t.effect.preset===src.PresetName)t.link.scaleFactor=full?1.5:1;
  if(charge>0){
   // StartCharge creates FX_single_projectile and sets its source SpriteName;
   // charge-level transitions pop to 2 then settle over .06 seconds.
   const effect=index.effects.find(e=>e.preset===raw.nativeChargePreset);if(!effect)throw Error('Missing native charging-arrow renderer');
   const uniformScalePath=[],motionPath=[],random=new UnityRand(options.seed??12345);if(options.randomState)random.setState(options.randomState);
   const offset=w.shootOffset??.4,times=new Set([0,.05,.133,...levels.flatMap(t=>[t,t+.06])]),jitterByFrame=[0];for(let f=0;f<=Math.ceil(charge*60);f++){times.add(Math.min(charge,f/60));if(f)jitterByFrame.push((random.nextFloat()-offset)*.025);}
   for(const time of [...times].filter(t=>t<=charge).sort((a,b)=>a-b)){
    const u=Math.max(0,Math.min(1,(time-.05)/.083));let scale=time<.133?.5*Math.sin(u*Math.PI*.6)/.9510564804077148:.5,offsetFactor=time<.133?1-(1-offset)*u:offset;
    for(const [n,at]of levels.entries())if(time>=at){const v=Math.min(1,(time-at)/.06);scale=2+((n===1?1.15:1)-2)*v;offsetFactor=offset*(n===1?1.2:1);}
    uniformScalePath.push({time,position:[scale,scale,scale]});
    const jitter=jitterByFrame[Math.min(jitterByFrame.length-1,Math.floor(time*60+1e-8))];motionPath.push({time,position:add(center,forward,offsetFactor+jitter)});
   }
   m.tracks.unshift({effect,at:0,link:{delay:0,end:duration,anchor:'feet',graphPosition:motionPath[0].position,graphDirection:forward,directed:true,motionPath,graphPath:m.actor.graphPath,graphOwnerAtBirth:initial,fxEnd:charge,uniformScalePath}});
  }
  m.nativeWeapon={type:'charge-bow',sourceItemId:w.sourceItemId,chargeLevel:levels.findLastIndex(t=>charge>=t),chargeDuration:charge,projectile:src.Name,sourceSpeedMultiplier:full?3:2};result.push(m);
 }
 return result;
}
import {UnityRand} from './native-random.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
const rows=v=>Object.fromEntries((v||[]).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const rotate=(v,d)=>{const r=d*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
export function buildNativeWeaponActions(index,options,native,style){return [...buildNativeWeaponBasics(index,options,native,style),...buildNativeWeaponSkills(index,options,native)];}
function buildNativeWeaponSkills(index,options,native){
 const weapon=native.weapons?.[options.weapon],plan=(native.plans||[]).find(p=>p.behavior==='native-weapon-skill'&&p.action===weapon?.action);
 if(!plan)return [];
 const original=native.actions[plan.action],hero=options.heroAppearance||options.appearance||options.profile.defaultSkin;
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const ascent=ids.has(original.AscentOptionId)?byId.get(original.AscentOptionId):null,a={...original,...ascent,Name:original.Name},presets={...rows(original.PresetInfo),...rows(ascent?.PresetInfo)};
 const initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),targets=targetPositions(options,options.direction),center=add(initial,[0,.375,0]),end=a.ActionDuration;
 const effects=new Map(index.effects.filter(e=>!e.unavailable).map(e=>[e.preset,e])),tracks=[],clips=[],path=[{time:0,position:initial},{time:end,position:initial}],spinePath=[],trace={action:plan.action,operation:plan.nativeWeaponSkill,sourceItemId:weapon.sourceItemId,impacts:[]};
 let actorEnd=end;
 const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
 const lifetime=e=>e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration;
 function effect(key,at,position,extra={}){const e=effects.get(presets[key]);if(!e)throw Error('Missing native weapon skill effect '+presets[key]);const t={effect:e,at:0,link:{delay:at,end,anchor:'feet',graphPosition:position.slice(),graphDirection:forward,directed:false,graphPath:path,graphOwnerAtBirth:initial.slice(),fxEnd:at+lifetime(e),...extra}};if(!extra.screen){const pool=nativePoolEventTransform(e,{nativePoolTransform:extra.directed?'directional':'direct',directed:!!extra.directed},forward);if(pool){t.link.graphPosition=add(t.link.graphPosition,pool.offset);t.link.rootScaleX=pool.scale[0];t.link.rootScaleY=pool.scale[1];t.link.rootScaleZ=pool.scale[2];t.link.rotationType=pool.rotationType;t.link.directed=pool.directed;}}tracks.push(t);return t;}
 function dispose(track,at){const e=track.effect;track.link.fxEnd=e.dispose==='TriggeredTimeLimit'?at+(e.poolTimeLimit??e.duration):e.dispose==='TimeLimit'?track.link.delay+(e.poolTimeLimit??e.duration):at;}
 function clip(key,at=0,extra={}){const r=(a.AnimationInfo||[]).find(r=>r.Name===key);if(!r)return;for(const c of clips)if(c.track===(extra.track||'Base')&&c.end==null)c.end=at;clips.push({name:r.Animation,start:at,speed:r.Scale??1,loop:!!r.Loop,track:'Base',...extra});}
 function callback(t,event,offset=0,complete=false){const c=clips[0];t.link.spineEvent={animation:c.name,event,speed:c.speed,clipStart:offset,relativeEnd:true,complete};return t;}
 let directionPath=[{time:0,position:[Math.sign(forward[0])||1,0,0]}];
 if(plan.nativeWeaponSkill==='falling-chain'){
  clip(options.exclusiveWeapon?'action':'actionbackup');effect('cast',0,center,{graphFollow:true});effect('screen',0,initial,{screen:true});
  let previous=initial.slice(),target=targets.find(t=>distance(t,initial)<=a.SearchRange);
  for(let i=0;i<a.Limit;i++){
   if(!target||distance(target,initial)>a.SearchRange)target=targets.find(t=>distance(t,previous)<=a.SearchRange);
   const point=target?[target[0],0,target[2]]:add(previous,forward,a.SearchRange),at=a.AttackTiming+i*(a.HitDelay+a.AttackDelay),hit=at+a.HitDelay,motion=[{time:at,position:add(point,[0,10,0])},{time:hit,position:point}];
   for(const key of ['proj','trail'])dispose(effect(key,at,motion[0].position,{motionPath:motion}),hit);
   effect('explosion',hit,point);trace.impacts.push({at:hit,position:point.slice(),fallback:!target});previous=point;
  }
 }else if(plan.nativeWeaponSkill==='charge-impact'){
  const start=a.ChargeStartProgress*end*(1-(ascent?.ChargeStartScale||0)),speed=a.ChargeSpeed;
  path.splice(0,path.length,{time:0,position:initial},{time:start,position:initial});let position=initial.slice(),previous=0,hitIndex=-1;
  const bounds=a.ChargeBoundSize,targetRadius=options.targetRadius??.275;
  for(let frame=1;frame<=Math.ceil(end*60);frame++){
   const time=Math.min(end,frame/60);if(time<start){previous=time;continue;}
   const delta=speed*(time-Math.max(start,previous)),mid=add(position,forward,delta/2);
   hitIndex=targets.findIndex(target=>{const d=add(target,mid,-1),along=d[0]*forward[0]+d[2]*forward[2],side=d[0]*forward[2]-d[2]*forward[0];return Math.abs(along)<=(bounds[0]+delta)/2+targetRadius&&Math.abs(side)<=bounds[2]/2+targetRadius&&Math.abs(target[1]-initial[1])<=bounds[1]/2+.375;});
   position=add(position,forward,delta);path.push({time,position:position.slice()});previous=time;if(hitIndex>=0){actorEnd=time;break;}
  }
  clip('cast');clip('dash',start);const cast=effect('cast',0,initial,{graphFollow:true,directed:true});dispose(cast,actorEnd);
  for(const key of ['dash','smoke'])dispose(effect(key,start,initial,{graphFollow:true,directed:true}),actorEnd);
  effect('explosion',actorEnd,path.at(-1).position);trace.chargeStart=start;trace.distance=distance(position,initial);trace.hitTargetIndex=hitIndex;trace.previewStage='60Hz level-floor preview with source swept OBB and preview target bounds; terrain collision external';
 }else if(plan.nativeWeaponSkill==='thunder-sequence'){
  clip(options.exclusiveWeapon?'cast':'castbackup');if(!clips.length)clip('cast');
  effect('cast',0,initial,{directed:false,graphFollow:true});callback(effect('cloud',0,initial,{screen:true}),'shoot');
  const selected=targets.filter(t=>distance(t,initial)<=a.Range).sort((x,y)=>distance(x,initial)-distance(y,initial));
  for(let i=0;i<a.MaximumTargets;i++){
   let point=selected[i];if(!point){const radius=1+rng.nextFloat()*(a.Range-1),angle=rng.nextFloat()*180+(i%2?180:0);point=add(initial,rotate([0,0,1],angle),radius);}
   const at=i*a.DamageTerm,t=effect('thunder',at,[point[0],point[1]+.375,point[2]]);callback(t,'hit',at);trace.impacts.push({relativeAt:at,position:t.link.graphPosition.slice(),fallback:i>=selected.length});
  }
 }else if(plan.nativeWeaponSkill==='targeted-area'){
  clip('action');directionPath=[{time:0,position:[1,0,0]}];
  for(let frame=0;frame<=Math.ceil(end*60);frame++){const time=Math.min(end,frame/60);spinePath.push({time,position:[0,Math.sin(Math.PI*time/end),0]});}
  const follow=path.map(p=>({time:p.time,position:p.position}));for(const key of ['action',...(options.exclusiveWeapon?['cwp']:[])])effect(key,0,initial,{graphFollow:true,graphPath:spinePath.map(p=>({time:p.time,position:add(initial,p.position)}))});
  const target=targets.find(t=>distance(t,initial)<=a.Range)||add(initial,forward,a.Range),point=[target[0],0,target[2]];
  callback(effect('screen',0,initial,{screen:true}),null,0,true);const area=effect('area',0,point);callback(area,null,0,true);trace.damageWindow=a.AreaLifeTime;trace.impacts.push({callback:'action:first-complete',position:point});
 }else return [];
 return [{id:'cwp',label:'专武技能',actor:{end:actorEnd,clips,graphPath:path,spinePath,directionPath},tracks,duration:Math.max(actorEnd,...tracks.map(t=>t.link.fxEnd)),source:plan.source,sourceTrace:trace,random:{implementation:'UnityEngine.Random',stateBefore,stateAfter:rng.getState(),choices:[]}}];
}
