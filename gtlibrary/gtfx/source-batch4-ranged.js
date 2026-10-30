import {scriptActionModules} from './script-actions.js';
import {sequenceActionModules} from './source-module-sequence.js';
import {aimDirection,targetPositions} from './targeting.js';
import {sampleGraphPath} from './graph-action.js';
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]),rot=(v,d)=>{const r=d*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
export function batch4RangedActionModules(index,options,native,plans,style){
 const result=[],initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0],weapon=native.weapons?.[options.weapon]||{};
 const event=(key,at=0,extra={})=>({op:'effect',key,at,nativePoolLifetime:true,nativePoolTransform:extra.directed?'directional':'direct',...extra}),shot=(at,index=0,extra={})=>({op:'projectile',index,at,directional:true,...extra});
 const path=(at,duration,fn)=>Array.from({length:Math.ceil(duration*60)+1},(_,i)=>{const t=Math.min(duration,i/60);return {time:at+t,position:fn(duration?t/duration:1,t)};});
 function build(plan,a,events,clips,end=plan.end,extra={}){return scriptActionModules(index,options,{...native,actions:{...native.actions,[a.Name]:a}},[{...plan,behavior:'timeline',events,clips,end,disableCombo:true,...extra}],style)[0];}
 function moving(key,at,motion,extra={}){return event(key,at,{anchor:'feet',link:{motionPath:motion,graphPosition:motion[0].position},...extra});}
 for(const p of plans){if(p.behavior!=='source-batch4-ranged')continue;const a=native.actions[p.action],op=p.rangedOperation;if(p.category==='basic'&&!(style.ManualBattleActions||[]).includes(a.Name))continue;if(p.category==='cwp'&&(!options.exclusiveWeapon||weapon.action!==a.Name))continue;
  if(op==='six-round-reload'){
   for(const full of [false,true]){const count=full?6:1,events=[],clips=[];for(let i=0;i<count;i++){const at=i*a.ActionDuration;events.push(shot(at+a.ShootTiming,0,{offset:weapon.shootOffset??.5,muzzleOffset:.3}));clips.push({key:'aim',at,track:'Upper'},{key:'shoot',at:at+a.ShootTiming,track:'Upper'});}const end=count*a.ActionDuration+(full?1:0);if(full){clips.push({key:'reload',at:count*a.ActionDuration,track:'Upper'});for(let i=1;i<=6;i++)events.push(event('cartridge',count*a.ActionDuration+i*.15,{directed:true}));}const m=build(p,a,events,clips,end);if(full){m.id='basic-magazine';m.label='六发弹夹与装填';m.magazine={capacity:6,count:6,consumption:10,reload:1};}m.sourceTrace={operation:op,count,staminaPerShot:10};result.push(m);}
  }else if(op==='pivot-tumble-shoot'){
   const tumble=a.AttackType==='tumbling',distance=Math.min(Math.max(a.DashPivotDist-Math.hypot(...add(target,initial,-1)),0),a.DashSpeed*a.DashDuration/2),moves=tumble?[{op:'dash',at:a.DashTiming,duration:a.DashDuration,speed:distance*2/a.DashDuration,sign:-1}]:[],spine=tumble?[{op:'jump',at:0,duration:a.DashDuration,height:1.5,aerialDuration:.05}]:[];
   result.push(build(p,a,[shot(a.ShootTiming,0,{offset:0,followSpine:tumble,directional:!tumble})],[{key:'cast',at:0},{key:'shoot',at:a.ShootTiming}],p.end,{moves,spine}));
  }else if(op==='jump-arrow-explosion'){
   const at=a.ShootTiming,spec=native.projectiles[a.ProjectileInfo[0].Name],flight=Math.max(0,(Math.hypot(...add(target,initial,-1)))/spec.Speed),impact=at+flight;
   result.push(build(p,a,[event('screen',0,{screen:true}),event('cast',0,{directed:true,follow:true,followSpine:true,triggerDisposeAt:at}),shot(at,0,{offset:0,impact:'explosion'})],[{key:'cast',at:0},{key:'shoot',at}],p.end,{moves:[{op:'dash',at:a.DashTiming,duration:a.DashDuration,speed:a.DashSpeed,sign:-1}]}));
  }else if(op==='multi-shot-combo'){
   const events=[],type=a.AttackType;for(const at of Array.isArray(a.ShootTiming)?a.ShootTiming:[a.ShootTiming]){if(type==='dagger'){for(let i=0;i<a.ShootCount;i++)events.push(shot(at,0,{offset:.5,originAngle:a.Angle*i/(a.ShootCount-1)-a.Angle/2,directionAngle:a.Angle*i/(a.ShootCount-1)-a.Angle/2}));events.push(event('cast',at+.05,{directed:true,follow:true}));}else {events.push(shot(at,0,{offset:type==='bomb'?1:0,muzzleOffset:type==='bomb'?0:1}),event('cartridge',at,{offset:.3,directed:true}));}}result.push(build(p,a,events,[{key:'shoot',at:0,track:'Upper'}]));
  }else if(op==='jump-bomb'){
   const at=a.ShootTiming,duration=a.HitTiming[0]-at,start=add(initial,[0,a.JumpHeight,0]),motion=path(at,duration,(u)=>{const v=add(start,add(target,start,-1),u);v[1]+=2*a.JumpHeight*u*(1-u);return v;});result.push(build(p,a,[moving('proj',at,motion,{triggerDisposeAt:a.HitTiming[0]}),moving('trail',at,motion,{triggerDisposeAt:a.HitTiming[0]}),event('explosion',a.HitTiming[0],{anchor:'targetGround',directed:false})],[{key:'cast',at:0},{key:'cast',at:0,track:'Emotion'},{key:'fire',at}],p.end,{spine:[{op:'jump',at:0,height:a.JumpHeight,duration:a.JumpDuration,aerialDuration:a.AerialDuration}]}));
  }else if(op==='dash-slash-combo'){
   const shoot=a.AttackType==='shoot',events=shoot?[shot(a.ShootTiming,0,{offset:1})]:[event(a.AttackType==='stomp'?'explosion':'cast',a.AttackTiming,{offset:a.Offset||0,directed:a.AttackType!=='stomp',follow:a.AttackType!=='stomp',negativeKey:a.AttackType==='upper'?'cast_rev':undefined})];result.push(build(p,a,events,[{key:'attack',at:0}],p.end,{moves:shoot?[]:[{op:'dash',at:a.DashTiming,duration:a.DashDuration,speed:a.DashSpeed}]}));
  }else if(op==='flag-target-dash'){
   const flag=path(0,a.HitTiming,u=>add(target,[0,5*(1-u),0])),events=[moving('flag',0,flag,{triggerDisposeAt:a.HitTiming}),event('screen',a.HitTiming,{screen:true}),event('dash',a.HitTiming,{offset:1,directed:true,follow:true,triggerDisposeAt:a.ActionDuration}),event('contrail',a.HitTiming,{offset:-.5,directed:true,follow:true,triggerDisposeAt:a.ActionDuration}),event('waterpool',a.HitTiming+.15,{anchor:'targetGround',directed:false})];result.push(build(p,a,events,[{key:'cast',at:0},{key:'dash',at:a.HitTiming}],p.end,{moves:[{op:'dash',at:a.HitTiming,duration:a.DashDuration,speed:Math.hypot(...add(target,initial,-1))*2/a.DashDuration,free:true}]}));
  }else if(op==='crossing-boat'){
   const reverse=forward[0]<0,sign=reverse?-1:1,suffix=reverse?'_rev':'',start=add(target,[-12*sign,0,0]),motion=[...path(a.ShootTiming,a.HitTiming-a.ShootTiming,u=>add(start,[12*sign,0,0],u)),...path(a.HitTiming,a.Duration-a.HitTiming,u=>add(target,[12*sign,0,0],u))],trail=motion.map(r=>({...r,position:add(r.position,[-sign,0,0])}));result.push(build(p,a,[event('cast'+suffix,a.ShootTiming,{offsetVector:[.2*sign,0,0],directed:false}),moving('boat'+suffix,a.ShootTiming,motion,{triggerDisposeAt:a.Duration}),moving('contrail'+suffix,a.ShootTiming,trail,{triggerDisposeAt:a.Duration}),event('hit'+suffix,a.HitTiming,{anchor:'target',directed:false})],[{key:'cast',at:0}]));
  }else if(op==='alternating-punch-break'){
   for(const full of [false,true]){const capacity=native.battleDefaults?.maxStamina||200,count=full?Math.ceil(capacity/a.StaminaPerAction)-1:1,events=[],clips=[];for(let i=0;i<count;i++){const at=i*a.ActionDuration,index=(i+1)%2;events.push(shot(at+.1,index,{offset:.5,sideOffset:(!!index===(forward[0]<=0))?-.21:.21}));clips.push({key:index?'left':'right',at:at+.1});}let end=count*a.ActionDuration;if(full){events.push(event('break',end+.05,{directed:true}));clips.push({key:'break',at:end});end+=a.ActionDuration;}const m=build(p,a,events,clips,end);if(full){m.id='basic-magazine';m.label='耐力耗尽与终结拳';}m.sourceTrace={operation:op,count,capacity,staminaPerAction:a.StaminaPerAction};result.push(m);}
  }else if(op==='five-orbit-buff'){
   const end=options.exclusiveWeapon?6:4,events=[event('cast',0,{follow:true})];for(let i=1;i<=5;i++){const motion=path(0,end,(_,t)=>add(add(initial,[0,.375,0]),rot([0,0,a.Radius],i*72+t*2.5*180/Math.PI)));for(const key of ['proj','trail'])events.push(moving(key,0,motion,{triggerDisposeAt:end}));events.push(moving('end',end,[motion.at(-1)]));}result.push(build(p,a,events,[{key:'cast',at:0}]));
  }else throw Error('Unsupported batch4 ranged operation '+op);
 }
 const basics=result.filter(m=>/^basic-\d+$/.test(m.id));
 if(basics.length>1&&!options.batch4SequencePart){
  const parts=[];let position=initial.slice();
  for(const name of style.ManualBattleActions||[]){const plan=plans.find(p=>p.action===name&&p.behavior==='source-batch4-ranged'&&p.category==='basic');if(!plan)continue;const part=batch4RangedActionModules(index,{...options,actorPosition:position,batch4SequencePart:true},native,[plan],style).find(m=>/^basic-\d+$/.test(m.id));if(!part)throw Error('Missing source combo segment '+name);parts.push(part);position=sampleGraphPath(part.actor.graphPath,part.actor.end);}
  if(parts.length===basics.length)result.push(sequenceActionModules(parts,{id:'basic-combo',label:'普攻连贯',source:'source batch4 ranged sequence'}));
 }
 return result;
}
