const f=Math.fround,PI=f(Math.PI),clamp=u=>Math.max(0,Math.min(1,u));

/** DeviateCalculator<Vector3>.UpdateFrameInner 520bd88..520bebc.
 * Inbound uses sin(pi*u/2), outbound is linear. No guessed spring easing.
 * Sampling is continuous; native state transitions can retain one frame at 1.
 */
export function nativeDeviation(offset,elapsed,duration,clearDuration,stayDuration=0){
 if(elapsed<0)return [0,0,0];
 let u;
 if(duration>0&&elapsed<duration)u=f(Math.sin(f(f(f(elapsed/duration)*PI)*.5)));
 else if(elapsed<duration+stayDuration)u=1;
 else u=clearDuration>0?f(1-clamp(f(f(elapsed-duration-stayDuration)/clearDuration))):0;
 return offset.map(v=>f(f(v)*u));
}

/** SquishCalculator.UpdateFrame 6cf0ed4..6cf1024, broad/narrow interchange. */
export function nativeSquish(broad,narrow,frequency,elapsed,duration,firstAnchor,secondAnchor){
 if(elapsed<0||elapsed>=duration)return [1,1,1];
 const period=f(f(duration)/frequency),time=f(elapsed),remainder=f(time-f(period*Math.floor(f(time/period)))),u=f(clamp(remainder/period));
 let x,y;
 if(u<firstAnchor){const t=f(u/firstAnchor),a=f(1-t);x=f(f(narrow*t)+a);y=f(f(broad*t)+a);}
 else if(u<secondAnchor){const t=f(f(u-firstAnchor)/f(secondAnchor-firstAnchor)),a=f(1-t);x=f(f(broad*t)+f(narrow*a));y=f(f(narrow*t)+f(broad*a));}
 else{const t=f(f(u-secondAnchor)/f(1-secondAnchor)),a=f(1-t);x=f(t+f(broad*a));y=f(t+f(narrow*a));}
 return [x,y,1];
}

/** ColorOverrideCalculator pulse 61083c0..6108478 and InstantApplyColor 6ccbf60. */
export function nativeColorPulse(target,magnitude,frequency,elapsed,duration,anchor=.5,base=[1,1,1]){
 if(elapsed<0||elapsed>=duration)return base.slice();
 const time=f(elapsed),period=f(f(duration)/frequency),remainder=f(time-f(period*Math.floor(f(time/period)))),u=f(clamp(remainder/period));
 const a=f(f(.5/anchor)*Math.min(u,anchor)),b=f(f(.5/f(1-anchor))*Math.max(f(u-anchor),0));
 const amount=clamp(f(f(Math.abs(Math.sin(f(f(a+b)*PI))))*magnitude));
 return target.slice(0,3).map((v,i)=>f(base[i]+f(f(v-base[i])*amount)));
}
