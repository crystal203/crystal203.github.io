import {playableClips} from './model.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value)),end=clip=>clip.start+(clip.out-clip.in)/Math.abs(clip.rate||1),length=clip=>end(clip)-clip.start;
export const transitionLabels={none:'无',black:'黑场',white:'白场',mix:'混合'};
const enabled=transition=>transition&&transition.type!=='none'&&transition.duration>0;
export function transitionWindows(clips){
 const layers=new Map(),windows=[];for(const clip of clips)if(!clip.muted){if(!layers.has(clip.layer))layers.set(clip.layer,[]);layers.get(clip.layer).push(clip);}
 for(const rows of layers.values()){
  rows.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));const incoming=new Set(),outgoing=new Set();
  for(let i=1;i<rows.length;i++){
   const a=rows[i-1],b=rows[i],overlap=end(a)-b.start;if(overlap<-.0001||b.start<=a.start)continue;const transition=enabled(b.transitionIn)?b.transitionIn:a.transitionOut;if(!enabled(transition))continue;
   const duration=Math.min(transition.duration,length(a),length(b),overlap>.0001?overlap:Infinity);if(duration<=0)continue;const start=overlap>.0001?b.start:b.start-duration/2;
   windows.push({from:a,to:b,type:transition.type,start,duration,layer:b.layer,order:b.start});incoming.add(b);outgoing.add(a);
  }
  for(const clip of rows)for(const side of ['In','Out']){const transition=clip['transition'+side];if(!enabled(transition)||(side==='In'?incoming:outgoing).has(clip))continue;const duration=Math.min(transition.duration,length(clip)/2);windows.push({from:side==='Out'?clip:null,to:side==='In'?clip:null,type:transition.type,start:side==='In'?clip.start:end(clip)-duration,duration,layer:clip.layer,order:clip.start});}
 }
 return windows;
}
export class ProjectCompositor {
 invalidate(){this.project=null;}
 layout(project){
  if(this.project!==project||this.clips!==project.clips){this.project=project;this.clips=project.clips;this.playable=playableClips(project);this.windows=transitionWindows(this.playable);}
  return this.windows;
 }
 plan(project,time){
  this.layout(project);if(project.forceEnd!=null&&time>=project.forceEnd)return [];
  const used=new Set(),steps=[];for(const window of this.windows.filter(window=>time>=window.start&&time<window.start+window.duration).sort((a,b)=>b.start-a.start)){const clips=[window.from,window.to].filter(Boolean);if(clips.some(clip=>used.has(clip)))continue;for(const clip of clips)used.add(clip);steps.push({...window,kind:'transition',progress:clamp((time-window.start)/window.duration,0,1)});}
  for(const clip of this.playable)if(!clip.muted&&!used.has(clip)&&time>=clip.start&&time<end(clip))steps.push({kind:'clip',clip,layer:clip.layer,order:clip.start});return steps.sort((a,b)=>a.layer-b.layer||a.order-b.order);
 }
 async draw(ctx,step,width,height,drawClip){
  const frame=async(index,clip)=>{this.frames??=[];const canvas=this.frames[index]??=document.createElement('canvas');if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}const target=canvas.getContext('2d');target.clearRect(0,0,width,height);target.save();try{await drawClip(target,clip);}finally{target.restore();}return canvas;};
  if(step.kind==='clip'){ctx.save();try{ctx.globalAlpha=step.clip.opacity??1;if(ctx.globalAlpha===1)await drawClip(ctx,step.clip);else ctx.drawImage(await frame(0,step.clip),0,0,width,height);}finally{ctx.restore();}return;}
  const from=step.from?await frame(0,step.from):null,to=step.to?await frame(1,step.to):null;
  this.canvas??=document.createElement('canvas');if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}const target=this.canvas.getContext('2d'),u=step.progress;target.clearRect(0,0,width,height);target.save();
  try{
   if(step.type==='mix'){
    if(from){target.globalAlpha=(step.from.opacity??1)*(1-u);target.drawImage(from,0,0,width,height);}target.globalCompositeOperation='lighter';if(to){target.globalAlpha=(step.to.opacity??1)*u;target.drawImage(to,0,0,width,height);}
   }else{
    const clip=step.from&&step.to?(u<.5?step.from:step.to):step.from||step.to,opacity=step.from&&step.to?1-Math.abs(2*u-1):step.to?1-u:u;
    if(clip){target.globalAlpha=clip.opacity??1;target.drawImage(clip===step.from?from:to,0,0,width,height);}target.globalAlpha=opacity;target.fillStyle=step.type==='white'?'#fff':'#000';target.fillRect(0,0,width,height);
   }
  }finally{target.restore();}
  ctx.save();ctx.globalAlpha=1;ctx.drawImage(this.canvas,0,0,width,height);ctx.restore();
 }
 dispose(){for(const canvas of [this.canvas,...this.frames||[]])if(canvas)canvas.width=canvas.height=1;this.canvas=null;this.frames=[];this.invalidate();}
}
