const vec=v=>Array.isArray(v)?v.slice():[v?.x||0,v?.y||0,v?.z||0];
export function nativeVectorAngle(a,b){a=vec(a);b=vec(b);const denominator=Math.sqrt(a.reduce((s,x)=>s+x*x,0)*b.reduce((s,x)=>s+x*x,0));return denominator<1e-15?0:Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/denominator)))*180/Math.PI;}
export function sampleMirageAlpha(m,time){const a=m.alpha.filter(e=>e.at<=time).at(-1);return a?a.from+(a.value-a.from)*(a.duration?Math.min(1,(time-a.at)/a.duration):1):0;}
export const mirageValueAt=(path,time)=>path.filter(e=>(e.time??e.at)<=time).at(-1);
// Native GraphMirageHolder: loader 0x7739a88, show/fade/hide 0x7739524..0x7739900.
// Visibility and alpha are distinct: Hide preserves alpha and resets animation to idle.
export function createGraphMirages(){
 const mirages=[];
 return {mirages,control(kind,v,vars,selected,time){
  if(!['InitMirage','SetMirage','ShowMirage','FadeMirage','HideMirage','PlayMirageAnimation'].includes(kind))return false;
  if(kind==='InitMirage'){const color=v('MirageColor',{r:1,g:1,b:1,a:1});mirages.length=0;for(let i=0;i<v('MirageCount',0);i++)mirages.push({index:i,color:{...color},state:'Hide',graphPath:[],directionPath:[],visibility:[{at:time,value:false}],alpha:[{at:time,from:0,value:0,duration:0}],clips:[]});return true;}
  const m=mirages[v('MirageIndex',0)];if(!m)throw Error('Native mirage index was not initialized');
  if(kind==='SetMirage'){m.graphPath.push({time,position:vec(v('Position'))});m.directionPath.push({time,position:vec(v('Direction'))});}
  else if(kind==='PlayMirageAnimation'){const info=vars[v('AnimKey')];if(!info)throw Error('Missing native mirage animation '+v('AnimKey'));const track=v('AnimationTrack','Base');for(const c of m.clips)if(c.track===track&&c.end==null)c.end=time;m.clips.push({name:selected(info,'AnimationName'),start:time,speed:info.Scale||1,loop:!!info.Loop,track,targetDuration:info.TargetDuration||undefined});}
  else {
   const state=kind.slice(0,-6);if(m.state===state)return true;m.state=state;
   if(kind==='HideMirage'){m.visibility.push({at:time,value:false});for(const c of m.clips)if(c.end==null)c.end=time;}
   else {if(kind==='ShowMirage')m.visibility.push({at:time,value:true});m.alpha.push({at:time,from:sampleMirageAlpha(m,time),value:kind==='ShowMirage'?1:0,duration:v('FadeDuration',0)});}
  }
  return true;
 }};
}
