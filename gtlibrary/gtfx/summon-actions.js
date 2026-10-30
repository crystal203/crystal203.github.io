import {batch6AActionModules} from './source-batch6-a.js';
import {sourceHero} from './weapon-hero-variants.js';
import {resolveFacing,targetPosition,aimDirection} from './targeting.js';
import {composeSummonCycle} from './summon-cycles.js';
import {scriptActionModules} from './script-actions.js';
const values=v=>Object.values(v||{});
/** Summon options are actor dependencies; their native styles run in their own skeleton. */
export function summonSelection(native,options){
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set(native.heroOptionIds?.[hero]||[]);
 const option=values(native.options).find(o=>o.Class==='Summon'&&ids.has(o.Id)&&(options.summonOptionId==null||options.summonOptionId===o.Id));if(!option)return null;
 const enhancement=values(native.options).find(o=>o.Id===option.EnhanceOptionId&&ids.has(o.Id)),myth=values(native.options).find(o=>o.Id===option.MythOptionId&&ids.has(o.Id));
 const patches=native.costumes?.[options.appearance]?.overrides?.options||{};
 const costumeOnly=patches[option.Id]?.SummonableId&&!patches[option.EnhanceOptionId]?.SummonableId;
 const id=!costumeOnly&&(myth?.SummonableId||enhancement?.SummonableId)||option.SummonableId;
 return {option,spec:native.summonables?.[id]};
}
function singleSummonActionModules(index,options,native,plans,modules){
 const selected=summonSelection(native,options);if(!selected)return modules;
 const {option,spec}=selected;if(!spec)throw Error('缺少召唤实体 '+option.SummonableId);
 const effects=new Map(index.effects.map(e=>[e.preset,e])),body=effects.get(spec.preset);if(!body)throw Error('缺少召唤骨骼 '+spec.preset);
 const present=options.summoned!==false,point=options.summonPosition;
 const offset=modules.find(m=>m.summonOffset!=null)?.summonOffset||0,aim=aimDirection(options,options.direction);
 const position=Array.isArray(point)&&point.length===3&&point.every(Number.isFinite)?[point[0],0,point[2]]:aim.map(v=>v*offset);
 const target=targetPosition(options,options.direction),facing=resolveFacing(options.summonDirection||'auto',target,position);
 const bodyTrack=(duration,actor={},at=0)=>({effect:body,at,link:{delay:0,end:duration,fxEnd:duration,anchor:'feet',directed:false,graphPosition:position.slice(),motionPath:actor.graphPath,skeletonView:facing==='left'||facing==='right'?'side':facing,skeletonFlip:facing==='left',skeletonClips:actor.clips||[],skeletonSkin:(typeof spec.SpineAssetName==='string'?spec.SpineAssetName:spec.SpineAssetName?.default)?.split('#')[1],skeletonIdle:'idle',entity:true}});
 const style=values(native.summonStyles).find(s=>s.Class===spec.Class);if(!style)throw Error('缺少召唤物战斗样式 '+spec.Class);
 const actions=new Set(style.ManualBattleActions||[]),recipes=plans.filter(p=>actions.has(p.action));
 const eligible=plan=>!plan.autonomous||(Math.hypot(position[0],position[2])<plan.masterRange&&Math.hypot(target[0]-position[0],target[2]-position[2])<=plan.targetRange);
 const entityOptions={...options,actorPosition:position,direction:facing,targetPosition:target};
 const autonomous=recipes.filter(p=>p.autonomous&&eligible(p));
 const attacks=[...batch6AActionModules(index,{...entityOptions,autonomousCycle:true},native,autonomous,style),...scriptActionModules(index,entityOptions,native,autonomous,style)].filter((m,i,a)=>a.findIndex(v=>v.id===m.id)===i);
 const result=modules.map(module=>{
  if(module.suppressSummons||!present&&!module.summon)return module;
  const tracks=module.tracks.slice(),duration=module.summon?Math.max(2,module.duration):module.duration,entityDuration=module.summonDuration!=null?module.summonDuration:duration;
  if(module.summon){const fx=effects.get(spec.SummonPresetName);if(!fx)throw Error('缺少召唤出生特效 '+spec.SummonPresetName);tracks.push({effect:fx,at:0,link:{delay:0,fxEnd:fx.duration,anchor:'feet',directed:false,graphPosition:position.slice()}});}
  let actor={},cycleInfo;
  for(const attack of attacks){
   const cycle=composeSummonCycle(attack,entityDuration,native.summonAis?.[style.Ai]);tracks.push(...cycle.tracks);actor=cycle.actor;cycleInfo=cycle.cycle;
  }
  for(const plan of recipes.filter(p=>p.autonomous&&p.passiveEvents?.length)){
   const passive={...plan,end:entityDuration,clips:[],events:plan.passiveEvents.map(e=>({...e,until:entityDuration})),autonomous:false};
   const ambient=scriptActionModules(index,entityOptions,native,[passive],style)[0];
   for(const track of ambient?.tracks||[]){if(track.link.anchor==='masterFeet'&&module.actor?.graphPath){track.link.graphPath=module.actor.graphPath;track.link.graphOwnerAtBirth=[0,0,0];}tracks.push(track);}
  }
  tracks.push(bodyTrack(entityDuration,actor));if(module.summonDuration!=null&&spec.UnsummonPresetName){const fx=effects.get(spec.UnsummonPresetName);if(!fx)throw Error('Missing native unsummon effect '+spec.UnsummonPresetName);tracks.push({effect:fx,at:entityDuration,link:{delay:0,fxEnd:fx.poolTimeLimit??fx.duration,anchor:'feet',directed:false,graphPosition:position.slice()}});}return {...module,tracks,duration:Math.max(duration,...tracks.map(t=>(t.at||0)+t.link.fxEnd)),summonedId:spec.Id,summonCycle:cycleInfo};
 });
 if(present){
  const entityModules=[...batch6AActionModules(index,entityOptions,native,recipes.filter(eligible),style),...scriptActionModules(index,entityOptions,native,recipes.filter(eligible),style)].filter((m,i,a)=>a.findIndex(v=>v.id===m.id)===i);
  for(const module of entityModules){
   result.push({...module,id:'summon-'+module.id,label:'召唤物 · '+(module.id==='basic-combo'?'连贯攻击':module.label),actor:{end:module.duration,clips:[]},tracks:[...module.tracks,bodyTrack(module.duration,module.actor)],summonedId:spec.Id});
  }
 }
 return result;
}
export function summonActionModules(index,options,native,plans,modules){
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set(native.heroOptionIds?.[hero]||[]),selected=values(native.options).filter(o=>o.Class==='Summon'&&ids.has(o.Id));
 if(selected.length<=1)return singleSummonActionModules(index,options,native,plans,modules);
 const combined=modules.map(m=>({...m,tracks:m.tracks.slice()})),children=[];
 for(const option of selected){const current=singleSummonActionModules(index,{...options,summonOptionId:option.Id},native,plans,modules);
  for(let i=0;i<modules.length;i++){combined[i].tracks.push(...current[i].tracks.slice(modules[i].tracks.length));combined[i].duration=Math.max(combined[i].duration,current[i].duration);}
  children.push(...current.slice(modules.length).map(m=>({...m,id:'summon-'+option.SummonableId+'-'+m.id.replace(/^summon-/, '')})));
 }
 return [...combined,...children];
}

