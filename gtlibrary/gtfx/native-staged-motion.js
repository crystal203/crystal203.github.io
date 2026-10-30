// Source flat-floor support approach, advance and return; no actor identifiers.
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
export function buildSupportDashReturn({rule:r,initial,target,forward,end}){
 const distance=Math.hypot(...add(target,initial,-1)),adjust=distance<r.threshold,first=adjust?add(target,forward,-r.initialDistance):initial.slice(),dest=add(target,forward,-r.finishOffset),path=[],spinePath=[];
 const times=new Set([0,end,r.advanceAt,r.advanceAt+r.advanceDuration,r.returnAt,r.returnAt+r.returnDuration]);for(let f=0;f<=Math.ceil(end*60);f++)times.add(Math.min(end,f/60));
 for(const time of [...times].sort((a,b)=>a-b)){let pos=initial.slice();
  if(adjust&&time>0&&time<r.advanceAt)pos=add(initial,add(first,initial,-1),(time-r.advanceAt)/r.advanceAt);
  if(time>=r.advanceAt)pos=add(first,add(dest,first,-1),Math.min(1,(time-r.advanceAt)/r.advanceDuration));
  if(time>=r.returnAt)pos=add(dest,add(initial,dest,-1),Math.min(1,(time-r.returnAt)/r.returnDuration));
  path.push({time,position:pos});spinePath.push({time,position:[0,0,0]});
 }return {path,spinePath};
}
