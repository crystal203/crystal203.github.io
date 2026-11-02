import {planIntervalOverwrite} from './intervals.js';
import {trimFxSource} from './fx-playback.js';
import {sliceCameraEffect} from './camera-effects.js';
import {hasPositionFollowCycle} from './position-follow.js';
import {uid,clone} from './model.js';
import {sliceAudioEnvelope} from './audio-envelope.js';
import {entryStart} from './timeline-selection.js';

const phaseProperties=new Set(['animation','expression','sub','fx','audio']);
export function copyTimelineFrames(entries,{project,shot,resolveKey}={}){
 const frames=entries.filter(entry=>entry.kind==='key'||entry.kind==='segment');if(!frames.length)return null;
 return {project:project.id,shot:shot.id,start:Math.min(...frames.map(entryStart)),frames:frames.map(entry=>{
  const item=clone(entry.item);delete item.initial;if(item.follow&&resolveKey)item.value=resolveKey(item);
  return {kind:entry.kind,track:entry.track,target:entry.model.target,property:entry.model.property,group:entry.model.gimmickGroup,item};
 })};
}
export function planTimelinePaste(clipboard,{project,shot,time,target}){
 if(!clipboard?.frames.length||!shot)throw Error('请先复制关键帧或区间帧');
 const same=clipboard.project===project.id&&clipboard.shot===shot.id,ids=new Map(clipboard.frames.map(frame=>[frame.item.id,uid()])),tracks=new Map(),entries=[];
 for(const source of clipboard.frames){
  const matches=track=>track.target===target&&track.property===source.property&&(source.group===undefined||track.gimmickGroup===source.group),track=(same&&source.target===target?shot.tracks.find(track=>track.id===source.track&&matches(track)):null)||shot.tracks.find(matches);
  if(!track)throw Error('此对象没有可粘贴的'+source.property+'轨道');
  const item=clone(source.item);item.id=ids.get(item.id);delete item.initial;if(item.trajectory){if(ids.has(item.trajectory.to))item.trajectory.to=ids.get(item.trajectory.to);else if(!same||source.target!==target)delete item.trajectory;}
  if(item.trajectory?.type==='follow'&&(!shot.instances.some(instance=>instance.id===item.trajectory.object)||item.trajectory.object===target))throw Error('位置轨迹需要此镜头中的其他实例对象');
  if(source.kind==='key'){item.time=time+item.time-clipboard.start;if(item.time>shot.duration+1e-6)throw Error('粘贴的关键帧超出镜头');if(item.follow){if(ids.has(item.follow.clip)){item.follow={track:shot.tracks.find(track=>track.target===target&&track.property==='follow')?.id,clip:ids.get(item.follow.clip)};}else if(!same||!shot.tracks.some(track=>track.id===item.follow.track&&track.clips.some(clip=>clip.id===item.follow.clip)))delete item.follow;}}
  else {item.start=time+item.start-clipboard.start;if(item.start>=shot.duration-1e-6)throw Error('粘贴的片段超出镜头');if(track.property==='fx'&&item.duration>shot.duration-item.start)Object.assign(item,trimFxSource(item,0,'right'));if(track.property==='cameraEffect'&&item.duration>shot.duration-item.start)Object.assign(item,sliceCameraEffect(item));if(track.property==='audio'&&item.duration>shot.duration-item.start)item.audioEnvelope=sliceAudioEnvelope(item);item.duration=Math.min(item.duration,shot.duration-item.start);if(track.property==='follow'&&!shot.instances.some(instance=>instance.id===item.object))throw Error('此镜头不存在跟随目标');if(track.property==='fx'){if(item.target&&!shot.instances.some(instance=>instance.id===item.target))throw Error('此镜头不存在 GTFX 主目标');for(const secondary of item.secondary||[])if(secondary.object&&!shot.instances.some(instance=>instance.id===secondary.object))throw Error('此镜头不存在 GTFX 副目标');}}
  if(!tracks.has(track.id))tracks.set(track.id,{track,keys:track.keys.slice(),clips:track.clips.slice()});entries.push({kind:source.kind,id:item.id,track:track.id,item,model:track});
 }
 for(const entry of entries.slice().sort((a,b)=>entryStart(a)-entryStart(b))){const state=tracks.get(entry.track);if(entry.kind==='key'){state.keys=state.keys.filter(key=>Math.abs(key.time-entry.item.time)>1e-5);state.keys.push(entry.item);state.keys.sort((a,b)=>a.time-b.time);}else state.clips.push(entry.item);}
 for(const state of tracks.values()){state.overwrite=planIntervalOverwrite(state.clips,state.track.property,entries.filter(entry=>entry.track===state.track.id&&entry.kind==='segment').map(entry=>entry.item));if(state.overwrite)state.clips=state.overwrite.clips;state.clips.sort((a,b)=>a.start-b.start);}
 if(hasPositionFollowCycle(shot.tracks.map(track=>tracks.has(track.id)?{...track,keys:tracks.get(track.id).keys}:track)))throw Error('位置跟随不能形成循环');
 const removed=new Set();for(const state of tracks.values()){const retained=new Set([...state.keys,...state.clips].map(item=>item.id));for(const item of [...state.track.keys,...state.track.clips])if(!retained.has(item.id))removed.add(item.id);}
 return {tracks,entries:entries.filter(entry=>(entry.kind==='key'?tracks.get(entry.track).keys:tracks.get(entry.track).clips).some(item=>item.id===entry.id)),removed};
}
