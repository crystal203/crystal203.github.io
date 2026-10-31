import {snapshotPlaybackTargets} from './targeting.js';
import {sampleNativeStageShadow} from './native-stage-shadow.js';
import {sampleGraphPath} from './graph-action.js';
import * as THREE from '../vendor/three.module.js';
import {createParticleSimulation} from './core.js';
import {anchorPosition,anchorVelocity} from './character-link.js';
import {UnityRand} from './native-random.js';

/** Multiple native prefabs in one action, sharing the FX renderer and camera. */
export class FxActionPlayer {
 constructor(runtime){this.runtime=runtime;this.entries=[];this.active=false;}
 anchor(track,time){
  const link=track.link,dir=this.runtime.characterPlayer.direction,follower=link.entityBoneFollower;
  if(!follower)return anchorPosition(link,time,dir,this.options);
  const body=this.entries.find(e=>e.track.link.entityId===follower.entityId);if(!body)throw Error('实体骨骼引用不存在 '+follower.entityId);
  const bodyTime=track.at+(follower.freezeAt??time)-body.track.at,root=anchorPosition(body.track.link,bodyTime,dir,this.options),local=Math.max(0,bodyTime-(body.track.link.delay||0));
  const skeleton=body.sim.skeletonEffects.find(e=>typeof e.bonePosition==='function');if(!skeleton)throw Error('实体没有原生骨骼 '+follower.entityId);
  const offset=skeleton.bonePosition(follower.bone,local);const delta=follower.deltaPath?sampleGraphPath(follower.deltaPath,time):[0,0,0];return root.map((v,i)=>v+offset[i]+delta[i]);
 }
 velocity(track,time){
  if(!track.link.entityBoneFollower)return anchorVelocity(track.link,time,this.runtime.characterPlayer.direction,this.options);
  const step=1/4096,start=Math.max(track.link.delay||0,time-step),a=this.anchor(track,start),b=this.anchor(track,time+step),dt=time+step-start;return b.map((v,i)=>(v-a[i])/dt);
 }
 load(module,options,cycle=0){
  this.clear();this.module=module;this.options=snapshotPlaybackTargets(options,this.runtime.characterPlayer.direction);this.cycle=cycle;if(cycle===0)this.initialRepeatState=options.particleAutoSeedState;
  const rt=this.runtime,seed=rt.seed??12345,autoSeeds=new UnityRand(seed);
  if(options.particleAutoSeedState)autoSeeds.setState(options.particleAutoSeedState);
  this.randomStateBefore=autoSeeds.getState();
  const activationOrder=module.tracks.map((source,index)=>({track:{...source,link:{...source.link,screen:!!source.link.screen||source.effect.scripts?.some(s=>s.type==='ScreenEffectObject')}},index})).sort((a,b)=>(a.track.at+(a.track.link.delay||0))-(b.track.at+(b.track.link.delay||0))||a.index-b.index);
  for(const {track,index:instance} of activationOrder){
   const definition=rt.characterPlayer.effectDefinition(track.effect,track.link);
   definition.emitterVelocity=time=>this.velocity(track,time+(track.link.delay||0));
   definition.emitterPosition=time=>this.anchor(track,time+(track.link.delay||0));
   const sourceSampleNodes=definition.sampleNodes;
   if(track.link.nativeLaserScalePath||track.link.nativeHookFromTo||track.link.materialPaths?.length||track.link.nodePaths?.length||track.link.eulerPath||track.link.uniformScalePath||definition.scripts?.some(s=>s.type==='StageShadowSetter'&&s.bodyNode))definition.sampleNodes=(simulation,localTime)=>{
    sourceSampleNodes?.(simulation,localTime);
    const at=localTime+(track.link.delay||0),path=track.link.eulerPath;
    if(path&&at>=path[0].time){const values=sampleGraphPath(path,at),euler=new THREE.Euler().setFromQuaternion(simulation.nodeRoot.quaternion,'YXZ');for(let i=0;i<3;i++)if(track.link.eulerMask?.[i])euler['xyz'[i]]=values[i]*Math.PI/180;simulation.nodeRoot.quaternion.setFromEuler(euler);}
    if(track.link.uniformScalePath)simulation.nodeRoot.scale.multiply(new THREE.Vector3(...sampleGraphPath(track.link.uniformScalePath,at)));
    for(const rule of track.link.nodePaths||[]){
     const node=simulation.nodes.get(rule.node);if(!node)throw Error('Native node path target missing: '+rule.node);
     if(rule.positionPath&&at>=rule.positionPath[0].time){let point=new THREE.Vector3(...sampleGraphPath(rule.positionPath,at));if(rule.space==='world'){const anchor=this.anchor(track,at);point.sub(new THREE.Vector3(...anchor));node.parent.updateWorldMatrix(true,false);point=node.parent.worldToLocal(point);}node.position.copy(point);}
     if(rule.sourceMaceMotion){
      const m=rule.sourceMaceMotion,anchor=this.anchor(track,at),duration=m.hitAt-m.shootAt,u=at<m.shootAt?0:at<m.hitAt?Math.min(1,(at-m.shootAt)/duration):at<m.returnAt?1:Math.max(0,1-(at-m.returnAt)/(m.end-m.returnAt)),point=new THREE.Vector3(...anchor).lerp(new THREE.Vector3(...m.target),u*u),local=point.clone().sub(new THREE.Vector3(...anchor));
      node.parent.updateWorldMatrix(true,false);node.position.copy(node.parent.worldToLocal(local));
      const distance=point.distanceToSquared(new THREE.Vector3(...anchor))/3;
      for(const item of simulation.statics)for(const material of Array.isArray(item.mesh.material)?item.mesh.material:[item.mesh.material])if(material.uniforms.partlyVisible?.value)material.uniforms.partlySqrRange.value=distance;
      if(m.chainNode){const chain=simulation.nodes.get(m.chainNode);if(chain)chain.lookAt(point.clone().sub(new THREE.Vector3(...anchor)));}
     }
     if(rule.scale)node.scale.fromArray(rule.scale);
     if(rule.lookAtPath&&at>=rule.lookAtPath[0].time){const point=new THREE.Vector3(...sampleGraphPath(rule.lookAtPath,at));if(rule.space==='world'){point.sub(new THREE.Vector3(...this.anchor(track,at)));simulation.nodeRoot.updateMatrixWorld(true);}node.lookAt(point);}
    }
    for(const rule of track.link.materialPaths||[]){const value=sampleGraphPath(rule.path,at)[0];for(const item of [...simulation.statics,...simulation.particles])if(!rule.node||item.s.node===rule.node)for(const material of Array.isArray(item.mesh.material)?item.mesh.material:[item.mesh.material]){const uniform=material.uniforms[rule.uniform];if(!uniform)throw Error('Native material path uniform missing: '+rule.uniform);uniform.value=value;}}
    if(track.link.nativeHookFromTo){
     const h=track.link.nativeHookFromTo,from=sampleGraphPath(h.fromPath,at),to=sampleGraphPath(h.toPath,at),delta=to.map((v,i)=>v-from[i]),length=Math.hypot(...delta),direction=length>1e-5?delta.map(v=>v/length):[0,0,0],span=Math.max(0,length-h.headLength),anchor=this.anchor(track,at),root=from.map((v,i)=>v+direction[i]*span*.5-anchor[i]);
     simulation.nodeRoot.position.fromArray(root);if(length>1e-5)simulation.nodeRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...direction));
     const chain=simulation.nodes.get(h.chainNode),head=simulation.nodes.get(h.headNode);if(!chain||!head)throw Error('Native HookShot target node missing');chain.scale.set(h.chainScale[0],span/h.chainUnitLength,h.chainScale[2]);head.position.z=h.headOffset-h.chainScale[1]+(length-h.headLength)*.5;head.scale.fromArray(h.headScale).multiplyScalar(Math.min(1,length/h.headLength));
     for(const item of simulation.statics.filter(s=>s.s.node===h.chainNode))for(const mat of Array.isArray(item.mesh.material)?item.mesh.material:[item.mesh.material])mat.uniforms.uvScale.value.y=span/h.chainScale[1];
     simulation.nativeHookSample={length,span,from,to,root,headScale:Math.min(1,length/h.headLength),headZ:head.position.z,chainScaleY:chain.scale.y,uvTop:span/h.chainScale[1]};
    }
    if(track.link.nativeLaserScalePath){const scale=sampleGraphPath(track.link.nativeLaserScalePath,at)[0];for(const script of definition.scripts||[])for(const rule of script.scalingNodes||[]){const node=simulation.nodes.get(rule.node);if(!node)throw Error('Missing ScalingLaserEffect node '+rule.node);node.scale.fromArray(rule.scale.map((v,i)=>v*(rule.axes&(1<<i)?scale:1)));}}
    sampleNativeStageShadow(simulation,localTime);
   };
   definition.simulationDuration=Math.max(0,(track.link.emissionEnd??track.link.fxEnd??(track.link.delay||0)+track.effect.duration)-(track.link.delay||0));
   definition.particleAutoSeedState=autoSeeds.getState();
   if(options.systemSeeds?.[instance])definition.systemSeeds=options.systemSeeds[instance];
   if(options.seedResetOrder?.[instance])definition.seedResetOrder=options.seedResetOrder[instance];
   if(options.frameSteps?.[instance])definition.frameSteps=options.frameSteps[instance];
   const sim=createParticleSimulation(definition,{textures:rt.textures,geometries:rt.geometries,index:rt.index,camera:track.link.screen?rt.screenCamera:rt.camera,seed});
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
  const period=this.module.continuous?.period;
  if(period){
   const cycle=Math.floor(Math.max(0,time)/period);
   if(cycle<this.cycle)this.load(this.module,{...this.options,particleAutoSeedState:this.initialRepeatState});
   while(this.cycle<cycle){
    const initial=this.initialRepeatState??this.randomStateBefore;
    this.load(this.module,{...this.options,particleAutoSeedState:this.randomStateAfter},this.cycle+1);this.initialRepeatState=initial;
   }
   time-=cycle*period;
  }
  for(const {sim,track} of this.entries){
   const local=time-track.at,link=track.link,start=link.delay||0,end=link.fxEnd??start+track.effect.duration;
   sim.group.visible=local>=start&&local<end;
   if(!sim.group.visible)continue;
   sim.topView=rt.topView;sim.sample(link.effectClockPath?sampleGraphPath(link.effectClockPath,local)[0]:local-start);

   if(link.colorPath){const rgba=sampleGraphPath(link.colorPath,local),seen=new Set();for(const item of [...sim.statics,...sim.particles])for(const material of Array.isArray(item.mesh.material)?item.mesh.material:[item.mesh.material]){const color=(sim.statics.includes(item)?material.uniforms.tint:material.uniforms.particleColor)?.value;if(color&&!seen.has(color)){seen.add(color);color.multiply(new THREE.Vector4(...rgba));}}}
   if(link.growUntil){const scale=Math.max(0,Math.min(1,(local-start)/link.growUntil));sim.group.scale.set(scale,scale,-scale);}
   if(link.screen){sim.group.position.set(0,0,0);continue;}
   if(link.directionPath){const initial=link.directionPath[0].position,now=sampleGraphPath(link.directionPath,local);sim.group.rotation.y=Math.atan2(now[2],now[0])-Math.atan2(initial[2],initial[0]);}
   const pos=this.anchor(track,local);sim.group.position.set(pos[0],pos[1],-pos[2]);
   // All world-space systems keep the emitter's position at birth.
   if(link.entityBoneFollower||link.motionPath||link.graphFollow||['projectile','meteor','hook'].includes(link.anchor))for(const p of sim.particles){
    if(!p.mesh.visible||p.s.local)continue;
    const born=this.anchor(track,p.birth/p.s.speed+start),elements=p.mesh.matrix.elements;
    elements[12]+=born[0]-pos[0];elements[13]+=born[1]-pos[1];elements[14]+=born[2]-pos[2];
   }
   if(link.entityBoneFollower||link.motionPath||link.graphFollow||['projectile','meteor','hook'].includes(link.anchor))for(const p of sim.trails){
    if(!p.trail.visible||p.s.local)continue;
    const born=this.anchor(track,p.birth/p.s.speed+start);
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


