// Native RecoilType1: CharacterExtensions 0x6081af8 -> SpineControllerExtensions
// 0x6ced914. DeviateLocal / DeviateLocalAngle rise with sin(u*pi/2),
// return linearly; JumpCalculator 0x671af3c uses height*sin(u*pi).
export function sampleNativeRecoil(time,events=[],forward=[1,0,0]){
 let position=[0,0,0],angle=0,jumpEnd=-Infinity;
 for(const e of events){
  const duration=e.duration??.3,at=e.at??0,t=time-at;if(t<0)continue;
  const d=e.direction||forward,n=Math.hypot(d[0],d[2]),dir=n>1e-5?[d[0]/n,0,d[2]/n]:[0,0,0];
  const u=t/duration,w=u>=1?0:u<.5?Math.sin(u*Math.PI):2*(1-u);
  // RecoilType1 cancels the existing positional deviation before starting.
  position=[-dir[0]*(e.distance??.2)*w,position[1],-dir[2]*(e.distance??.2)*w];
  // Native ToDirection prefers X on ties: back/right positive, front/left negative.
  const sign=n?Math.abs(dir[0])>=Math.abs(dir[2])?Math.sign(dir[0]):Math.sign(dir[2]):0;
  if(sign&&at>=jumpEnd){angle=sign*(e.angle??8)*w;}
  // Jump(height,duration,false) rejects a new jump while one is active.
  if(at>=jumpEnd){position[1]=u<1?(e.height??.2)*Math.sin(Math.PI*u):0;jumpEnd=at+duration;}
 }
 return {position,angle};
}
export function buildNativeRecoilPath(events,forward,end,fps=60){
 const times=new Set([0,end]);for(let i=0;i<=Math.ceil(end*fps);i++)times.add(Math.min(end,i/fps));
 for(const e of events)for(const dt of [0,e.duration/2,e.duration])if(e.at+dt<=end)times.add(e.at+dt);
 return [...times].sort((a,b)=>a-b).map(time=>({time,...sampleNativeRecoil(time,events,forward)}));
}
