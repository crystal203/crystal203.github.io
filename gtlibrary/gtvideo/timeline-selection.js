import {fxSourceEnd,trimFxSource} from './fx-playback.js';
import {sliceCameraEffect} from './camera-effects.js';
import {clipEnd} from './model.js';
export const timelineKinds=new Set(['key','segment','cut','audio']);
export const entryStart=entry=>entry.kind==='key'?entry.item.time:entry.item.start;
export const entryEnd=entry=>entry.kind==='key'?entry.item.time:entry.kind==='cut'?clipEnd(entry.item):entry.item.start+entry.item.duration;
export function timelineEntries(project,shot){return shot?shot.tracks.flatMap(track=>[...track.keys.map(item=>({kind:'key',id:item.id,track:track.id,item,model:track})),...track.clips.map(item=>({kind:'segment',id:item.id,track:track.id,item,model:track}))]):[...project.clips.map(item=>({kind:'cut',id:item.id,item})),...project.audio.map(item=>({kind:'audio',id:item.id,item}))];}
export function dragBounds(entry,project,shot,frame,trim){
 const item=entry.item,start=entryStart(entry),end=entryEnd(entry),span=end-start,limit=entry.kind==='key'||entry.kind==='segment'?shot.duration:36000;
 if(!trim||entry.kind==='key')return [-start,limit-end];
 if(entry.kind==='cut'){const rate=Math.abs(item.rate||1),reverse=item.rate<0,source=project.shots.find(shot=>shot.id===item.shot).duration;return trim==='left'?[-Math.min(start,(reverse?source-item.out:item.in)/rate),span-frame]:[frame-span,(reverse?item.in:source-item.out)/rate];}
 const source=['animation','expression','sub','fx'].includes(entry.model?.property)||entry.kind==='audio'||entry.model?.property==='audio',rate=source?(Math.abs(item.speed??1)||1):1;
 const available=entry.model?.property==='fx'&&item.speed<0?((item.nativeDuration??Infinity)-fxSourceEnd(item))/rate:source?(item.in||0)/rate:start;return trim==='left'?[-Math.min(start,available),span-frame]:[frame-span,Math.min(limit-end,3600-span)];
}
export function moveTimelineEntry(entry,original,delta,trim){
 const item=entry.item;if(entry.kind==='key'){item.time=original.time+delta;return;}
 if(!trim){item.start=original.start+delta;return;}
 if(entry.kind==='cut'){const rate=Math.abs(original.rate||1);if(trim==='left'){item.start=original.start+delta;if(original.rate<0)item.out=original.out-delta*rate;else item.in=original.in+delta*rate;}else if(original.rate<0)item.in=original.in-delta*rate;else item.out=original.out+delta*rate;return;}
 if(entry.model?.property==='fx'){Object.assign(item,trimFxSource(original,delta,trim));if(trim==='left'){item.start=original.start+delta;item.duration=original.duration-delta;}else item.duration=original.duration+delta;return;}if(entry.model?.property==='cameraEffect')Object.assign(item,sliceCameraEffect(original,trim==='left'?delta:0));if(trim==='left'){item.start=original.start+delta;item.duration=original.duration-delta;if(original.audioEnvelope)item.audioEnvelope={...original.audioEnvelope,offset:original.audioEnvelope.offset+delta};const phase=['animation','expression','sub','fx'].includes(entry.model?.property);if(phase||entry.kind==='audio'||entry.model?.property==='audio')item.in=(original.in||0)+delta*Math.abs(original.speed??1);}else item.duration=original.duration+delta;
}
