import {scriptActionModules} from './script-actions.js';
import {aimDirection,targetPositions,facingVectors} from './targeting.js';
import {sourceHero} from './weapon-hero-variants.js';

const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const rotate=(v,degrees)=>{const r=degrees*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
const list=v=>Array.isArray(v)?v:v==null?[]:[v];

// RoleDemonSlayerBattleAction: sphere_state -> get_spheres -> independent
// background_projectile. The sphere objects survive the actor action's exit.
export function buildSlayerSpheres(index,options,native,p,style){
 const a=native.actions[p.action],initial=options.actorPosition||[0,0,0],center=add(initial,[0,.375,0]),forward=aimDirection(options,options.direction,initial),look=facingVectors[options.direction]||forward,target=targetPositions(options,options.direction)[0];
 const hero=sourceHero(native,options.heroAppearance||options.appearance),ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o])),cwp=ids.has(a.CwpOptionId)?byId.get(a.CwpOptionId):null,special=ids.has(a.SpecialOptionId)?byId.get(a.SpecialOptionId):null;
 const requested=options.slayerSphereCount??options.roleUseLeft,counts=requested==null?[a.BattleStartChargeCount,a.UseCount]:[Math.max(1,Math.min(a.UseCount,Math.floor(requested)))],result=[];
 for(const count of [...new Set(counts)]){
  const events=[],shoots=[],base=180/(count+1),hasTarget=Math.hypot(target[0]-initial[0],target[2]-initial[2])<=a.SearchRange;
  // get_spheres takes existing objects in reverse order; always_update removes
  // from the end, so sphere index 1 is disposed for the first background shot.
  for(let idx=1;idx<=count;idx++){
   const angle=idx*base+90,desired=add(center,rotate(forward,angle),a.ShootOffset),launch=a.ShootTiming+a.ShootTerm*(idx-1),motion=[{time:0,position:add(center,rotate(look,angle),a.ShootOffset)}];
   let position=motion[0].position;
   for(let frame=1;frame<=Math.ceil(a.ShootTiming*60);frame++){
    const time=Math.min(a.ShootTiming,frame/60);
    // Source action_state:update lerps from the previous frame's position,
    // rather than using a single interpolation from the original position.
    position=add(position,add(desired,position,-1),Math.min(1,time/a.ShootTiming));
    motion.push({time,position});
   }
   motion.push({time:launch,position:position.slice()});
   events.push({op:'effect',key:'sphere',at:0,anchor:'feet',directed:false,nativePoolTransform:'direct',nativePoolLifetime:true,triggerDisposeAt:launch,link:{graphPosition:motion[0].position,motionPath:motion}});
   events.push({op:'projectile',at:launch,index:0,offset:a.ShootOffset,originAngle:angle,directional:!hasTarget,nativePoolTransform:'directional'});
   shoots.push({index:idx,at:launch,angle,position:desired,targeted:hasTarget});
  }
  // Some costumes supply cast; the original source has no cast pool entry.
  const presets=Object.assign({},...list(a.PresetInfo));
  if(presets.cast)events.unshift({op:'effect',key:'cast',at:0,anchor:'center',directed:false,nativePoolTransform:'direct',nativePoolLifetime:true,follow:true});
  const lastShot=shoots.at(-1).at,spec=native.projectiles[a.ProjectileInfo[0].Name],plan={...p,behavior:'timeline',sourceProjectilePools:true,disableCombo:true,end:a.ActionDuration,independentFieldEnd:lastShot+spec.Lifetime,events,clips:[{key:'action',at:0,track:'Upper',end:a.ActionDuration},{key:'action',at:0,track:'Emotion',end:a.ActionDuration}],moves:[],spine:[],nativeRecoils:[{at:a.ShootTiming,duration:.25,distance:.4,height:.1}]};
  const m=scriptActionModules(index,options,native,[plan],style)[0];if(!m)continue;
  if(count!==a.BattleStartChargeCount){m.id=p.id+'-full';m.label=(p.label||'角色技能')+'（满库存'+count+'球）';}
  m.sourceTrace={operation:'slayer-spheres',sphereCount:count,capacity:a.UseCount,battleStartChargeCount:a.BattleStartChargeCount,sourceHero:hero,inventory:{formation:'180 / (count + 1); angle = index * base + 90',radius:a.ShootOffset,followSpeed:10,transferOrder:'reverse; background pop restores ascending shot order',useLeftBefore:count,useLeftAfter:0},shoots,actorEnd:a.ActionDuration,backgroundEnd:lastShot+spec.Lifetime,reinforced:!!cwp&&count>=cwp.ReinforceCondition,specialBuff:!!special&&count>=special.UseLeftCondition,projectile:spec.Name};
  result.push(m);
 }
 return result;
}
