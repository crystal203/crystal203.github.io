// JumpStompSupport native UpdateMovement uses linear XZ travel and independent
// SpineController.Jump clocks. This is the unobstructed preview field contract.
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const lerp=(a,b,u)=>add(a,add(b,a,-1),Math.max(0,Math.min(1,u)));
export function buildJumpStompMotion({rule,initial,target,forward,end,options}){
 const approach=rule.approach,hold=rule.hold,retreat=rule.retreat,returnAt=approach+hold;
 const side=[Math.sign(forward[0])||1,0,0],destination=target.slice();
 if(rule.contact){const gap=(options.boundsSize?.[0]??.55)/2+(options.targetBoundsSize?.[0]??.55)/2+.2;destination[0]-=gap*side[0];}
 const path=[],spinePath=[],duration=Math.max(end,returnAt+retreat),times=new Set([0,approach,returnAt,returnAt+retreat,end]);
 for(let f=0;f<=Math.ceil(duration*60);f++)times.add(Math.min(duration,f/60));
 for(const time of [...times].sort((a,b)=>a-b)){
  // BasicSupport.UpdateMovement stops at Duration; jump calculator can finish later.
  const t=Math.min(time,end),position=t<=approach?lerp(initial,destination,t/approach):t<returnAt?destination.slice():lerp(destination,initial,(t-returnAt)/retreat);
  path.push({time,position});
  const jump=(at,d,h)=>time>=at&&time<at+d?Math.sin((time-at)/d*Math.PI)*h:0;
  spinePath.push({time,position:[0,jump(0,approach,rule.jumpHeight)+jump(returnAt,retreat,rule.backJumpHeight),0]});
 }
 return {path,spinePath,directionPath:[{time:0,position:side}]};
}

// C# double-height free-fall clock: advance to .35, set clock .4,
// freeze until .375, then run the calculator at 15x until landing.
export function buildHammerLeapMotion({rule,initial,forward,end}){
 const path=[],spinePath=[],times=new Set([0,rule.dashDuration,rule.apexAt,rule.dropAt,.5,rule.returnAt,rule.returnAt+rule.dashDuration,end]);
 for(let f=0;f<=Math.ceil(end*60);f++)times.add(Math.min(end,f/60));
 for(const time of [...times].sort((a,b)=>a-b)){
  const outbound=Math.min(time,rule.dashDuration)*rule.speed,back=Math.max(0,Math.min(rule.dashDuration,time-rule.returnAt))*rule.speed;
  path.push({time,position:add(initial,forward,outbound-back)});
  const clock=time<rule.apexAt?time:time<=rule.dropAt?rule.apexClock:rule.apexClock+(time-rule.dropAt)*rule.dropTimeScale;
  const fall=time<.5?Math.max(0,rule.velocity*clock-rule.gravity*clock*clock/2)*rule.spineHeightScale:0;
  const t=time-rule.returnAt,jump=t>=0&&t<.3?2*Math.sin(t/.3*Math.PI):0,offset=t>=0&&t<.2?-(t<.1?t/.1:2-t/.1):0;
  spinePath.push({time,position:add([0,fall+jump,0],forward,offset)});
 }
 return {path,spinePath};
}
