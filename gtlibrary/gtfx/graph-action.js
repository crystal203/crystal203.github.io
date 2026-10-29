// Bounded interpreter for exported CharacterTool/VisualScripting action graphs.
// Node types and ports define behavior; graph/actor names are only resource keys.
const unwrap=v=>v&&typeof v==='object'&&'$content' in v?v.$content:v;
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
 const nodes=new Map(graph.nodes.map(n=>[n.$id,n])),values=new Map(),controls=new Map();
 for(const e of graph.connections){const a=e.sourceUnit.$ref,b=e.destinationUnit.$ref;
  if(e.$type.endsWith('ValueConnection'))values.set(b+':'+e.destinationKey,[a,e.sourceKey]);
  else{const key=a+':'+e.sourceKey;if(!controls.has(key))controls.set(key,[]);controls.get(key).push(b);}
 }
 const vars=Object.fromEntries(graph.variables.map(v=>[v.name,copy(unwrap(v.value))]));
 const optionIds=new Set(options.optionIds||[]),direction={right:[1,0,0],left:[-1,0,0],front:[0,0,-1],back:[0,0,1]}[options.direction||'right'];
 const target={position:direction.map(v=>v*(options.targetDistance??6)),target:true};
 const owner={position:options.initialPosition?.slice()||[0,0,0]},tracks=[],clips=[],samples=[{time:0,position:owner.position.slice()}],events=[],cache=new Map(),outputs=new Map();
 const effects=new Map(index.effects.filter(e=>!e.unavailable).flatMap(e=>[[e.preset,e],[e.assetName,e]]));
 let time=0,oldTime=-1e-7,dt=1/60,eventTime=0,routine=null,finished=false,end=0,dash=null,operations=0;
 const globalFired=new Set();
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
   case 'GetOwner':return owner;
   case 'GetActionTarget':case 'GetTargetForManualMelee':case 'GetTargetForSupport':return port==='Direction'?direction:target;
   case 'GetActionDirVector':return direction;
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
   case 'GetEaseProgress':{const start=v('StartTime',0),stop=v('EndTime',1),t=routine?.time??time;return Math.max(0,Math.min(1,(t-start)/(stop-start)));}
   case 'GetRoutinePassedTime':return v('Routine')?.time||0;
   case 'GetAnyRoutineActive':return allInputs(n,'Routine').some(r=>r?.active);
   case 'IsOnwerDirectionInSector':{const sector={back:'First',right:'Third',front:'Fifth',left:'Seventh'}[options.direction||'right'];return String(v('Sector','')).split(',').includes(sector);}
   case 'OnUpdateFrame':return port==='DeltaTime'?dt:time;
   case 'CollisionInit':{const c={...Object.fromEntries(Object.keys(n.defaultValues||{}).map(key=>[key,v(key)])),type:n.CalculatorType,active:false,hit:false};for(const key of ['Radius','Size','Duration'])if(values.has(n.$id+':'+key))c[key]=v(key);outputs.set(n.$id,{Result:c});return c;}
   case 'InvokeMember':if(n.member?.targetType==='UnityEngine.Vector3'&&n.member.name==='.ctor')return ['%x','%y','%z'].map(key=>v(key,0));break;
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
  const effect=effects.get(preset);if(!effect)throw Error('Graph effect missing: '+preset);
  const position=vector(input(n,'Position',bound(owner,'Root'))),dir=vector(input(n,'Direction',[0,0,0]));
  const scale=input(n,'Scale',1),parent=input(n,'ParentObject',null);
  const track={effect,at:0,link:{delay:eventTime,end:0,clips:[],screen,directed:length(dir)>0,
   graphDirection:dir,graphPosition:position,graphOwnerAtBirth:owner.position.slice(),graphFollow:parent===owner,
   scaleFactor:typeof scale==='number'?scale:1,fxEnd:eventTime+effect.duration}};
  tracks.push(track);outputs.set(n.$id,{PooledObject:track});events.push({time:eventTime,type:kind(n),node:n.$id,preset});return track;
 }
 const passive=new Set(['PlaySound','PlayDefaultVoice','PlayCameraShake','SetIsControllingCharacter','SetIsRunCancelable','LockDirection','UnLockDirection','SetActionActive','SetOwnerDirection','SetLockedTarget','SetAimPoint','SetupRoleParameter','ApplyHeal','ApplyBuff','ApplyAggro','SetCwpDarken','UnSetCwpDarken','SetSupportDarken','UnsetSupportDarken','ChangeSupportCrashBehaviour','CacheAudioSource','DisposeAudioSource']);
 function run(n){
  if(++operations>200000)throw Error('Graph instruction budget exceeded');
  const k=kind(n),v=(key,f)=>input(n,key,f),out=port=>emit(n.$id,port);
  if(passive.has(k)){out('OutputTrigger');return;}
  switch(k){
   case 'SetVariable':vars[v('name')]=v('input');out('assigned');out('exit');return;
   case 'If':out(v('condition')?'ifTrue':'ifFalse');return;
   case 'StartRoutine':for(const r of allInputs(n,'Routine'))if(r){r.active=true;r.time=0;r.old=-1e-7;r.fired.clear();}break;
   case 'EndRoutine':for(const r of allInputs(n,'Routine'))if(r)r.active=false;break;
   case 'OnUpdateRoutine':{const previous=routine;for(let i=1;i<=(n.InputCount||1);i++){const r=v(i+' Routine');if(!r?.active)continue;routine=r;r.old=r.time===0?-1e-7:r.time;r.time+=dt;out(i+' Update');}routine=previous;out('OutputTrigger');return;}
   case 'IsTimePassed':case 'IsTimePassedForFinishAction':{const a=routine?.old??oldTime,b=routine?.time??time,t=v('Timer');if(!Number.isFinite(t))throw Error('Invalid graph timer '+n.$id);const fired=routine?.fired||globalFired;if(!fired.has(n.$id)&&t<=b+1e-9){fired.add(n.$id);const prior=eventTime;eventTime=time-(b-t);if(k==='IsTimePassedForFinishAction'){if(!finished){finished=true;end=eventTime;root('OnFinishAction');}}else out('True');eventTime=prior;}out('Exit');return;}
   case 'IsTimeBetween':if((routine?.time??time)>=v('MinTimer')&&(routine?.old??oldTime)<v('MaxTimer'))out('True');out('Exit');return;
   case 'PlayAnim':{const info=vars[v('AnimKey')];if(!info)throw Error('Missing graph animation '+v('AnimKey'));const track=v('AnimationTrack','Base');for(const c of clips)if(c.track===track&&c.end==null)c.end=eventTime;clips.push({name:selected(info,'AnimationName'),start:eventTime,speed:info.Scale||1,loop:!!info.Loop,targetDuration:info.TargetDuration||undefined,track});break;}
   case 'RemoveAnim':for(const c of clips)if(c.track===v('AnimationTrack','Base')&&c.end==null)c.end=eventTime;break;
   case 'PlayEffect':effect(n);break;
   case 'PlayScreenEffect':effect(n,true);break;
   case 'CacheEffect':cache.set(v('ManageKey'),v('PooledObject'));break;
   case 'DisposeEffect':for(let i=1;i<=(n.InputCount||1);i++){const t=cache.get(v(i+' Managed Key'));if(t)t.link.fxEnd=Math.min(t.link.fxEnd,eventTime);}break;
   // ShortDash decelerates from DashSpeed to zero: distance = speed * duration / 2.
   case 'PlayDash':{const duration=v('DashDuration',0),start=owner.position.slice(),speed=v('DashSpeed',0),distance=Math.min(speed*duration*.5,Math.max(v('ManualMinDistance',0),length(add(target.position,start,-1))-(options.targetRadius??.275)-(options.ownerRadius??.275)));dash={at:eventTime+v('StayDuration',0),duration,start,end:add(start,vector(v('Direction',direction)),distance)};break;}
   case 'ExecuteLerpMove':owner.position=add(vector(v('StartPos')),add(vector(v('TargetPos')),vector(v('StartPos')),-1),v('Progress'));break;
   case 'ExcuteInstantMove':owner.position=vector(v('TargetPos'));break;
   case 'CollisionCalculateStart':{const c=v('Calculator');if(c){c.active=true;c.hit=false;}break;}
   case 'CollisionCalculateEnd':for(const c of allInputs(n,'Calculator'))if(c)c.active=false;break;
   case 'WhileCollisionCalculate':case 'CollisionCalculateOnce':{out('OnExecute');const c=v('Calculator');if(c&&k==='CollisionCalculateOnce')c.hit=false;if(c&&(k==='CollisionCalculateOnce'||c.active)&&!c.hit){const p=vector(v('Position',bound(owner))),radius=c.Radius??(vector(c.Size)[0]/2||2);if(length(add(bound(target),p,-1))<=radius+(options.targetRadius??.275)){c.hit=true;outputs.set(n.$id,{EachFieldObject:target});out('Each');}}out('OutputTrigger');return;}
   case 'ApplyDamage':{for(const key of ['HitEffect','EffectInfo']){const hit=v(key);if(hit?.node)effect(hit.node);}events.push({type:k,time:eventTime,node:n.$id});break;}
   case 'SetActionInactive':break;
   case 'PublishTriggerAction':for(const node of nodes.values())if(kind(node)==='TriggerAction')emit(node.$id,'Trigger');break;
   case 'GetTargetForManualMelee':case 'GetTargetForSupport':break;
   case 'AppendTarget':case 'AppendDirection':break;
   case 'ReturnBool':return;
   default:throw Error('Unsupported graph control '+k);
  }
  out('OutputTrigger');
 }
 function root(type){for(const n of nodes.values())if(kind(n)===type)emit(n.$id,'trigger');}
 root('OnInit');root('OnDeclareAction');root('OnStartAction');
 // Process zero-time events before the first integration step.
 dt=0;root('OnUpdateFrame');dt=1/60;
 for(let frame=1;frame<=3600;frame++){
  oldTime=time;time=frame/60;eventTime=time;
  if(dash){const t=Math.max(0,Math.min(1,(time-dash.at)/dash.duration));owner.position=add(dash.start,add(dash.end,dash.start,-1),t*(2-t));if(t===1)dash=null;}
  root('OnUpdateFrame');samples.push({time,position:owner.position.slice()});
  if(finished&&!routines.some(r=>r.active))break;
  if(frame===3600)throw Error('Action graph did not terminate');
 }
 for(const track of tracks){track.link.end=end;track.link.graphPath=samples;}
 return {actor:{end,clips,graphPath:samples},tracks,duration:Math.max(end,...tracks.map(t=>t.link.fxEnd)),graphTrace:{source:graph.source,events,operations}};
}
