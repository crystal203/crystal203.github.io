import {UnityRand} from './native-random.js';
const f32=Math.fround,clamp=x=>Math.max(0,Math.min(1,x));

// EmissionModule::AccumulateBurst / EmitCommon, recovered from native code.
// Unlike a float MinMaxCurve, a two-constant burst uses an inclusive integer
// range. Constant counts and probability 1 do not consume a random number.
export function nativeBurstCount(burst,rng,time,evaluate){
  const probability=f32(burst.probability??1);
  if(probability===0||probability<1&&rng.nextFloat()>=probability)return 0;
  const c=burst.countCurve;
  if(!c)return 0;
  if(!c.minMaxState)return Math.max(0,Math.trunc(c.scalar));
  if(c.minMaxState===3){
    const lo=Math.trunc(Math.min(c.minScalar,c.scalar)),hi=Math.trunc(Math.max(c.minScalar,c.scalar))+1;
    return Math.max(0,lo+(hi>lo?rng.nextUint()%(hi-lo):0));
  }
  return Math.max(0,Math.trunc(evaluate(c,time,rng.nextFloat())));
}

export class NativeEmissionState {
  constructor(seed){this.rng=new UnityRand(seed);this.remainder=0;this.interval=1;this.burstAge=0;}
  accumulate(amount){
    const total=f32(this.remainder+f32(amount)),count=Math.trunc(total);
    this.remainder=f32(total-count);this.interval=amount>=1e-6?f32(1/amount):1;
    return count;
  }
  accumulateBursts(emission,previous,current,duration,evaluate,repeatAllowed=true){
    let count=0;
    for(const burst of emission.m_Bursts||[]){
      const start=f32(burst.time),repeat=f32(burst.repeatInterval),cycles=burst.cycleCount??1;
      let fires=start>=previous&&current>start;
      if(!fires&&repeatAllowed&&cycles!==1&&previous>start&&repeat>0){
        const before=f32(f32(previous-start)/repeat),after=f32(f32(current-start)/repeat);
        fires=(cycles===0||cycles-1>before)&&Math.trunc(after)>Math.trunc(before);
      }
      if(!fires)continue;
      count+=nativeBurstCount(burst,this.rng,f32(current/duration),evaluate);
      this.burstAge=f32(1-clamp(f32(f32(start-previous)/f32(current-previous))));
    }
    return count;
  }
  overTime(emission,previous,current,duration,evaluate){
    // A wrap shares this one rate random value, then evaluates the new-cycle
    // segment before the tail of the old cycle (including burst RNG order).
    const random=this.rng.nextFloat(),a=Math.max(0,f32(previous)),b=Math.max(0,f32(current));
    const rate=t=>Math.max(0,f32(evaluate(emission.rateOverTime,f32(t/duration),random)));
    let amount=0,burstCount=0;
    if(emission.rateOverTime?.scalar>0)amount=a>b?f32(f32(rate(b)*b)+f32(rate(duration)*f32(duration-a))):f32(rate(b)*f32(b-a));
    if(a>b){
      burstCount+=this.accumulateBursts(emission,0,b,duration,evaluate);
      burstCount+=this.accumulateBursts(emission,a,f32(duration+f32(.0001)),duration,evaluate,false);
    }else burstCount=this.accumulateBursts(emission,a,b,duration,evaluate);
    const continuous=this.accumulate(amount);
    return {continuous,count:continuous+burstCount,interval:this.interval,remainder:this.remainder,burstAge:this.burstAge};
  }
  overDistance(emission,distance,current,duration,evaluate){
    if(!(emission.rateOverDistance?.scalar>0))return null;
    const rate=Math.max(0,f32(evaluate(emission.rateOverDistance,f32(current/duration),this.rng.nextFloat())));
    const count=this.accumulate(f32(rate*f32(distance)));
    this.interval=f32(rate*f32(distance))>=f32(.0001)?f32(1/f32(rate*f32(distance))):1;
    return {continuous:count,count,interval:this.interval,remainder:this.remainder,burstAge:0};
  }
}

// Frames are simulation-clock seconds. Supplying frameSteps preserves batch
// boundaries; an integer seed alone cannot reconstruct those boundaries.
export function nativeEmissionBatches(system,seed,evaluate,{step=1/60,frameSteps,emitterPosition,baseAt=0,limit=1500,delayOverride,simulationDuration}={}){
  const state=new NativeEmissionState(seed),emission=system.modules.EmissionModule,batches=[],frameStates=[];
  const delay=f32(delayOverride??evaluate(system.delay,0,new UnityRand(seed).nextFloat()));
  if(!emission)return {delay,batches,frameStates,state:state.rng.getState(),truncated:false};
  let elapsed=0,cycleTime=0,frame=0,phase=0,total=0;
  const duration=f32(system.duration),speed=system.speed||1,shape=system.modules.ShapeModule;
  const horizon=system.loop&&Number.isFinite(simulationDuration)?Math.max(0,simulationDuration*speed):delay+duration;
  while(elapsed<horizon&&total<limit&&frame<100000){
    const dt=f32(frameSteps?.[frame]??step);
    if(!(dt>0&&Number.isFinite(dt)))throw Error('Particle frame steps must be positive finite seconds');
    const previousElapsed=elapsed;elapsed=f32(elapsed+dt);
    const activeStep=Math.max(0,f32(elapsed-Math.max(previousElapsed,delay)));
    const previousCycle=cycleTime;
    cycleTime=f32(cycleTime+activeStep);
    if(system.loop&&duration>0){while(cycleTime>=duration)cycleTime=f32(cycleTime-duration);}
    else cycleTime=Math.min(duration,cycleTime);
    const previousPhase=phase;
    phase+=f32(f32(evaluate(shape?.type===12?shape.radius?.speed:shape?.arc?.speed,f32(cycleTime/duration),1,1))*dt);
    if(activeStep<=0){frame++;continue;}
    const append=batch=>{
      if(!batch?.count)return;
      batch.requestedCount=batch.count;batch.count=Math.min(batch.count,limit-total);total+=batch.count;
      const births=Array.from({length:batch.count},(_,i)=>{
        const fraction=clamp(i<batch.continuous?f32(f32(i+batch.remainder)*batch.interval):batch.burstAge);
        return f32(elapsed-f32(fraction*activeStep));
      });
      batches.push({...batch,births,previous:Math.max(0,previousElapsed-delay),current:elapsed-delay,normalizedTime:f32(cycleTime/duration),previousPhase,phase,frame});
    };
    // Update1b performs distance emission before Update1Incremental/time.
    if(emission.rateOverDistance?.scalar>0){
      const a=emitterPosition?.(baseAt+previousElapsed/speed)??[0,0,0],b=emitterPosition?.(baseAt+elapsed/speed)??a;
      append(state.overDistance(emission,Math.hypot(...a.map((x,i)=>f32(b[i]-x))),cycleTime,duration,evaluate));
    }
    const before=state.rng.getState();
    append(state.overTime(emission,previousCycle,cycleTime,duration,evaluate));
    frameStates[frame]={before,after:state.rng.getState()};
    frame++;
  }
  return {delay,batches,frameStates,state:state.rng.getState(),truncated:elapsed<horizon||batches.some(b=>b.requestedCount>b.count)};
}
