import * as THREE from '../vendor/three.module.js';
import {createParticleSimulation} from './core.js';
import {anchorPosition,anchorVelocity} from './character-link.js';
import {UnityRand} from './native-random.js';

/** Multiple native prefabs in one action, sharing the FX renderer and camera. */
export class FxActionPlayer {
 constructor(runtime){this.runtime=runtime;this.entries=[];this.active=false;}
 load(module,options){
  this.clear();this.module=module;this.options=options;
  const rt=this.runtime,seed=rt.seed??12345,autoSeeds=new UnityRand(seed);
  if(options.particleAutoSeedState)autoSeeds.setState(options.particleAutoSeedState);
  this.randomStateBefore=autoSeeds.getState();
  const activationOrder=module.tracks.map((track,index)=>({track,index})).sort((a,b)=>(a.track.at+(a.track.link.delay||0))-(b.track.at+(b.track.link.delay||0))||a.index-b.index);
  for(const {track,index:instance} of activationOrder){
   const definition=rt.characterPlayer.effectDefinition(track.effect,track.link);
   definition.emitterVelocity=time=>anchorVelocity(track.link,time+(track.link.delay||0),rt.characterPlayer.direction,options);
   definition.emitterPosition=time=>anchorPosition(track.link,time+(track.link.delay||0),rt.characterPlayer.direction,options);
   definition.simulationDuration=Math.max(0,(track.link.fxEnd??(track.link.delay||0)+track.effect.duration)-(track.link.delay||0));
   definition.particleAutoSeedState=autoSeeds.getState();
   if(options.systemSeeds?.[instance])definition.systemSeeds=options.systemSeeds[instance];
   if(options.seedResetOrder?.[instance])definition.seedResetOrder=options.seedResetOrder[instance];
   if(options.frameSteps?.[instance])definition.frameSteps=options.frameSteps[instance];
   const sim=createParticleSimulation(definition,{textures:rt.textures,geometries:rt.geometries,index:rt.index,camera:rt.camera,seed});
   autoSeeds.setState(sim.randomStateAfter);
   sim.group.scale.z=-1;sim.group.visible=false;sim.cameraConfig=rt.cameraConfig;sim.topView=rt.topView;
   if(track.link.screen)sim.camera=rt.screenCamera;
   rt.characterPlayer.bindNodes(definition,sim);rt.scene.add(sim.group);
   if(track.link.screen){sim.group.removeFromParent();rt.screenScene.add(sim.group);}
   this.entries.push({sim,track,instance});
  }
  this.randomStateAfter=autoSeeds.getState();
  this.active=true;rt.nativePlanCache=null;
 }
 sample(time){
  if(!this.active)return;
  const rt=this.runtime,dir=rt.characterPlayer.direction;
  for(const {sim,track} of this.entries){
   const local=time-track.at,link=track.link,start=link.delay||0,end=link.fxEnd??start+track.effect.duration;
   sim.group.visible=local>=start&&local<end;
   if(!sim.group.visible)continue;
   sim.topView=rt.topView;sim.sample(local-start);
   if(link.screen){sim.group.position.set(0,0,0);continue;}
   const pos=anchorPosition(link,local,dir,this.options);sim.group.position.set(pos[0],pos[1],-pos[2]);
   // All world-space systems keep the emitter's position at birth.
   if(link.graphFollow||['projectile','meteor','hook'].includes(link.anchor))for(const p of sim.particles){
    if(!p.mesh.visible||p.s.local)continue;
    const born=anchorPosition(link,p.birth/p.s.speed+start,dir,this.options),elements=p.mesh.matrix.elements;
    elements[12]+=born[0]-pos[0];elements[13]+=born[1]-pos[1];elements[14]+=born[2]-pos[2];
   }
   if(link.graphFollow||['projectile','meteor','hook'].includes(link.anchor))for(const p of sim.trails){
    if(!p.trail.visible||p.s.local)continue;
    const born=anchorPosition(link,p.birth/p.s.speed+start,dir,this.options);
    p.trail.matrix.makeTranslation(born[0]-pos[0],born[1]-pos[1],born[2]-pos[2]);
   }
   if(link.hook)for(const p of sim.statics){
    const name=p.node.userData.linkName;if(name==='Left'||name==='Right')p.mesh.visible=name===(dir==='right'?'Right':'Left');
    if(p.s.chainIndex!=null){p.mesh.visible=p.node.scale.y>0;for(const mat of (Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material]))mat.uniforms.uvScale.value.y=p.node.scale.y/.2;}
   }
  }
 }
 bounds(){
  const result=new THREE.Box2().makeEmpty();if(!this.active)return result;
  for(const {sim,track} of this.entries)if(sim.group.visible&&!track.link.screen)result.union(sim.projectedBounds());
  return result;
 }
 clear(){
  for(const {sim} of this.entries){sim.clear();sim.group.removeFromParent();sim.quad.dispose();}
  this.entries=[];this.active=false;this.module=null;this.runtime.nativePlanCache=null;
 }
}
