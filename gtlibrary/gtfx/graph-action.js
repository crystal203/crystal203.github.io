import {effectLookup} from './effect-lookup.js';
import {nativeVectorAngle,createGraphMirages} from './graph-native-extensions.js';
import {graphEase} from './graph-preview-helpers.js';
import {UnityRand} from './native-random.js';
import {createHomingTrajectory} from './native-projectile.js';
import {targetPositions,aimDirection} from './targeting.js';
// Bounded interpreter for exported CharacterTool/VisualScripting action graphs.
// Node types and ports define behavior; graph/actor names are only resource keys.
const unwrap=v=>v&&typeof v==='object'&&'$content' in v?unwrap(v.$content):Array.isArray(v)?v.map(unwrap):v;
const vector=v=>Array.isArray(v)?v:[v?.x||0,v?.y||0,v?.z||0];
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const length=v=>Math.hypot(...v);
const copy=v=>structuredClone(v);
const kind=n=>n.$type.split('.').at(-1);
export function sampleGraphPath(samples,time){
 if(!samples?.length)return [0,0,0];
 let lo=0,hi=samples.length-1;
 while(lo<hi){const m=Math.ceil((lo+hi)/2);if(samples[m].time<=time)lo=m;else hi=m-1;}
 const a=samples[lo],b=samples[lo+1];if(!b||time<=a.time)return a.position.slice();
 return add(a.position,b.position.map((v,i)=>v-a.position[i]),Math.min(1,(time-a.time)/(b.time-a.time)));
}
export function interpretActionGraph(graph,index,options={}){
 const random=options.random||new UnityRand(options.seed??12345);
 const nodes=new Map(graph.nodes.map(n=>[n.$id,n])),values=new Map(),controls=new Map();
 for(const e of graph.connections){const a=e.sourceUnit.$ref,b=e.destinationUnit.$ref;
  if(e.$type.endsWith('ValueConnection'))values.set(b+':'+e.destinationKey,[a,e.sourceKey]);
  else{const key=a+':'+e.sourceKey;if(!controls.has(key))controls.set(key,[]);controls.get(key).push(b);}
 }
 const vars=Object.fromEntries(graph.variables.map(v=>[v.name,copy(unwrap(v.value))]));
 const optionIds=new Set(options.optionIds||[]),direction=aimDirection(options,options.direction||'right',options.initialPosition);
 const targets=targetPositions(options,options.direction||'right').map((position,id)=>({position,target:true,id,elementalType:options.targetElements?.[id]??options.targetElement??'None'})),target=targets[0];
 const owner={position:options.initialPosition?.slice()||[0,0,0],elementalType:options.ownerElement??'None'},tracks=[],clips=[],samples=[{time:0,position:owner.position.slice()}],events=[],cache=new Map(),outputs=new Map();
 const effects=effectLookup(index.effects);
 let time=0,oldTime=-1e-7,dt=1/60,eventTime=0,routine=null,finished=false,end=0,dash=null,operations=0;
 const alpha=[],sorting=[],mirageState=createGraphMirages();let alphaValue=1;
 const recent=[],optionCooldowns=new Map(),globalFired=new Set(),pending=[],buffs=new Set(options.activeBuffs||[]),spineSamples=[];
 const staminaBefore=options.stamina??options.native?.battleDefaults?.maxStamina??200;let stamina=staminaBefore;
 let jump=null;let spineOffset=[0,0,0],spineAngle=0,syncInfo={positions:[],integers:[]},hitCount=0;
 const optionRows=new Map(Object.values(options.native?.options||{}).map(o=>[o.Id,o]));
 function staticValue(key){const info=vars[key];let result=options.action?.[key]??info?.StaticData;
  for(const id of info?.OptionOverride||[])if(optionIds.has(id)&&optionRows.get(id)?.[key]!=null)result=optionRows.get(id)[key];
  if(result==null)throw Error('Missing graph static: '+key);return result;}

 const routines=Object.values(vars).filter(v=>v?.$type==='CharacterTool.ToolRoutine');
 for(const r of routines)Object.assign(r,{active:false,time:0,old:-1e-7,fired:new Set()});
 function input(n,key,fallback){const link=values.get(n.$id+':'+key);return link?value(nodes.get(link[0]),link[1]):key in(n.defaultValues||{})?unwrap(n.defaultValues[key]):fallback;}
 function allInputs(n,suffix){return Array.from({length:n.InputCount||1},(_,i)=>input(n,`${i+1} ${suffix}`));}
 function selected(info,key){let result=info?.[key];for(const row of Array.isArray(info?.OptionalName)?info.OptionalName:[])if(optionIds.has(row.Key))result=row.Value;return result;}
 function bound(obj,pivot='Center'){const p=(obj?.position||target.position).slice();if(pivot==='Center')p[1]+=(options.centerHeight??.375);return p;}
 function value(n,port){
  if(!n)throw Error('Missing graph value node');
  const k=kind(n),v=(key,f)=>input(n,key,f),result=outputs.get(n.$id);
  if(result&&port in result)return result[port];
  switch(k){
   case 'Literal':return unwrap(n.value);
   case 'GetVariable':return vars[v('name')];
   case 'SetVariable':return vars[v('name')];
   case 'Vector3Sum':return Array.from({length:n.inputCount||2},(_,i)=>vector(v(String(i)))).reduce((a,b)=>add(a,b),[0,0,0]);
   case 'SelectOnInteger':return v(n.options.includes(v('selector'))?'%'+v('selector'):'default');
   case 'GetOwnerSpineOffset':return spineOffset.slice();
   case 'GetIsOwnerLocal':return true;
   case 'GetCharacterPosition':return (v('Target')?.position||target.position).slice();
   case 'GetListItem':return v('list',[])[v('index',0)];
   case 'Vector3Subtract':return add(vector(v('minuend')),vector(v('subtrahend')),-1);
   case 'CountItems':return v('collection',v('list',[]))?.length??0;
   case 'GetDirectionAt':return vector(v('TargetInfo',syncInfo).directions?.[v('Index',0)]??direction);
   case 'GetEffectPosition':{const t=v('PooledObject',cache.get(v('ManageKey')));return t?sampleGraphPath(t.link.motionPath||[{time:t.link.delay,position:t.link.graphPosition}],time):[0,0,0];}
   case 'GetOwnerLookDirection':return direction;
   case 'GetIsCharacterPartyLeader':return v('Target')===owner;
   case 'Magnitude':return length(vector(v('Vector')));
   case 'ScalarLerp':return v('a')+(v('b')-v('a'))*Math.max(0,Math.min(1,v('t')));
   case 'GetDistanceFurtherBetween':return Math.max(0,length(add(vector(v('Current')),vector(v('Target')),-1))-v('Length',0));
   case 'GetDashSpeedFromDistance':return Math.min(v('MaxSpeed',Infinity),2*v('DashLength',0)/v('DashDuration',1));
   case 'GetIsCharacterElementalType':{const character=v('Target');return !!character&&character.elementalType===v('ElementalType');}
   case 'GetIsCostume':return options.costumeId===v('CostumeId');
   case 'DirectionRotateEuler':{let p=vector(v('Direction')).slice(),e=vector(v('Euler')).map(x=>x*Math.PI/180);for(const axis of [2,0,1]){const i=(axis+1)%3,j=(axis+2)%3,a=p[i],b=p[j];p[i]=a*Math.cos(e[axis])-b*Math.sin(e[axis]);p[j]=a*Math.sin(e[axis])+b*Math.cos(e[axis]);}return p;}
   case 'GetStickDirection':return vector(options.stickDirection??v('Default',[0,0,0]));
   case 'OnDeclareAction':case 'OnStartAction':return port==='Direction'?direction:port==='Target'?target:syncInfo;
   case 'OnSyncAction':return syncInfo;
   case 'GetTargetAt':return v('TargetInfo',syncInfo).targets?.[v('Index',0)]??target;
   case 'GetStatic':return staticValue(v('Key'));
   case 'GetMember':if(n.member.targetType==='UnityEngine.Transform'&&n.member.name==='position')return v('target')?.position?.slice();if(n.member.targetType==='UnityEngine.Vector3'){const constants={right:[1,0,0],left:[-1,0,0],up:[0,1,0],down:[0,-1,0],forward:[0,0,1],back:[0,0,-1],zero:[0,0,0],one:[1,1,1]};return constants[n.member.name]?.slice()??vector(v('target'))['xyz'.indexOf(n.member.name)];}break;
   case 'ScalarSubtract':return v('minuend')-v('subtrahend');
   case 'ScalarDivide':return v('dividend')/v('divisor');
   case 'ScalarSum':return Array.from({length:n.inputCount||2},(_,i)=>v(String(i),0)).reduce((a,b)=>a+b,0);
   case 'ScalarMinimum':return Math.min(...Array.from({length:n.inputCount||2},(_,i)=>v(String(i),Infinity)));
   case 'Greater':return v('a')>v('b');
   case 'GetCharacterAttackToDps':return 1;
   case 'GetDamageSourceType':return 'Projectile';
   case 'GreaterOrEqual':return v('a')>=v('b');
   case 'Equal':return v('a')===v('b');
   case 'And':return v('a')&&v('b');
   case 'Or':return v('a')||v('b');
   case 'Negate':return !v('input');
   case 'Vector3Lerp':{const a=vector(v('a')),b=vector(v('b'));return add(a,add(b,a,-1),Math.max(0,Math.min(1,v('t'))));}
   case 'Vector3Angle':return nativeVectorAngle(v('a'),v('b'));
   case 'GetSpineContainer':{const character=v('Target');return character?{get position(){return add(character.position,character===owner?spineOffset:[0,0,0]);},character}:null;}
   case 'BuffAddListen':return null;
   case 'Vector3Distance':return length(add(vector(v('a')),vector(v('b')),-1));
   case 'HasActiveBuff':return buffs.has(v('BuffName'));
   case 'GetCharacterIsNull':return !v('Value',v('Target')); 
   case 'GetIsCharacterEqual':return v('From',v('A'))===v('Target',v('B'));
   // Native party selection uses PartyManager.GetPartyFor(owner).StageMembers,
   // then HpRatio or HpRatioWithShield (ARM 0x3aba77c). The preview party is a singleton.
   case 'GetLowestHpStageMember':return owner;
   case 'GetCharacterHpRatio':return options.hpRatio??1;
   case 'IsInActiveBattle':return true;
   case 'GetCurrentHitCount':return hitCount;
   case 'GetSpineSkinName':return 'default';
   case 'IsThereStaminaForAction':return stamina>0;
   case 'IsBreakAttack':return options.breakAttack??(stamina<=v('StaminaPerAction',options.action?.StaminaPerAction??0));
   case 'GetModifierForDiscreteStamina':return 1;
   case 'GetPositionAt':return syncInfo.positions?.[v('Index',0)]||target.position;
   case 'GetIntegerAt':return syncInfo.integers?.[v('Index',0)]||0;
   case 'GetOptionTriggerInfo':return {target:v('Target'),position:v('Position')};
   case 'AppendPosition':case 'AppendInteger':case 'AppendTarget':case 'AppendDirection':{
    const info={...v('TargetInfo',{})},key={AppendPosition:'positions',AppendInteger:'integers',AppendTarget:'targets',AppendDirection:'directions'}[k];
    info[key]=[...(info[key]||[]),...Array.from({length:n.InputCount||1},(_,i)=>v(i+' Value'))];return info;}
   case 'ToSideDirection':return [vector(v('DirectionVector'))[0]<0?-1:1,0,0];
   case 'GetOwner':return owner;
   case 'GetClosestTargetInBattle':case 'GetTargetForManualProj':case 'GetActionTarget':case 'GetTargetForManualMelee':case 'GetTargetForSupport':return port==='Direction'?direction:target;
   case 'GetActionDirVector':return direction;
   // The FX preview has no obstacle geometry. A host with a collision world
   // can supply the clipped endpoint; never substitute an enemy position.
   case 'GetClosestCollidedFieldObjects':{const origin=bound(owner,v('Pivot','Root')),delta=vector(v('Direction'));return options.clipMovement?.(origin,delta,v('EntityGroup'))??add(origin,delta);}
   case 'GetOwnerPosition':return bound(owner,v('Pivot','Root'));
   case 'GetBoundPosition':return bound(v('Target'),v('Pivot','Center'));
   case 'GetGroundPosition':{const p=vector(v('Position')).slice();p[1]=0;return p;}
   case 'GetBoundDistance':return Math.max(0,length(add(target.position,owner.position,-1))-(options.targetRadius??.275)-(options.ownerRadius??.275));
   case 'GetOptionApply':return optionIds.has(v('TargetId'));
   case 'GetOptionAppliedSelector':return v(optionIds.has(v('TargetId'))?'True':'False');
   case 'GetExclusiveWeapon':return options.exclusiveWeapon!==false;
   case 'SelectUnit':return v(v('condition')?'ifTrue':'ifFalse');
   case 'LessOrEqual':return v('a')<=v('b');
   case 'Less':return v('a')<v('b');
   case 'ScalarMultiply':return v('a')*v('b');
   case 'MultiplyVectorFloat':return vector(v('A',v('Vector'))).map(x=>x*v('B',v('Float',1)));
   case 'AddVectorOffset':return add(vector(v('Position')),vector(v('Direction',direction)),v('OffsetAmount',0));
   case 'CalculateMovePosition':return add(bound(v('Target'),'Root'),vector(v('Direction',direction)),v('Magnitude',0));
   case 'GetEaseProgress':{const start=v('StartTime',0),stop=v('EndTime',1),t=routine?.time??time;return graphEase(v('EaseType','Linear'),(t-start)/(stop-start));}
   case 'GetRoutinePassedTime':return v('Routine')?.time||0;
   case 'GetAnyRoutineActive':return allInputs(n,'Routine').some(r=>r?.active);
   case 'IsOnwerDirectionInSector':{const sector={back:'First',right:'Third',front:'Fifth',left:'Seventh'}[options.direction||'right'];return String(v('Sector','')).split(',').includes(sector);}
   case 'OnUpdateFrame':return port==='DeltaTime'?dt:time;
   case 'CollisionInit':{const c={...Object.fromEntries(Object.keys(n.defaultValues||{}).map(key=>[key,v(key)])),type:n.CalculatorType,active:false,hits:new Set()};for(const key of ['Radius','Size','Duration'])if(values.has(n.$id+':'+key))c[key]=v(key);outputs.set(n.$id,{Result:c});return c;}
   case 'InvokeMember':
    if(n.member?.targetType==='UnityEngine.Mathf'){const f=v('%f',0);switch(n.member.name){case 'Pow':return f**v('%p');case 'Sqrt':return Math.sqrt(f);case 'FloorToInt':return Math.floor(f);case 'Clamp':return Math.max(v('%min'),Math.min(v('%max'),v('%value')));}}
    if(n.member?.targetType==='CharacterTool.ToolFieldObject'&&['Equals','ReferenceEquals'].includes(n.member.name))return v('%objA')===v('%objB');
    if(n.member?.targetType==='UnityEngine.Vector3'&&n.member.name==='.ctor')return ['%x','%y','%z'].map(key=>v(key,0));
    if(n.member?.targetType==='UnityEngine.Random'&&n.member.name==='Range'){const a=v('%minInclusive',0),b=v('%maxInclusive',v('%maxExclusive',1)),draw=random.nextFloat();return n.member.parameterTypes?.[0]==='System.Int32'?a+Math.min(b-a-1,Math.floor(draw*(b-a))):a+draw*(b-a);}
    break;
   case 'GetHitEffect':case 'GetHitSound':return {node:n};
   case 'GetModifier':return v('Modifier',1);
   case 'GetAilmentInfo':return {};
   case 'GetCharacterDps':return options.characterDps??1;
   case 'GetCharacterMaxHp':return options.characterMaxHp??1;
  }
  throw Error('Unsupported graph value '+k+'.'+port);
 }
 function emit(id,port){for(const next of controls.get(id+':'+port)||[])run(nodes.get(next));}
 function effect(n,screen=false){
  const key=input(n,'EffectKey'),info=vars[key],preset=selected(info,'PresetName');
  if(!preset)return null;const effect=effects.get(preset);if(!effect)throw Error('Graph effect missing: '+preset);
  const position=vector(input(n,'Position',bound(owner,'Root'))),dir=vector(input(n,'Direction',[0,0,0]));
  const scale=input(n,'Scale',1),parent=input(n,'ParentObject',null);
  const track={effect,at:0,link:{delay:eventTime,end:0,clips:[],screen,directed:length(dir)>0,
   graphDirection:dir,graphPosition:position,graphOwnerAtBirth:owner.position.slice(),graphFollow:parent===owner,
   scaleFactor:typeof scale==='number'?scale:1,fxEnd:eventTime+effect.duration}};
  tracks.push(track);outputs.set(n.$id,{PooledObject:track});events.push({time:eventTime,type:kind(n),node:n.$id,preset});return track;
 }
 const passive=new Set(['PlaySound','PlayDefaultVoice','PlayCameraShake','SetIsControllingCharacter','SetIsRunCancelable','LockDirection','UnLockDirection','SetActionActive','SetOwnerDirection','SetLockedTarget','SetAimPoint','SetupRoleParameter','ApplyHeal','ApplyAggro','SetCwpDarken','UnSetCwpDarken','SetSupportDarken','UnsetSupportDarken','ChangeSupportCrashBehaviour','CacheAudioSource','DisposeAudioSource','PlayCameraShakeFadeout','ChangeCrashBehaviour','SetLeaderDarken','UnsetLeaderDarken','SetCustomBattleStyleAnim','SetRoleChargeIcon','SetRoleIcon','DecreaseUseLeft','ResetAggro','ApplyDrainShield','PlayVoice','RecoverMana','CureAllDebuff']);
 function run(n){
  if(++operations>200000)throw Error('Graph instruction budget exceeded');
  const k=kind(n),v=(key,f)=>input(n,key,f),out=port=>emit(n.$id,port);if(options.debug){recent.push([time,k,n.$id]);if(recent.length>20)recent.shift();}
  if(mirageState.control(k,v,vars,selected,eventTime)){out('OutputTrigger');return;}
  if(passive.has(k)){out('OutputTrigger');return;}
  switch(k){
   case 'ApplyBuff':{
    const name=selected(vars[v('BuffKey')],'BuffName')||v('BuffKey'),recipient=v('Target',owner),sender=v('Sender',owner);
    if(!recipient)break;
    buffs.add(name);
    const buff=Object.values(options.native?.buffs||{}).find(b=>b.Name===name);
    for(const listener of nodes.values())if(kind(listener)==='BuffAddListen'){
     const id=input(listener,'TargetBuffId',0),cls=input(listener,'TargetBuffClass',''),category=input(listener,'TargetCategory','');
     if(!buff)throw Error('Missing native buff metadata for graph listener: '+name);
     // BuffAddListen.ShouldTrigger at 0x3ace6f8: each non-default filter must match.
     if(id>0&&buff.Id!==id||cls&&buff.ClassName!==cls)continue;
     if(category)throw Error('Unsupported native buff category filter: '+category);
     outputs.set(listener.$id,{Target:recipient,Sender:sender,Buff:buff});
     events.push({type:'BuffAddListen',time:eventTime,node:listener.$id,buffId:buff.Id,target:recipient===owner?'owner':recipient.id});
     emit(listener.$id,'trigger');
    }
    break;
   }
   case 'RemoveBuff':buffs.delete(vars[v('BuffKey')]?.BuffName||v('BuffKey'));break;
   case 'IncreaseHitCount':hitCount+=v('Amount',1);break;
   case 'UseStaminaPerAction':{const cost=v('StaminaPerAction',options.action?.StaminaPerAction??0);stamina=Math.max(0,stamina-cost);events.push({type:k,time:eventTime,cost,remaining:stamina});break;}
   case 'For':{const step=v('step',1),last=v('lastIndex',0);if(!step)throw Error('Zero graph loop step');let count=0;for(let i=v('firstIndex',0);step>0?i<last:i>last;i+=step){if(++count>10000)throw Error('Graph loop budget exceeded');outputs.set(n.$id,{currentIndex:i});out('body');}out('exit');return;}
   case 'SwitchOnInteger':out(n.options.includes(v('selector'))?'%'+v('selector'):'default');return;
   case 'PlayJump':jump={at:eventTime,height:v('Height',0),up:v('JumpDuration',0),stay:v('AerialDuration',0),down:v('FallDuration',v('JumpDuration',0))};break;
   case 'EulerRotateEffect':{const t=v('PooledObject',cache.get(v('ManageKey')));if(t){const angle=vector(v('EulerAngle')),previous=t.link.eulerPath?.at(-1)?.position||[0,0,0];t.link.eulerMask=['X','Y','Z'].map((axis,i)=>t.link.eulerMask?.[i]||v('Override'+axis,false));t.link.eulerPath??=[];t.link.eulerPath.push({time:eventTime,position:angle.map((x,i)=>v('Override'+'XYZ'[i],false)?x:previous[i])});}break;}
   case 'UpdateEffect':{const t=cache.get(v('ManageKey'));if(t){t.link.motionPath??=[{time:t.link.delay,position:t.link.graphPosition.slice()}];t.link.motionPath.push({time:eventTime,position:vector(v('Position',t.link.graphPosition))});if(values.has(n.$id+':Direction'))t.link.graphDirection=vector(v('Direction'));}break;}
   case 'SetSpineFade':{const previous=alpha.at(-1);if(previous){const t=previous.duration?Math.min(1,(eventTime-previous.at)/previous.duration):1;alphaValue=previous.from+(previous.value-previous.from)*t;}alpha.push({at:eventTime,from:alphaValue,value:v('TargetAlpha',1),duration:v('Duration',0)});break;}
   case 'SetSpineSortingLayer':sorting.push({at:eventTime,layer:v('LayerName','Default'),order:v('SortingOrder',0)});break;
   case 'SetCollisionSize':{const c=v('Calculator');if(c)c.Size=vector(v('Size'));break;}
   case 'InvokeMember':{const result=value(n,'result');outputs.set(n.$id,{result});out('exit');return;}
   case 'SetSpineOffset':spineOffset=vector(v('Offset'));break;
   case 'SetSpineRotate':spineAngle=v('Angle',0);break;
   case 'GetSummonedEach':for(const summoned of options.summonedMembers||[]){outputs.set(n.$id,{EachFieldObject:summoned});out('Each');}break;
   case 'GetPartyMemberEach':case 'GetStageMemberEach':outputs.set(n.$id,{EachFieldObject:owner});out('Each');break;
   case 'CollisionInBattleOnce':for(const t of targets){outputs.set(n.$id,{EachFieldObject:t});out('Each');}break;
   case 'IsHittableTarget':out(v('Target')?'True':'False');out('Exit');return;
   case 'SwitchOnProjectileHit':out('%'+v('Enum'));return;
   case 'PublishSyncAction':{const info=v('TriggerInfo',{}),actionName=v('ActionName',options.action?.Name);
    // A named recipient (e.g. role charge counters) must not re-enter this
    // projectile's OnSyncAction. The preview exposes the cross-action event.
    if(actionName&&actionName!==options.action?.Name){events.push({type:k,time:eventTime,actionName,info});break;}
    pending.push({time:eventTime,run:()=>{syncInfo=info;root('OnSyncAction');}});break;}
   case 'PublishTriggerOption':{
    const id=v('TargetOptionId'),row=optionRows.get(id),graph=options.native?.graphs?.[row?.GraphName];
    if(optionIds.has(id)&&graph&&eventTime>=(optionCooldowns.get(id)??-Infinity)){
     const sub=interpretActionGraph(graph,index,{...options,action:row,optionTrigger:v('TriggerInfo'),initialPosition:owner.position});
     tracks.push(...sub.tracks.map(t=>({...t,at:eventTime+t.at})));optionCooldowns.set(id,eventTime+(row.CoolTime||0));
    }
    events.push({type:k,time:eventTime,optionId:id});break;
   }
   case 'ShootProjectile':shoot(n);break;
   case 'SetVariable':vars[v('name')]=v('input');out('assigned');out('exit');return;
   case 'AddListItem':{const list=v('listInput');if(!Array.isArray(list))throw Error('Graph list is not an array');list.push(v('item'));outputs.set(n.$id,{listOutput:list});out('exit');return;}
   case 'ClearList':{const list=v('listInput');if(Array.isArray(list))list.length=0;out('exit');return;}
   case 'If':out(v('condition')?'ifTrue':'ifFalse');return;
   case 'NullCheck':out(v('input')==null?'ifNull':'ifNotNull');return;
   case 'StartRoutine':for(const r of allInputs(n,'Routine'))if(r){r.active=true;r.time=0;r.old=-1e-7;r.fired.clear();}break;
   case 'EndRoutine':for(const r of allInputs(n,'Routine'))if(r)r.active=false;break;
   case 'OnUpdateRoutine':{const previous=routine;for(let i=1;i<=(n.InputCount||1);i++){const r=v(i+' Routine');if(!r?.active)continue;routine=r;r.old=r.time===0?-1e-7:r.time;r.time+=dt;out(i+' Update');}routine=previous;out('OutputTrigger');return;}
   case 'IsTimePassed':case 'IsTimePassedForFinishAction':{const a=routine?.old??oldTime,b=routine?.time??time,t=v('Timer');if(!Number.isFinite(t))throw Error('Invalid graph timer '+n.$id);const fired=routine?.fired||globalFired,timerKey=n.$id+':'+t;if(!fired.has(timerKey)&&t<=b+1e-9){fired.add(timerKey);const prior=eventTime;eventTime=time-(b-t);if(k==='IsTimePassedForFinishAction'){if(routine)routine.active=false;if(!finished){finished=true;end=eventTime;root('OnFinishAction');}}else out('True');eventTime=prior;}out('Exit');return;}
   case 'IsTimeBetween':if((routine?.time??time)>=v('MinTimer')&&(routine?.old??oldTime)<v('MaxTimer'))out('True');out('Exit');return;
   case 'PlayAnim':{const info=vars[v('AnimKey')];if(!info){events.push({type:'MissingNativeAnimation',key:v('AnimKey'),time:eventTime});break;}const track=v('AnimationTrack','Base');for(const c of clips)if(c.track===track&&c.end==null)c.end=eventTime;clips.push({name:(info.$type?.endsWith('ToolEmotionInfo')?'[emo]':'')+selected(info,'AnimationName'),start:eventTime,speed:info.Scale||1,loop:!!info.Loop,targetDuration:info.TargetDuration||undefined,track});break;}
   case 'RemoveAnim':for(const c of clips)if(c.track===v('AnimationTrack','Base')&&c.end==null)c.end=eventTime;break;
   case 'PlayEffect':effect(n);break;
   case 'PlayScreenEffect':effect(n,true);break;
   case 'CacheEffect':cache.set(v('ManageKey'),v('PooledObject'));break;
   case 'DisposeEffect':for(let i=1;i<=(n.InputCount||1);i++){const t=cache.get(v(i+' Managed Key'));if(t)t.link.fxEnd=Math.min(t.link.fxEnd,eventTime);}break;
   // ShortDash decelerates from DashSpeed to zero: distance = speed * duration / 2.
   case 'PlayDash':{const duration=v('DashDuration',0),start=owner.position.slice(),speed=v('DashSpeed',0),distance=Math.min(speed*duration*.5,Math.max(v('ManualMinDistance',0),length(add(target.position,start,-1))-(options.targetRadius??.275)-(options.ownerRadius??.275)));dash={at:eventTime+v('StayDuration',0),duration,start,end:add(start,vector(v('Direction',direction)),distance)};break;}
   case 'ExecuteLerpMove':owner.position=add(vector(v('StartPos')),add(vector(v('TargetPos')),vector(v('StartPos')),-1),v('Progress'));break;
   case 'ExcuteInstantMove':owner.position=vector(v('TargetPos'));break;
   case 'CollisionCalculateStart':{const c=v('Calculator');if(c){c.active=true;c.hits.clear();}break;}
   case 'CollisionCalculateEnd':for(const c of allInputs(n,'Calculator'))if(c)c.active=false;break;
   case 'WhileCollisionCalculate':case 'CollisionCalculateOnce':{
    const c=v('Calculator');let total=0;
    if(c&&k==='CollisionCalculateOnce')c.hits.clear();
    if(c&&(k==='CollisionCalculateOnce'||c.active)){
     const p=vector(v('Position',bound(owner))),d=vector(v('Direction',direction)),size=vector(c.Size),r=options.targetRadius??.275;
     for(const candidate of targets){const diff=add(bound(candidate),p,-1),along=diff[0]*d[0]+diff[2]*d[2],across=diff[0]*d[2]-diff[2]*d[0];
      const inside=c.type==='RotatableCube'?Math.abs(across)<=size[2]/2+r&&(c.IsCenterToSide?along>=-r&&along<=size[0]+r:Math.abs(along)<=size[0]/2+r):Math.hypot(diff[0],diff[2])<=(c.Radius??2)+r;
      if(inside&&!c.hits.has(candidate.id)){c.hits.add(candidate.id);total++;outputs.set(n.$id,{EachFieldObject:candidate,Total:total});out('Each');}
     }
    }
    outputs.set(n.$id,{...outputs.get(n.$id),Total:total});out('OnExecute');out('OutputTrigger');return;
   }
   case 'ApplyDamage':{for(const key of ['HitEffect','EffectInfo']){const hit=v(key);if(hit?.node)effect(hit.node);}events.push({type:k,time:eventTime,node:n.$id});break;}
   case 'SetActionInactive':break;
   case 'PublishTriggerAction':{const info=v('TriggerInfo',{});pending.push({time:eventTime,run:()=>{syncInfo=info;root('OnDeclareAction');root('OnStartAction');}});break;}
   case 'GetClosestTargetFrom':{
    // Native 0x3ab8678 searches around FromTarget and excludes that exact object.
    const from=v('FromTarget'),origin=from?.position;if(!origin)throw Error('Closest-target source is null');
    const candidates=targets.filter(t=>t!==from&&length(add(t.position,origin,-1))<=v('SearchRange',3));
    candidates.sort((a,b)=>length(add(a.position,origin,-1))-length(add(b.position,origin,-1)));
    const found=candidates[0]||null,delta=found?add(found.position,owner.position,-1):direction,norm=length(delta);
    outputs.set(n.$id,{Target:found,Direction:norm?delta.map(x=>x/norm):[0,0,0]});break;
   }
   case 'GetClosestTargetInBattle':case 'GetTargetForManualProj':case 'GetTargetForManualMelee':case 'GetTargetForSupport':break;
   case 'AppendTarget':case 'AppendDirection':break;
   case 'ReturnFloat':case 'ReturnBool':return;
   default:throw Error('Unsupported graph control '+k);
  }
  out('OutputTrigger');
 }
 function shoot(n){
  const info=vars[input(n,'Key')],spec=options.native?.projectiles?.[selected(info,'SpecName')];
  if(!spec)throw Error('Missing graph projectile: '+selected(info,'SpecName'));
  const at=eventTime,d=vector(input(n,'Direction',direction)),start=add(vector(input(n,'Position',bound(owner))),d,info.Offset||0),life=spec.Lifetime;
  const trajectory=createHomingTrajectory({position:start,direction:d,speed:spec.Speed,accel:spec.Accel||0,angularSpeed:spec.HomingAngularSpeed||0,target:bound(target)});
  let stop=life;const hits=[];
  for(const t of targets){let prev=start;
   for(let f=1;f<=Math.ceil(life*60);f++){const elapsed=Math.min(life,f/60),pos=trajectory(elapsed),delta=add(pos,prev,-1),len=length(delta),toward=add(bound(t),prev,-1),u=len?Math.max(0,Math.min(1,toward.reduce((s,x,i)=>s+x*delta[i],0)/(len*len))):0;
    if(length(add(bound(t),add(prev,delta,u),-1))<=(spec.HitBoxWidth||0)/2+(options.targetRadius??.275)){hits.push({t,elapsed:Math.max(0,(f-1+u)/60),position:add(prev,delta,u)});break;}prev=pos;}
  }
  hits.sort((a,b)=>a.elapsed-b.elapsed);if(spec.PenetrateType!=='All'&&hits.length){stop=hits[0].elapsed;hits.length=1;}
  const path=Array.from({length:Math.ceil(stop*60)+1},(_,i)=>({time:at+Math.min(stop,i/60),position:trajectory(Math.min(stop,i/60))}));
  const addPreset=(preset,when,link={})=>{if(!preset)return;const e=effects.get(preset);if(!e)throw Error('Missing graph projectile FX: '+preset);tracks.push({effect:e,at:0,link:{delay:when,end:0,clips:[],anchor:'center',graphDirection:d,graphPosition:start,fxEnd:when+e.duration,...link}});};
  addPreset(spec.ShootEffectPreset,at);
  for(const preset of [spec.PresetName,...(spec.ExtraPoolInfo||[]).map(p=>p.PresetName)])addPreset(preset,at,{motionPath:path,fxEnd:at+stop});
  for(const hit of hits){addPreset(spec.HitPreset,at+hit.elapsed,{graphPosition:hit.position});pending.push({time:at+hit.elapsed,run:()=>{for(const h of nodes.values())if(kind(h)==='ProjectileHit'){outputs.set(h.$id,{OnHitType:'FieldObject',OnHitTarget:hit.t,OnHitPosition:hit.position,HitPosition:hit.position,HitDirection:d,Label:input(n,'Label',0),OnHitLabel:input(n,'Label',0)});emit(h.$id,'Trigger');}}});}
  addPreset(spec.ExpirePreset,at+stop,{graphPosition:trajectory(stop)});
  if(spec.Exploding)addPreset(spec.ExplosionPreset,at+stop,{graphPosition:trajectory(stop)});
 }
 function flush(){let count=0;while(pending.some(e=>e.time<=time+1e-9)){
  if(++count>10000)throw Error('Graph event queue did not settle');const event=pending.find(e=>e.time<=time+1e-9);pending.splice(pending.indexOf(event),1);
  const previous=eventTime;eventTime=event.time;event.run();eventTime=previous;
 }}
 function root(type){for(const n of nodes.values())if(kind(n)===type)emit(n.$id,'trigger');}
 root('OnInit');root('BattleEnterEventListen');
 if(options.optionTrigger){for(const n of nodes.values())if(kind(n)==='OnTriggerOption')outputs.set(n.$id,{Target:options.optionTrigger.target,Position:options.optionTrigger.position,Integer:options.optionTrigger.integer??0});root('OnTriggerOption');finished=true;}
 else if(options.action?.Name.startsWith('GraphStamina:')){for(const n of nodes.values())if(kind(n)==='TriggerAction')emit(n.$id,'Trigger');}
 else{root('OnDeclareAction');root('OnStartAction');}
 flush();
 // Process zero-time events before the first integration step.
 dt=0;root('OnUpdateFrame');dt=1/60;
 for(let frame=1;!options.optionTrigger&&frame<=3600;frame++){
  oldTime=time;time=frame/60;eventTime=time;
  if(dash){const t=Math.max(0,Math.min(1,(time-dash.at)/dash.duration));owner.position=add(dash.start,add(dash.end,dash.start,-1),t*(2-t));if(t===1)dash=null;}
  root('OnUpdateFrame');flush();const offset=spineOffset.slice();
  if(jump){const elapsed=time-jump.at;let h=0;if(elapsed<=jump.up){const t=jump.up?elapsed/jump.up:1;h=jump.height*(1-(1-t)**2);}else if(elapsed<=jump.up+jump.stay)h=jump.height;else {const t=jump.down?(elapsed-jump.up-jump.stay)/jump.down:1;h=jump.height*(1-Math.min(1,t)**2);if(t>=1)jump=null;}offset[1]+=h;}
  spineSamples.push({time,position:offset,angle:spineAngle});samples.push({time,position:owner.position.slice()});
  if(finished&&!routines.some(r=>r.active)&&!pending.length)break;
  if(frame===3600)throw Error('Action graph did not terminate'+(options.debug?JSON.stringify({recent,vars:Object.fromEntries(Object.entries(vars).filter(([k,v])=>typeof v!=='object')),routines,pending:pending.length,finished,end}):''));
 }
 for(const track of tracks){track.link.end=end;track.link.graphPath=samples;}
 return {actor:{end,clips,graphPath:samples,spinePath:spineSamples,alpha,sorting,mirages:mirageState.mirages},tracks,duration:Math.max(end,...tracks.map(t=>t.at+t.link.fxEnd)),graphTrace:{source:graph.source,events,operations,stamina:{before:staminaBefore,after:stamina}}};
}
