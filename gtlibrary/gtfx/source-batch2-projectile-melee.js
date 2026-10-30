import {scriptActionModules} from './script-actions.js';
import {aimDirection,targetPositions} from './targeting.js';
import {sampleGraphPath} from './graph-action.js';
const add=(a,b,k=1)=>a.map((x,i)=>x+k*b[i]),length=v=>Math.hypot(...v),list=v=>Array.isArray(v)?v:v==null?[]:[v];
const times=(end,extra=[])=>[...new Set([...Array.from({length:Math.ceil(end*60)+1},(_,i)=>Math.min(end,i/60)),...extra])].sort((a,b)=>a-b);
const fields=v=>Object.fromEntries(list(v).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
// Small operation recipes supplement the common timeline interpreter. All
// selection is by source contract; no actor or resource names are dispatched.
export function batch2ProjectileMeleeActionModules(index,options,native,plans,style){
 const custom=plans.filter(p=>p.behavior==='source-batch2-projectile-melee');if(!custom.length)return [];
 const result=[],basics=(style.ManualBattleActions||[]).filter(n=>n.startsWith('Manual'));
 const build=(input,initial=options.actorPosition||[0,0,0])=>{
  const a=native.actions[input.action],p=structuredClone(input);p.behavior='timeline';const forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0],distance=length(add(target,initial,-1)),facing=Math.abs(forward[0])>=Math.abs(forward[2])?forward[0]<0?'left':'right':forward[2]<0?'front':'back',trace={operation:p.operation,previewStep:1/60};
  const ev=(key,at=0,extra={})=>({op:'effect',key,at,nativePoolLifetime:true,nativePoolTransform:extra.directed?'directional':'direct',...extra});let specialSpine=null;
  if(p.operation==='parented-companion'){
   const e=p.events.find(e=>e.key===p.companionKey);e.link={...e.link,skeletonView:['left','right'].includes(facing)?'side':facing,skeletonFlip:facing==='left'};trace.parent='owner Transform';trace.animation=p.companionAnimation;
  }else if(p.operation==='linear-contact-motion'){
   const travel=Math.min(Math.max(0,distance-.55),p.motionSpeed*(p.end-p.motionAt));p.moves=[{op:'lerp',at:p.motionAt,duration:p.end-p.motionAt,offset:travel-distance}];trace.travel=travel;trace.moveStart=p.motionAt;
  }else if(p.operation==='deviate-local'){
   const d=p.deviate,out=d.duration*d.outFraction;specialSpine=times(p.end,[d.at,d.at+out]).map(time=>{const t=time-d.at,value=t<0||t>=d.duration?0:t<=out?Math.sin(t/out*Math.PI/2):1-(t-out)/(d.duration-out);return {time,position:forward.map(v=>v*d.offset*value)};});trace.deviate=d;
  }else if(p.operation==='plateau-spine-stomp'){
   const j=p.jumpCurve,fall=facing==='front'?j.downFallStart:j.fallStart;specialSpine=times(p.end,[j.at,j.at+j.rise,j.at+fall,j.at+j.duration]).map(time=>{const t=time-j.at;let y=t<0||t>=j.duration?0:t<j.rise?j.height*Math.sin(t/j.rise*Math.PI/2):t<=fall?j.height:j.height*(1-Math.sin((t-fall)/(j.duration-fall)*Math.PI/2));return {time,position:[0,y,0]};});
   p.events.push(ev(['left','right'].includes(facing)?'attack_side':'attack',p.upperAt,{anchor:'feet',offset:['left','right'].includes(facing)?0:.5,directed:false,mirrorXByFacing:['left']}));trace.jump={...j,fallStart:fall};
  }else if(p.operation==='falling-independent-routine'){
   const f=p.fall,motion=[];let impact;for(let frame=1;frame<1000;frame++){const t=frame/60,h=Math.max(0,f.apex+f.velocity*t-f.gravity*t*t/2),pos=target.slice();pos[0]-=(forward[0]>0?1:-1)*f.horizontalDistance*h/f.apex;pos[1]+=h;motion.push({time:f.launchAt+t,position:pos});if(h===0){impact=f.launchAt+t;break;}}
   for(const key of f.projectileKeys)p.events.push(ev(key,motion[0].time,{anchor:'targetGround',directed:false,triggerDisposeAt:impact,link:{motionPath:motion}}));p.events.push(ev(f.impactKey,impact,{anchor:'targetGround',directed:false}));trace.launchAt=motion[0].time;trace.impactAt=impact;trace.motion=motion;trace.actorEnd=p.end;
  }else if(p.operation==='growing-contact-charge'){
   const r=p.roll,start=a.ChargeStartTiming,speed=r.previewWalkSpeed*a.ChargeSpeed,grow=Math.min(a.IncreaseEndTiming-start,a.ActionDuration-start),path=[{time:0,position:initial.slice()},{time:start,position:initial.slice()}],ball=[{time:0,position:add(initial,forward,a.MinExplosionRadius*r.offset)},{time:start,position:add(initial,forward,a.MinExplosionRadius*r.offset)}],scale=[{time:0,position:[2*a.MinExplosionRadius,2*a.MinExplosionRadius,2*a.MinExplosionRadius]},{time:start,position:[2*a.MinExplosionRadius,2*a.MinExplosionRadius,2*a.MinExplosionRadius]}];let stop=a.ActionDuration,size=a.MinExplosionRadius,blocked=false,previous=start;
   for(const time of times(a.ActionDuration,[start,a.IncreaseEndTiming]).filter(t=>t>start)){
    const dt=time-previous;size=a.MinExplosionRadius+(a.MaxExplosionRadius-a.MinExplosionRadius)*Math.min((time-start)/grow,1);const owner=path.at(-1).position,travel=dt*speed,center=add(owner,forward,size*r.offset+travel/2),delta=add(target,center,-1),along=delta[0]*forward[0]+delta[2]*forward[2],side=Math.abs(delta[0]*forward[2]-delta[2]*forward[0]),radius=options.targetRadius??.275;blocked=Math.abs(along)<=size/Math.SQRT2+travel/2+radius&&side<=size/Math.SQRT2+radius;const next=add(owner,forward,travel);path.push({time,position:next});ball.push({time,position:add(next,forward,size*r.offset)});scale.push({time,position:[2*size,2*size,2*size]});previous=time;if(blocked){stop=time;break;}
   }
   p.end=stop+a.GroggyDuration;p.moves=[];p.clips=[{key:'dash',at:start,end:stop},{key:'groggy',at:stop,end:p.end}];p.events=[ev('screen',0,{screen:true,directed:false}),ev('spawn',0,{anchor:'feet',directed:true,triggerDisposeAt:start,link:{motionPath:ball.filter(x=>x.time<=start)}}),ev('snowball',0,{anchor:'feet',directed:true,triggerDisposeAt:stop,link:{motionPath:ball,uniformScalePath:scale}}),ev('trail',start,{anchor:'feet',directed:true,triggerDisposeAt:stop,link:{motionPath:ball,uniformScalePath:scale}}),ev('footstep',start,{anchor:'feet',directed:true,triggerDisposeAt:stop,link:{motionPath:path}}),ev('explosion',stop,{anchor:'feet',directed:false,uniformScale:Math.min(size*2,r.explosionScaleCap),link:{graphPosition:ball.at(-1).position}})];
   path.push({time:p.end,position:path.at(-1).position.slice()});trace.path=path;trace.stopAt=stop;trace.blocked=blocked;trace.size=size;trace.speed=speed;trace.ball=ball;trace.scale=scale;trace.hitTimes=a.HitTiming.map(t=>stop+t);trace.collisionBoundary='single flat preview target swept OBB; no stage obstacles or joystick steering';
  }
  const m=scriptActionModules(index,{...options,actorPosition:initial},native,[p],style).find(m=>m.id!== 'basic-combo');if(!m)return null;m.sourceTrace=trace;
  if(p.nativeAim&&m.actor.nativeAim)m.actor.nativeAim.windows=p.nativeAim.windows;
  if(trace.path){m.actor.graphPath=trace.path;for(const t of m.tracks){t.link.graphPath=trace.path;t.link.graphOwnerAtBirth=sampleGraphPath(trace.path,t.link.delay||0);}}
  if(specialSpine){m.actor.spinePath=specialSpine;for(const t of m.tracks){const event=p.events.find(e=>e.key&&fields(a.PresetInfo)[e.key]===t.effect.preset&&e.followSpine);if(event){t.link.graphPath=m.actor.graphPath.map(x=>({time:x.time,position:add(x.position,sampleGraphPath(specialSpine,x.time))}));t.link.graphOwnerAtBirth=sampleGraphPath(t.link.graphPath,t.link.delay||0);t.link.graphPosition=add(t.link.graphPosition,sampleGraphPath(specialSpine,t.link.delay||0));}}}
  return m;
 };
 for(const p of custom){const m=build(p);if(m)result.push(m);}
 if(custom.some(p=>p.category==='basic')&&basics.length>1){
  let at=0,initial=(options.actorPosition||[0,0,0]).slice();const tracks=[],clips=[],path=[],spinePath=[],aims=[];
  for(const name of basics){const p=plans.find(p=>p.action===name);if(!p)continue;const m=p.behavior==='source-batch2-projectile-melee'?build(p,initial):scriptActionModules(index,{...options,actorPosition:initial},native,[p],style).find(m=>m.id!=='basic-combo');if(!m)continue;if(m.actor.nativeAim)aims.push({...m.actor.nativeAim,windows:m.actor.nativeAim.windows.map(w=>({...w,at:at+w.at,end:at+w.end}))});tracks.push(...m.tracks.map(t=>({...t,at:at+(t.at||0)})));clips.push(...m.actor.clips.map(c=>({...c,start:at+c.start,end:at+(c.end??m.actor.end)})));path.push(...m.actor.graphPath.map(v=>({...v,time:at+v.time})));spinePath.push(...m.actor.spinePath.map(v=>({...v,time:at+v.time})));initial=sampleGraphPath(m.actor.graphPath,m.actor.end);at+=m.actor.end;}
  result.push({id:'basic-combo',label:'普攻连贯',actor:{end:at,clips,graphPath:path,spinePath,...(aims.length?{nativeAim:{...aims[0],windows:aims.flatMap(a=>a.windows)}}:{})},tracks,duration:Math.max(at,...tracks.map(t=>t.at+t.link.fxEnd))});
 }
 return result;
}
