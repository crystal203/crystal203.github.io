// Source-derived option hit visualization for an offset pie collision.
// The preview represents flat target discs. It does not simulate battle buffs;
// source accepts either resisted application or the freshly active debuff.
import {sampleGraphPath} from './graph-action.js';
const add=(a,b,k=1)=>a.map((x,i)=>x+k*b[i]);
export function appendSourceOptionHitEffects({plan,action,presets,ids,path,forward,targets,options,evaluate,addEffect}){
 const rule=plan.sourceOptionHit;if(!rule)return null;
 const active=[action.OptionId].flat().some(id=>ids.has(id));
 if(!active)return {active:false,hits:[]};
 const at=evaluate(rule.at),birth=evaluate(rule.centerAt),center=add(sampleGraphPath(path,birth),forward,evaluate(rule.offset)),radius=evaluate(rule.radius),halfAngle=evaluate(rule.angle)*Math.PI/360;
 const hits=[];
 for(const [index,target]of targets.entries()){
  const dx=target[0]-center[0],dz=target[2]-center[2],distance=Math.hypot(dx,dz),targetRadius=options.targetRadius??.275;
  const dot=(dx*forward[0]+dz*forward[2])/(distance||1),angle=Math.acos(Math.max(-1,Math.min(1,dot))),angularRadius=distance<=targetRadius?Math.PI:Math.asin(Math.min(1,targetRadius/distance));
  if(distance>radius+targetRadius||angle>halfAngle+angularRadius)continue;
  // Test distance to the straight sector edge when the disc center is outside.
  if(angle>halfAngle&&distance*Math.sin(angle-halfAngle)>targetRadius)continue;
  const position=target.slice();position[1]+=options.centerHeight??.375;
  addEffect(presets[rule.key],at,{anchor:'target',directed:false},position);hits.push({target:index,at,position});
 }
 return {active:true,at,center,radius,angle:evaluate(rule.angle),hits,condition:rule.condition,targetStateBoundary:rule.targetStateBoundary};
}
