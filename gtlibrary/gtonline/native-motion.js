const f=Math.fround;
/** Native Rope input 5eb4e54 and state 5eb5620..5eb58a8; all constants from CRC-verified .rodata. */
export class RopeSway{
 constructor(time){this.time=time;this.start=time;this.offset=0;this.velocity=0;this.impulse=0;this.pushing=false;this.impulseElapsed=0;}
 tap(){if(this.pushing)return false;this.impulse=this.velocity<0?-.5:.5;this.impulseElapsed=0;this.pushing=true;return true;}
 sample(time){const dt=f(Math.min(.1,Math.max(0,time-this.time)));this.time=Math.max(this.time,time);this.velocity=f(this.velocity-f(this.offset*dt));if(this.pushing){if(this.impulseElapsed>f(.3))this.velocity=f(this.velocity+f(this.impulse*dt));this.impulseElapsed=f(this.impulseElapsed+dt);if(this.impulseElapsed>f(.7))this.pushing=false;}this.offset=Math.max(-5,Math.min(5,f(this.offset+f(this.velocity*dt))));const arc=Math.sin(f(f(f(Math.abs(this.offset)/f(7.071067810058594))*f(Math.PI))*.5)),elapsed=f(Math.max(0,time-this.start));return {x:this.offset,angle:f(f(this.offset/5)*15),height:f(f(1.5+f(Math.sin(f(-2.5*elapsed))*f(.025)))+f(arc*.25))};}
}

/** Native freefall/bounce calculator, 88b4f00..88b5394. */
export class PhysicsDistance{
 constructor(velocity,gravity,height,bounces=0){this.timeScale=1;this.rebound=.5;this.set(velocity,gravity,height,bounces);}
 set(velocity,gravity,height,bounces){const f=Math.fround;this.height=f(height);this.velocity=f(velocity);this.gravity=f(gravity);this.apex=f(this.velocity/this.gravity);this.total=f(this.apex+f(Math.sqrt(f(f(f(this.velocity*this.velocity)/f(this.gravity*this.gravity))+f(f(this.height+this.height)/this.gravity)))));this.elapsed=0;this.count=0;this.max=bounces;this.offset=0;}
 distance(delta=0){const f=Math.fround,t=f(this.elapsed+f(delta)),base=f(this.height+this.offset);if(t<this.apex){const v=f(this.velocity+f(f(1-f(t/this.apex))*this.velocity));return f(base+f(f(t*v)*.5));}const fall=f(t-this.apex);return f(f(base+f(f(this.apex*this.velocity)*.5))-f(f(f(fall*fall)*this.gravity)*.5));}
 done(){return this.elapsed>=this.total;}
 basic(dt){const f=Math.fround;this.elapsed=f(this.elapsed+f(this.timeScale*f(dt)));if(this.elapsed>=this.total&&this.count<this.max){const extra=f(this.elapsed-this.total),v=f(f(f(this.total-this.apex)*this.gravity)*this.rebound),count=this.count+1,max=this.max;this.set(v,this.gravity,0,max);this.count=count;this.elapsed=extra;}}
 proceed(dt,floor=0){const f=Math.fround;dt=f(dt);floor=f(floor);if(Math.abs(floor)<1e-6){this.basic(dt);return;}const step=f(this.timeScale*dt);if(this.distance(step)>floor){this.elapsed=f(this.elapsed+step);return;}const count=this.count,remaining=this.max-count;if(remaining>0){const v=f(this.velocity-f(this.elapsed*this.gravity)),h=f(this.distance()-floor);this.set(v,this.gravity,h,remaining);this.basic(dt);const nextCount=this.count,v2=f(this.velocity-f(this.elapsed*this.gravity)),h2=f(this.distance()+floor);this.set(v2,this.gravity,h2,remaining);this.count=nextCount+count;}else if(this.elapsed>this.total)this.elapsed=f(this.elapsed+step);else{const v=f(this.velocity-f(this.elapsed*this.gravity)),h=f(this.distance()-floor);this.set(v,this.gravity,h,0);this.basic(step);this.offset=floor;}}
}
/** Hang coroutine: .5s rotation/position, physics continues until its bounce ends. */
export class RopeLift{
 constructor(clock){this.started=this.last=clock;this.physics=new PhysicsDistance(8.5,10,0,2);this.physics.timeScale=2;this.finished=false;}
 sample(clock){const elapsed=Math.max(0,clock-this.started),dt=Math.max(0,Math.min(.1,clock-this.last));this.last=clock;if(!this.finished){if(elapsed>=.5&&this.physics.done())this.finished=true;else if(dt>0)this.physics.proceed(dt,this.physics.elapsed/this.physics.apex>=1?1.5:0);}return {height:this.finished?1.5:this.physics.distance(),finished:this.finished};}
}
