export const doorDuration=(fields,value)=>Math.max(.001,value==='open'?(fields.IsFullOpening?1:.07999999821186066):(fields.CloseDuration??.07999999821186066));
export function doorValueAt(pose,time){const u=pose.duration?Math.max(0,Math.min(1,(time-pose.start)/pose.duration)):1;return pose.from+(pose.target-pose.from)*u;}
// Replay only authored state changes, not prior rendered frames. This also
// handles a close clip entered by seeking, and interrupted opening/closing.
export function doorTimelinePose(clips,time,fields,initial=0){
 let pose={from:initial,target:initial,start:0,duration:0};for(const clip of clips.filter(clip=>(clip.group==='door:height'||!clip.group)&&clip.start<=time).slice().sort((a,b)=>a.start-b.start)){
  const rate=clip.speed??1,from=doorValueAt(pose,clip.start),target=clip.value==='open'?fields.OpenHeight:0,duration=clip.still?0:rate===0?Infinity:doorDuration(fields,clip.value)/Math.abs(rate);pose={from:rate<0?target:from,target:rate<0?from:target,start:clip.start-(clip.in||0)/(Math.abs(rate)||1),duration};
 }return {...pose,value:doorValueAt(pose,time)};
}
