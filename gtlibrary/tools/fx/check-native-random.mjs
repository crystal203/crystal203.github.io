// One bounded native fixture check. No browser, skins, direction sweeps or Unity.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UnityRand,UnityRand4,nativeInitialBatch,nativeCircleBatch,nativeParticleFlip} from '../../gtfx/native-random.js';
import {nativeSystemSeeds} from '../../gtfx/native-system-seeds.js';
import {nativeShapeSamples} from '../../gtfx/native-shapes.js';
import {NativeEmissionState} from '../../gtfx/native-emission.js';
import {nativeOrbitalDelta,nativeDrag,nativeForceTimeline} from '../../gtfx/native-motion.js';
import {createHomingTrajectory} from '../../gtfx/native-projectile.js';
const fixture=JSON.parse(readFileSync(new URL('./native-random-fixtures.json',import.meta.url))),f=Math.fround;
const seedInput={systems:[{sourceId:'a',autoRandomSeed:true,seed:0},{sourceId:'fixed',autoRandomSeed:false,seed:17},{sourceId:'b',autoRandomSeed:true,seed:0}]};
const baseline=nativeSystemSeeds(seedInput,12345),overridden=nativeSystemSeeds({...seedInput,systemSeeds:{a:99}},12345);
assert.equal(overridden.seeds.a,99);assert.equal(overridden.seeds.b,baseline.seeds.b);assert.deepEqual(overridden.after,baseline.after);assert.equal(baseline.seeds.fixed,17);
const repeated=nativeSystemSeeds({...seedInput,seedResetOrder:['b','a','b','fixed']},12345),referenceStream=new UnityRand(12345);
referenceStream.nextUint();assert.equal(repeated.seeds.a,referenceStream.nextUint());assert.equal(repeated.seeds.b,referenceStream.nextUint());assert.deepEqual(repeated.after,referenceStream.getState());
const circle=fixture.circle,shape={type:10,arc:{value:360,mode:0,spread:0},radius:{value:f(.05)},radiusThickness:f(.03)};
assert.deepEqual(new UnityRand4(circle.seed).nextUint4(),circle.particleSeeds);
assert.deepEqual(nativeCircleBatch(new UnityRand4(circle.seed),shape),circle.shape);
assert.deepEqual(nativeShapeSamples(shape,new UnityRand4(circle.seed),2,{normalize:false}),circle.shape.slice(0,2));
assert.deepEqual(circle.particleSeeds.slice(0,2).map(seed=>nativeParticleFlip(seed,{x:.5,y:0})),[[1,0],[0,0]]);
assert.deepEqual(circle.shape.slice(0,2).map(p=>f(p.position[0]*f(39.35))),[1.0554324388504028,-.445120632648468]);
const lineRng=new UnityRand4(circle.seed),lineShape={type:12,radius:{value:1.5,mode:2,spread:0},angle:25,length:2,radiusThickness:.25,donutRadius:.2,arc:{value:270,spread:0,mode:0},randomDirectionAmount:.2,sphericalDirectionAmount:.1,randomPositionAmount:.3};
assert.deepEqual(nativeShapeSamples(lineShape,lineRng,5,{phase:.37,previousPhase:.31,interpolationStep:.125,interpolationStart:.5}),fixture.linePingPong.particles);
assert.deepEqual(['x','y','z','w'].flatMap(k=>lineRng.lanes.map(l=>l[k])),fixture.linePingPong.state);
const initial=fixture.initial,rng=new UnityRand4(initial.seed),batches=[nativeInitialBatch(rng,{size3D:true,rotation3D:true}),nativeInitialBatch(rng,{size3D:true,rotation3D:true})];
assert.deepEqual(batches.flatMap(b=>b.map(p=>p.randomSeed)),initial.particleSeeds);
const fields={0x10:0,0x90:3,0xb0:4,0xd0:5,0x130:8,0xf0:6,0x110:7,0x50:2};
for(const [i,row] of initial.draws.entries())assert.deepEqual(batches[Math.floor(i/8)].map(p=>p.r[fields[+row.fieldOffset]]),row.random);
assert.deepEqual(['x','y','z','w'].flatMap(k=>rng.lanes.map(l=>l[k])),initial.state);
const emission=new NativeEmissionState(circle.seed),em={rateOverTime:{scalar:150},m_Bursts:[{time:.02,probability:1,cycleCount:1,countCurve:{minMaxState:3,minScalar:2,scalar:6}}]};
for(const row of fixture['emission-orbit'].emission){
  const result=emission.overTime(em,f(row.previous),f(row.current),1,c=>c?.scalar||0);
  assert.equal(result.count,row.count);assert.equal(result.continuous,row.continuous);
  assert.deepEqual([result.interval,result.remainder,result.burstAge],row.emission);
  assert.deepEqual(emission.rng.getState(),row.randomState);
}
const orbit=fixture['orbit-arm'];
for(let i=0;i<orbit.position.length;i++)assert.deepEqual(nativeOrbitalDelta(orbit.position[i],orbit.angular,orbit.offset,orbit.radial,orbit.dt),orbit.velocityDelta[i]);
const df=fixture['drag-force'],drag=fixture['drag-arm'];
assert.deepEqual(drag.velocity.map((v,i)=>nativeDrag(v,drag.drag,drag.dt,drag.size[i],true,true)),drag.result);
const particles=Array.from({length:4},()=>({frameIndex:0,localBirth:0,life:.04}));nativeForceTimeline(circle.seed,particles);
const velocity=particles.map(()=>[0,0,0]);
for(let frame=0;frame<2;frame++){
  for(let i=0;i<4;i++)for(let axis=0;axis<3;axis++){const a=f(f(particles[i].forceFrames[frame][axis]*f(2*(axis+2)))-(axis+2));velocity[i][axis]=f(velocity[i][axis]+f(a*f(1/60)));}
  assert.deepEqual(velocity,fixture['force-arm'].frames[frame].velocity);
}
// A behavior regression for the recovered target-following update, not a
// native libm bit-parity fixture: moving a target must change the trajectory.
const config={position:[0,0,0],direction:[1,0,0],speed:5,accel:2,angularSpeed:90,target:[6,0,0]};
const straight=createHomingTrajectory(config),moving=createHomingTrajectory({...config,targetAt:t=>[6,0,20*t]});
const at=moving(.2);moving(.1);assert.deepEqual(moving(.2),at);assert.notDeepEqual(at,straight(.2));assert.ok(at[2]>0);
console.log('PASS: heart/Rand4/Initial, bounded emission/orbit/drag/force fixtures, target-following seek regression.');
console.log('Fixture provenance distinguishes APK ARM64 from the Windows reference; this is not full-game parity.');
