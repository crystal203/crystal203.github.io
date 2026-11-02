// Properties whose players deliberately compose simultaneous intervals.
export const overlappingSegments=new Set(['fx','audio','cameraEffect']);
export const allowsOverlap=property=>overlappingSegments.has(property);
const epsilon=1e-7,uid=()=>crypto.randomUUID();
export const intervalEnd=(clip,property)=>clip.start+(property==='video'?(clip.out-clip.in)/Math.abs(clip.rate||1):clip.duration);
const phased=new Set(['animation','expression','sub','audio','gimmick','dialogue']);
export function sliceInterval(clip,start,end,property,id=clip.id){
 const offset=start-clip.start,result={...clip,id,start};delete result.initial;
 if(property==='video'){const rate=Math.abs(clip.rate||1);if(clip.rate<0){result.out=clip.out-offset*rate;result.in=clip.out-(end-clip.start)*rate;}else{result.in=clip.in+offset*rate;result.out=clip.in+(end-clip.start)*rate;}if(offset>epsilon)delete result.transitionIn;if(end<intervalEnd(clip,property)-epsilon)delete result.transitionOut;}
 else {result.duration=end-start;if(phased.has(property))result.in=(clip.in||0)+offset*Math.abs(clip.speed??1);if(property==='dialogue')result.dialogueDuration=clip.dialogueDuration??clip.duration;}
 return result;
}
// The changed intervals win. Split the covered material and preserve the source
// phase of each surviving part; untouched clips retain their object identity.
export function planIntervalOverwrite(clips,property,priority=[]){
 if(allowsOverlap(property)||clips.length<2)return null;
 const sorted=clips.slice().sort((a,b)=>a.start-b.start);let end=-Infinity,overlap=false;
 for(const clip of sorted){if(clip.start<end-epsilon){overlap=true;break;}end=Math.max(end,intervalEnd(clip,property));}if(!overlap)return null;
 const winners=new Set(priority.map(clip=>clip.id)),present=new Set(clips.map(clip=>clip.id)),background=clips.filter(clip=>!winners.has(clip.id)),foreground=priority.filter(clip=>present.has(clip.id)),origins=new Map(clips.map(clip=>[clip.id,clip.id]));let baseEnd=-Infinity,disjoint=true;for(const clip of sorted)if(!winners.has(clip.id)){if(clip.start<baseEnd-epsilon){disjoint=false;break;}baseEnd=Math.max(baseEnd,intervalEnd(clip,property));}const fast=winners.size&&disjoint,order=fast?foreground:[...background,...foreground];let result=fast?background:[];
 for(const item of order){const right=intervalEnd(item,property),next=[];for(const old of result){const oldEnd=intervalEnd(old,property);if(oldEnd<=item.start+epsilon||old.start>=right-epsilon){next.push(old);continue;}const origin=origins.get(old.id),left=item.start-old.start>=.001-epsilon,tail=oldEnd-right>=.001-epsilon;
   if(left)next.push(sliceInterval(old,old.start,item.start,property));if(tail){const part=sliceInterval(old,right,oldEnd,property,left?uid():old.id);origins.set(part.id,origin);next.push(part);}
  }next.push(item);result=next;
 }
 result.sort((a,b)=>a.start-b.start);const fragments=new Map(clips.map(clip=>[clip.id,[]]));for(const clip of result)fragments.get(origins.get(clip.id))?.push(clip);const changed=new Set(clips.filter(clip=>{const pieces=fragments.get(clip.id);return pieces.length!==1||pieces[0]!==clip;}).map(clip=>clip.id));return {clips:result,fragments,changed};
}
export function reconcileFollowFragments(shot,track,plan,resolve){
 for(const row of shot.tracks)for(const key of row.keys){if(key.follow?.track!==track.id||!plan.changed.has(key.follow.clip))continue;const pieces=plan.fragments.get(key.follow.clip)||[],part=pieces.slice().reverse().find(clip=>key.time>=clip.start-epsilon&&key.time<=intervalEnd(clip,track.property)+epsilon);if(part)key.follow.clip=part.id;else{if(resolve)key.value=resolve(key);delete key.follow;}}
}
// Creation always starts at the playhead; shorten at the next authored start.
export function segmentPlacement(clips,time,duration,limit,frame){
 const next=Math.min(limit,...clips.filter(clip=>clip.start>time+1e-7).map(clip=>clip.start));return {start:time,duration:Math.min(limit-time,Math.max(Math.min(frame,limit-time),Math.min(duration,next-time)))};
}
