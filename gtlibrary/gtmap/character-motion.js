const f=Math.fround;
/** ShakeCalculator mode 0: Random.value supplies an angle, then a circle of radius/2.
 * Seeded angle replay is retained for editor seeking; Unity's global RNG state is not shared.
 * Source 6c934ec..6c93834; direction mode uses sinf and the configured decay/cycle count.
 */
export function characterShake(radius,elapsed,duration,seed=0){
 if(elapsed<0||elapsed>=duration-1e-9)return [0,0,0];
 const frame=Math.floor(elapsed*60),x=Math.sin((frame+1)*127.1+seed*311.7)*43758.5453123;
 const angle=f(f(x-Math.floor(x))*f(f(Math.PI)*2)),length=f(f(radius)*.5);
 return [f(f(Math.cos(angle))*length),f(f(Math.sin(angle))*length),0];
}
export function directionShake(radius,elapsed,duration,axis,decay=1,cycles=1){
 if(elapsed<0||elapsed>=duration)return [0,0,0];
 const u=f(elapsed/duration),envelope=Math.max(0,Math.min(1,f(1-f(f(decay)*u))));
 const wave=f(Math.sin(f(f(f(u*f(Math.PI))*2)*f(cycles)))),distance=f(f(f(radius)*envelope)*wave);
 return axis.map(v=>f(f(v)*distance));
}
