import {shapeKernels,shapeConstants} from './native-shape-kernels.js';
import {compileKernel,NativeKernelVM} from './native-kernel-vm.js';
import {UnityRand4} from './native-random.js';
const orbitalKernel=compileKernel(shapeKernels.orbitalVelocity),vm=new NativeKernelVM(shapeConstants);
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const f32=Math.fround;

// ClampVelocityModule's drag subtracts force * dt from speed. The size term
// is the projected disk area, and the velocity term is squared speed.
export function nativeDrag(velocity,drag,step,size=1,bySize=false,byVelocity=false){
  const [x,y,z]=velocity.map(f32),squared=f32(f32(f32(y*y)+f32(z*z))+f32(x*x)),speed=f32(Math.sqrt(squared));
  if(!(speed>1e-15))return [0,0,0];
  const radius=f32(size*.5),area=bySize?f32(f32(radius*f32(Math.PI))*radius):1;
  const force=f32(f32(area*f32(drag))*(byVelocity?squared:1));
  const remaining=Math.max(0,f32(speed-f32(force*f32(step))));
  return [x,y,z].map(v=>f32(f32(v/speed)*remaining));
}

// ForceModule::Update uses a module-owned Rand4 when randomizePerFrame is on.
// Existing particles update before time emission; newly born particles form
// a separate SIMD batch. Native KillParticles removes lanes 3..0 per block,
// swapping the last particle into a removed slot and rechecking that block.
export function nativeForceTimeline(seed,particles,{step=1/60,frameSteps,recordForce=true}={}){
  const rng=new UnityRand4(seed),alive=[],born=new Map();
  for(const p of particles){p.forceFrames=[];p.orderFrames=[];if(!born.has(p.frameIndex))born.set(p.frameIndex,[]);born.get(p.frameIndex).push(p);}
  const end=Math.max(0,...particles.map(p=>p.localBirth+p.life));
  let time=0;
  const apply=(batch,frame)=>{for(let base=0;base<batch.length;base+=4){const xyz=[rng.nextFloat4(),rng.nextFloat4(),rng.nextFloat4()];for(let lane=0;lane<4&&base+lane<batch.length;lane++)batch[base+lane].forceFrames[frame]=xyz.map(axis=>axis[lane]);}};
  const kill=current=>{let base=0;while(base<alive.length){let removed=false;for(let lane=Math.min(3,alive.length-base-1);lane>=0;lane--){const i=base+lane,p=alive[i];if(p.localBirth+p.life<current){alive[i]=alive[alive.length-1];alive.pop();removed=true;}}if(!removed)base+=4;}};
  for(let frame=0;time<=end&&frame<100000;frame++){
    time=f32(time+f32(frameSteps?.[frame]??step));
    if(recordForce)apply(alive,frame);kill(time);
    alive.forEach((p,i)=>p.orderFrames[frame]={stage:0,index:i,time});
    const fresh=born.get(frame)||[];if(recordForce)apply(fresh,frame);alive.push(...fresh);kill(time);
    for(const p of fresh)if(alive.includes(p))p.orderFrames[frame]={stage:1,index:alive.indexOf(p),time};
  }
}

// The game's ApplyOrbitalAndRadialVelocity ARM64 arithmetic, including its
// sin/cos and reciprocal-square-root approximations. Matrices use column order.
export function nativeOrbitalDelta(position,angular,offset,radial,step,{speed=1,toModule=identity,fromModule=identity}={}){
  const v=vm.view,data=0x1000;
  vm.g.fill(0);vm.g[31]=0x1f000;
  for(const [i,ptr] of [0x1000,0,0x2000,0x2100,0x2200,0x2210,0x2300,0x2400].entries())vm.g[i]=ptr;
  v.setBigUint64(vm.g[31],0x2500n,true);
  for(const [i,field] of [0,0x20,0x40,0xc0,0xe0,0x100,0x4c0].entries())v.setBigUint64(data+field,BigInt(0x3000+i*16),true);
  v.setUint8(data+0x7d8,speed!==1?1:0);
  for(let i=0;i<16;i++){v.setFloat32(0x2000+i*4,fromModule[i],true);v.setFloat32(0x2100+i*4,toModule[i],true);}
  for(let lane=0;lane<4;lane++){
    v.setFloat32(0x2200+lane*4,step,true);v.setFloat32(0x2210+lane*4,step>0?1/step:0,true);
    v.setFloat32(0x2500+lane*4,radial,true);v.setFloat32(0x3060+lane*4,speed,true);
    for(let i=0;i<3;i++){
      v.setFloat32(0x3000+i*16+lane*4,position[i],true);v.setFloat32(0x3030+i*16+lane*4,0,true);
      v.setFloat32(0x2300+i*16+lane*4,angular[i],true);v.setFloat32(0x2400+i*16+lane*4,offset[i],true);
    }
  }
  vm.run(orbitalKernel);
  return [0,1,2].map(i=>v.getFloat32(0x3030+i*16,true));
}
