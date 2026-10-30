// Source-native projected orbit and bouncing debris operations; no actor dispatch.
import {sampleGraphPath} from './graph-action.js';
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k);
const rotate=(v,degrees)=>{const r=degrees*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
export function buildProjectedOrbit({rule,evaluate,initial,forward,end}){
 const radius=evaluate(rule.radius),range=evaluate(rule.range),path=[],spinePath=[],directionPath=[];let previous=0,totalMoved=0;
 for(let frame=0;frame<=Math.ceil(end*60);frame++){
  const time=Math.min(end,frame/60),u=time/end,angle=evaluate(rule.angleStart)+evaluate(rule.angleRange)*u;
  const radial=rotate(forward,angle),center=radius+(range-2*radius)*u;
  // Native ExecuteMove projects the circular final position onto its original axis.
  const distance=center+radius*(radial[0]*forward[0]+radial[2]*forward[2]);
  // ExecuteMove receives magnitude(currentProjection-lastProjection), with
  // the original direction unchanged, so reverse oscillation still moves forward.
  totalMoved+=Math.abs(distance-previous);previous=distance;
  path.push({time,position:add(initial,forward,totalMoved)});spinePath.push({time,position:[0,0,0]});directionPath.push({time,position:radial.map(x=>-x)});
 }
 return {path,spinePath,directionPath};
}
// CalculatorFreeFall: source parabola, accelerated time, one elastic bounce.
// This previews a level floor. Native collision with terrain remains external.
export function elasticDebris({start,direction,speed=6,bouncedSpeed=2,velocity=5,gravity=12.5,timeScale=2,elasticity=.4}){
 const first=(velocity/gravity+Math.sqrt(velocity*velocity/(gravity*gravity)+2*start[1]/gravity))/timeScale;
 const rebound=Math.sqrt(velocity*velocity+2*gravity*start[1])*elasticity,second=2*rebound/gravity/timeScale,total=first+second;
 const path=[],eulerPath=[],colorPath=[];
 for(let frame=0;frame<=Math.ceil(total*60);frame++){
  const time=Math.min(total,frame/60),bounced=time>=first,t=(bounced?time-first:time)*timeScale;
  const height=bounced?rebound*t-gravity*t*t/2:start[1]+velocity*t-gravity*t*t/2;
  const distance=speed*Math.min(time,first)+bouncedSpeed*Math.max(0,time-first);
  const position=add([start[0],Math.max(0,height),start[2]],direction,distance);
  const progress=bounced?(time-first)/second:time/first,fade=1-Math.pow((bounced?.7:0)+progress*.3,4);
  path.push({time,position});eulerPath.push({time,position:[0,360*time,0]});colorPath.push({time,position:[fade,fade,fade,fade]});
 }
 return {path,eulerPath,colorPath,total,bounceAt:first,bouncePosition:sampleGraphPath(path,first)};
}
export function emitRadialDebris({event,evaluate,initial,forward,path,addEffect,presets,rng}){
 const term=evaluate(event.term),end=evaluate(event.until),radius=evaluate(event.radius),originOffset=evaluate(event.originOffset),sweep=evaluate(event.angleRange),angleStart=evaluate(event.angleStart);
 for(let i=1;i<=Math.floor((end+1e-9)/term);i++){
  const at=i*term,owner=sampleGraphPath(path,at),distance=evaluate(event.minRadius)+(radius-evaluate(event.minRadius))*rng.nextFloat(),angle=rng.nextFloat()*360;
  addEffect(presets[event.hitKey],at,{anchor:'feet',directed:false},add(add(owner,[0,1,0],originOffset),rotate([0,0,1],angle),distance));
  const radial=rotate(forward,angleStart+sweep*at/end),start=add(owner,[0,1,0],originOffset);
  const debris=elasticDebris({start,direction:radial.map(x=>-x),speed:event.speed,bouncedSpeed:event.bouncedSpeed,velocity:event.velocity,gravity:event.gravity,timeScale:event.timeScale,elasticity:event.elasticity});
  const shift=rows=>rows.map(p=>({...p,time:p.time+at}));
  addEffect(presets[event.debrisKey],at,{directed:false,link:{motionPath:shift(debris.path),eulerPath:shift(debris.eulerPath),eulerMask:[false,true,false],colorPath:shift(debris.colorPath),fxEnd:at+debris.total}},start);
  addEffect(presets[event.bounceKey],at+debris.bounceAt,{directed:false,uniformScale:event.bounceScale},debris.bouncePosition);
 }
}

export function buildSideVaultReturn({rule,evaluate,initial,target,forward,end,options={}}){
 const side=[Math.sign(target[0]-initial[0])||Math.sign(forward[0])||1,0,0],sign=side[0];
 const approach=evaluate(rule.approach),hold=evaluate(rule.hold),retreat=evaluate(rule.retreat),backAt=approach+hold,returnAt=backAt+retreat;
 const targetHeight=options.targetHeight??.75,clearance=(options.ownerRadius??.275)+(options.targetRadius??.275)+evaluate(rule.clearance);
 const destination=add(add(target,side,-clearance),[0,1,0],targetHeight),back=add(destination,side,-evaluate(rule.backDistance));
 const clamp=u=>Math.max(0,Math.min(1,u)),lerp=(a,b,u)=>add(a,add(b,a,-1),clamp(u));
 const times=new Set(Array.from({length:Math.ceil(end*60)+1},(_,i)=>Math.min(end,i/60)));
 for(const t of [0,approach*.75,approach,2*approach,backAt,returnAt,returnAt+evaluate(rule.returnInterpolation),end])if(t<=end)times.add(t);
 const path=[],spinePath=[],spineRotationPath=[],directionPath=[];const pivot=evaluate(rule.pivot),approachAngle=evaluate(rule.approachAngle),retreatAngle=evaluate(rule.retreatAngle),ramp=evaluate(rule.heightRampStart);
 const angleAt=time=>time<approach?0:time<2*approach?sign*approachAngle*(time-approach)/approach:time<backAt?sign*approachAngle:time<returnAt?sign*(approachAngle+(retreatAngle-approachAngle)*(time-backAt)/retreat):0;
 for(const time of [...times].sort((a,b)=>a-b)){
  let position=time<approach?lerp(initial,destination,time/approach):time<backAt?destination.slice():time<returnAt?lerp(destination,back,(time-backAt)/retreat):lerp(back,initial,(time-returnAt)/evaluate(rule.returnInterpolation));
  const angle=angleAt(time),r=angle*Math.PI/180,manualHeight=time<approach?targetHeight*clamp((time/approach-ramp)/(1-ramp)):time<backAt?targetHeight:time<returnAt?targetHeight*(1-(time-backAt)/retreat):0;
  const jump=time>=backAt&&time<returnAt?evaluate(rule.jumpHeight)*Math.sin(Math.PI*(time-backAt)/retreat):0;
  path.push({time,position});spinePath.push({time,position:[pivot*Math.sin(r),manualHeight+jump+pivot*(1-Math.cos(r)),0]});
  // Duplicate time encodes the native instantaneous Rotate(0,0), avoiding a rewind.
  if(time===returnAt)spineRotationPath.push({time,angle:sign*retreatAngle});
  spineRotationPath.push({time,angle});
  const facing=time<returnAt?side:[Math.sign(initial[0]-back[0])||sign,0,0];if(time===returnAt)directionPath.push({time,position:side});directionPath.push({time,position:facing});
 }
 return {path,spinePath,spineRotationPath,directionPath};
}

export function nativePoolEventTransform(effect,event,forward){
 if(!event.nativePoolTransform)return null;
 const scale=effect.poolInitialScale||[1,1,1],offset=(effect.poolOffset||[0,0,0]).slice(),direction=effect.poolDirection;
 if(event.nativePoolTransform==='sideMirror')offset[0]*=Math.sign(forward[0])||1;
 else if(event.nativePoolTransform==='direct')offset.fill(0);
 else if(event.directed!==false&&direction?.some(x=>x)){
  const angle=(Math.atan2(forward[0],forward[2])-Math.atan2(direction[0],direction[2]))*180/Math.PI;
  const rotated=rotate(offset,angle);offset.splice(0,3,...rotated);
 }
 return {offset,scale,rotationType:event.nativePoolTransform==='directional'&&event.directed!==false?effect.poolType||'Default':'Default',
         directed:event.nativePoolTransform==='directional'&&event.directed!==false&&!!direction?.some(x=>x)};
}
