import {scriptActionModules} from './script-actions.js';
import {sequenceActionModules} from './source-module-sequence.js';
import {sampleGraphPath} from './graph-action.js';
export function batch6RootActionModules(index,options,native,plans,style){
 const relevant=plans.filter(p=>p.behavior==='source-batch6-root');if(!relevant.length)return [];
 const out=[],ev=(key,at=0,extra={})=>({op:'effect',key,at,anchor:'center',nativePoolLifetime:true,nativePoolTransform:extra.directed?'directional':'direct',...extra});
 const build=(p,extra)=>scriptActionModules(index,options,native,[{...p,behavior:'timeline',disableCombo:true,meleeTimeline:true,events:[],clips:[],moves:[],spine:[],sourceProjectilePools:true,recordProjectileHits:true,...extra}],style)[0];
 for(const p of relevant){const a=native.actions[p.action];if(p.category==='basic'&&!style.ManualBattleActions.includes(p.action))continue;if(p.category==='cwp'&&(!options.exclusiveWeapon||native.weapons?.[options.weapon]?.action!==p.action))continue;
  if(p.operation==='bat-basic'){
   const swingAt=Math.max(a.CastTime-.4*(1-.47),0),m=build(p,{events:[ev('cast',0,{optional:true,anchor:'feet',directed:false,follow:true,followSpine:true}),ev('slash',swingAt,{fourWay:true,directed:true,follow:true}),{op:'projectile',at:a.CastTime,index:0,offset:a.ShootOffset,directional:true,hitKey:'explosion'}],clips:[{key:'ready',at:0,end:swingAt,track:'Upper'},{key:'swing',at:swingAt,track:'Upper'},{key:'swing',at:swingAt,track:'Emotion'}]});m.sourceTrace={operation:p.operation,swingAt,shootAt:a.CastTime,authoredSwingRatio:.47};out.push(m);
  }else if(p.operation==='bat-meteor'){
   const spec=native.projectiles[a.ProjectileInfo[0].Name],height=spec.Speed*spec.Lifetime,m=build(p,{events:[ev('fire',.3,{offset:1.8,directed:true}),ev('slash',.35,{fourWay:true,directed:true}),...a.HitTiming.map(t=>({op:'projectile',at:a.ShootTiming+t,index:0,fromTarget:true,targetGround:true,height:height-.375,offset:0,directional:false,muzzle:false}))],clips:[{key:'cast',fallbackKey:'castfallback',at:0}],independentFieldEnd:a.ShootTiming+a.HitTiming.at(-1)+spec.Lifetime});m.sourceTrace={operation:p.operation,shootTimes:a.HitTiming.map(t=>a.ShootTiming+t),height,speed:spec.Speed,ownerEnd:a.AnimDuration};out.push(m);
  }
 }
 if(!options.skipBatch6RootCombo){const names=(style.ManualBattleActions||[]).filter(n=>relevant.some(p=>p.category==='basic'&&p.action===n));if(names.length>1){let pos=options.actorPosition||[0,0,0];const parts=[];for(const n of names){const p=relevant.find(p=>p.action===n),m=batch6RootActionModules(index,{...options,actorPosition:pos,skipBatch6RootCombo:true},native,[p],style).find(m=>/^basic-\d+$/.test(m.id));parts.push(m);pos=sampleGraphPath(m.actor.graphPath,m.actor.end);}out.push(sequenceActionModules(parts,{id:'basic-combo',label:'普攻连贯',source:relevant[0].source}));}}
 return out;
}
