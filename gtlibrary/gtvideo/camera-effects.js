import {playbackTime} from '../shared/playback-time.js';
export const cameraEffectLabels={fadeIn:'渐入',fadeOut:'渐出',shake:'振动',flash:'闪光',blur:'模糊',vignette:'暗角'};
const clamp=value=>Math.max(0,Math.min(1,value));
export const sliceCameraEffect=(clip,offset=0)=>({effectOffset:(clip.effectOffset||0)+offset*Math.abs(clip.speed??1),effectDuration:clip.effectDuration??clip.duration});
const elapsed=(clip,time)=>playbackTime(time-clip.start,clip.speed??1,clip.effectDuration??clip.duration,clip.effectOffset||0);
const progress=(clip,time)=>clamp(elapsed(clip,time)/(clip.effectDuration??clip.duration));
export function cameraEffectClips(tracks,time){return tracks.filter(track=>track.enabled!==false&&track.target==='camera'&&track.property==='cameraEffect').flatMap(track=>track.clips.filter(clip=>time>=clip.start&&time<clip.start+clip.duration));}
function seed(id){let hash=2166136261;for(const character of id||'')hash=Math.imul(hash^character.charCodeAt(0),16777619);return (hash>>>0)/4294967296*Math.PI*2;}
export function cameraEffectState(clips,time,width,height){
 let x=0,y=0,blur=0,zoom=1;for(const clip of clips){const u=progress(clip,time),strength=clip.strength??1;if(clip.effect==='shake'){const phase=elapsed(clip,time)*(clip.frequency??12)*Math.PI*2,s=seed(clip.seed||clip.id),amplitude=(clip.amount??1.5)*.01*Math.min(width,height)*strength*(clip.soft===false?1:Math.sin(Math.PI*u));x+=amplitude*(Math.sin(phase+s)+.35*Math.sin(phase*1.73+s*2))/1.35;y+=amplitude*(Math.cos(phase*1.31+s)+.3*Math.sin(phase*2.17+s))/1.3;zoom+=2*(clip.amount??1.5)*.01*strength;}else if(clip.effect==='blur')blur=Math.max(blur,(clip.radius??8)*height/720*strength);}
 return {x,y,blur,zoom};
}
export class CameraEffects{
 draw(ctx,image,width,height,clips,time){const state=cameraEffectState(clips,time,width,height);ctx.save();ctx.fillStyle='#0f1116';ctx.fillRect(0,0,width,height);ctx.translate(width/2+state.x,height/2+state.y);ctx.scale(state.zoom,state.zoom);if(state.blur)ctx.filter='blur('+state.blur+'px)';ctx.drawImage(image,-width/2,-height/2,width,height);ctx.restore();
  for(const clip of clips){const u=progress(clip,time),strength=clip.strength??1;ctx.save();if(clip.effect==='vignette'){const gradient=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.18,width/2,height/2,Math.hypot(width,height)/2);gradient.addColorStop(0,'#0000');gradient.addColorStop(1,clip.color||'#000000');ctx.globalAlpha=strength;ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);}else if(['fadeIn','fadeOut','flash'].includes(clip.effect)){ctx.globalAlpha=clamp(strength*(clip.effect==='fadeOut'?u:1-u));ctx.fillStyle=clip.color||(clip.effect==='flash'?'#ffffff':'#000000');ctx.fillRect(0,0,width,height);}ctx.restore();}
 }
}
