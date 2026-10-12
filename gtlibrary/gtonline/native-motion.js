/** Rope state MoveNext 0x5eb5620 and input 0x5eb4e54: spring, half impulse, ±5 clamp, 15° / 5. */
export class RopeSway{
 constructor(time){this.time=time;this.offset=0;this.velocity=0;}
 tap(){this.velocity=(this.velocity<0?-1:1)*.5;}
 sample(time){const dt=Math.min(.1,Math.max(0,time-this.time));this.time=time;this.velocity-=this.offset*dt;this.offset=Math.max(-5,Math.min(5,this.offset+this.velocity*dt));return {x:this.offset,angle:this.offset/5*15};}
}
