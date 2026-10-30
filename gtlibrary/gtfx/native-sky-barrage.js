import {effectLookup} from './effect-lookup.js';
// One declaration-time Unity draw; Lua's indexed ring order is preserved.
import {UnityRand} from './native-random.js';
import {aimDirection} from './targeting.js';
import {nativePoolEventTransform} from './native-melee-operations.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),clamp=v=>Math.max(0,Math.min(1,v));
export function skyBarrageActionModules(index,options,native,plans){
 const hero=options.heroAppearance||options.appearance||options.profile.defaultSkin;
 if(!(native.heroClasses?.[hero]||'').endsWith('_myth'))return [];
 const effects=effectLookup(index.effects);
 return plans.filter(p=>p.behavior==='source-sky-barrage').map(plan=>{
  const a=native.actions[plan.action],r=plan.sourceConstants,end=plan.end,initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),presets=fields(a.PresetInfo);
  const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState(),draw=rng.nextFloat(),angle=draw*r.randomAngleSpan;
  const points=plan.hitTimings.map((_,i)=>{const radians=(angle+i*r.angleStep)*Math.PI/180;return add(initial,[Math.cos(radians)*r.radius,0,Math.sin(radians)*r.radius]);});
  const tracks=[],clips=[],path=[{time:0,position:initial.slice()},{time:end,position:initial.slice()}],spinePath=[],spineRotationPath=[],trace={draw,angle,points,shots:[],impacts:[],landing:r.landingEffectAt};
  const times=new Set([0,end,r.descentStart,r.descentStart+r.descentDuration,r.spinStart,r.spinStart+r.spinDuration,r.landingEffectAt]);
  for(let f=0;f<=Math.ceil(end*60);f++)times.add(Math.min(end,f/60));
  for(const time of [...times].sort((a,b)=>a-b)){
   const progress=clamp((time-r.descentStart)/r.descentDuration),spin=clamp((time-r.spinStart)/r.spinDuration);
   spinePath.push({time,position:[0,time>=r.landingEffectAt?0:r.jumpHeight*(1-progress**3),0]});
   if(time===r.landingEffectAt)spineRotationPath.push({time,angle:r.rotation});
   spineRotationPath.push({time,angle:time>=r.landingEffectAt?0:r.rotation*spin});
  }
  function clip(key,start,order){const row=list(a.AnimationInfo).find(c=>c.Name===key);if(row)clips.push({name:row.Animation,start,speed:row.Scale??1,loop:!!row.Loop,track:'Base',...(row.NextAnimation?{nextAnimation:row.NextAnimation}:{}),sourceOrder:order});}
  // update_movement visits each hit index before landing checks. At a shared
  // timestamp cast at the preceding impact is followed by the next shoot.
  clip('cast',0,-1);
  for(const [i,hit]of plan.hitTimings.entries()){clip('shoot',hit-r.shotLead,i*2);clip('cast',hit,i*2+1);}
  clip('landing',r.landingAnimationAt,plan.hitTimings.length*2);
  clips.sort((a,b)=>a.start-b.start||a.sourceOrder-b.sourceOrder);for(let i=0;i<clips.length;i++){clips[i].end=clips[i+1]?.start??end;delete clips[i].sourceOrder;}
  const natural=e=>e.dispose==='TimeLimit'?e.poolTimeLimit??e.duration:e.duration;
  function effect(preset,at,position,extra={}){
   const e=effects.get(preset);if(!e)throw Error('Missing native sky barrage effect '+preset);
   const direction=extra.graphDirection||forward,pool=nativePoolEventTransform(e,{nativePoolTransform:extra.directed?'directional':'direct',directed:!!extra.directed},direction);
   const link={delay:at,end,clips:[],anchor:'feet',graphPosition:add(position,pool.offset),graphDirection:direction,graphPath:path,graphOwnerAtBirth:initial.slice(),directed:pool.directed,rotationType:pool.rotationType,rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2],fxEnd:at+natural(e),...extra};
   if(link.motionPath)link.motionPath=link.motionPath.map(p=>({...p,position:add(p.position,pool.offset)}));
   const track={effect:e,at:0,link};tracks.push(track);return track;
  }
  function dispose(t,death){const e=t.effect;t.link.triggeredDisposeAt=death;t.link.fxEnd=e.dispose==='TriggeredTimeLimit'?death+(e.poolTimeLimit??e.duration):e.dispose==='TimeLimit'?t.link.delay+(e.poolTimeLimit??e.duration):death;}
  const spec=native.projectiles[list(a.ProjectileInfo)[0]?.Name];if(!spec)throw Error('Missing native falling projectile '+plan.action);
  for(const [i,hit]of plan.hitTimings.entries()){
   const at=hit-r.shotLead,target=points[i],start=add(target,r.shootOffset),delta=add(target,start,-1),distance=Math.hypot(...delta),direction=delta.map(v=>v/distance);
   const life=spec.Lifetime,motionPath=[],directionPath=[];
   for(let f=0;f<=Math.ceil(life*60);f++){const elapsed=Math.min(life,f/60),position=add(start,direction,spec.Speed*elapsed+(spec.Accel||0)*elapsed**2/2);motionPath.push({time:at+elapsed,position});directionPath.push({time:at+elapsed,position:direction});}
   const death=at+life,last=motionPath.at(-1).position;
   if(spec.ShootEffectPreset)effect(spec.ShootEffectPreset,at,start,{directed:true,graphDirection:direction});
   for(const preset of [spec.PresetName,...list(spec.ExtraPoolInfo).map(p=>p.PresetName)].filter(Boolean))dispose(effect(preset,at,start,{directed:true,graphDirection:direction,motionPath,directionPath}),death);
   if(spec.ExpirePreset)effect(spec.ExpirePreset,death,last);if(spec.Exploding&&spec.ExplosionPreset)effect(spec.ExplosionPreset,death,last);
   effect(presets.explosion,hit,target);trace.shots.push({at,death,start,direction,target:target.slice(),projectile:spec.Name});trace.impacts.push({at:hit,position:target.slice()});
  }
  effect(presets.jump,r.landingEffectAt,initial);
  return {id:plan.id,label:plan.label,actor:{end,clips,graphPath:path,spinePath,spineRotationPath,alpha:[{at:0,from:0,value:1,duration:r.fadeDuration}]},tracks,duration:Math.max(end,...tracks.map(t=>t.link.fxEnd)),source:plan.source,nativeSkyBarrageTrace:trace,random:{implementation:'UnityEngine.Random.value (single declaration draw)',stateBefore,stateAfter:rng.getState(),choices:[]}};
 });
}
