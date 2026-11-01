const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const timelineLabelWidth=160;

export function scaleLimits(extent,fps,width){
 const fit=Math.max(1,width-timelineLabelWidth-24)/Math.max(1/fps,extent);
 return {min:Math.min(.02,fit/4),max:Math.max(fit,Math.min(fps*64,16000000/Math.max(extent,1/fps)))};
}
export function scaleFromSlider(value,limits){return limits.min*(limits.max/limits.min)**(clamp(value,0,1000)/1000);}
export function sliderFromScale(scale,limits){return 1000*Math.log(clamp(scale,limits.min,limits.max)/limits.min)/Math.log(limits.max/limits.min);}
export function fitTimelineRange(start,end,width,fps){
 const span=Math.max(1/fps,end-start),pixels=Math.max(1,width-timelineLabelWidth-32)/span;
 return {pixels,scrollLeft:Math.max(0,start*pixels-16)};
}
export function anchoredTimelineScroll(scrollLeft,pixels,nextPixels,x){return Math.max(0,(scrollLeft+x-timelineLabelWidth)/pixels*nextPixels+timelineLabelWidth-x);}

function tickFrames(pixels,fps){
 const wanted=72*fps/pixels;
 if(wanted<=fps)return [...new Set([1,2,3,4,5,6,8,10,12,15,20,24,25,30,fps])].filter(n=>n<=fps&&fps%n===0).sort((a,b)=>a-b).find(n=>n>=wanted)||fps;
 const seconds=wanted/fps,choices=[1,2,5,10,15,30,60,120,300,600,900,1800,3600];
 return (choices.find(n=>n>=seconds)||Math.ceil(seconds/3600)*3600)*fps;
}
export function timelineRuler({pixels,fps,scrollLeft,width,extent}){
 const major=tickFrames(pixels,fps),division=[5,4,3,2].find(n=>major%n===0&&major/n*pixels/fps>=10)||1,minor=major/division;
 const first=Math.max(0,Math.floor(scrollLeft/pixels*fps/minor)*minor),last=Math.min(Math.ceil(extent*fps),Math.ceil((scrollLeft+width-timelineLabelWidth)/pixels*fps/minor)*minor),ticks=[];
 for(let frame=first;frame<=last;frame+=minor){
  const seconds=Math.floor(frame/fps),remainder=frame%fps,isMajor=frame%major===0;
  const label=major<fps?seconds+'s '+String(remainder).padStart(2,'0')+'f':seconds<60?seconds+'s':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  ticks.push({time:frame/fps,major:isMajor,label:isMajor?label:''});
 }
 return {ticks,label:major<fps?major+' 帧 / 格':major/fps>=60?major/fps/60+' 分 / 格':major/fps+' 秒 / 格'};
}
