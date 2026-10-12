const clamp=v=>Math.max(0,Math.min(1,v));
/** DropItem's two phases: ballistic drop, then a spinning, shrinking consume flight. */
export function dropPose(from,to,elapsed,duration=.6){
 const u=clamp(elapsed/duration),p=from.map((v,i)=>v+(to[i]-v)*u);
 p[1]+=4*1.2*u*(1-u);return {position:p,angle:0,scale:1,done:u===1};
}
export function consumePose(from,to,elapsed,duration=.25){
 const u=clamp(elapsed/duration),v=u*u,p=from.map((x,i)=>x+(to[i]-x)*v);
 return {position:p,angle:2*Math.PI*u,scale:1-u,done:u===1};
}
