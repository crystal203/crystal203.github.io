import {curve} from './animation-curve.js';
/** Sample the source state graph. Color keys 6..9 are R,G,B,A. */
export function sampleAnimator(fields,time){
 const states=fields.States||[];let state=states.find(s=>s.StateName===fields.StartState)||states[0];if(!state)return [];
 let t=Math.max(0,time)*(fields.TimeScale??1);
 for(let n=0;n<64;n++){
  const duration=Math.max(.001,...(state.Curves||[]).map(c=>c.Duration||0));
  if(state.Loop){t%=duration;break;}if(t<=duration)break;
  const next=states.find(s=>s.StateName===state.NextStateName);if(!next){t=duration;break;}t-=duration;state=next;
 }
 return (state.Curves||[]).map(c=>({key:c.Key,value:(c.StartValue??0)+((c.EndValue??0)-(c.StartValue??0))*curve(c.Curve,Math.min(1,t/Math.max(.001,c.Duration||.001)),0)}));
}
