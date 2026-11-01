export const isBezierControl=key=>key?.bezier?.role==='control';
const anchor=(keys,index,step)=>{for(let i=index;i>=0&&i<keys.length;i+=step)if(!isBezierControl(keys[i]))return i;return -1;};
const delta=(a,b,scale=1)=>a.map((value,i)=>(value-b[i])*scale);
export function bezierHandles(keys,index){
 const key=keys[index],previous=anchor(keys,index-1,-1),next=anchor(keys,index+1,1),left=keys[previous],right=keys[next],node=key.bezier?.role==='node',smooth=node&&left&&right,span=smooth?right.time-left.time:1;
 const incoming=smooth?delta(left.value,right.value,(key.time-left.time)/(3*span)):left?delta(left.value,key.value,1/3):[0,0,0],outgoing=smooth?delta(right.value,left.value,(right.time-key.time)/(3*span)):right?delta(right.value,key.value,1/3):[0,0,0];
 return {in:key.bezier?.mode!=='auto'&&key.bezier?.in?key.bezier.in.slice():incoming,out:key.bezier?.mode!=='auto'&&key.bezier?.out?key.bezier.out.slice():outgoing};
}
export function bezierSpan(keys,index){
 const start=anchor(keys,index,-1);if(start<0)return null;const end=anchor(keys,start+1,1);if(end<0)return null;
 const left=keys[start],right=keys[end];if(!Array.isArray(left.value)||left.value.length!==3||!Array.isArray(right.value)||right.value.length!==3)return null;
 if(left.trajectory?.to===keys[start+1]?.id)return null;
 if(end===start+1&&!left.bezier&&!right.bezier)return null;
 const controls=keys.slice(start+1,end);let points;
 if(controls.length)points=[left.value,...controls.map(key=>key.value),right.value];
 else{const a=bezierHandles(keys,start).out,b=bezierHandles(keys,end).in;points=[left.value,left.value.map((v,i)=>v+a[i]),right.value.map((v,i)=>v+b[i]),right.value];}
 return {start,end,left,right,points,controls};
}
export function bezierSections(keys){const result=[];for(let i=0;i<keys.length-1;){const span=bezierSpan(keys,i);if(span){result.push(span);i=span.end;}else i++;}return result;}
export function bezierPoint(points,t){
 if(t<=0)return points[0].slice();if(t>=1)return points.at(-1).slice();const v=1-t;
 if(points.length===3)return points[0].map((n,i)=>v*v*n+2*v*t*points[1][i]+t*t*points[2][i]);
 if(points.length===4)return points[0].map((n,i)=>v*v*v*n+3*v*v*t*points[1][i]+3*v*t*t*points[2][i]+t*t*t*points[3][i]);
 // Relative Bernstein weights start at their maximum, avoiding factorials,
 // underflow at high degree and quadratic work when many control keys exist.
 const n=points.length-1,mode=Math.min(n,Math.floor((n+1)*t)),result=points[mode].slice();let total=1,weight=1;
 for(let i=mode-1;i>=0;i--){weight*=(i+1)/(n-i)*v/t;total+=weight;for(let axis=0;axis<3;axis++)result[axis]+=points[i][axis]*weight;}
 weight=1;for(let i=mode+1;i<=n;i++){weight*=(n-i+1)/i*t/v;total+=weight;for(let axis=0;axis<3;axis++)result[axis]+=points[i][axis]*weight;}return result.map(value=>value/total);
}
// Control keys describe geometry; only endpoint/waypoint times define playback.
export function sampleBezier(keys,index,time){
 const span=bezierSpan(keys,index);if(!span||time<span.left.time||time>=span.right.time)return null;let t=(time-span.left.time)/(span.right.time-span.left.time);if(span.left.ease==='smooth')t=t*t*(3-2*t);return bezierPoint(span.points,t);
}
