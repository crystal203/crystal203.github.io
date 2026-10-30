// Entity routines compiled from Lua operations; all timing/physics inputs are
// action fields. Physical mines keep their own clocks after actor release.
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k),len=v=>Math.hypot(...v),unit=v=>{const n=len(v);return n?v.map(x=>x/n):[1,0,0];};
const rotate=(v,a)=>{const r=a*Math.PI/180;return[v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
export function buildSourceMines({a,at,initial,center,forward,targets,extraMines,effect,presets,poolLimit,effects}){
 const range=a.MineSearchRange,destination=targets.find(t=>len(add(t,initial,-1))<=a.MaxDist)||add(initial,forward,a.MaxDist),diff=add(destination,center,-1),distance=len(diff),angle=Math.acos(Math.max(-1,Math.min(1,(2*distance*distance-1)/(2*distance*distance))))*180/Math.PI;
 const destinations=[destination,...(extraMines?[-angle,angle].map(d=>{const p=add(center,rotate(forward,d),distance);p[1]=0;return p;}):[])],trace=[];
 for(const [index,target]of destinations.entries()){
  const id='mine:'+index,throwDuration=distance/a.Speed,motion=[{time:at,position:center.slice()}],jumps=[{at:0,duration:throwDuration,height:.5}],clips=[{name:'idle',start:0,track:'Base',loop:true,speed:1}];
  let current=center.slice(),clock=0,throwing=true,locked=null,speed=a.MoveSpeed,lockedAt=null,deadAt=null;
  for(let frame=1;frame<=Math.ceil((throwDuration+a.LifeTime+1)*60);frame++){
   const elapsed=frame/60,previous=current.slice(),old=clock;clock+=1/60;
   if(throwing){const p=Math.min(1,clock/throwDuration);current=add(center,add(target,center,-1),p);if(clock>throwDuration){throwing=false;clock=0;}}
   else if(!locked){locked=targets.find(t=>Math.hypot(t[0]-current[0],t[2]-current[2])<=range)||null;if(locked){lockedAt=at+elapsed;jumps.push({at:elapsed,duration:.5,height:.5});clips[0].end=elapsed;clips.push({name:'jump',start:elapsed,track:'Base',speed:1,loop:false,nextName:'walk'});}}
   else{const ds=a.Accel/60,movement=Math.min(speed+ds*.5,a.MaxSpeed)/60;speed+=ds;const d=unit([locked[0]-previous[0],0,locked[2]-previous[2]]);current=add(previous,d,movement);}
   const move=[current[0]-previous[0],0,current[2]-previous[2]],distance=len(move),direction=unit(move);
   // Preview target bounds use the standard .55 width; swept mine OBB is 1x.25x1.
   let contact=null;
   for(const t of targets){const rel=add(t,previous,-1),along=rel[0]*direction[0]+rel[2]*direction[2],side=Math.abs(rel[0]*direction[2]-rel[2]*direction[0]);if(side<=.775&&along>=-.775&&along<=distance+.775&&Math.abs(current[1]-.375)<=.5){const d=Math.max(0,along-.775);if(contact==null||d<contact)contact=d;}}
   if(contact!=null)current=add(previous,direction,Math.min(contact,distance));
   motion.push({time:at+elapsed,position:current.slice()});
   if(contact!=null||clock>=a.LifeTime){deadAt=at+elapsed;break;}
  }
  if(deadAt==null)throw Error('Source mine lifetime exceeded');
  const offsets=motion.map(p=>{const t=p.time-at;let y=0;for(const j of jumps){const u=(t-j.at)/j.duration;if(u>=0&&u<1)y+=j.height*Math.sin(Math.PI*u);}return{time:t,position:[0,y,0]};});
  effect(presets.mine,at,center,{entityId:id,motionPath:motion,skeletonIdle:'idle',skeletonClips:clips,skeletonOffsetPath:offsets,fxEnd:deadAt});
  effect(presets.light,at,center,{motionPath:motion,entityBoneFollower:{entityId:id,bone:'body'},fxEnd:lockedAt??deadAt});
  if(lockedAt!=null)effect(presets.red,lockedAt,motion.find(p=>p.time>=lockedAt).position,{motionPath:motion,entityBoneFollower:{entityId:id,bone:'body'},fxEnd:deadAt});
  effect(presets.explosion,deadAt,current);trace.push({id,spawn:at,throwDuration,lockedAt,death:deadAt,position:current,independentClock:true});
 }
 return trace;
}
export function buildSourceBombs({a,plan,initial,center,forward,targets,myth,effect,presets,rng,effects,poolLimit}){
 const max=a.Speed*a.LifeTime,first=len(add(targets[0],initial,-1))<=max?targets[0]:add(initial,forward,max),second=targets.find((p,i)=>i&&len(add(p,first,-1))<=a.SecondSearchRange)||first,trace=[];
 let screened=false;
 for(const [index,at]of a.ShootTiming.entries()){
  const target=index?second:first,delta=add(target,center,-1),distance=len(delta),duration=distance/a.Speed,x1=distance/2,height=plan.arcOffset*Math.hypot(delta[0],delta[2])/max,dy=target[1]-center[1],qa=(dy-height*distance/x1)/((distance-x1)*distance),qb=(height-x1*x1*qa)/x1;
  const motion=[];let death=at;
  for(let f=0;f<=Math.ceil(duration*60);f++){const t=f/60,u=Math.min(1,t/duration),p=add(center,delta,u),x=t*a.Speed;p[1]=qa*x*x+qb*x+center[1];death=at+t;motion.push({time:death,position:p});}
  const direction=unit(delta),last=target.slice();effect(presets.fire,at,center,{directed:true,graphDirection:direction.map(v=>-v)});
  for(const key of ['proj','trail']){const e=effects.get(presets[key]),tail=e.dispose==='TriggeredTimeLimit'?(poolLimit(presets[key])??e.duration):0;effect(presets[key],at,center,{motionPath:motion,triggeredDisposeAt:death,fxEnd:death+tail});}
  if(!screened){effect(presets.screen,death,initial,{screen:true});screened=true;}
  effect(presets.explosion,death,add(last,[0,myth?0:plan.explosionOffset,0]),{directed:myth,graphDirection:myth?rotate([0,0,1],rng.nextFloat()*360):forward});trace.push({at,death,target:last,duration,independentClock:true});
 }
 return trace;
}
