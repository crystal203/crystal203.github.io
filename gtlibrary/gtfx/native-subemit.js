import {NativeEmissionState} from './native-emission.js';
import {nativeParticleRandom} from './native-random.js';
const f32=Math.fround;

// SubModule::Update / RecordEmit. Each parent keeps its emission remainder,
// but reconstructs the random state from its particle seed and its owning
// system's current emission seed. A looping child follows the parent's life;
// its own duration does not restart its burst clock.
export function nativeSubEmissionBatches(parent,child,row,evaluate,position,{step=1/60,frameSteps}={}){
  if((row.emitProbability??1)===0||nativeParticleRandom(parent.randomSeed,1520730008)[0]>(row.emitProbability??1))return [];
  const delay=f32(evaluate(child.delay,0,nativeParticleRandom(parent.randomSeed,0x34bfa39a)[0]));
  const duration=child.loop?3.4028234663852886e38:child.duration,result=[];
  let remainder=0;
  for(let frame=parent.birthFrameIndex;frame<parent.orderFrames.length;frame++){
    const order=parent.orderFrames[frame];if(!order)continue;
    const current=f32(order.time-parent.birth-delay),dt=f32(frameSteps?.[frame]??step),previous=f32(current-dt);
    if(current<0||current>=duration||current>=parent.life)continue;
    const states=parent.emissionFrameStates?.[frame],seedWord=states?.[order.stage?'after':'before']?.[0]??parent.emissionState?.[0]??parent.systemSeed;
    const state=new NativeEmissionState((parent.randomSeed+seedWord)>>>0);state.remainder=remainder;
    const a=position(Math.max(parent.birth,order.time-dt)),b=position(order.time);
    const distance=Math.hypot(...a.map((v,i)=>f32(b[i]-v)));
    const append=batch=>{
      if(!batch?.count)return;
      const births=[],positions=[];
      for(let i=0;i<batch.count;i++){
        const fraction=Math.min(1,Math.max(0,i<batch.continuous?f32(f32(i+batch.remainder)*batch.interval):batch.burstAge));
        births.push(f32(order.time-f32(fraction*dt)));
        positions.push(b.map((v,k)=>f32(v+f32(f32(a[k]-v)*fraction))));
      }
      result.push({...batch,births,positions,frame,current:order.time,previous:order.time-dt,normalizedTime:f32(current/duration),previousPhase:0,phase:0,order,subDelay:delay});
    };
    append(state.overDistance(child.modules.EmissionModule,distance,current,duration,evaluate));
    append(state.overTime(child.modules.EmissionModule,previous,current,duration,evaluate));
    remainder=state.remainder;
  }
  return result;
}
