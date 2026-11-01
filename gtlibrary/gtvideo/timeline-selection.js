import {clipEnd} from './model.js';
export const timelineKinds=new Set(['key','segment','cut','audio']);
export const entryStart=entry=>entry.kind==='key'?entry.item.time:entry.item.start;
export const entryEnd=entry=>entry.kind==='key'?entry.item.time:entry.kind==='cut'?clipEnd(entry.item):entry.item.start+entry.item.duration;
export function timelineEntries(project,shot){return shot?shot.tracks.flatMap(track=>[...track.keys.map(item=>({kind:'key',id:item.id,track:track.id,item,model:track})),...track.clips.map(item=>({kind:'segment',id:item.id,track:track.id,item,model:track}))]):[...project.clips.map(item=>({kind:'cut',id:item.id,item})),...project.audio.map(item=>({kind:'audio',id:item.id,item}))];}
export function dragBounds(entry,project,shot,frame,trim){
 const item=entry.item,start=entryStart(entry),end=entryEnd(entry),span=end-start,limit=entry.kind==='key'||entry.kind==='segment'?shot.duration:36000;
 if(!trim||entry.kind==='key')return [-start,limit-end];
 if(entry.kind==='cut'){const rate=item.rate||1;return trim==='left'?[-Math.min(start,item.in/rate),span-frame]:[frame-span,(project.shots.find(shot=>shot.id===item.shot).duration-item.out)/rate];}
 const source=['animation','expression','sub'].includes(entry.model?.property)||entry.kind==='audio'||entry.model?.property==='audio',rate=source&&entry.kind==='segment'?(item.speed||1):1;
 return trim==='left'?[-Math.min(start,source?(item.in||0)/rate:start),span-frame]:[frame-span,Math.min(limit-end,3600-span)];
}
export function moveTimelineEntry(entry,original,delta,trim){
 const item=entry.item;if(entry.kind==='key'){item.time=original.time+delta;return;}
 if(!trim){item.start=original.start+delta;return;}
 if(entry.kind==='cut'){if(trim==='left'){item.start=original.start+delta;item.in=original.in+delta*(original.rate||1);}else item.out=original.out+delta*(original.rate||1);return;}
 if(trim==='left'){item.start=original.start+delta;item.duration=original.duration-delta;if(original.audioEnvelope)item.audioEnvelope={...original.audioEnvelope,offset:original.audioEnvelope.offset+delta};const phase=['animation','expression','sub'].includes(entry.model?.property);if(phase||entry.kind==='audio'||entry.model?.property==='audio')item.in=(original.in||0)+delta*(phase?(original.speed||1):1);}else item.duration=original.duration+delta;
}
