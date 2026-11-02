const epsilon=1e-6;
export function segmentGap(clips,time,limit){if(time<0||time>=limit)return null;let start=0,end=limit;for(const clip of clips){if(time>=clip.start-epsilon&&time<clip.start+clip.duration-epsilon)return null;if(clip.start+clip.duration<=time+epsilon)start=Math.max(start,clip.start+clip.duration);if(clip.start>time)end=Math.min(end,clip.start);}return {start,end};}
export function adjacentSegments(entries){
 if(entries.length<2||entries.some(entry=>!['segment','audio'].includes(entry.kind)))return null;const first=entries[0];if(entries.some(entry=>entry.kind!==first.kind||(entry.kind==='segment'?entry.track!==first.track:entry.item.layer!==first.item.layer)))return null;
 const sorted=entries.slice().sort((a,b)=>a.item.start-b.item.start);for(let i=1;i<sorted.length;i++)if(Math.abs(sorted[i-1].item.start+sorted[i-1].item.duration-sorted[i].item.start)>epsilon)return null;return sorted;
}
export function mergedSegment(entries){const sorted=adjacentSegments(entries);if(!sorted)return null;const left=sorted[0].item,right=sorted.at(-1).item,item={...structuredClone(left),id:crypto.randomUUID(),duration:right.start+right.duration-left.start};delete item.initial;return {...sorted[0],id:item.id,item};}
