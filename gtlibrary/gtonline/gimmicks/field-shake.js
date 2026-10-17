const f=Math.fround;
/** ShakeCalculator mode 0: max decayed radius, a random XY circle, radius / 2.
 * FieldObject.Shake with no source key adds a pulse; it does not replace others.
 */
export class NativeFieldShake{
 constructor(random=Math.random){this.random=random;this.pulses=[];}
 add(radius,duration,clock){this.pulses.push({radius:f(radius),duration:f(duration),at:clock});}
 sample(clock){let radius=0;this.pulses=this.pulses.filter(p=>clock-p.at<p.duration);for(const p of this.pulses)radius=Math.max(radius,f(p.radius*f(1-f(f(clock-p.at)/p.duration))));if(!radius)return [0,0,0];const angle=f(f(f(this.random())*f(Math.PI))*2),length=f(radius*.5);return [f(f(Math.cos(angle))*length),f(f(Math.sin(angle))*length),0];}
 clear(){this.pulses=[];}
}
