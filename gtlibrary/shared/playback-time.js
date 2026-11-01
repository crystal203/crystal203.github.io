// Offset is a non-negative distance into the chosen playback direction. A
// negative rate starts at the native end; trimming keeps the same source phase.
export function playbackTime(elapsed,rate=1,duration=0,offset=0,loop=false){
 const distance=Math.max(0,elapsed)*Math.abs(rate)+offset;if(!Number.isFinite(duration))return rate<0?0:Math.max(0,distance);if(duration<=0)return 0;const phase=loop?((distance%duration)+duration)%duration:Math.max(0,Math.min(duration,distance));return rate<0?duration-phase:phase;
}
export function playbackElapsed(source,rate=1,duration=0,offset=0){return ((rate<0?duration-source:source)-offset)/(Math.abs(rate)||1);}
export const playbackSpec=(elapsed,rate=1,offset=0)=>({elapsed,rate,offset});
export function samplePlayback(spec,duration,loop=false,fallback=0){return spec?playbackTime(spec.elapsed,spec.rate,duration,spec.offset,loop):Math.max(0,Math.min(loop?Infinity:duration,fallback));}
