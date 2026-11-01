// Only serializable source data belongs in a project; decoded assets stay in the player.
export const uid=()=>crypto.randomUUID();
export const clone=value=>structuredClone(value);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function newShot(name='镜头 1') {const shot={id:uid(),name,duration:6,map:null,loadCharacters:true,edits:null,actors:[],instances:[],camera:{position:[0,500,500],target:[0,0,0],span:12,near:.1,far:10000,nativeProjection:true},tracks:[]};ensureSystemTracks(shot);return shot;}
export function newProject(name='未命名动画') {return {format:'GTVideo',version:1,trackDefaultsVersion:1,audioLayoutVersion:2,id:uid(),name,updated:Date.now(),width:1280,height:720,fps:30,bitrate:8000000,shots:[],clips:[],audio:[],audioTracks:[{...newTrack('audio','audio'),name:'音轨 1',layer:0}]};}
export const clipEnd=c=>c.start+(c.out-c.in)/(c.rate||1);
export const projectDuration=p=>Math.max(.1,...p.clips.map(clipEnd),...p.audio.map(c=>c.start+c.duration));
export function activeClips(project,time){return project.clips.filter(c=>!c.muted&&time>=c.start&&time<clipEnd(c)).sort((a,b)=>a.layer-b.layer||a.start-b.start);}
export const sourceTime=(clip,time)=>clip.in+(time-clip.start)*(clip.rate||1);
export const inRange=(c,t)=>t>=c.start&&t<c.start+c.duration;
export function sampleKeys(keys,time,fallback){
 if(!keys?.length||time<keys[0].time)return fallback;
 let lo=0,hi=keys.length;while(lo<hi){const m=(lo+hi)>>1;if(keys[m].time<=time)lo=m+1;else hi=m;}
 const a=keys[lo-1],b=keys[lo];if(!b||a.ease==='hold'&&a.trajectory?.to!==b.id||typeof a.value!=='number'&&!Array.isArray(a.value))return clone(a.value);
 let u=clamp((time-a.time)/(b.time-a.time||1),0,1);if(a.ease==='smooth')u=u*u*(3-2*u);
 if(Array.isArray(a.value)){const value=a.value.map((v,i)=>v+(b.value[i]-v)*u),path=a.trajectory;if(value.length===3&&path?.to===b.id){if(path.type==='jump'){const top=Math.max(path.height,a.value[1],b.value[1]),rise=Math.sqrt(top-a.value[1]),fall=Math.sqrt(top-b.value[1]);value[1]=top-((rise+fall)*u-rise)**2;}else if(path.type==='arc')for(let i=0;i<3;i++)value[i]+=4*u*(1-u)*path.bend[i];}return value;}return a.value+(b.value-a.value)*u;
}
export function setKey(track,time,value,ease='linear'){const key=track.keys.find(k=>Math.abs(k.time-time)<1e-5);if(key){Object.assign(key,{value:clone(value),ease});delete key.follow;delete key.initial;}else track.keys.push({id:uid(),time,value:clone(value),ease});track.keys.sort((a,b)=>a.time-b.time);}
export function splitClip(project,id,time){const c=project.clips.find(c=>c.id===id);if(!c||time<=c.start||time>=clipEnd(c))return false;const cut=sourceTime(c,time),next={...clone(c),id:uid(),start:time,in:cut};c.out=cut;project.clips.push(next);return next;}
export const properties={position:'位置',rotation:'旋转',rotation3D:'三轴旋转',scale:'缩放',visible:'显示',alpha:'透明度',direction:'朝向',skin:'皮肤',animation:'Spine 动作',expression:'表情',sub:'子动画',speed:'动画速度',equipment:'装备',span:'视野高度',cameraPosition:'相机位置',cameraTarget:'相机目标',cameraNear:'相机近裁切',cameraFar:'相机远裁切',cameraProjection:'斜投影',gimmick:'机关',fx:'GTFX',follow:'相机跟随',dialogue:'对白',audio:'音轨'};
export const cameraProperties=new Set(['span','cameraPosition','cameraTarget','cameraNear','cameraFar','cameraProjection','follow']);
export const characterSegmentKinds=new Set(['direction','skin','animation','expression','sub','equipment','visible']);
export const stateSegmentKinds=new Set([...characterSegmentKinds,'cameraProjection']);
export const persistentSegmentKinds=new Set([...characterSegmentKinds,'gimmick']);
export const segmentKinds=new Set([...persistentSegmentKinds,'follow','cameraProjection','fx','dialogue','audio']);
export const defaultCollapsed=new Set(['rotation','rotation3D','scale','visible','alpha','skin','sub','equipment','speed','cameraNear','cameraFar','cameraProjection']);
export function newTrack(target,property){return {id:uid(),target,property,name:properties[property]||property,type:segmentKinds.has(property)?'clip':'key',enabled:true,collapsed:defaultCollapsed.has(property),foldingVersion:3,...(property==='audio'?{waveform:false}:{}),keys:[],clips:[]};}
export function sampledSegments(track,time){
 if(!persistentSegmentKinds.has(track.property)){const active=track.clips.filter(c=>inRange(c,time));return ['follow','cameraProjection'].includes(track.property)?active.sort((a,b)=>b.start-a.start).slice(0,1):active;}
 let latest;for(const clip of track.clips)if(clip.start<=time&&(!latest||clip.start>=latest.start))latest=clip;
 return latest?[latest]:[];
}
export function segmentContinuation(track,clip,duration){if(!persistentSegmentKinds.has(track.property))return 0;const next=Math.min(duration,...track.clips.filter(c=>c.start>clip.start).map(c=>c.start));return Math.max(0,next-clip.start-clip.duration);}
export function setStateSegment(track,time,value,duration,baseline){
 time=clamp(time,0,duration-.001);track.type='clip';track.keys=[];
 if(!track.clips.some(c=>c.start<=time)&&time>.001&&baseline!==undefined)track.clips.push({id:uid(),start:0,duration:time,value:clone(baseline),loop:true,speed:1});
 let clip=track.clips.find(c=>Math.abs(c.start-time)<1e-5);
 if(clip){clip.value=clone(value);delete clip.initial;}else{const next=Math.min(duration,...track.clips.filter(c=>c.start>time).map(c=>c.start));for(const c of track.clips)if(c.start<time&&c.start+c.duration>time){c.duration=Math.max(.001,time-c.start);delete c.initial;}clip={id:uid(),start:time,duration:Math.max(.001,next-time),value:clone(value),loop:true,speed:1};track.clips.push(clip);}
 track.clips.sort((a,b)=>a.start-b.start);return clip;
}
export function migrateCharacterTrack(track,duration){
 if(!stateSegmentKinds.has(track.property)||track.type!=='key')return;
 const keys=track.keys.slice().sort((a,b)=>a.time-b.time);track.type='clip';track.keys=[];
 for(const key of keys){const clip=setStateSegment(track,key.time,key.value,duration);clip.id=key.id;}
}
export const commonInstanceProperties=['position','rotation3D','scale','visible'];
export const characterProperties=['position','rotation3D','scale','visible','alpha','direction','skin','animation','expression','sub','speed','equipment','fx','dialogue'];
export function ensureTargetTracks(shot,target,descriptors,owned){
 let changed=false;const tracks=owned||shot.tracks.filter(track=>track.target===target);
 for(const descriptor of descriptors){const spec=typeof descriptor==='string'?{property:descriptor}:descriptor;let track=tracks.find(track=>track.property===spec.property&&(spec.group===undefined||track.gimmickGroup===spec.group));if(!track){track=newTrack(target,spec.property);track.defaultTrack=true;track.needsInitialValue=true;if(spec.group!==undefined){track.gimmickGroup=spec.group;track.name=spec.name||properties.gimmick;}shot.tracks.push(track);tracks.push(track);changed=true;}
  if(track.needsInitialValue&&Object.hasOwn(spec,'value')){if(!track.keys.length&&!track.clips.length){if(track.type==='key')setKey(track,0,spec.value);else if(stateSegmentKinds.has(track.property))setStateSegment(track,0,spec.value,shot.duration);else if(track.property==='gimmick')track.clips.push({id:uid(),start:0,duration:shot.duration,group:spec.group,value:clone(spec.value),still:true,speed:1});for(const frame of [...track.keys,...track.clips])frame.initial=true;}delete track.needsInitialValue;changed=true;}else if(track.needsInitialValue&&['fx','dialogue','audio','follow'].includes(track.property)){delete track.needsInitialValue;changed=true;}
 }
 return changed;
}
export function ensureSystemTracks(shot){const camera=shot.camera,values={span:camera.span,cameraPosition:camera.position,cameraTarget:camera.target,cameraNear:camera.near,cameraFar:camera.far,cameraProjection:camera.nativeProjection!==false};let changed=ensureTargetTracks(shot,'camera',[...cameraProperties].map(property=>Object.hasOwn(values,property)?{property,value:values[property]}:{property}));changed=ensureTargetTracks(shot,'narrator',['dialogue'])||changed;return ensureTargetTracks(shot,'audio',['audio'])||changed;}
export function instantiate(shot,object,name=object,kind){shot.instances??=[];let instance=shot.instances.find(instance=>instance.object===object);if(!instance){const actor=shot.actors?.find(actor=>object===actor.id||object==='preview-character:'+actor.id);instance={id:uid(),object,name,kind:kind||(actor?'character':'object')};shot.instances.push(instance);}ensureTargetTracks(shot,instance.id,(kind||instance.kind)==='character'?[...characterProperties,'audio']:commonInstanceProperties);return instance;}


export function ensureProjectAudioTracks(project){
 const existing=project.audioTracks||[],layers=[...new Set([...existing.map(track=>track.layer),...project.audio.map(clip=>clip.layer)])].sort((a,b)=>a-b);if(!layers.length)layers.push(0);const remap=new Map(layers.map((layer,index)=>[layer,index]));project.audioTracks=layers.map((layer,index)=>{const track=existing.find(track=>track.layer===layer)||{...newTrack('audio','audio'),name:'音轨 '+(index+1)};return {...track,target:'audio',property:'audio',type:'clip',collapsed:false,layer:index};});for(const clip of project.audio)clip.layer=remap.get(clip.layer);return project.audioTracks;
}
export function shotAudioTracks(shot){return shot.tracks.filter(track=>track.property==='audio');}

function assert(ok,message){if(!ok)throw Error('项目无效：'+message);}
const number=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>number(n,-1e7,1e7));
export function validateProject(input){
 const p=clone(input);assert(p?.format==='GTVideo'&&p.version===1,'文件格式或版本');
 assert(typeof p.id==='string'&&typeof p.name==='string','项目名称');
 assert(number(p.width,64,3840)&&p.width%2===0&&number(p.height,64,2160)&&p.height%2===0,'画幅');
 assert(number(p.fps,1,60)&&Number.isInteger(p.fps)&&number(p.bitrate,100000,80000000),'编码参数');
 assert(Array.isArray(p.shots)&&p.shots.length<=200&&Array.isArray(p.clips)&&p.clips.length<=5000&&Array.isArray(p.audio)&&p.audio.length<=1000,'数量');
 const ids=new Set();const id=o=>{assert(typeof o.id==='string'&&!ids.has(o.id),'重复或缺少 ID');ids.add(o.id);};id(p);
 const interval=c=>{id(c);assert(number(c.start,0,36000)&&number(c.duration,.001,3600),'片段时间');};
 for(const s of p.shots){id(s);assert(typeof s.name==='string'&&number(s.duration,.1,3600),'镜头时长');assert(s.map===null||typeof s.map==='string','地图');assert(vector(s.camera?.position)&&vector(s.camera?.target)&&number(s.camera.span,.01,100000)&&number(s.camera.near,.001,10000)&&number(s.camera.far,s.camera.near+.001,1000000),'相机');assert(Array.isArray(s.actors)&&s.actors.length<=128&&Array.isArray(s.tracks)&&s.tracks.length<=100000,'轨道数量');
  for(const track of s.tracks)if(track.property==='audio')track.collapsed=false;
  const offsets=new Map(s.tracks.filter(t=>t.property==='offset').map(t=>[t.target,t]));for(const track of s.tracks.filter(t=>t.property==='fx'))for(const clip of track.clips){clip.takeover??={};clip.actor??={};if(clip.offset&&!clip.actor.positionOffset)clip.actor.positionOffset=clone(clip.offset);delete clip.offset;const legacy=offsets.get(track.target);if(legacy)clip.actor.positionOffsetKeys=legacy.keys.map(k=>({time:k.time,value:clone(k.value),ease:k.ease}));}s.tracks=s.tracks.filter(t=>t.property!=='offset');
  s.camera.nativeProjection??=true;assert(typeof s.camera.nativeProjection==='boolean','相机投影');if(s.editorView&&typeof s.editorView==='object')s.editorView.nativeProjection??=true;
  // Early GTVideo documents only promoted referenced objects; retain those explicit edits.
  if(!s.instances){s.instances=[];const refs=new Map(),promote=object=>{if(!object||['camera','narrator','audio'].includes(object))return object;if(!refs.has(object)){const instance={id:uid(),object,name:object};s.instances.push(instance);refs.set(object,instance.id);}return refs.get(object);};for(const t of s.tracks.slice()){t.target=promote(t.target);for(const c of t.clips){if(t.property==='follow')c.object=promote(c.object);if(t.property==='fx'){c.target=promote(c.target);for(const x of c.secondary||[])x.object=promote(x.object);}}}}
  assert(Array.isArray(s.instances)&&s.instances.length<=1000,'实例数量');const sources=new Set(),instances=new Set();for(const instance of s.instances){id(instance);assert(typeof instance.object==='string'&&!sources.has(instance.object)&&typeof instance.name==='string','实例');sources.add(instance.object);instances.add(instance.id);}
  for(const a of s.actors){id(a);assert(typeof a.resource==='string'&&vector(a.position),'人物');}
  for(const t of s.tracks){if(cameraProperties.has(t.property))t.target='camera';if(t.property==='rotation'&&t.target!=='camera'){t.property='rotation3D';for(const key of t.keys)if(typeof key.value==='number')key.value=[0,key.value,0];}if(t.foldingVersion!==3){if(t.property==='alpha'||t.foldingVersion!==2&&defaultCollapsed.has(t.property)&&(t.foldingVersion!==1||['cameraNear','cameraFar','cameraProjection'].includes(t.property)))t.collapsed=true;t.foldingVersion=3;}id(t);assert((['camera','narrator','audio'].includes(t.target)||instances.has(t.target))&&Object.hasOwn(properties,t.property)&&['key','clip'].includes(t.type)&&Array.isArray(t.keys)&&t.keys.length<=20000&&Array.isArray(t.clips)&&t.clips.length<=5000,'轨道须绑定已实例化对象');
   for(const k of t.keys){id(k);assert(number(k.time,0,s.duration)&&['linear','hold','smooth'].includes(k.ease),'关键帧');if(k.trajectory){assert(t.property==='position'&&typeof k.trajectory.to==='string'&&['jump','arc'].includes(k.trajectory.type),'位置轨迹');if(k.trajectory.type==='jump')assert(number(k.trajectory.height,-1e7,1e7),'跳跃顶点高度');else assert(vector(k.trajectory.bend),'弧线偏移');}const v=k.value;assert(typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||vector(v)||t.property==='equipment'&&v&&typeof v==='object','关键帧值');}t.keys.sort((a,b)=>a.time-b.time);
   if(stateSegmentKinds.has(t.property)&&t.type==='key'){for(const key of t.keys)ids.delete(key.id);migrateCharacterTrack(t,s.duration);}
   for(const c of t.clips){if(c.initial&&c.start===0)c.duration=s.duration;interval(c);assert(c.start+c.duration<=s.duration+1e-5,'片段超出镜头');if(stateSegmentKinds.has(t.property))assert(['visible','cameraProjection'].includes(t.property)?typeof c.value==='boolean':t.property==='equipment'?c.value&&typeof c.value==='object'&&!Array.isArray(c.value)&&Object.values(c.value).every(v=>Number.isInteger(v)&&v>=0):typeof c.value==='string','人物片段值');if(t.property==='fx'){assert(typeof c.character==='string'&&typeof c.module==='string'&&vector(c.targetOffset||[6,0,0])&&(!c.target||instances.has(c.target))&&(c.secondary||[]).every(x=>!x.object||instances.has(x.object)),'GTFX 参数或目标实例');assert(c.takeover&&typeof c.takeover==='object'&&Object.values(c.takeover).every(v=>typeof v==='boolean'),'GTFX 接管开关');for(const property of ['positionOffset','rotationOffset','scaleMultiplier'])if(c.actor[property]!==undefined)assert(vector(c.actor[property])&&(property!=='scaleMultiplier'||c.actor[property].every(v=>v>0)),'GTFX 相对变换');if(c.actor.equipment)assert(typeof c.actor.equipment==='object'&&Object.values(c.actor.equipment).every(v=>Number.isInteger(v)&&v>=0),'GTFX 装备');for(const property of ['animation','direction','skin','expression','sub'])if(c.actor[property]!==undefined)assert(typeof c.actor[property]==='string','GTFX 角色参数');if(c.actor.speed!==undefined)assert(number(c.actor.speed,.1,8),'GTFX 动画速度');if(c.actor.alpha!==undefined)assert(number(c.actor.alpha,0,1),'GTFX 透明度');if(c.actor.visible!==undefined)assert(typeof c.actor.visible==='boolean','GTFX 显隐');}if(t.property==='audio'){assert(typeof c.clip==='string','音源');for(const field of ['fadeIn','fadeOut'])if(c[field]!==undefined)assert(number(c[field],0,3600),'音频淡入淡出');if(c.audioEnvelope)assert(number(c.audioEnvelope.offset,-3600,3600)&&number(c.audioEnvelope.duration,.001,3600),'音频包络');}if(t.property==='follow')assert(instances.has(c.object)&&vector(c.offset),'跟随目标须实例化');if(t.property==='animation'&&c.mix!==undefined)assert(number(c.mix,0,2),'动作衔接时长');if(t.property==='dialogue'){if(c.bubbleType!==undefined)assert(['talk','shout','thought'].includes(c.bubbleType),'对白气泡类型');if(c.typeSpeed!==undefined)assert(number(c.typeSpeed,0,1),'对白打字间隔');if(c.scale!==undefined)assert(number(c.scale,.25,2),'对白大小');}if(t.property==='dialogue')assert(typeof c.text==='string'&&Array.isArray(c.screen)&&c.screen.length===2&&c.screen.every(n=>number(n,0,1)),'对白');}
  }
  ensureSystemTracks(s);const tracksByTarget=new Map();for(const track of s.tracks){if(!tracksByTarget.has(track.target))tracksByTarget.set(track.target,[]);tracksByTarget.get(track.target).push(track);}for(const instance of s.instances){const actor=s.actors.find(actor=>instance.object===actor.id||instance.object==='preview-character:'+actor.id);instance.kind??=actor?'character':'object';ensureTargetTracks(s,instance.id,instance.kind==='character'?[...characterProperties,'audio']:commonInstanceProperties,tracksByTarget.get(instance.id)||[]);}
  for(const track of s.tracks)for(const key of track.keys)if(key.follow){assert(track.target==='camera'&&track.property==='cameraPosition'&&typeof key.follow.track==='string'&&typeof key.follow.clip==='string','相机跟随帧');const source=s.tracks.find(t=>t.id===key.follow.track&&t.property==='follow'&&t.target==='camera');if(!source?.clips.some(c=>c.id===key.follow.clip))delete key.follow;}
 }
 const shots=new Map(p.shots.map(s=>[s.id,s]));for(const c of p.clips){id(c);const s=shots.get(c.shot);assert(s&&number(c.start,0,36000)&&number(c.in,0,s.duration)&&number(c.out,c.in+.001,s.duration)&&number(c.rate,.1,8)&&Number.isInteger(c.layer)&&number(c.layer,0,31)&&number(c.opacity,0,1),'主时间轴片段');}
 for(const c of p.audio){interval(c);for(const field of ['fadeIn','fadeOut'])if(c[field]!==undefined)assert(number(c[field],0,3600),'音频淡入淡出');if(c.audioEnvelope)assert(number(c.audioEnvelope.offset,-3600,3600)&&number(c.audioEnvelope.duration,.001,3600),'音频包络');assert(typeof c.clip==='string'&&number(c.in,0,36000)&&number(c.volume,0,4)&&Number.isInteger(c.layer)&&number(c.layer,0,31),'音轨');}
 if(p.audioTracks!==undefined){assert(Array.isArray(p.audioTracks)&&p.audioTracks.length<=32,'音轨数量');const layers=new Set();for(const track of p.audioTracks){assert(Number.isInteger(track.layer)&&number(track.layer,0,31)&&!layers.has(track.layer)&&typeof track.name==='string','音轨设置');layers.add(track.layer);}}ensureProjectAudioTracks(p);assert(p.audioTracks.length<=32,'音轨数量');for(const track of p.audioTracks)id(track);
 p.trackDefaultsVersion=1;p.audioLayoutVersion=2;return p;
}

let database;
function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('GTVideo',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export const projects={
 async list(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.updated-a.updated));r.onerror=()=>reject(r.error);});},
 async save(project){const d=await db(),snapshot=clone(project);snapshot.updated=Date.now();return new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').put(snapshot);tx.oncomplete=()=>resolve(snapshot.updated);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存已中断'));});},
 async remove(id){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
};
