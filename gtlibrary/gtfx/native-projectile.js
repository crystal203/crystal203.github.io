// HomingProjectile.GetMoveVector, APK IL2CPP RVA 0x6a4f510.
// The update order and float32 arithmetic are recovered from the game.
// RotateTowards uses the matching Unity algorithm; libm last-bit parity is
// not established. Collision/hit detection belongs to the battle scene.
const f=Math.fround, mul=(a,b)=>f(a*b), add=(a,b)=>f(a+b);
const length=v=>f(Math.sqrt(add(add(mul(v[0],v[0]),mul(v[1],v[1])),mul(v[2],v[2]))));
const normalized=v=>{const n=length(v);return n>f(.00001)?v.map(x=>f(x/n)):[0,0,0];};
const cross=(a,b)=>[f(mul(a[1],b[2])-mul(a[2],b[1])),f(mul(a[2],b[0])-mul(a[0],b[2])),f(mul(a[0],b[1])-mul(a[1],b[0]))];
function rotateDirection(current,target,maxAngle){
  const cm=length(current),tm=length(target);if(cm<=.00001||tm<=.00001)return current.slice();
  const a=current.map(x=>f(x/cm)),b=target.map(x=>f(x/tm));
  const dot=add(add(mul(a[0],b[0]),mul(a[1],b[1])),mul(a[2],b[2]));
  if(dot>f(1-.000001))return current.slice();
  let axis,angle;
  if(dot<f(-1+.000001)){
    axis=Math.abs(a[2])>Math.SQRT1_2?[0,-a[2],a[1]]:[-a[1],a[0],0];
    axis=normalized(axis);angle=maxAngle;
  }else{axis=normalized(cross(a,b));angle=Math.min(f(Math.acos(Math.max(-1,Math.min(1,dot)))),maxAngle);}
  const c=f(Math.cos(angle)),s=f(Math.sin(angle)),v=cross(axis,a),axisDot=add(add(mul(axis[0],a[0]),mul(axis[1],a[1])),mul(axis[2],a[2]));
  return normalized(a.map((x,i)=>add(add(mul(x,c),mul(v[i],s)),mul(mul(axis[i],axisDot),f(1-c)))));
}

export function stepHomingProjectile(state,dt,{accel=0,angularSpeed=0,target=null}={}){
  dt=f(dt);let direction=state.direction;
  if(angularSpeed>0&&target){
    const toward=normalized(target.map((x,i)=>f(x-state.position[i])));
    direction=normalized(rotateDirection(direction,toward,mul(mul(angularSpeed,dt),f(Math.PI/180))));
  }
  const dv=mul(accel,dt),distance=mul(add(state.speed,mul(dv,.5)),dt);
  return {position:state.position.map((x,i)=>add(x,mul(direction[i],distance))),direction,speed:add(state.speed,dv)};
}

// Full frames are cached. Sampling a fractional frame does not mutate the
// history, so scrubbing backwards cannot change the subsequent trajectory.
export function createHomingTrajectory({position,direction,speed,accel=0,angularSpeed=0,target,targetAt=null,step=1/60,frameSteps=null}){
  if(!(step>0&&Number.isFinite(step)))throw new RangeError('Invalid projectile step');
  const frames=[{time:0,position:position.map(f),direction:normalized(direction),speed:f(speed)}];
  const advance=(state,dt)=>stepHomingProjectile(state,dt,{accel,angularSpeed,target:targetAt?targetAt(state.time+dt):target});
  return elapsed=>{
    elapsed=Math.max(0,elapsed);if(!Number.isFinite(elapsed))throw new RangeError('Invalid projectile time');
    while(frames.at(-1).time<elapsed){
      if(frames.length>20000)throw new RangeError('Projectile frame budget exceeded');
      const previous=frames.at(-1),dt=frameSteps?.[frames.length-1]??step;
      if(!(dt>0&&Number.isFinite(dt)))throw new RangeError('Invalid projectile frame step');
      if(previous.time+dt>elapsed+1e-10)break;
      frames.push({...advance(previous,dt),time:previous.time+dt});
    }
    let lo=0,hi=frames.length;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=elapsed+1e-10)lo=mid;else hi=mid;}
    const state=frames[lo],remaining=elapsed-state.time;
    return (remaining>1e-10?advance(state,remaining):state).position.slice();
  };
}
