const f=Math.fround;
/** Bomb.UpdateFrame 5dd22e8..5dd2370 and PlayCountSfx 5dd27cc..5dd2824. */
export function bombPresentation(elapsed,timeToExplode=5,blinkThreshold=3){
 const t=f(elapsed),start=f(timeToExplode-blinkThreshold),active=f(timeToExplode-t)<=blinkThreshold,u=f(t-start),phase=f(u*f(f(u+1)*7)),green=active?f(Math.abs(f(Math.sin(phase)))):null;
 return {active,phase,color:active?[1,green,green,1]:null,tickBit:active&&f(Math.sin(f(phase*f(.6000000238418579))))>0,shakeRadius:f(f(t*f(.02500000037252903))/timeToExplode)};
}
