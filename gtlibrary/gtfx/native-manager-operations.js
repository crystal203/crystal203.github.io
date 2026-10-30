import {effectLookup} from './effect-lookup.js';
// Native managers retain their own distance/option/ammunition branch before
// generic ComboAction expansion. Actor identifiers never participate in dispatch.
import {targetPositions,aimDirection} from './targeting.js';
import {elasticDebris,nativePoolEventTransform} from './native-melee-operations.js';
import {UnityRand} from './native-random.js';
const list=x=>Array.isArray(x)?x:x==null?[]:[x];
const rows=x=>Object.fromEntries(list(x).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const rotate=(v,a)=>{a*=Math.PI/180;return [v[0]*Math.cos(a)+v[2]*Math.sin(a),v[1],v[2]*Math.cos(a)-v[0]*Math.sin(a)];};
function managerParameters(native,action,rule,options){
 const ids=new Set([...(native.heroOptionIds?.[options.heroAppearance||options.appearance]||native.heroOptionIds?.[options.profile?.defaultSkin]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon||options.profile?.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const equipped=list(action[rule.parameterOptionField]).find(id=>ids.has(id));if(equipped==null)return null;
 const base=byId.get(equipped);if(!base)throw Error('Missing native manager option '+equipped);
 const myth=list(action[rule.mythOptionField]).find(id=>ids.has(id)),upgrade=myth==null?null:byId.get(myth);
 // Constructor gets all animation/pool/timing fields from equipped option.
 // Its explicit myth branch replaces ProjName and SFX only.
 return {base,projectile:upgrade?.[rule.projectileField]??base[rule.projectileField],optionId:equipped,mythOptionId:myth??null};
}
export function resolveNativeManagerStyle(native,style,options={},plans=[]){
 if(!style)return style;
 const found=[],initial=options.actorPosition||[0,0,0],target=targetPositions(options,options.direction||'right')[0];
 const distance=Math.hypot(target[0]-initial[0],target[2]-initial[2]);
 function visit(name,chain=[]){
  if(chain.includes(name))throw Error('Cyclic native manager '+name);
  const a=native.actions?.[name];if(!a)return;
  const plan=plans.find(p=>p.action===name&&p.nativeManager);if(plan){
   const rule=plan.nativeManager;if(rule.operation!=='distanceMagazine')throw Error('Unknown native manager operation '+rule.operation);
   const parameters=managerParameters(native,a,rule,options),threshold=parameters?.base[rule.distanceField];
   found.push({manager:name,plan,parameters,active:!!parameters&&(options.nativeManagerMode==='ranged'||options.nativeManagerMode!=='melee'&&distance>threshold),distance,threshold:threshold??null});
  }
  for(const child of a.ComboAction||[])visit(child,[...chain,name]);
 }
 for(const name of style.ManualBattleActions||style.BattleActions||[])visit(name);
 return {...style,nativeManagers:found};
}
export function nativeManagerActionModules(index,options,native,plans,style){
 const effects=effectLookup(index.effects),modules=[];
 for(const state of style.nativeManagers||[]){
  if(!state.active)continue;
  const {plan,parameters}=state,rule=plan.nativeManager,a=parameters.base,p=native.projectiles[parameters.projectile],presets=rows(a.PresetInfo);
  if(!p?.PresetName)throw Error('Missing materialized native manager projectile '+parameters.projectile);
  const initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0];
  const period=a[rule.periodField],capacity=a[rule.capacityField],reload=a[rule.reloadField],offset=a[rule.offsetField];
  if(!(period>0&&Number.isInteger(capacity)&&capacity>0&&reload>=period))throw Error('Invalid native manager magazine source');
  function build(id,label,count,last){
   const actorEnd=(count-1)*period+(last?reload:period),path=[{time:0,position:initial.slice()},{time:actorEnd,position:initial.slice()}],tracks=[],clips=[],sequence=[],rng=new UnityRand(options.seed??12345);
   if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState();
   function effect(preset,at,position,extra={}){
    if(!preset)return null;const e=effects.get(preset);if(!e)throw Error('Missing native manager effect '+preset);
    const pool=nativePoolEventTransform(e,{nativePoolTransform:'direct',directed:false},forward);
    const t={effect:e,at:0,link:{delay:at,end:actorEnd,clips:[],anchor:'feet',graphPosition:position.slice(),graphDirection:forward,graphPath:path,graphOwnerAtBirth:initial.slice(),graphFollow:false,directed:false,fxEnd:at+e.duration,...(pool?{rootScaleX:pool.scale[0],rootScaleY:pool.scale[1],rootScaleZ:pool.scale[2]}:{}),...extra}};
    tracks.push(t);return t;
   }
   const center=add(initial,[0,(options.centerHeight??.375)+rule.originHeight,0]),start=add(center,forward,offset);
   function clip(key,at,end){const r=list(a.AnimationInfo).find(r=>r.Name===key);if(!r)return;clips.push({name:r.Animation,start:at,end,speed:r.Scale??1,loop:!!r.Loop,track:'Upper',...(r.TargetDuration?{targetDuration:r.TargetDuration}:{})});}
   for(let shot=0;shot<count;shot++){
    const at=shot*period,final=last&&shot===count-1,until=at+(final?reload:period),flight=[];
    // Native ShootDirectionAtPosition uses the locked direction, never homing.
    // The preview target has radius .275. Hitbox fields are source pixels/P2w.
    const width=(p.HitBoxWidth??0)*(p.P2w??1),targetHeight=options.centerHeight??.375;
    let stop=p.Lifetime,hit=false;
    for(let i=0;i<=Math.ceil(p.Lifetime*60);i++){
     const t=Math.min(p.Lifetime,i/60),pos=add(start,forward,p.Speed*t+(p.Accel||0)*t*t/2);flight.push({time:at+t,position:pos});
     if(Math.hypot(pos[0]-target[0],pos[2]-target[2])<=width/2+.275&&Math.abs(pos[1]-targetHeight)<=(p.HitBoxHeight??p.HitBoxWidth??0)*(p.P2w??1)/2+.375){stop=t;hit=true;break;}
    }
    effect(p.PresetName,at,start,{motionPath:flight,graphDirection:forward,directed:!!p.Directional,fxEnd:at+stop});
    for(const extra of list(p.ExtraPoolInfo))effect(extra.PresetName,at,start,{motionPath:flight,graphDirection:forward,fxEnd:at+stop});
    if(hit)effect(p.HitPreset,at+stop,flight.at(-1).position);
    const muzzle=effect(p.ShootEffectPreset,at,center,{bone:rule.weaponBone,directionBone:rule.weaponBone,boneByFacing:rule.boneByFacing,boneOffset:offset,boneExtraOffsetByFacing:rule.boneExtraOffsetByFacing,boneSideOffsetByFacing:rule.boneSideOffsetByFacing,boneFollowUntil:until});
    if(muzzle){const e=muzzle.effect;muzzle.link.fxEnd=e.dispose==='TriggeredTimeLimit'?until+(e.poolTimeLimit??e.duration):e.dispose==='TimeLimit'?at+(e.poolTimeLimit??e.duration):until;}
    clip(rule.animationKey,at,final?at+period:until);
    if(final){
     clip(rule.reloadAnimationKey,at+period,until);
     // Native only ejects all spent cases after the eighth shot, beginning at
     // ShootTerm. Each independent fall can outlive the owner's reload state.
     let born=at+period;const c=rule.casing;
     for(let shell=0;shell<capacity;shell++){
      const direction=rotate(forward,(rng.nextFloat()*2-1)*c.angleRange).map(v=>-v),fall=elasticDebris({start:center,direction,...c}),shift=arr=>arr.map(pt=>({...pt,time:born+pt.time}));
      effect(presets[c.key],born,center,{motionPath:shift(fall.path),eulerPath:shift(fall.eulerPath),eulerMask:[false,true,false],colorPath:shift(fall.colorPath),fxEnd:born+fall.total});
      effect(presets[c.smokeKey],born+fall.bounceAt,fall.bouncePosition,{uniformScale:c.bounceScale});
      born+=c.delayMin+(c.delayMax-c.delayMin)*rng.nextFloat();
     }
    }
    sequence.push({time:at,round:shot+1,remaining:final?capacity:capacity-shot-1,projectile:p.Name,reloadAt:final?at+period:null,end:until,attackType:final?'Reload':'Shoot'});
   }
   return {id,label,actor:{end:actorEnd,clips,graphPath:path,spinePath:[{time:0,position:[0,0,0]}],nativeAim:{bone:'b.aim',originHeight:(options.centerHeight??.375)+rule.originHeight,direction:forward,windows:sequence.map(s=>({at:s.time,end:s.time+period}))}},tracks,duration:Math.max(actorEnd,...tracks.map(t=>t.link.fxEnd)),attackSequence:sequence,magazine:{count,capacity,period,reloadDuration:reload,finalReload:last},nativeManager:{manager:state.manager,operation:rule.operation,branch:'ranged',distance:state.distance,threshold:state.threshold,optionId:parameters.optionId,mythOptionId:parameters.mythOptionId},random:{stateBefore,stateAfter:rng.getState(),implementation:'UnityEngine.Random'},source:plan.source};
  }
  modules.push(build('basic-1','远程普通攻击',1,false),build('basic-break','远程末发与换弹',1,true),build('basic-magazine','远程整弹匣连射（'+capacity+' 发）',capacity,true));
 }
 return modules;
}
