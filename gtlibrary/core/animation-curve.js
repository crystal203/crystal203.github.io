// Unity AnimationCurve: cubic Hermite, with weighted Bezier tangents when present.
export function curve(c, time, fallback=1) {
  const keys=c?.m_Curve || [];
  if (!keys.length) return fallback;
  const first=keys[0], last=keys.at(-1);
  if (time<first.time || time>last.time) {
    const mode=time<first.time?c.m_PreInfinity:c.m_PostInfinity, span=last.time-first.time;
    if (span && (mode===1 || mode===4)) {
      let u=(time-first.time)/span; u=((u%(mode===4?2:1))+(mode===4?2:1))%(mode===4?2:1);
      time=first.time+(mode===4&&u>1?2-u:u)*span;
    }
  }
  if(time<=first.time)return first.value;
  if(time>=last.time)return last.value;
  let i=1;while(keys[i].time<time)i++;
  const a=keys[i-1],b=keys[i],dt=b.time-a.time,t=(time-a.time)/dt;
  if(!Number.isFinite(a.outSlope)||!Number.isFinite(b.inSlope))return a.value;
  if ((a.weightedMode&2)||(b.weightedMode&1)) {
    const w1=(a.weightedMode&2)?a.outWeight:1/3,w2=(b.weightedMode&1)?b.inWeight:1/3;
    const bez=(u,p0,p1,p2,p3) => (1-u)**3*p0+3*(1-u)**2*u*p1+3*(1-u)*u*u*p2+u**3*p3;
    let lo=0,hi=1,u=t;
    for(let n=0;n<18;n++){u=(lo+hi)/2;if(bez(u,0,w1,1-w2,1)<t)lo=u;else hi=u;}
    return bez(u,a.value,a.value+a.outSlope*dt*w1,b.value-b.inSlope*dt*w2,b.value);
  }
  return (2*t**3-3*t*t+1)*a.value+(t**3-2*t*t+t)*dt*a.outSlope+(-2*t**3+3*t*t)*b.value+(t**3-t*t)*dt*b.inSlope;
}
