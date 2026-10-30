import {effectLookup} from './effect-lookup.js';
// Registered ManualSoundWave: frame clock, hop, no-replacement projectile draw,
// and separately source-compiled normal-action option effects.
import {UnityRand} from './native-random.js';
import {aimDirection,targetPosition} from './targeting.js';
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const rotate=(v,a)=>{const r=a*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),0,v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
export function nativeSoundWaveActionModules(index,options,native,plans,style){
 const basics=(style.ManualBattleActions||[]).filter(n=>n.startsWith('Manual'));
 const selected=basics.map(n=>plans.find(p=>p.action===n&&p.behavior==='native-soundwave')).filter(Boolean);
 if(!selected.length)return [];
 const effects=effectLookup(index.effects);
 const hero=options.heroAppearance||options.appearance||options.profile.defaultSkin,weapon=native.weapons?.[options.weapon];
 const ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?weapon?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 const initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),target=add(targetPosition(options,options.direction),[0,.375,0]);
 function build(sequence){
  const rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);const stateBefore=rng.getState(),tracks=[],clips=[],shots=[],jumps=[],optionEvents=[],cooldowns=new Map();let offset=0;
  function effect(preset,at,position,link={}){if(!preset)return;const e=effects.get(preset);if(!e)throw Error('Missing native sound-wave effect '+preset);tracks.push({effect:e,at:0,link:{delay:at,end:0,clips:[],anchor:'feet',graphPosition:position.slice(),graphDirection:forward,directed:false,fxEnd:at+e.duration,...link}});}
  for(const plan of sequence){
   const a=native.actions[plan.action],rule=plan.nativeSoundWave,myth=ids.has(a.MythOptionId),names=list(myth?a.MythProjName:a.ProjName),available=names.map((_,i)=>i),presets={...fields(a.PresetInfo),...(myth?fields(a.MythPresetInfo):{})},end=a.ActionDuration;
   const anim=list(a.AnimationInfo).find(r=>r.Name==='action');if(anim)clips.push({name:anim.Animation,start:offset,end:offset+end,track:'Base',speed:anim.Scale??1,loop:!!anim.Loop,...(anim.TargetDuration?{targetDuration:anim.TargetDuration}:{})});
   const [jumpStart,jumpEnd]=a.DashFrame.map(f=>f/rule.fps);if(jumpStart>=0)jumps.push({at:offset+jumpStart,end:offset+jumpEnd,height:rule.jumpHeight});
   for(const contract of plan.normalTriggerOptions||[]){
    if(!ids.has(contract.optionId)||offset<(cooldowns.get(contract.optionId)??-Infinity))continue;
    const base=byId.get(contract.optionId),upgrade=ids.has(base.MythOptionId)?byId.get(base.MythOptionId):null,o={...base,...upgrade},preset={...fields(base.PresetInfo),...fields(upgrade?.PresetInfo)}[contract.key];
    effect(preset,offset,initial,{graphFollow:true});cooldowns.set(contract.optionId,offset+o[contract.cooldownField]);optionEvents.push({at:offset,optionId:base.Id,myth:!!upgrade,preset,nextReady:cooldowns.get(base.Id),recipients:['owner']});
   }
   for(const [i,frame]of list(a.ShootFrame).entries()){
    // Unity Random.Range(int,int) is uint32 modulo; RemoveAt prevents repeats.
    const pick=rng.nextUint()%available.length,projectileIndex=available.splice(pick,1)[0],name=names[projectileIndex],p=native.projectiles[name];if(!p)throw Error('Missing native sound-wave projectile '+name);
    // Default flag=false is serialized as number 1 in GetTriggerInfo and
    // restored by OnStart; it reverses Angle indexing, not the facing vector.
    const at=offset+frame/rule.fps,angleIndex=a.Angle.length-i-1,angle=a.Angle[angleIndex]??0,direction=rotate(forward,angle),start=add(add(initial,[0,.375,0]),direction,rule.shootOffset),life=p.Lifetime,speed=p.Speed||0,accel=p.Accel||0;
    const path=[];let hitAt=null,hitPosition=null,death=at+life;
    for(let f=0;f<=Math.ceil(life*60);f++){
     const t=Math.min(life,f/60),position=add(start,direction,speed*t+accel*t*t/2);path.push({time:at+t,position});
     if(hitAt==null&&Math.hypot(...add(position,target,-1))<=(p.HitBoxWidth||0)/2+.275){hitAt=at+t;hitPosition=position;if(p.PenetrateType!=='All'){death=at+t;break;}}
    }
    effect(p.ShootEffectPreset,at,start,{directed:true,graphDirection:direction});
    for(const preset of [p.PresetName,...list(p.ExtraPoolInfo).map(r=>r.PresetName)].filter(Boolean)){
     const e=effects.get(preset),tail=e?.dispose==='TriggeredTimeLimit'?(e.poolTimeLimit??e.duration):0;
     effect(preset,at,start,{motionPath:path,directed:true,graphDirection:direction,triggeredDisposeAt:death,fxEnd:death+tail});
    }
    if(hitAt!=null)effect(p.HitPreset,hitAt,hitPosition);
    if(i===0)effect(presets[rule.auraKey],at,initial,{graphFollow:true});
    shots.push({at,action:a.Name,projectile:name,projectileIndex,angle,start,hitAt,death});
   }
   offset+=end;
  }
  const activeJumps=[];for(const j of jumps)if(j.at>=(activeJumps.at(-1)?.end??-Infinity))activeJumps.push(j);
  const jumpTail=Math.max(offset,...activeJumps.map(j=>j.end)),times=new Set([0,offset,jumpTail,...activeJumps.flatMap(j=>[j.at,(j.at+j.end)/2,j.end])]);for(let f=0;f<=Math.ceil(jumpTail*60);f++)times.add(Math.min(jumpTail,f/60));
  const spinePath=[...times].sort((a,b)=>a-b).map(time=>({time,position:[0,activeJumps.reduce((y,j)=>time>=j.at&&time<j.end?y+j.height*Math.sin(Math.PI*(time-j.at)/(j.end-j.at)):y,0),0]}));
  const graphPath=[{time:0,position:initial.slice()},{time:jumpTail,position:initial.slice()}];
  for(const t of tracks)Object.assign(t.link,{end:offset,graphPath,graphOwnerAtBirth:initial.slice()});
  return {actor:{end:offset,clips,graphPath,spinePath},tracks,duration:Math.max(jumpTail,...tracks.map(t=>t.link.fxEnd)),source:selected[0].source,sourceTrace:{shots,jumps:activeJumps,optionEvents},random:{implementation:'UnityEngine.Random.Range(int,int), without replacement',stateBefore,stateAfter:rng.getState()}};
 }
 const result=selected.map(p=>({id:'basic-'+(basics.indexOf(p.action)+1),label:'普攻第 '+(basics.indexOf(p.action)+1)+' 段',...build([p])}));
 if(selected.length>1)result.push({id:'basic-combo',label:'普攻连贯',...build(selected)});
 return result;
}
