import {curve} from './animation-curve.js';
/** Sample source states, retaining values from completed states like the Unity animator. */
export function sampleAnimator(fields,time){
 const states=fields.States||[];let state=states.find(s=>s.StateName===fields.StartState)||states[0];if(!state)return [];
 let t=Math.max(0,time)*(fields.TimeScale??1);const result=new Map();
 const sample=(s,at)=>{for(const c of s.Curves||[]){const u=curve(c.Curve,Math.min(1,at/Math.max(.001,c.Duration||.001)),0);result.set(c.Key,{key:c.Key,value:(c.StartValue??0)+((c.EndValue??0)-(c.StartValue??0))*u,vector:['x','y','z'].map(k=>(c.StartVector?.[k]??0)+((c.EndVector?.[k]??0)-(c.StartVector?.[k]??0))*u)});}};
 for(let n=0;n<64;n++){
  const duration=Math.max(.001,...(state.Curves||[]).map(c=>c.Duration||0));
  if(state.Loop){t%=duration;break;}if(t<=duration)break;
  sample(state,duration);const next=states.find(s=>s.StateName===state.NextStateName);if(!next){t=duration;break;}t-=duration;state=next;
 }
 sample(state,t);return [...result.values()];
}
