import {clipEnd} from './model.js';

// Build once at drag start, including tracks hidden in the compact folded strip.
export function snapPoints(project,{shot=null,exclude=null,playhead=0,target='all',query=''}={}){
 const points=new Set([0,playhead]),excluded=new Set(Array.isArray(exclude)?exclude:[exclude]);
 if(shot){points.add(shot.duration);for(const track of shot.tracks){if(target!=='all'&&track.target!==target||query&&!(track.name+' '+track.target).toLowerCase().includes(query))continue;for(const key of track.keys)if(!excluded.has(key.id))points.add(key.time);for(const clip of track.clips)if(!excluded.has(clip.id)){points.add(clip.start);points.add(clip.start+clip.duration);}}}
 else{for(const clip of project.clips)if(!excluded.has(clip.id)){points.add(clip.start);points.add(clipEnd(clip));}for(const clip of project.audio)if(!excluded.has(clip.id)){points.add(clip.start);points.add(clip.start+clip.duration);}}
 return [...points].filter(Number.isFinite).sort((a,b)=>a-b);
}

export function snapTime(value,points,{pixels=80,offsets=[0],min=0,max=Infinity,threshold=8,enabled=true}={}){
 value=Math.max(min,Math.min(max,value));let result={value,time:null},distance=threshold/Math.max(1,pixels)+1e-9;
 if(!enabled)return result;
 for(const offset of offsets){const at=value+offset;let lo=0,hi=points.length;while(lo<hi){const middle=(lo+hi)>>1;if(points[middle]<at)lo=middle+1;else hi=middle;}
  for(const index of [lo-1,lo]){const point=points[index];if(point===undefined)continue;const candidate=point-offset,d=Math.abs(point-at);if(candidate<min-1e-8||candidate>max+1e-8||d>distance)continue;distance=d;result={value:Math.max(min,Math.min(max,candidate)),time:point};}
 }
 return result;
}
