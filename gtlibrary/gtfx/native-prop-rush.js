// Expands a source timed prop rush into existing timeline and embedded-Spine APIs.
import {scriptActionModules} from './script-actions.js';
import {targetPositions,aimDirection} from './targeting.js';
const add=(a,b,k=1)=>a.map((x,i)=>x+k*b[i]);
export function propRushActionModules(index,options,native,plans,style){
 const results=[];
 for(const plan of plans.filter(p=>p.behavior==='source-prop-rush')){
  const a=native.actions[plan.action],r=plan.choreography,end=plan.end,initial=options.actorPosition||[0,0,0],target=targetPositions(options,options.direction)[0],aim=aimDirection(options,options.direction,initial),forward=[aim[0]<0||aim[0]===0&&aim[2]<0?-1:1,0,0],first=add(target,forward,-r.firstDistance),horse=add(add(first,forward,r.propForward),r.propOffset),destination=add(target,r.propOffset);
  const event=(key,at,extra={})=>({op:'effect',key,at,anchor:'feet',directed:false,nativePoolTransform:'direct',...extra});
  const timeline={...plan,behavior:'timeline',sideDirection:true,sideDirectionVertical:true,meleeTimeline:true,moves:[{op:'lerp',at:0,duration:r.approachDuration,offset:-r.firstDistance},{op:'lerp',at:r.returnAt,duration:0,to:'origin'}],spine:[],
   clips:[{key:'throw',at:r.throwAt},{key:'cast',at:r.propAt},{key:'cast',at:r.castAt,track:'Emotion'}],
   events:[event('pinata',r.propAt,{offset:r.propForward,offsetVector:r.propOffset,until:end}),event('cast',r.castAt,{anchor:'center',offset:.5,directed:true,nativePoolTransform:'directional'}),event('dash',r.rushAt,{anchor:'center',directed:true,nativePoolTransform:'directional',until:end}),event('contrail',r.rushAt,{anchor:'center',until:end}),event('explosion',a.HitTiming,{anchor:'targetGround',negativeKey:'explosion_rev'})]};
  // Already source-locked to left/right, including the source vertical fallback.
  const adjusted={...options,targetPosition:target,direction:forward[0]<0?'left':'right'};
  const module=scriptActionModules(index,adjusted,native,[timeline],style)[0];if(!module)throw Error('Missing source prop-rush module');
  module.actor.directionPath=[{time:0,position:forward.slice()},{time:end,position:forward.slice()}];
  const returning=module.actor.graphPath.findIndex(p=>Math.abs(p.time-r.returnAt)<1e-9);if(returning>=0)module.actor.graphPath.splice(returning,0,{time:r.returnAt,position:first.slice()});
  const path=[{time:r.propAt,position:horse.slice()},{time:r.rushAt,position:horse.slice()}];let pos=horse.slice();
  for(let frame=0;frame<=Math.round((r.rushEnd-r.rushAt)*r.fps);frame++){
   const time=r.rushAt+frame/r.fps,remaining=Math.max(0,r.rushEnd-time),fraction=remaining<=1e-9?1:Math.min(1,(1/r.fps)/remaining);
   pos=add(pos,add(destination,pos,-1),fraction);path.push({time,position:pos.slice()});
  }
  for(const t of module.tracks){
   const key=t.effect.preset,source=Object.fromEntries(a.PresetInfo.flatMap(v=>v.Name&&v.Preset?[[v.Name,v.Preset]]:Object.entries(v)));
   if(key===source.pinata){
    const shift=add(t.link.graphPosition,horse,-1);t.link.motionPath=path.map(p=>({...p,position:add(p.position,shift)}));
    Object.assign(t.link,{skeletonIdle:r.propAnimation,skeletonClips:[{name:r.propAnimation,start:0,loop:true,track:'Base'}],skeletonFlip:forward[0]<0,skeletonAlpha:[{at:0,from:0,to:1,duration:r.propFadeDuration}]});
   }else if(key===source.dash||key===source.contrail){
    const extra=key===source.dash?add(r.dashOffset,forward):r.dashOffset,base=add(first,[0,.375,0]),shift=add(t.link.graphPosition,base,-1);
    t.link.motionPath=path.filter(p=>p.time>=r.rushAt).map(p=>({...p,position:add(add(p.position,extra),shift)}));
   }
  }
  module.sourcePropRush={source:plan.source,sourceSha256:plan.sourceSha256,first,horse,destination,path,fps:r.fps,partyReaction:'no matching living party member in the single-owner preview'};
  results.push(module);
 }
 return results;
}
