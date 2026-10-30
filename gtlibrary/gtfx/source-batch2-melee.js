import {continuousArsenalActionModules} from './native-continuous-arsenal.js';
import {scriptActionModules} from './script-actions.js';
import {sourceHero} from './weapon-hero-variants.js';
import {aimDirection,targetPositions} from './targeting.js';
import {sampleGraphPath} from './graph-action.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v],add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
export function batch2MeleeActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-batch2-melee'),hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const delayed=selected.filter(p=>p.sourceMelee.operation==='delayed-melee-combo'),result=[];
 const ev=(key,at=0,extra={})=>({op:'effect',key,at,anchor:'center',nativePoolTransform:extra.directed===false?'direct':'directional',nativePoolLifetime:true,...extra});
 function comboPlans(boost){return delayed.map(plan=>{const a=native.actions[plan.action],kind=a.AttackType,option=ids.has(a.OptionId)&&byId.get(a.OptionId),on=boost&&!!option,scale=on?1+option.AttackSpeedScale:1,end=a.ActionDuration/scale,events=[],clips=[{key:'action',at:0}],moves=[],spine=[];
  if(kind==='stomp'){clips[0].speed=(list(a.AnimationInfo).find(r=>r.Name==='action')?.Scale||1)*scale;moves.push({op:'dash',at:a.StayDuration/scale,duration:a.DashDuration/scale,speed:a.DashSpeed*scale});spine.push({op:'jump',at:a.StayDuration/scale,height:1.5,duration:a.DashDuration-.1});events.push(ev(on?'enhance':'stomp',a.HitTiming/scale,{anchor:'feet',offset:a.Offset,directed:false}));}
  else {moves.push({op:'dash',at:a.HitTiming,duration:a.DashDuration,speed:a.DashSpeed});events.push(ev('slash',a.HitTiming-.02,{offset:.2,follow:true,followSpine:true,fourWay:true}));}
  const presets={...fields(a.PresetInfo),...(option?fields(option.PresetInfo):{})};return {...plan,behavior:'timeline',end,events,clips,moves,spine,meleeTimeline:true,cancelJumpAtEnd:true,resolvedParameters:{action:a,presets}};
 });}
 if(delayed.length){const boosted=Object.hasOwn(options.buffScores||{},delayed[0].sourceMelee.boostBuff)||Object.hasOwn(options.buffScores||{},delayed[0].sourceMelee.boostEventId);result.push(...scriptActionModules(index,options,native,comboPlans(boosted),style));
  if(!boosted&&delayed.some(p=>ids.has(native.actions[p.action].OptionId)))for(const m of scriptActionModules(index,options,native,comboPlans(true),style).filter(m=>m.id==='basic-1'||m.id==='basic-combo'))result.push({...m,id:m.id+'-enhanced',label:'强化'+m.label,nativeCondition:{buff:delayed[0].sourceMelee.boostBuff,sourceEventId:delayed[0].sourceMelee.boostEventId}});
 }
 if(delayed.length)for(const option of byId.values()){
  if(!ids.has(option.Id)||option.Class!=='OnTriggerBattleActionPassive'||!option.SelfEffectPreset)continue;
  const action=native.actions[option.BattleActionName];if(!action?.EffectPresetNames?.length||action.LuaAddOn)continue;
  const events=action.EffectPresetNames.map((preset,i)=>({op:'effect',preset,at:action.EffectCreateTimings[i],anchor:action.EffectAnchors?.[i]==='Target'?'target':'feet',follow:!!action.EffectFollowingTargets?.[i],directed:false,nativePoolTransform:'direct',nativePoolLifetime:true}));
  events.push({op:'effect',preset:option.SelfEffectPreset,at:0,anchor:'feet',follow:true,directed:false,nativePoolTransform:'direct',nativePoolLifetime:true});
  const p={behavior:'timeline',category:'support',id:'support',label:'连锁技能',action:action.Name,end:action.Duration,animationArrays:true,clips:list(action.EmotionKeys).map((animation,i)=>({animation,at:action.EmotionTimings?.[i]||0,end:action.EmotionRemoveTimes?.[i]??action.Duration,track:'Emotion'})),events,moves:[],spine:[],meleeTimeline:true,source:'native BasicSupport arrays and OnTriggerBattleActionPassive source option '+option.Id};
  for(const m of scriptActionModules(index,options,native,[p],style))result.push({...m,sourceTrace:{operation:'source-triggered-owner-effect',optionId:option.Id,triggerAction:action.Name,preset:option.SelfEffectPreset}});
 }
 for(const plan of selected.filter(p=>p.sourceMelee.operation==='linear-charge')){
  if(plan.exclusive&&!options.exclusiveWeapon)continue;
  const a=native.actions[plan.action],option=ids.has(a.AscentOptionId)?byId.get(a.AscentOptionId):null,begin=a.ChargeStartProgress*a.ActionDuration*(1-(option?.ChargeStartScale||0)),initial=(options.actorPosition||[0,0,0]).slice(),forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0],path=[{time:0,position:initial.slice()},{time:begin,position:initial.slice()}];let end=a.ActionDuration,pos=initial.slice(),collision=false;
  const targetHalf=options.targetBoundsSize?.[0]/2||.275,chargeHalf=a.ChargeBoundSize[0]/2,widthHalf=a.ChargeBoundSize[2]/2;
  for(let frame=Math.floor(begin*60)+1;frame<=Math.ceil(a.ActionDuration*60);frame++){const time=Math.min(a.ActionDuration,frame/60),old=path.at(-1).time,dist=(time-old)*a.ChargeSpeed,delta=add(target,pos,-1),along=delta[0]*forward[0]+delta[2]*forward[2],side=Math.abs(delta[0]*forward[2]-delta[2]*forward[0]);collision=side<=widthHalf+targetHalf&&along>=-chargeHalf-targetHalf&&along<=chargeHalf+targetHalf+dist;pos=add(pos,forward,dist);path.push({time,position:pos.slice()});if(collision){end=time;break;}}
  const action={...a,PresetInfo:Object.entries({...fields(a.PresetInfo),...fields(option?.PresetInfo)}).map(([Name,Preset])=>({Name,Preset}))},events=[ev('cast',0,{anchor:'feet',follow:true,triggerDisposeAt:end}),ev('dash',begin,{anchor:'feet',follow:true,triggerDisposeAt:end}),ev('smoke',begin,{anchor:'feet',follow:true,triggerDisposeAt:end}),ev('explosion',end,{anchor:'feet',directed:false})],p={...plan,behavior:'timeline',end,events,clips:[{key:'cast',at:0},{key:'cast',at:0,track:'Emotion'},{key:'dash',at:begin}],moves:[],spine:[],meleeTimeline:true,resolvedParameters:{action,presets:fields(action.PresetInfo)}};
  const m=scriptActionModules(index,options,{...native,actions:{...native.actions,[a.Name]:action}},[p],style)[0];if(!m)continue;m.actor.graphPath=path;
  for(const track of m.tracks){const at=track.link.delay,owner=sampleGraphPath(path,at);track.link.graphPosition=add(track.link.graphPosition,add(owner,initial,-1));track.link.graphPath=path;track.link.graphOwnerAtBirth=owner;}
  m.sourceTrace={operation:plan.sourceMelee.operation,chargeStart:begin,chargeEnd:end,speed:a.ChargeSpeed,ascent:!!option,collision,previewStep:1/60};result.push(m);
 }
 if(plans.some(p=>p.sourceMelee?.operation==='mixed-melee-member'&&style.ManualBattleActions?.includes(p.action))){
  let offset=0,pos=(options.actorPosition||[0,0,0]).slice();const tracks=[],clips=[],path=[],spinePath=[],parts=[];
  for(const name of style.ManualBattleActions||[]){const p=plans.find(p=>p.action===name&&p.category==='basic');if(!p)continue;const local={...options,actorPosition:pos,arsenalComboPart:true},builder=p.behavior==='source-continuous-arsenal'?continuousArsenalActionModules:scriptActionModules,m=builder(index,local,native,[p],style).find(m=>/^basic-\d+$/.test(m.id));if(!m)continue;
   parts.push({action:name,at:offset,end:offset+m.actor.end});tracks.push(...m.tracks.map(t=>({...t,at:offset+(t.at||0)})));clips.push(...m.actor.clips.map(c=>({...c,start:c.start+offset,end:(c.end??m.actor.end)+offset})));path.push(...m.actor.graphPath.map(p=>({...p,time:p.time+offset})));spinePath.push(...(m.actor.spinePath||[]).map(p=>({...p,time:p.time+offset})));pos=sampleGraphPath(m.actor.graphPath,m.actor.end);offset+=m.actor.end;
  }
  result.unshift({id:'basic-combo',label:'普攻连贯',actor:{end:offset,clips,graphPath:path,spinePath},tracks,duration:Math.max(offset,...tracks.map(t=>(t.at||0)+t.link.fxEnd)),sourceTrace:{parts}});
 }
 return result;
}


