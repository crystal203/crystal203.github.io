// Buff option visuals compiled from ownership-effect / one-use damage source.
import {sampleGraphPath} from './graph-action.js';
const rows=v=>Array.isArray(v)?v:[],fields=rs=>Object.fromEntries(rows(rs).flatMap(r=>r.Name?[[r.Name,r.Preset]]:Object.entries(r)));
export function appendManagedBuffEffects({plan,action,options,ids,path,spinePath,target,addEffect}){
 const rule=plan.buffVfx;if(!rule)return null;
 if(!ids.has(rule.optionId))return null;
 const active=rule.applies||Object.hasOwn(options.buffScores||{},rule.buff);if(!active)return null;
 let presets=fields(rule.option.PresetInfo),idle=rule.option.IdleAnimation;
 if(rule.mythOption&&ids.has(rule.mythOption.Id))presets={...presets,...fields(rule.mythOption.PresetInfo)};
 let until=rule.duration,hitAt=rule.hitAt;
 if(hitAt!=null){
  const owner=sampleGraphPath(path,hitAt),dx=target[0]-owner[0],dz=target[2]-owner[2],distance=Math.hypot(dx,dz),targetRadius=options.targetRadius??.275;
  let hit=plan.category==='support';
  if(plan.category==='basic'){
   const aimLength=Math.hypot(target[0]-path[0].position[0],target[2]-path[0].position[2])||1;
   const dot=(dx*(target[0]-path[0].position[0])+dz*(target[2]-path[0].position[2]))/(distance*aimLength||1);
   const radius=(action.Radius||0)*(action.ColliderSizeMultiplier??1);
   hit=distance<=radius+targetRadius&&dot>=Math.cos((action.Angle??360)*Math.PI/360)-1e-9;
  }else if(plan.category==='cwp')hit=Math.max(0,distance-action.AttackRange)<=action.Radius+targetRadius;
  if(hit)until=Math.min(until,hitAt);else hitAt=null;
 }
 // Native aura follows position and the owner's SpineContainer, without direction.
 addEffect(presets.buff,0,{anchor:'center',directed:false,follow:true,followSpine:true,until});
 if(hitAt!=null)addEffect(presets.hit,hitAt,{anchor:'target',directed:false});
 return {buff:rule.buff,applied:rule.applies,expiresAt:rule.duration,consumedAt:hitAt,activeUntil:until,idleAnimation:idle};
}
