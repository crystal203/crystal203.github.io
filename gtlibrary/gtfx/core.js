import * as THREE from '../vendor/three.module.js';
import {installNativeProjection} from '../gtmap/native-camera.js';
import {sampleAnimator} from '../core/custom-animator.js';
import {UnityRand,UnityRand4,nativeInitialBatch,nativeParticleFlip,nativeMeshParticleFlip,nativeParticleRandom,nativeModuleRandoms} from './native-random.js';
import {nativeShapeSamples} from './native-shapes.js';
import {nativeNoiseField,noiseSeedOffset} from './native-noise.js';
import {nativeEmissionBatches} from './native-emission.js';
import {nativeSubEmissionBatches} from './native-subemit.js';
import {nativeSystemSeeds} from './native-system-seeds.js';
import {auditEffect} from './native-fidelity.js';
import {nativeOrbitalDelta,nativeDrag,nativeForceTimeline} from './native-motion.js';

const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
const mix = (a,b,t) => a+(b-a)*t;
const vec = (v={}) => new THREE.Vector3(v.x||0,v.y||0,v.z||0);
const rgba = (c={r:1,g:1,b:1,a:1}) => [c.r,c.g,c.b,c.a];
const rand = seed => {const state=new UnityRand(seed);return ()=>state.nextFloat();};

import {curve} from '../core/animation-curve.js';
export {curve} from '../core/animation-curve.js';
export function value(c,t=0,r=.5,fallback=0) {
  if(!c)return fallback;
  switch(c.minMaxState) {
    case 1:return curve(c.maxCurve,t)*c.scalar;
    case 2:return mix(curve(c.minCurve,t)*c.scalar,curve(c.maxCurve,t)*c.scalar,r);
    case 3:return mix(Number(c.minScalar),Number(c.scalar),r);
    default:return c.scalar==null?fallback:Number(c.scalar);
  }
}
function gradient(g,t) {
  function sample(prefix,n,channels) {
    if(!n)return channels.map(()=>1);
    const keys=Array.from({length:n},(_,i)=>({t:g[prefix+'time'+i]/65535,c:g['key'+i]}));
    let i=1;while(i<n&&keys[i].t<t)i++;
    const a=keys[Math.max(0,i-1)],b=keys[Math.min(n-1,i)];
    const u=b.t===a.t||g.m_Mode===1?0:clamp((t-a.t)/(b.t-a.t));
    return channels.map(ch=>mix(a.c[ch],b.c[ch],u));
  }
  return [...sample('c',g.m_NumColorKeys,['r','g','b']),...sample('a',g.m_NumAlphaKeys,['a'])];
}
function color(c,t,r) {
  if(!c)return [1,1,1,1];
  if(c.minMaxState===1)return gradient(c.maxGradient,t);
  if(c.minMaxState===2){const a=rgba(c.minColor),b=rgba(c.maxColor);return a.map((v,i)=>mix(v,b[i],r));}
  if(c.minMaxState===3){const a=gradient(c.minGradient,t),b=gradient(c.maxGradient,t);return a.map((v,i)=>mix(v,b[i],r));}
  if(c.minMaxState===4)return gradient(c.maxGradient,r);
  return rgba(c.maxColor);
}
function integral(c,age,life,r,force=false) {
  let sum=0;const n=16,step=age/n;
  for(let i=0;i<n;i++){const t=(i+.5)*step;sum+=value(c,t/life,r)*(force?age-t:1)*step;}
  return sum;
}
const f32=Math.fround;
const roundVector=v=>v.set(f32(v.x),f32(v.y),f32(v.z));
const addNative=(a,b,scale=1)=>{for(const k of ['x','y','z'])a[k]=f32(a[k]+f32(b[k]*f32(scale)));return a;};
// Per-frame native module order: Initial(gravity), Velocity, Noise, Inherit,
// Force, Clamp; SimulateParticles then adds (persistent + animated) * speed * dt.
// A replay must supply the original frame steps, not just its initial seed.
function particleMotion(p,age,effect) {
  const m=p.s.modules,noise=m.NoiseModule,velocity=m.VelocityModule,mr=p.moduleRandom;
  const orbital=velocity&&['orbitalX','orbitalY','orbitalZ','radial'].some(k=>velocity[k]?.scalar||velocity[k]?.minScalar);
  const dt=f32(effect.simulationStep||1/60),cache=p.noiseSteps??=[{time:0,position:p.sh.clone(),persistent:p.velocity.clone(),velocity:p.velocity.clone(),rotation:p.startRotation.clone()}];
  const inverseRotation=p.worldRot.clone().invert();
  const fromWorld=v=>roundVector(v.applyQuaternion(inverseRotation));
  const evaluate=(state,t,step,frame)=>{
    step=f32(step);
    const u=f32(state.time/p.life),coords=state.position.clone(),persistent=state.persistent.clone(),animated=new THREE.Vector3();
    const systemTime=p.birth+t-p.systemStart,gravity=value(m.InitialModule.gravityModifier,f32((p.s.loop?systemTime%p.s.duration:systemTime)/p.s.duration),mr.gravity);
    const gravityVector=fromWorld(new THREE.Vector3(...(effect.gravity||[0,-9.8100004196167,0]))).multiplyScalar(gravity);
    addNative(persistent,gravityVector,step);
    const speed=f32(value(velocity?.speedModifier,u,mr.speedModifier,1));
    if(velocity){
      const linear=new THREE.Vector3(...['x','y','z'].map((k,i)=>f32(value(velocity[k],u,mr.velocity[i]))));
      if(velocity.inWorldSpace)fromWorld(linear);addNative(animated,linear);
    }
    if(orbital&&step>0){
      const angular=['orbitalX','orbitalY','orbitalZ'].map((k,i)=>value(velocity[k],u,mr.orbital[i]));
      const offset=['orbitalOffsetX','orbitalOffsetY','orbitalOffsetZ'].map((k,i)=>value(velocity[k],u,mr.orbitalOffset[i]));
      const toModule=velocity.inWorldSpace?new THREE.Matrix4().makeRotationFromQuaternion(p.worldRot):new THREE.Matrix4();
      const delta=nativeOrbitalDelta(state.position.toArray(),angular,offset,value(velocity.radial,u,mr.radial),step,
        {speed,toModule:toModule.elements,fromModule:toModule.clone().invert().elements});
      addNative(animated,new THREE.Vector3(...delta));
    }
    let result=null;
    if(noise){
      if(p.s.simulationSpace===1){
        coords.applyMatrix4(p.matrix).add(p.originOffset);
        if(effect.emitterPosition)coords.add(new THREE.Vector3(...effect.emitterPosition(p.birth/p.s.speed)));
      }
      const scroll=integral(noise.scrollSpeed,p.birth+t-p.systemStart,p.s.duration,1);
      result=nativeNoiseField(noise,p.noiseSeedOffset,p.randomSeed,coords.toArray(),scroll,u,value);
      if(result){const v=new THREE.Vector3(...result.velocity);if(p.s.simulationSpace===1){fromWorld(v);v.set(v.x/(p.worldScale.x||1),v.y/(p.worldScale.y||1),v.z/(p.worldScale.z||1));}addNative(animated,v);}
    }
    const inherit=m.InheritVelocityModule;
    if(inherit&&p.s.simulationSpace===1&&(inherit.m_Mode!==0||![0,3].includes(inherit.m_Curve.minMaxState))){
      const inherited=p.inherited.clone();
      if(inherit.m_Mode===1&&effect.emitterVelocity){inherited.fromArray(effect.emitterVelocity((p.birth+t)/p.s.speed));fromWorld(inherited);inherited.set(inherited.x/(p.worldScale.x||1),inherited.y/(p.worldScale.y||1),inherited.z/(p.worldScale.z||1));}
      addNative(animated,inherited,value(inherit.m_Curve,u,mr.inherit));
    }
    if(m.ForceModule){
      const mod=m.ForceModule,random=mod.randomizePerFrame?p.forceFrames?.[frame]??mr.force:mr.force;
      const force=new THREE.Vector3(...['x','y','z'].map((k,j)=>f32(value(mod[k],u,random[j]))));
      if(mod.inWorldSpace)fromWorld(force);addNative(persistent,force,step);
    }
    const total=addNative(persistent.clone(),animated),mod=m.ClampVelocityModule;
    if(mod){
      const factor=f32(1-f32(Math.pow(f32(1-(mod.dampen||0)),f32(Math.abs(step)*60))));
      if(factor>0){
        if(mod.separateAxis){
          if(mod.inWorldSpace)total.applyQuaternion(p.worldRot);
          for(const k of ['x','y','z']){const limit=Math.max(0,value(mod[k],u,mr.clamp,Infinity));total[k]=f32(mix(total[k],clamp(total[k],-limit,limit),factor));}
          if(mod.inWorldSpace)fromWorld(total);
        }else{const length=total.length(),limit=Math.max(0,value(mod.magnitude,u,mr.clamp,Infinity));if(length>limit&&length)roundVector(total.multiplyScalar(mix(1,limit/length,factor)));}
      }
      const drag=value(mod.drag,u,mr.drag);
      if(drag){
        const size=p.startSize.clone();if(m.SizeModule){const sm=m.SizeModule,x=value(sm.curve,u,mr.size,1);size.multiply(new THREE.Vector3(x,sm.separateAxes?value(sm.y,u,mr.size,1):x,sm.separateAxes?value(sm.z,u,mr.size,1):x));}
        total.fromArray(nativeDrag(total.toArray(),drag,step,m.InitialModule.size3D?Math.max(size.x,size.y,size.z):size.x,mod.multiplyDragByParticleSize,mod.multiplyDragByParticleVelocity));
      }
      roundVector(persistent.copy(total).sub(animated));
    }
    const actual=roundVector(total.multiplyScalar(speed)),position=addNative(state.position.clone(),actual,step);
    const rotation=state.rotation.clone();
    if(m.RotationModule){const mod=m.RotationModule;addNative(rotation,new THREE.Vector3(mod.separateAxes?value(mod.x,u,mr.rotation):0,mod.separateAxes?value(mod.y,u,mr.rotation):0,value(mod.curve,u,mr.rotation)),step*p.rotationSign);}
    if(m.RotationBySpeedModule){const mod=m.RotationBySpeedModule,range=mod.range||{x:0,y:1},v=clamp((actual.length()-range.x)/Math.max(1e-9,range.y-range.x));addNative(rotation,new THREE.Vector3(mod.separateAxes?value(mod.x,v,mr.rotationBySpeed):0,mod.separateAxes?value(mod.y,v,mr.rotationBySpeed):0,value(mod.curve,v,mr.rotationBySpeed)),step*p.rotationSign);}
    return {time:t,position,persistent,velocity:actual,rotation,noise:result};
  };
  const firstStep=Math.max(0,(p.birthFrame??p.birth+dt)-p.birth);
  let i=0;
  while(true){
    const next=i===0&&firstStep>1e-10?firstStep:cache[i].time+(effect.frameSteps?.[(p.birthFrameIndex??0)+i]??dt);
    if(next>age+1e-10)break;
    if(!cache[i+1])cache.push(evaluate(cache[i],next,next-cache[i].time,(p.birthFrameIndex??0)+i));
    i++;
  }
  return age-cache[i].time>1e-10?evaluate(cache[i],age,age-cache[i].time,(p.birthFrameIndex??0)+i):cache[i];
}
function particleSizeAt(p,age,motion={}){
  const m=p.s.modules,mr=p.moduleRandom,u=age/p.life,currentVelocity=motion.velocity||p.velocity;
  const size=p.startSize.clone();
  if(m.SizeModule){const mod=m.SizeModule,x=value(mod.curve,u,mr.size,1);size.multiply(new THREE.Vector3(x,mod.separateAxes?value(mod.y,u,mr.size,1):x,mod.separateAxes?value(mod.z,u,mr.size,1):x));}
  if(m.SizeBySpeedModule){const mod=m.SizeBySpeedModule,range=mod.range||{x:0,y:1},speed=currentVelocity.length();
    const t=clamp((speed-range.x)/Math.max(1e-9,range.y-range.x)),x=value(mod.curve,t,mr.sizeBySpeed,1);
    size.multiply(new THREE.Vector3(x,mod.separateAxes?value(mod.y,t,mr.sizeBySpeed,1):x,mod.separateAxes?value(mod.z,t,mr.sizeBySpeed,1):x));}
  if(motion.noise){const factors=motion.noise.size;size.multiply(new THREE.Vector3(factors[0],m.InitialModule.size3D?factors[1]:factors[0],m.InitialModule.size3D?factors[2]:factors[0]));}
  return size;
}
function shapeSample(sh,rng) {
  const position=new THREE.Vector3(),direction=new THREE.Vector3(0,0,1);
  if(!sh)return {position,direction};
  const radius=sh.radius?.value??1,arc=(sh.arc?.value??360)*Math.PI/180;
  const a=rng()*arc, radiusMin=1-(sh.radiusThickness??1);
  const rr=radius*Math.sqrt(mix(radiusMin*radiusMin,1,rng()));
  if(sh.type===0||sh.type===1||sh.type===2||sh.type===3){
    const z=sh.type>=2?rng():rng()*2-1, f=Math.sqrt(1-z*z);
    direction.set(f*Math.cos(a),f*Math.sin(a),z);position.copy(direction).multiplyScalar(radius*Math.cbrt(rng()));
  }else if(sh.type===10||sh.type===11){
    position.set(Math.cos(a)*rr,Math.sin(a)*rr,0);direction.set(Math.cos(a),Math.sin(a),0);
  }else if([4,7,8,9].includes(sh.type)){
    position.set(Math.cos(a)*rr,Math.sin(a)*rr,sh.type>=8?rng()*(sh.length||0):0);
    const angle=(sh.angle||0)*Math.PI/180;direction.set(Math.cos(a)*Math.sin(angle),Math.sin(a)*Math.sin(angle),Math.cos(angle));
  }else if([5,15,16,18].includes(sh.type))position.set(rng()-.5,rng()-.5,sh.type===18?0:rng()-.5);
  else if(sh.type===12)position.set((rng()*2-1)*radius,0,0);
  else if(sh.type===17){const b=rng()*Math.PI*2,minor=sh.donutRadius||.2;position.set((radius+minor*Math.cos(b))*Math.cos(a),(radius+minor*Math.cos(b))*Math.sin(a),minor*Math.sin(b));direction.copy(position).normalize();}
  else if([6,13,14,19,20].includes(sh.type))position.set(rng()-.5,rng()-.5,0);
  return transformShapeSample(sh,position,direction,rng);
}
function transformShapeSample(sh,position,direction,rng,native=false) {
  if(!sh)return {position,direction};
  const s=sh.m_Scale||{x:1,y:1,z:1};position.multiply(vec(s));
  if(native){position.set(...position.toArray().map(Math.fround));direction.multiply(vec(s));if(direction.lengthSq()>1e-30)direction.normalize();else direction.set(0,0,1);}
  const rot=vec(sh.m_Rotation).multiplyScalar(Math.PI/180);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x,rot.y,rot.z,'ZXY'));
  position.applyQuaternion(q).add(vec(sh.m_Position));direction.applyQuaternion(q);
  if(!native&&sh.randomDirectionAmount){const random=new THREE.Vector3(rng()*2-1,rng()*2-1,rng()*2-1).normalize();direction.lerp(random,sh.randomDirectionAmount).normalize();}
  return {position,direction};
}
const vertexShader=`attribute vec4 rgba; varying vec2 vUv; varying vec2 vUv2; varying vec2 vMaskUv; varying vec4 vColor; varying vec3 vNormal; varying float vHeight; varying vec2 nativeRawUv; varying vec4 nativeScreenPos;
uniform vec4 uvRect; uniform vec4 particleColor; uniform vec2 uvScale; uniform vec2 uvOffset;
uniform vec2 uvScale2; uniform vec2 uvOffset2;
uniform vec2 spriteSize; uniform vec2 spriteAtlasFlip; uniform vec3 particlePivot; uniform bool clampSpriteUv; uniform bool spriteRotated; uniform vec2 flipUv; uniform vec2 maskScale; uniform vec2 maskOffset;
void main(){vec2 particleUv=mix(uv,1.0-uv,flipUv);vec2 spriteUv=spriteRotated?vec2(particleUv.y,1.0-particleUv.x):particleUv;
vUv=(uvRect.xy+spriteUv*uvRect.zw)*uvScale+uvOffset;
vUv2=(uvRect.xy+spriteUv*uvRect.zw)*uvScale2+uvOffset2;
vMaskUv=(uvRect.xy+spriteUv*uvRect.zw)*maskScale+maskOffset;
if(clampSpriteUv){
  // Only the main image was moved into an atlas. UV animation still operates
  // in the original frame; secondary textures and masks keep their own UVs.
  vec2 frameUv=particleUv*uvScale+uvOffset;
  if(spriteRotated)frameUv=vec2(frameUv.y,1.0-frameUv.x);
  frameUv=mix(frameUv,1.0-frameUv,spriteAtlasFlip);
  vUv=uvRect.xy+frameUv*uvRect.zw;
  vUv2=particleUv*uvScale2+uvOffset2;vMaskUv=particleUv*maskScale+maskOffset;
}
vColor=rgba*particleColor;
vec3 vertex=position;vertex.xy*=spriteSize;vertex+=particlePivot;
vNormal=normalize(mat3(modelViewMatrix)*normal);vHeight=vertex.y;
gl_Position=projectionMatrix*modelViewMatrix*vec4(vertex,1.0);
nativeRawUv=particleUv;nativeScreenPos=gl_Position;nativeScreenPos.xy=gl_Position.xy*0.5+gl_Position.ww*0.5;}`;
const fragmentShader=`uniform sampler2D map; uniform sampler2D map2; uniform bool dualTexture; uniform sampler2D maskMap; uniform bool masked; uniform sampler2D matcapMap; uniform bool matcap; uniform bool opaque;
uniform vec4 gradColor; uniform vec2 gradRange; uniform bool gradation; uniform float cutoff;
uniform bool particleDissolve; uniform vec4 nativeCustom1;
uniform bool clampSpriteUv; uniform vec4 spriteUvBounds;
uniform vec4 tint;uniform bool additive;uniform bool sourcePremultiplied;uniform bool ignoreVertexColor;uniform bool gammaColorSpace;uniform float colorGain;varying vec2 vUv;varying vec2 vUv2;varying vec2 vMaskUv;varying vec4 vColor;varying vec3 vNormal;varying float vHeight;
void main(){vec2 sampleUv=clampSpriteUv?clamp(vUv,spriteUvBounds.xy,spriteUvBounds.zw):vUv;gl_FragColor=texture2D(map,sampleUv)*(ignoreVertexColor?vec4(1.0):vColor)*tint*colorGain;
if(dualTexture)gl_FragColor*=texture2D(map2,vUv2);
if(particleDissolve)gl_FragColor=texture2D(map,sampleUv).r>nativeCustom1.x?vColor:vec4(0.0);
// Match GTCharFx.BuildParticleShader: multiply mask RGB and alpha independently.
// Its UV transform must stay independent of scrolling/tiling on the main texture.
if(masked)gl_FragColor*=texture2D(maskMap,vMaskUv);
if(matcap){
  vec3 n=normalize(vNormal);
  // Orthographic Unity camera: MatCap lookup is the view-space surface normal.
  gl_FragColor*=texture2D(matcapMap,n.xy*0.5+0.5);
  if(gradation&&abs(gradRange.y-gradRange.x)>0.00001){float g=clamp((vHeight-gradRange.x)/(gradRange.y-gradRange.x),0.0,1.0);gl_FragColor.rgb*=mix(vec3(1.0),gradColor.rgb,g);}
  if(gl_FragColor.a<cutoff)discard;
  if(opaque)gl_FragColor.a=1.0;
}
gl_FragColor.a=clamp(gl_FragColor.a,0.0,1.0);
// FX blending uses display RGB on both the canvas and the byte capture target.
// Convert linear source colors once, before premultiplication, on either path.
if(!gammaColorSpace)gl_FragColor=sRGBTransferOETF(gl_FragColor);
// Additive textures may contain opaque black. Black contributes no light and
// must not turn into opaque black coverage when the canvas/GIF is transparent.
if(!sourcePremultiplied&&!opaque)gl_FragColor.rgb*=gl_FragColor.a;
if(additive)gl_FragColor.a=clamp(max(max(gl_FragColor.r,gl_FragColor.g),gl_FragColor.b),0.0,1.0);
if(gl_FragColor.a<0.002)discard;
}`;
function geometry(data) {
  let g;
  if(data.primitive){
    g=({cube:()=>new THREE.BoxGeometry(1,1,1),sphere:()=>new THREE.SphereGeometry(.5,24,16),
      cylinder:()=>new THREE.CylinderGeometry(.5,.5,2,24),capsule:()=>new THREE.CapsuleGeometry(.5,1,8,24),
      plane:()=>new THREE.PlaneGeometry(10,10).rotateX(-Math.PI/2)})[data.primitive]();
    // Unity primitives have one material slot.
    g.clearGroups();g.addGroup(0,g.index.count,0);
  }else{
    g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv||Array(data.position.length/3*2).fill(0),2));g.setIndex(data.indices);
    for(const group of data.groups||[])g.addGroup(group.start,group.count,group.material);
    if(data.normal?.length===g.attributes.position.count*3)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));else g.computeVertexNormals();
  }
  const count=g.attributes.position.count, colors=data.color;
  let out=Array(count*4).fill(1);
  if(colors?.length===count*4)out=colors;
  else if(colors?.length===count*3)for(let i=0;i<count;i++)for(let j=0;j<3;j++)out[i*4+j]=colors[i*3+j];
  // Unity Color32 mesh channels are bytes; Float32 shader attributes expect 0..1.
  if(colors?.length&&out.some(channel=>channel>1.01))out=out.map((channel,i)=>colors.length===count*3&&i%4===3?1:channel/255);
  g.setAttribute('rgba',new THREE.Float32BufferAttribute(out,4));return g;
}
// Reused atlas frames retain the clamp-to-edge sampling of standalone PNGs.
// Clamp in the fragment stage, so interior UV interpolation is unchanged.
function spriteSampleBounds(sprite,textures){
  const [x,y,w,h]=sprite?.uv||[0,0,1,1],texture=textures[sprite?.texture];
  const dx=.5/(texture?.width||1),dy=.5/(texture?.height||1);
  return new THREE.Vector4(x+dx,y+dy,x+w-dx,y+h-dy);
}
const materialsOf=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
const uniformsOf=mesh=>materialsOf(mesh)[0].uniforms;
function rotationOf(node){
  // Matrix decomposition divides by scale. Some FX deliberately animate scale
  // through zero; a Transform's quaternion remains defined at that instant.
  const rotation=new THREE.Quaternion();for(let n=node;n;n=n.parent)rotation.premultiply(n.quaternion);return rotation;
}

export class FxRuntime {
  constructor(canvas) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0,0);
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-8,8,8,-8,.01,100);
    this.screenScene=new THREE.Scene();this.screenCamera=new THREE.OrthographicCamera(-4.6,4.6,4.6,-4.6,.01,100);
    this.screenCamera.position.z=10;this.screenCamera.lookAt(0,0,0);
    this.cameraConfig={pitchDeg:45,oblique:true,orthographicSize:.5,near:.01,far:82,distance:20};
    installNativeProjection(this.camera,()=>this.cameraConfig.oblique&&!this.topView);
    this.topView=false;this.setView(false);this.zoom=1;this.viewSize=16;
    this.group=new THREE.Group();this.group.scale.z=-1;this.scene.add(this.group);
    this.grid=new THREE.GridHelper(40,40,0x263b58,0x162436);this.grid.position.y=-.05;this.scene.add(this.grid);
    this.quad=geometry({position:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],uv:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]});
    this.textures={};this.geometries={};this.particles=[];this.statics=[];this.excluded=new Set();this.frameCount=0;
  }
  resize() {
    const w=this.renderer.domElement.clientWidth,h=this.renderer.domElement.clientHeight;
    this.renderer.setSize(w,h,false);if(this.backgroundMode==='checker'&&this.checker)this.checker.repeat.set(w/192,h/192);const aspect=w/Math.max(h,1),size=this.viewSize/this.zoom;
    // Shared native ViewportScaler applies both the world and projection transforms.
    this.camera.left=-size*aspect/2;this.camera.right=size*aspect/2;this.camera.top=size/2;this.camera.bottom=-size/2;
    this.camera.updateProjectionMatrix();
    this.resizeScreenCamera(w,h);
  }
  resizeScreenCamera(width,height){
    const halfHeight=4.6,halfWidth=halfHeight*width/Math.max(height,1);
    this.screenCamera.left=-halfWidth;this.screenCamera.right=halfWidth;
    this.screenCamera.top=halfHeight;this.screenCamera.bottom=-halfHeight;
    this.screenCamera.updateProjectionMatrix();
  }
  clear() {
    for(const p of [...this.particles,...this.statics]){this.group.remove(p.mesh);p.mesh.userData.grabTexture?.dispose();for(const material of materialsOf(p.mesh))material.dispose();}
    for(const p of this.trails||[]){this.group.remove(p.trail);p.trail.geometry.dispose();p.trail.material.dispose();}
    this.trails=[];
    this.statics=[];
    this.particles=[];
  }
  dispose() {
    ++this.loadGeneration;this.modulePlayer?.clear();this.characterPlayer?.dispose();this.clear();
    Object.values(this.textures).forEach(t=>t.dispose());Object.values(this.geometries).forEach(g=>g.dispose());
    this.quad.dispose();this.checker?.dispose();this.captureTarget?.dispose();this.grid.geometry.dispose();
    for(const m of (Array.isArray(this.grid.material)?this.grid.material:[this.grid.material]))m.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();
  }
  async load(index,resolveUrl,{effect=null,loadImage=null}={}) {
    if(effect){
      // Follow references through sprite records, including animation frames and masks.
      const textureKeys=new Set(),meshKeys=new Set(),visited=new Set();
      const visit=v=>{if(typeof v==='string'){if(index.textures[v])textureKeys.add(v);if(index.meshes[v])meshKeys.add(v);if(index.sprites[v]&&!visited.has(v)){visited.add(v);visit(index.sprites[v]);}}else if(v&&typeof v==='object')Object.values(v).forEach(visit);};
      visit(effect);index={...index,textures:Object.fromEntries([...textureKeys].map(k=>[k,index.textures[k]])),meshes:Object.fromEntries([...meshKeys].map(k=>[k,index.meshes[k]]))};
    }
    const loaded={}, generation=(this.loadGeneration||0)+1;this.loadGeneration=generation;
    try {
      await Promise.all(Object.entries(index.textures).map(async([key,t])=>{
        const tex=loadImage?new THREE.Texture(await loadImage(resolveUrl(t.url))):await new THREE.TextureLoader().loadAsync(resolveUrl(t.url));
        if(loadImage)tex.needsUpdate=true;
        tex.colorSpace=index.colorSpace==='linear'?THREE.SRGBColorSpace:THREE.NoColorSpace;
        const wrap=mode=>mode===0?THREE.RepeatWrapping:mode===2?THREE.MirroredRepeatWrapping:THREE.ClampToEdgeWrapping;
        tex.wrapS=wrap(t.wrapU??(t.repeat?0:1));tex.wrapT=wrap(t.wrapV??(t.repeat?0:1));
        tex.minFilter=tex.magFilter=t.filterMode>0?THREE.LinearFilter:THREE.NearestFilter;tex.generateMipmaps=false;loaded[key]=tex;
      }));
    }catch(e){Object.values(loaded).forEach(t=>t.dispose());throw e;}
    if(generation!==this.loadGeneration){Object.values(loaded).forEach(t=>t.dispose());return;}
    this.clear();Object.values(this.textures).forEach(t=>t.dispose());Object.values(this.geometries).forEach(g=>g.dispose());
    this.index=index;this.textures=loaded;this.geometries=Object.fromEntries(Object.entries(index.meshes).map(([k,v])=>[k,geometry(v)]));
    this.cameraConfig={...this.cameraConfig,...index.camera};this.camera.near=this.cameraConfig.near;this.camera.far=this.cameraConfig.far;this.setView(this.topView);this.resize();
    const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;this.textures.white=white;
  }
  build(effect,seed=12345) {
    this.clear();effect={...effect,gravity:effect.gravity??this.index.gravity3D};this.effect=effect;this.seed=seed;this.excluded.clear();
    this.screenEffect=effect.scripts?.some(s=>s.type==='ScreenEffectObject')||false;
    if(!this.mapSimulation){
      const targetScene=this.screenEffect?this.screenScene:this.scene;
      if(this.group.parent!==targetScene){this.group.removeFromParent();targetScene.add(this.group);}
    }
    this.group.scale.set(1,1,-1);
    this.nativePlanCache=null;
    this.viewCenter=new THREE.Vector3();this.setView(this.topView);
    const nodes=new Map();
    for(const n of effect.nodes){const o=new THREE.Object3D();o.position.copy(vec(n.position));o.quaternion.set(n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w);o.scale.copy(vec(n.scale));o.visible=n.active;nodes.set(n.id,o);}
    for(const n of effect.nodes){if(nodes.has(n.parent))nodes.get(n.parent).add(nodes.get(n.id));}
    const root=nodes.get(effect.root);root.position.set(0,0,0);
    if(effect.rootRotation)root.quaternion.fromArray(effect.rootRotation);
    // Without an action direction the native pool instantiates the prefab at
    // its authored rotation. Direction describes its local forward axis; it
    // is not an initial rotation to apply to the prefab itself.
    root.scale.set(effect.scale[0]*(effect.rootScaleFactor||1),Math.abs(effect.scale[1]),Math.abs(effect.scale[2])*(effect.rootScaleFactor||1)*(effect.rootScaleZ||1));root.updateMatrixWorld(true);
    this.nodes=nodes;this.nodeRoot=root;
    this.scriptByNode=new Map();
    for(const script of effect.scripts||[]){if(!this.scriptByNode.has(script.node))this.scriptByNode.set(script.node,[]);this.scriptByNode.get(script.node).push(script);}
    for(const node of nodes.values())node.userData.base={position:node.position.clone(),rotation:node.quaternion.clone(),scale:node.scale.clone()};
    let end=effect.duration;
    const systemIds=new Map(effect.systems.map((s,i)=>[String(s.sourceId),i]));
    const subEmitterIds=new Set(effect.systems.flatMap(s=>(s.modules.SubModule?.subEmitters||[]).map(row=>String(row.emitter))));
    const allocation=nativeSystemSeeds(effect,seed);
    this.randomStateBefore=allocation.before;this.randomStateAfter=allocation.after;
    this.systemSeeds=allocation.seeds;this.seedResetEvents=allocation.events;
    const seeds=effect.systems.map(s=>allocation.seeds[s.sourceId]);
    const rngs=seeds.map(rand),initialStreams=seeds.map(s=>new UnityRand4(s)),shapeStreams=seeds.map(s=>new UnityRand4(s));
    const subQueue=[],liveBySystem=seeds.map(()=>[]);this.emissionTrace=[];this.replayIssues=allocation.issues;
    const emitSystem=(si,baseAt=0,origin=null,depth=0,parent=null,emissionOverride=null)=>{
      if(depth>8){this.replayIssues.push({code:"subemitter-depth",system:effect.systems[si]?.sourceId});return;}
      const s=effect.systems[si],node=nodes.get(s.node);if(!node)return;
      let active=true;
      for(let n=node;n;n=n.parent)if(!n.visible)active=false;
      if(!active&&!effect.includeInactive)return;
      const rng=rngs[si],m=s.modules,initial=m.InitialModule;
      const emission=emissionOverride??nativeEmissionBatches(s,seeds[si],value,{step:effect.simulationStep||1/60,frameSteps:effect.frameSteps,
        emitterPosition:effect.emitterPosition,baseAt,limit:effect.particleBudget??1500,delayOverride:effect.systemDelays?.[s.sourceId],simulationDuration:effect.simulationDuration});
      const {delay,batches}=emission,births=[];
      const worldPos=new THREE.Vector3().setFromMatrixPosition(node.matrixWorld),worldRot=rotationOf(node),worldScale=new THREE.Vector3().setFromMatrixScale(node.matrixWorld);
      if(node.matrixWorld.determinant()<0)worldScale.x=-worldScale.x;
      const originOffset=origin?origin.clone().sub(worldPos):new THREE.Vector3();
      // Each emission batch advances independent Initial and Shape SIMD streams.
      // NativeEmission coordinate recordings are deliberately not a runtime input.
      const native=[],liveUntil=liveBySystem[si],trace={system:s.sourceId,baseAt,depth,seed:seeds[si],delay,batches:[],initialStateBefore:initialStreams[si].lanes.map(r=>r.getState()),shapeStateBefore:shapeStreams[si].lanes.map(r=>r.getState()),emissionStateAfter:emission.state};
      this.emissionTrace.push(trace);if(emission.truncated)this.replayIssues.push({code:"particle-budget",system:s.sourceId});
      for(const emissionBatch of batches){
        for(let i=liveUntil.length-1;i>=0;i--)if(liveUntil[i]<=emissionBatch.current+delay)liveUntil.splice(i,1);
        const count=Math.min(emissionBatch.count,Math.max(0,(initial.maxNumParticles||1000)-liveUntil.length));
        trace.batches.push({frame:emissionBatch.frame,time:emissionBatch.current+delay,requested:emissionBatch.count,accepted:count,continuous:emissionBatch.continuous});
        if(!count)continue;
        const samples=nativeShapeSamples(m.ShapeModule,shapeStreams[si],count,{phase:emissionBatch.phase,previousPhase:emissionBatch.previousPhase,
          interpolationStep:emissionBatch.interval,interpolationStart:emissionBatch.remainder,meshes:this.index.meshes});
        births.push(...emissionBatch.births.slice(0,count));
        for(let base=0;base<count;base+=4){
          const batch=nativeInitialBatch(initialStreams[si],initial);
          for(let lane=0;lane<4&&base+lane<count;lane++){
            const initialTime=emissionBatch.normalizedTime;
            const life=Math.max(.00001,value(initial.startLifetime,initialTime,batch[lane].r[0]))*(parent?.properties&8?parent.p.life:1);
            liveUntil.push(emissionBatch.births[base+lane]+life);
            native.push({...batch[lane],life,initialTime,localBirth:emissionBatch.births[base+lane],origin:emissionBatch.positions?.[base+lane],shape:samples?.[base+lane],frame:emissionBatch.current+delay,frameIndex:emissionBatch.frame});
          }
        }
      }
      trace.initialStateAfter=initialStreams[si].lanes.map(r=>r.getState());trace.shapeStateAfter=shapeStreams[si].lanes.map(r=>r.getState());
      if(m.ForceModule?.randomizePerFrame||m.SubModule)nativeForceTimeline(seeds[si],native,{step:effect.simulationStep||1/60,frameSteps:effect.frameSteps,recordForce:!!m.ForceModule?.randomizePerFrame});
      let birthIndex=0;
      for(const localBirth of births){
        const birth=(baseAt+localBirth/s.speed)*s.speed;
        const nativeParticle=native[birthIndex++],r=[...nativeParticle.r,...nativeParticleRandom(nativeParticle.randomSeed,0,3)];
        const life=nativeParticle.life,initialTime=nativeParticle.initialTime;
        const sample=nativeParticle.shape;
        const sh=sample?transformShapeSample(m.ShapeModule,new THREE.Vector3(...sample.position),new THREE.Vector3(...sample.direction),rng,true):shapeSample(m.ShapeModule,rng);
        const velocity=sh.direction.multiplyScalar(value(initial.startSpeed,initialTime,r[1]));
        const moduleRandom=nativeModuleRandoms(nativeParticle.randomSeed),inherit=m.InheritVelocityModule;
        let inherited=new THREE.Vector3();
        if(inherit&&s.simulationSpace===1&&effect.emitterVelocity){
          inherited.fromArray(effect.emitterVelocity(birth/s.speed)).applyQuaternion(worldRot.clone().invert());
          inherited.set(inherited.x/(worldScale.x||1),inherited.y/(worldScale.y||1),inherited.z/(worldScale.z||1));
          if(inherit.m_Mode===0&&(inherit.m_Curve.minMaxState===0||inherit.m_Curve.minMaxState===3))velocity.addScaledVector(inherited,value(inherit.m_Curve,0,moduleRandom.inherit));
        }
        const hidden=s.emitterOnly||s.renderer.mode===5;
        const mesh=hidden?null:this.createMesh(s,s.renderer.mesh?this.geometries[s.renderer.mesh]:this.quad,{pivot:s.renderer.pivot});
        if(mesh){mesh.frustumCulled=false;mesh.visible=false;mesh.matrixAutoUpdate=false;
          mesh.renderOrder=(s.material.name.toLowerCase().includes('top')?100:0)+s.renderer.sort;this.group.add(mesh);}
        const flip=s.renderer.flip||{};
        const p={mesh,s,si,r,moduleRandom,inherited,birth,life,sh:sh.position,velocity,worldPos,worldRot,worldScale,node,matrix:node.matrixWorld.clone(),originOffset,
          systemStart:parent?parent.p.birth+(emissionOverride?.subDelay||0):baseAt*s.speed+delay,orderFrames:nativeParticle.orderFrames,emissionFrameStates:emission.frameStates,emissionState:emission.state,forceFrames:nativeParticle.forceFrames,systemSeed:seeds[si],noiseSeedOffset:m.NoiseModule?noiseSeedOffset(seeds[si]):null,randomSeed:nativeParticle.randomSeed,randomSource:sample?'native-initial-and-shape':'native-initial-approximate-shape',
          birthFrame:baseAt*s.speed+nativeParticle.frame,birthFrameIndex:nativeParticle.frameIndex,rotationSign:nativeParticle.rotationSign,
          flip:(s.renderer.mode===4?nativeMeshParticleFlip:nativeParticleFlip)(nativeParticle.randomSeed,flip),
          startColor:color(initial.startColor,initialTime,r[2]).map((c,i)=>c*(sample?.color?.[i]??1)),
          startSize:new THREE.Vector3(value(initial.startSize,initialTime,r[3],1),value(initial.size3D?initial.startSizeY:initial.startSize,initialTime,r[4],1),value(initial.size3D?initial.startSizeZ:initial.startSize,initialTime,r[5],1)).max(new THREE.Vector3()),
          startRotation:new THREE.Vector3(initial.rotation3D?value(initial.startRotationX,initialTime,r[6]):0,initial.rotation3D?value(initial.startRotationY,initialTime,r[7]):0,value(initial.startRotation,initialTime,r[8])).multiplyScalar(nativeParticle.rotationSign)};
        if(nativeParticle.origin){
          p.originOffset=new THREE.Vector3(...nativeParticle.origin).sub(worldPos);
          if(effect.emitterPosition)p.originOffset.sub(new THREE.Vector3(...effect.emitterPosition(birth/s.speed)));
        }
        if(parent){
          const age=Math.max(0,birth-parent.p.birth),parentMotion=particleMotion(parent.p,age,effect);
          if(parent.properties&2)p.startSize.multiply(particleSizeAt(parent.p,age,parentMotion));
          if(parent.properties&1){const over=parent.p.s.modules.ColorModule?color(parent.p.s.modules.ColorModule.gradient,age/parent.p.life,parent.p.moduleRandom.color):[1,1,1,1];p.startColor=p.startColor.map((c,i)=>c*parent.p.startColor[i]*over[i]);}
          if(parent.properties&4)p.startRotation.add(parentMotion.rotation||parent.p.startRotation);
        }
        if(mesh)this.particles.push(p);
        if(m.TrailModule?.mode===0&&s.trailMaterial)this.createTrail(p);
        end=Math.max(end,(birth+life)/s.speed);
        for(const [subIndex,row] of (m.SubModule?.subEmitters||[]).entries()){
          const child=systemIds.get(String(row.emitter));if(child==null)continue;
          if(row.type===0){
            const parentPosition=simTime=>{
              const position=particleMotion(p,Math.max(0,simTime-p.birth),effect).position.clone().applyMatrix4(p.matrix).add(p.originOffset);
              if(effect.emitterPosition)position.add(new THREE.Vector3(...effect.emitterPosition((p.s.local?simTime:p.birth)/p.s.speed)));
              return position.toArray();
            };
            const batches=nativeSubEmissionBatches(p,effect.systems[child],row,value,parentPosition,{step:effect.simulationStep||1/60,frameSteps:effect.frameSteps});
            for(const batch of batches)subQueue.push({child,p,row,subIndex,depth:depth+1,batch});
          }else if(row.type===1&&nativeParticleRandom(p.randomSeed,1520730008)[0]<=(row.emitProbability??1)){
            emitSystem(child,(birth+life)/s.speed,particleMotion(p,life,effect).position.clone().applyMatrix4(p.matrix).add(p.originOffset),depth+1,{p,properties:row.properties});
          }
        }
      }
    };
    for(let si=0;si<effect.systems.length;si++)if(!subEmitterIds.has(String(effect.systems[si].sourceId)))emitSystem(si);
    // Merge child emissions in simulation order, not parent-by-parent lifetimes.
    while(subQueue.length){
      subQueue.sort((a,b)=>a.batch.current-b.batch.current||a.batch.order.stage-b.batch.order.stage||a.p.si-b.p.si||a.subIndex-b.subIndex||a.batch.order.index-b.batch.order.index);
      const event=subQueue.shift(),{child,p,row,depth,batch}=event;
      emitSystem(child,0,null,depth,{p,properties:row.properties},{delay:0,batches:[batch],state:null,subDelay:batch.subDelay});
    }
    for(const s of effect.statics||[]){
      const node=nodes.get(s.node);if(!node)continue;
      if((this.scriptByNode.get(s.node)||[]).some(script=>script.type==='CustomSprite')&&!s.sprite)continue;
      let active=true;for(let n=node;n;n=n.parent)if(!n.visible)active=false;
      if(!active)continue;
      const mat=s.material,sp=s.sprite&&this.index.sprites[s.sprite];
      const mesh=this.createMesh(s,s.mesh?this.geometries[s.mesh]:this.quad,{sprite:sp,size:s.size||[1,1],atlas:s.sprite?.startsWith('atlas-')});
      mesh.matrixAutoUpdate=false;mesh.matrix.copy(node.matrixWorld);mesh.frustumCulled=false;mesh.renderOrder=s.sort||0;
      this.statics.push({mesh,s,node});this.group.add(mesh);
    }
    this.duration=Math.min(30,effect.duration||end);this.fitViewSize=16;this.viewSize=16;
    this.resize();this.sample(.06);return end;
  }
  sample(time) {
    this.currentTime=time;
    const sceneTime=time;time=this.characterPlayer?.beforeSample(time)??time;
    let alive=0;
    this.animationCache=new Map();
    this.animateNodes(time);
    const cameraQ=(this.screenEffect&&!this.mapSimulation?this.screenCamera:this.camera).quaternion.clone(); // compensate the reflected Unity coordinate group
    cameraQ.set(-cameraQ.x,-cameraQ.y,cameraQ.z,cameraQ.w);
    for(const p of this.particles){
      const {s,r,mesh,life,moduleRandom:mr}=p,m=s.modules;let age=time*s.speed-p.birth;if(this.mapSimulation&&s.loop&&p.period)age=((age%p.period)+p.period)%p.period;const u=age/life;
      mesh.visible=age>=0&&age<life&&!this.excluded.has(p.si)&&(!this.mapSimulation||time*s.speed>=p.delay);if(!mesh.visible)continue;alive++;
      if(s.local)p.matrix.copy(p.node.matrixWorld);
      const motion=particleMotion(p,age,this.effect),local=motion.position,currentVelocity=motion.velocity||p.velocity;
      mesh.position.copy(local.clone().applyMatrix4(p.matrix)).add(p.originOffset);
      const size=particleSizeAt(p,age,motion);
      if(s.renderer.mode===1)size.y*=Math.max(1,s.renderer.length+currentVelocity.length()*s.renderer.velocityScale);
      mesh.scale.copy(size).multiply(p.worldScale);
      const angles=motion.rotation||p.startRotation;
      // Unity billboard rotation is clockwise; mesh rotation uses its 3D axes.
      const spinZ=s.renderer.mode===4?angles.z:-angles.z;
      const spin=new THREE.Quaternion().setFromEuler(new THREE.Euler(angles.x,angles.y,spinZ,'ZXY'));
      if(s.renderer.mode===4){
        // Native mesh flip reflects geometry (including its pivot), not UVs.
        size.multiply(new THREE.Vector3(...p.flip.map(f=>f?-1:1)));
        // Render alignment and simulation space are independent. World-space
        // positions stay at their emitter pose; Local alignment follows its rotation.
        const basis=p.node.matrixWorld,position=mesh.position.clone(),q=rotationOf(p.node),scale=new THREE.Vector3().setFromMatrixScale(basis);
        if(basis.determinant()<0)scale.x=-scale.x;
        if(s.scalingMode===1)scale.copy(p.node.scale);else if(s.scalingMode===2)scale.set(1,1,1);
        if(s.renderer.alignment===2&&s.scalingMode===0){
          const linear=basis.clone().setPosition(0,0,0);mesh.matrix.compose(new THREE.Vector3(),spin,size).premultiply(linear).setPosition(position);
        }else{
          if(s.renderer.alignment===2)mesh.quaternion.copy(q).multiply(spin);
          else if(s.renderer.alignment===1)mesh.quaternion.copy(spin);
          else if(s.renderer.alignment===4&&p.velocity.lengthSq()>0){
            const direction=p.velocity.clone().applyQuaternion(p.worldRot).normalize();
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction).multiply(spin);
          }else mesh.quaternion.copy(cameraQ).multiply(spin);
          mesh.matrix.compose(position,mesh.quaternion,size.clone().multiply(scale));
        }
      }
      else if(s.renderer.alignment===2){
        // Unity ScalingMode: Hierarchy=0, Local=1, Shape=2. The emitter's
        // transform moves every particle, but Shape mode must not flatten its
        // rendered quad when an ancestor has a zero or nonuniform scale.
        const particle=new THREE.Matrix4().compose(new THREE.Vector3(),spin,size);
        if(s.scalingMode===0){
          // Hierarchy keeps parent reflection before particle rotation.
          particle.premultiply(p.matrix.clone().setPosition(mesh.position));
        }else{
          const scale=s.scalingMode===1?p.node.scale:new THREE.Vector3(1,1,1);
          particle.premultiply(new THREE.Matrix4().compose(mesh.position,rotationOf(p.node),scale));
        }
        mesh.matrix.copy(particle);
      }
      else if(s.renderer.mode===2)mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI/2,0,spinZ));
      else if(s.renderer.mode===3)mesh.quaternion.setFromEuler(new THREE.Euler(0,0,spinZ));
      else if(s.renderer.alignment===1)mesh.quaternion.copy(spin);
      else mesh.quaternion.copy(cameraQ).multiply(spin);
      if(s.renderer.mode!==4&&s.renderer.alignment!==2)mesh.updateMatrix();
      const over=m.ColorModule?color(m.ColorModule.gradient,u,mr.color):[1,1,1,1];
      if(s.renderer.mode===4)uniformsOf(mesh).flipUv.value.set(0,0);
      else uniformsOf(mesh).flipUv.value.set(...p.flip);
      uniformsOf(mesh).particleColor.value.set(...p.startColor.map((c,i)=>c*over[i]));
      if(m.CustomDataModule)for(const mat of materialsOf(mesh))for(let stream=0;stream<2;stream++){
        const custom=m.CustomDataModule,values=custom['mode'+stream]===2?color(custom['color'+stream],u,.5):Array.from({length:4},(_,i)=>value(custom['vector'+stream+'_'+i],u,.5));
        mat.uniforms['nativeCustom'+(stream+1)].value.set(...values);
      }
      for(const mat of materialsOf(mesh))if(mat.uniforms._Time){const clock=time+(this.effect.shaderTimeOrigin||0);mat.uniforms._Time.value.set(clock/20,clock,clock*2,clock*3);}
      const uv=m.UVModule;
      if(uv){
        const phase=value(uv.frameOverTime,u,mr.uvFrame)*(uv.cycles||1)+value(uv.startFrame,0,mr.uvStart);
        const frame=((phase%1)+1)%1;
        if(uv.mode===1&&uv.sprites?.length){
          const sprite=this.index.sprites[uv.sprites[Math.min(uv.sprites.length-1,Math.floor(clamp(frame,0,.999999)*uv.sprites.length))]];
          if(sprite){
            uniformsOf(mesh).spriteRotated.value=!!sprite.rotated;uniformsOf(mesh).uvRect.value.set(...sprite.uv);
            for(const mat of materialsOf(mesh)){mat.uniforms.spriteAtlasFlip.value.set(...(sprite.atlasFlip||[0,0]));mat.uniforms.clampSpriteUv.value=!!sprite.clampUv;mat.uniforms.spriteUvBounds.value.copy(spriteSampleBounds(sprite,this.index.textures));mat.uniforms.map.value=this.textures[sprite.texture];mat.uniforms.uvScale.value.set(1,1);mat.uniforms.uvOffset.value.set(0,0);}
            if(s.renderer.mode!==4){
              const tex=this.index.textures[sprite.texture];
              const [w,h]=sprite.size||[sprite.uv[2]*tex.width,sprite.uv[3]*tex.height],aspect=h/w;
              uniformsOf(mesh).spriteSize.value.set(1,aspect);
              // Sprite width defines Start Size. Renderer pivot is in Start Size units,
              // independent of the sprite aspect (chain: height 4, pivot Y 2).
              uniformsOf(mesh).particlePivot.value.copy(vec(s.renderer.pivot)).add(new THREE.Vector3(.5-sprite.pivot.x,(.5-sprite.pivot.y)*aspect,0));
            }
          }
        }else{
          const nx=uv.tilesX||1,ny=uv.tilesY||1,single=uv.animationType===1,n=single?nx:nx*ny,idx=Math.floor(clamp(frame,0,.999999)*n),row=single?(uv.randomRow?Math.min(ny-1,Math.floor(mr.uvRow*ny)):(uv.rowIndex||0)):Math.floor(idx/nx);
          uniformsOf(mesh).uvRect.value.set(idx%nx/nx,(ny-1-row)/ny,1/nx,1/ny);
        }
      }
    }
    for(const p of this.statics){p.mesh.matrix.copy(p.node.matrixWorld);for(const [i,mat] of materialsOf(p.mesh).entries())mat.uniforms.tint.value.set(...rgba((p.s.materials?.[i]||p.s.material).tint));this.animateMaterial(p,time);}
    for(const p of this.particles)if(p.mesh.visible)this.animateMaterial(p,time);
    for(const p of this.trails)this.sampleTrail(p,time,cameraQ);
    this.modulePlayer?.sample(sceneTime);
    this.characterPlayer?.afterSample(sceneTime);
    this.alive=alive;this.renderer.render(this.scene,this.camera);
    if(!this.mapSimulation&&(this.screenEffect||this.modulePlayer?.entries.some(e=>e.track.link.screen&&e.sim.group.visible))){
      const autoClear=this.renderer.autoClear;this.renderer.autoClear=false;this.renderer.clearDepth();
      this.renderer.render(this.screenScene,this.screenCamera);this.renderer.autoClear=autoClear;
    }
    this.frameCount++;
  }
  getReplayTrace(){
    if(this.modulePlayer?.active)return {
      format:'gtfx-replay-trace',version:1,origin:'preview',time:this.currentTime,character:this.index.character,module:this.modulePlayer.module.id,
      actionRandom:this.modulePlayer.module.random,options:this.modulePlayer.options,
      particleAutoStateBefore:this.modulePlayer.randomStateBefore,particleAutoStateAfter:this.modulePlayer.randomStateAfter,
      entries:this.modulePlayer.entries.map(({sim,track,instance})=>({instance,at:track.at,link:track.link,trace:sim.getReplayTrace()}))
    };
    this.group.updateWorldMatrix(true,false);
    return {format:'gtfx-replay-trace',version:1,origin:'preview',time:this.currentTime,visible:this.group.visible,character:this.index.character,preset:this.effect.preset,
      coordinates:{particleMatrixSpace:'effect-group-local',groupWorldMatrix:this.group.matrixWorld.toArray(),previewWorldZ:'mirrored from source'},
      source:this.index.nativeSource||null,seed:this.seed,
      inputs:{autoStateProvided:!!this.effect.particleAutoSeedState,systemSeedsProvided:!!this.effect.systemSeeds,emitterTrajectoryProvided:!!this.effect.emitterPosition},simulationStep:this.effect.simulationStep||1/60,
      frameSteps:this.effect.frameSteps||null,simulationDuration:this.effect.simulationDuration??null,
      particleAutoStateBefore:this.randomStateBefore,particleAutoStateAfter:this.randomStateAfter,systemSeeds:this.systemSeeds,seedResetEvents:this.seedResetEvents,
      fidelity:auditEffect(this.effect),runtimeIssues:this.replayIssues||[],emissions:this.emissionTrace,
      particles:this.particles.map(p=>({system:p.s.sourceId,seed:p.randomSeed,birth:p.birth,life:p.life,frame:p.birthFrameIndex,
        shape:p.sh.toArray(),velocity:p.velocity.toArray(),flip:p.flip,startColor:p.startColor,startSize:p.startSize.toArray(),startRotation:p.startRotation.toArray(),
        sample:{visible:p.mesh.visible,matrix:p.mesh.matrix.toArray()},source:p.randomSource}))};
  }
  animationCurves(script,time) {
    if(this.animationCache?.has(script))return this.animationCache.get(script);
    const sampled=sampleAnimator(script.fields,time).map(c=>({Key:c.key,v:c.value,vector:new THREE.Vector3(...c.vector)}));
    this.animationCache?.set(script,sampled);return sampled;
  }
  animateNodes(time) {
    if(!this.nodes)return;
    for(const node of this.nodes.values()){const b=node.userData.base;node.position.copy(b.position);node.quaternion.copy(b.rotation);node.scale.copy(b.scale);}
    for(const script of this.effect.scripts||[]){
      const node=this.nodes.get(script.node);if(!node)continue;
      if(script.type==='CustomAnimator')for(const c of this.animationCurves(script,time)){
        if(c.Key<=2)node.position[['x','y','z'][c.Key]]=c.v;
        else if(c.Key>=3&&c.Key<=5)node.scale[['x','y','z'][c.Key-3]]=c.v;
        else if(c.Key===10){const v=c.vector.multiplyScalar(Math.PI/180);node.quaternion.setFromEuler(new THREE.Euler(v.x,v.y,v.z,'ZXY'));}
        else if(c.Key===15)node.position.copy(c.vector);
        else if(c.Key===16)node.scale.copy(c.vector);
      }
      if(script.type==='RotateThis'){
        const f=script.fields,rotation=vec(f.rotationSpeed||f.RotateSpeed||f.rotation).multiplyScalar(time*Math.PI/180);
        node.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x,rotation.y,rotation.z,'ZXY')));
      }
    }
    // Native ScreenEffectObject.OnEnable: transformType 1 calls SetEffectSize
    // on the script's own transform. It does not use viewPortPosition.
    for(const script of this.effect.scripts||[]){
      if(script.type!=='ScreenEffectObject')continue;
      const node=this.nodes.get(script.node),camera=this.mapSimulation?this.camera:this.screenCamera;
      if(!node||!camera)continue;
      const f=script.fields,base=node.userData.base.scale;
      if(f.transformType===0){
        const p=f.viewPortPosition||{x:.5,y:.5};
        node.position.set(camera.left+(camera.right-camera.left)*p.x,camera.bottom+(camera.top-camera.bottom)*p.y,0);
        continue;
      }
      if(f.transformType!==1)continue;
      const size=camera.top/(f.baseSize||4.6),aspect=(camera.right/camera.top)/(f.baseAspect||2.08);
      if(f.scaleType===1)node.scale.set(aspect*size,base.y*size,base.z*size);
      else node.scale.set(aspect*size,base.y,base.z);
    }
    this.effect.sampleNodes?.(this,time);
    this.nodeRoot.updateMatrixWorld(true);
  }
  createTrail(p){
    const mod=p.s.modules.TrailModule;
    // TrailModule::Update derives independent ratio/lifetime random streams.
    if(nativeParticleRandom(p.randomSeed,(-1967131808)>>>0)[0]>(mod.ratio??1))return;
    p.trailRandom=nativeParticleRandom(p.randomSeed,884714267)[0];
    p.trail=new THREE.Mesh(new THREE.BufferGeometry(),this.createMaterial(p.s.trailMaterial));
    p.trail.frustumCulled=false;p.trail.visible=false;p.trail.renderOrder=p.mesh?.renderOrder||0;
    p.trail.matrixAutoUpdate=false;this.trails.push(p);this.group.add(p.trail);
  }
  sampleTrail(p,time,cameraQ){
    const mod=p.s.modules.TrailModule;let age=time*p.s.speed-p.birth;
    if(this.mapSimulation&&p.s.loop&&p.period)age=((age%p.period)+p.period)%p.period;
    const lifetime=p.life*value(mod.lifetime,clamp(age/p.life),p.trailRandom,1)*(mod.sizeAffectsLifetime?Math.max(...p.startSize.toArray()):1);
    p.trail.visible=age>0&&age<p.life+lifetime&&!(mod.dieWithParticles&&age>=p.life)&&!this.excluded.has(p.si);
    if(!p.trail.visible)return;
    const dt=this.effect.simulationStep||1/60,end=Math.min(age,p.life),cut=Math.max(0,age-lifetime),points=[];
    // Reconstruct the same clock on a seek; do not append samples per UI frame.
    const at=t=>particleMotion(p,t,this.effect).position.clone();
    let last=null;
    for(let t=0;t<end;t+=dt){
      const pos=at(t);
      if(last&&pos.distanceToSquared(last.position)<(mod.minVertexDistance||0)**2)continue;
      last={t,position:pos};if(t>=cut)points.push(last);
    }
    if(end>=cut)points.push({t:end,position:at(end)});
    if(points.length<2){p.trail.visible=false;return;}
    const matrix=p.s.local?p.node.matrixWorld:p.matrix;
    for(const point of points)point.position.applyMatrix4(matrix).add(p.originOffset);
    const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+points[i].position.distanceTo(points[i-1].position));
    const total=lengths.at(-1)||1,normal=new THREE.Vector3(0,0,1).applyQuaternion(cameraQ),positions=[],uvs=[],colors=[],indices=[];
    for(let i=0;i<points.length;i++){
      const point=points[i],u=1-lengths[i]/total;
      const tangent=points[Math.min(i+1,points.length-1)].position.clone().sub(points[Math.max(0,i-1)].position);
      const side=tangent.cross(normal).normalize();
      const width=value(mod.widthOverTrail,u,p.trailRandom,1)*(mod.sizeAffectsWidth?Math.max(...p.startSize.toArray()):1);
      side.multiplyScalar(width*.5);
      const a=color(mod.colorOverLifetime,clamp((age-point.t)/Math.max(lifetime,1e-9)),p.trailRandom),b=color(mod.colorOverTrail,u,p.trailRandom);
      const tint=a.map((v,k)=>v*b[k]*(mod.inheritParticleColor?p.startColor[k]:1));
      for(const sign of [-1,1]){positions.push(...point.position.clone().addScaledVector(side,sign).toArray());uvs.push(u*(mod.textureScale?.x??1),(sign+1)*.5*(mod.textureScale?.y??1));colors.push(...tint);}
      if(i)indices.push(2*i-2,2*i-1,2*i,2*i-1,2*i+1,2*i);
    }
    const data=p.trail.geometry;
    // Reuse GPU buffers once capacity has been allocated.
    const count=positions.length/3;
    if(!data.attributes.position||data.attributes.position.count<count){
      const capacity=Math.max(128,2**Math.ceil(Math.log2(count)));
      data.dispose();data.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3));
      data.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(capacity*3),3));
      data.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(capacity*2),2));
      data.setAttribute('rgba',new THREE.BufferAttribute(new Float32Array(capacity*4),4));
      data.setIndex(new THREE.BufferAttribute(new Uint32Array(capacity*3),1));
    }
    for(const [key,values] of [['position',positions],['uv',uvs],['rgba',colors]]){data.attributes[key].array.set(values);data.attributes[key].needsUpdate=true;}
    data.index.array.set(indices);data.index.needsUpdate=true;data.setDrawRange(0,indices.length);data.boundingBox=null;
  }
  animateMaterial(p,time) {
    for(const mat of materialsOf(p.mesh)){
    const uniforms=mat.uniforms;
    for(const script of this.scriptByNode.get(p.s.node)||[]){
      if(script.type==='CustomAnimator')for(const c of this.animationCurves(script,time)){
        if(c.Key>=6&&c.Key<=9)uniforms.tint.value[['x','y','z','w'][c.Key-6]]=c.v;
        else if(c.Key===11)uniforms.uvOffset.value.x=c.v;
        else if(c.Key===12)uniforms.uvOffset.value.y=c.v;
        else if(c.Key===13)uniforms.uvScale.value.x=c.v;
        else if(c.Key===14)uniforms.uvScale.value.y=c.v;
        else if(c.Key===17){uniforms.tint.value.x=c.vector.x;uniforms.tint.value.y=c.vector.y;uniforms.tint.value.z=c.vector.z;}
        else if(c.Key===18)uniforms.uvOffset.value.set(c.vector.x,c.vector.y);
        else if(c.Key===19)uniforms.uvScale.value.set(c.vector.x,c.vector.y);
      }
      const clock=time+(this.effect.shaderTimeOrigin||0),scroll=key=>clock*(script.fields[key]||0)*(script.fields.TimeScale??1),frac=x=>x-Math.floor(x);
      if(['FxUvanim','FxUvanim_frac_Main','FxUvanim_add'].includes(script.type))uniforms.uvOffset.value.set(frac(scroll('scrollSpeed_X')),frac(scroll('scrollSpeed_Y')));
      if(script.type==='FxUvanim_tex2')uniforms.uvOffset2.value.set(scroll('scrollSpeed_X'),scroll('scrollSpeed_Y'));
    }
    }
  }
  setView(top) {
    this.topView=top;
    const pitch=(top?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,distance=this.cameraConfig.distance;
    // Unity eye is (0, d*sin(pitch), -d*cos(pitch)); the scene's Z reflection maps it to +Z here.
    const center=this.viewCenter||new THREE.Vector3();this.camera.position.set(0,distance*Math.sin(pitch),distance*Math.cos(pitch)).add(center);this.camera.lookAt(center);
    if(this.viewSize)this.resize();
  }
  resetUnitySize() {this.viewSize=this.cameraConfig.orthographicSize*2;this.zoom=1;this.resize();}
  fitView() {this.viewSize=this.fitViewSize||16;this.zoom=1;this.resize();}
  setBackground(mode,color='#64615d') {
    this.backgroundMode=mode;
    if(mode==='transparent'){this.scene.background=null;this.renderer.setClearColor(0,0);return;}
    if(mode==='color'){this.scene.background=new THREE.Color(color);return;}
    if(!this.checker){
      const size=16,data=new Uint8Array(size*size*4);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++)data.set((x+y)%2?[28,34,43,255]:[19,24,32,255],(y*size+x)*4);
      this.checker=new THREE.DataTexture(data,size,size);this.checker.colorSpace=THREE.SRGBColorSpace;
      this.checker.minFilter=this.checker.magFilter=THREE.NearestFilter;this.checker.generateMipmaps=false;
      this.checker.wrapS=this.checker.wrapT=THREE.RepeatWrapping;this.checker.needsUpdate=true;
    }
    this.checker.repeat.set(this.renderer.domElement.clientWidth/192,this.renderer.domElement.clientHeight/192);
    this.scene.background=this.checker;
  }

  autoFit() {
    if(this.screenEffect&&!this.modulePlayer?.active)return;
    const bounds=new THREE.Box2().makeEmpty(),oldTime=this.currentTime||0;
    const delay=this.characterPlayer?.active?this.characterPlayer.link.delay:0;
    const times=this.modulePlayer?.active?Array.from({length:17},(_,i)=>i*this.duration/16):[0,.025,.08,.18,.35,.6,1].map(v=>Math.min(delay+v,this.duration*.95));
    for(const t of times){this.sample(t);bounds.union(this.projectedBounds());}
    if(bounds.isEmpty())return;
    const size=bounds.getSize(new THREE.Vector2()),center=bounds.getCenter(new THREE.Vector2()),aspect=this.renderer.domElement.clientWidth/Math.max(1,this.renderer.domElement.clientHeight);
    this.fitViewSize=Math.max(2,Math.min(160,Math.max(size.x/aspect,size.y)*1.3));
    this.fitSquareSize=Math.max(2,Math.max(size.x,size.y)*1.3);this.viewSize=this.fitViewSize;this.zoom=1;
    const pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,compensation=this.camera.nativeViewportScale();
    this.viewCenter=new THREE.Vector3(center.x,center.y*compensation*Math.cos(pitch),-center.y*compensation*Math.sin(pitch));
    this.setView(this.topView);this.resize();this.sample(oldTime);
  }
  frameCharacter(){
    if(!this.characterPlayer?.active)return;
    const oldTime=this.currentTime||0;this.sample(0);
    const bounds=this.characterPlayer.bounds(),height=bounds.max.y-bounds.min.y;
    if(Number.isFinite(height)&&height>0){
      // Keep the pixel character at a stable fraction of the viewport across
      // attacks; distant particles no longer dictate the initial zoom.
      this.viewSize=Math.max(2,Math.min(40,height/.17));
      const center=bounds.getCenter(new THREE.Vector2()),module=this.modulePlayer?.module;
      if(module?.tracks.some(t=>['target','projectile','meteor','hook'].includes(t.link.anchor))){
        const pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,comp=this.camera.nativeViewportScale(),target=this.characterPlayer.target.position;
        center.x=(center.x+target.x)/2;
        const targetY=target.y*Math.cos(pitch)-target.z*Math.sin(pitch)/comp;
        center.y+=THREE.MathUtils.clamp((targetY-center.y)/2,-this.viewSize*.3,this.viewSize*.3);
      }
      const pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,comp=this.camera.nativeViewportScale();
      this.viewCenter=new THREE.Vector3(center.x,center.y*comp*Math.cos(pitch),-center.y*comp*Math.sin(pitch));
      this.zoom=1;this.setView(this.topView);this.resize();
    }
    this.sample(oldTime);
  }
  nativePixelsPerUnit() {
    const counts=new Map();
    const sources=this.modulePlayer?.active?this.modulePlayer.entries.map(e=>e.track.effect):[this.effect];
    const refs=sources.flatMap(effect=>effect.systems.flatMap(s=>s.modules.UVModule?.sprites||[]).concat((effect.statics||[]).map(s=>s.sprite)));
    for(const ref of refs){const ppu=this.index.sprites[ref]?.pixelsToUnits;if(ppu>0&&Number.isFinite(ppu))counts.set(ppu,(counts.get(ppu)||0)+1);}
    return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||100;
  }
  createMaterial(mat,{sprite=null,size=[1,1],pivot={},atlas=false,shared=null}={}) {
    const opaque=mat.blend==='opaque',gradation=mat.gradation,distortion=mat.surface==='screenDistortion';
    const uniforms={map:{value:this.textures[sprite?.texture||mat.texture]||this.textures.white},
      dualTexture:{value:!!mat.texture2},map2:{value:this.textures[mat.texture2?.texture]||this.textures.white},
      uvScale2:{value:new THREE.Vector2(mat.texture2?.scale.x??1,mat.texture2?.scale.y??1)},
      uvOffset2:{value:new THREE.Vector2(mat.texture2?.offset.x??0,mat.texture2?.offset.y??0)},
      masked:{value:!!mat.mask},maskMap:{value:this.textures[mat.mask?.texture]||this.textures.white},
      maskScale:{value:new THREE.Vector2(mat.mask?.scale.x??1,mat.mask?.scale.y??1)},
      maskOffset:{value:new THREE.Vector2(mat.mask?.offset.x??0,mat.mask?.offset.y??0)},
      uvRect:{value:new THREE.Vector4(...(sprite?.uv||[0,0,1,1]))},particleColor:{value:new THREE.Vector4(1,1,1,1)},
      flipUv:{value:new THREE.Vector2(0,0)},
      spriteAtlasFlip:{value:new THREE.Vector2(...(sprite?.atlasFlip||[0,0]))},clampSpriteUv:{value:!!sprite?.clampUv},spriteUvBounds:{value:spriteSampleBounds(sprite,this.index.textures)},
      particleDissolve:{value:mat.surface==='particleDissolve'},nativeCustom1:{value:new THREE.Vector4()},nativeCustom2:{value:new THREE.Vector4()},
      tint:{value:new THREE.Vector4(...rgba(mat.tint))},uvScale:{value:new THREE.Vector2(sprite?1:mat.scale.x,sprite?1:mat.scale.y)},
      uvOffset:{value:new THREE.Vector2(sprite?0:mat.offset.x,sprite?0:mat.offset.y)},spriteSize:{value:new THREE.Vector2(...size)},
      particlePivot:{value:vec(pivot)},spriteRotated:{value:!!sprite?.rotated},additive:{value:mat.blend==='add'},
      colorGain:{value:mat.colorGain??(atlas?1:2)},matcap:{value:mat.surface==='matcap'},matcapMap:{value:this.textures[mat.matcap]||this.textures.white},
      sourcePremultiplied:{value:!!mat.premultiplied},ignoreVertexColor:{value:!!mat.ignoreVertexColor},gammaColorSpace:{value:this.index.colorSpace!=='linear'},
      opaque:{value:opaque},gradation:{value:!!gradation},gradRange:{value:new THREE.Vector2(gradation?.start||0,gradation?.end||0)},
      gradColor:{value:new THREE.Vector4(...rgba(gradation?.color))},cutoff:{value:mat.cutoff||0}};
    if(shared)for(const key of ['uvRect','particleColor','spriteSize','particlePivot','spriteRotated','flipUv','clampSpriteUv','spriteUvBounds','spriteAtlasFlip'])uniforms[key]=shared[key];
    let fragment=fragmentShader;
    if(distortion){
      for(const [key,v] of Object.entries(mat.parameters||{}))uniforms[key]={value:typeof v==='number'?v:new THREE.Vector4(...rgba(v))};
      const uv=mat.parameters?._DistortNoiseUV||{};uniforms._DistortNoiseUV={value:new THREE.Vector2(uv.r??1,uv.g??1)};
      uniforms._Time={value:new THREE.Vector4()};uniforms._ProjectionParams={value:new THREE.Vector4(1,.01,100,.01)};uniforms._GrabTexture={value:this.textures.white};
      fragment=`uniform vec4 nativeCustom1;uniform vec4 nativeCustom2;varying vec4 vColor;varying vec2 nativeRawUv;varying vec4 nativeScreenPos;
#define vs_TEXCOORD1 nativeCustom1
#define vs_TEXCOORD2 nativeScreenPos
#define vs_TEXCOORD3 vec4(nativeRawUv,0.0,0.0)
#define vs_TEXCOORD4 nativeCustom2
#define vs_COLOR0 vColor
`+mat.fragmentSource;
    }
    return new THREE.ShaderMaterial({vertexShader,fragmentShader:fragment,uniforms,transparent:!opaque||distortion,
      side:mat.cull==='back'?THREE.FrontSide:mat.cull==='front'?THREE.BackSide:THREE.DoubleSide,
      depthWrite:mat.depthWrite??opaque,depthTest:mat.depthTest??true,blending:opaque?THREE.NoBlending:THREE.CustomBlending,
      blendSrc:THREE.OneFactor,blendDst:mat.blend==='add'?THREE.OneFactor:THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
  }
  createMesh(s,geo,options={}) {
    if(s.renderer?.mode===4&&options.pivot){
      // DrawMeshParticles: pivot * (bounds.max-bounds.min), with Z negated.
      // This is a normalized mesh-bounds offset, not an unscaled vertex offset.
      if(!geo.boundingBox)geo.computeBoundingBox();
      const pivot=vec(options.pivot).multiply(geo.boundingBox.getSize(new THREE.Vector3()));
      pivot.z=-pivot.z;options={...options,pivot};
    }
    const defs=s.materials?.length?s.materials:[s.material],materials=[];
    const count=Math.max(defs.length,...geo.groups.map(g=>g.materialIndex+1),1);
    for(let i=0;i<count;i++)materials.push(this.createMaterial(defs[Math.min(i,defs.length-1)],{...options,shared:materials[0]?.uniforms}));
    const mesh=new THREE.Mesh(geo,materials.length===1?materials[0]:materials);
    if(defs.some(mat=>mat.surface==='screenDistortion')){
      mesh.onBeforeRender=(renderer,scene,camera,geometry,material)=>{
        const size=renderer.getDrawingBufferSize(new THREE.Vector2());let grab=mesh.userData.grabTexture;
        if(!grab||grab.image.width!==size.x||grab.image.height!==size.y){grab?.dispose();grab=new THREE.FramebufferTexture(size.x,size.y);grab.minFilter=grab.magFilter=THREE.LinearFilter;mesh.userData.grabTexture=grab;}
        renderer.copyFramebufferToTexture(grab);material.uniforms._GrabTexture.value=grab;
      };
    }
    if(materials.length>1&&!geo.groups.length){geo.addGroup(0,geo.index?.count||geo.attributes.position.count,0);}
    return mesh;
  }
  projectedBounds() {
    const bounds=new THREE.Box2().makeEmpty(),point=new THREE.Vector3(),pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,compensation=this.camera.nativeViewportScale();
    for(const {mesh} of [...this.particles,...this.statics]){
      if(this.screenEffect||!this.group.visible||!mesh.visible)continue;
      const geo=mesh.geometry;if(!geo.boundingBox)geo.computeBoundingBox();const b=geo.boundingBox,u=uniformsOf(mesh);
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
        point.set(x*u.spriteSize.value.x,y*u.spriteSize.value.y,z).add(u.particlePivot.value).applyMatrix4(mesh.matrix);
        point.x+=this.group.position.x;point.y+=this.group.position.y;point.z-=this.group.position.z;
        bounds.expandByPoint(new THREE.Vector2(point.x,point.y*Math.cos(pitch)+point.z*Math.sin(pitch)/compensation));
      }
    }
    if(this.modulePlayer?.active)bounds.union(this.modulePlayer.bounds());
    if(this.characterPlayer?.active)bounds.union(this.characterPlayer.bounds());
    return bounds;
  }
  async measureNative(times,{onProgress=()=>{},isCancelled=()=>false}={}) {
    if(this.screenEffect&&!this.modulePlayer?.active){
      const width=this.renderer.domElement.clientWidth,height=this.renderer.domElement.clientHeight;
      this.validateCaptureSize(width,height);
      return {width,height,center:[0,0],pixelsPerUnit:this.nativePixelsPerUnit()};
    }
    const ppu=this.nativePixelsPerUnit(),key=JSON.stringify([this.effect.id,this.seed,this.topView,[...this.excluded].sort(),times,ppu]);
    if(this.nativePlanCache?.key===key)return this.nativePlanCache.plan;
    const oldTime=this.currentTime??0,bounds=new THREE.Box2().makeEmpty(),cancel=()=>{if(isCancelled())throw new Error('已取消');};
    const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    try{
      for(let i=0;i<times.length;i++){
        cancel();this.sample(times[i]);bounds.union(this.projectedBounds());onProgress((i+1)/times.length*.3);
        if(i%8===0)await yieldFrame();
      }
      const plan={width:1,height:1,center:[0,0],pixelsPerUnit:ppu};
      if(!bounds.isEmpty()){
        const x0=Math.floor(bounds.min.x*ppu)-1,x1=Math.ceil(bounds.max.x*ppu)+1,y0=Math.floor(bounds.min.y*ppu)-1,y1=Math.ceil(bounds.max.y*ppu)+1;
        Object.assign(plan,{width:Math.max(1,x1-x0),height:Math.max(1,y1-y0),center:[(x0+x1)/2/ppu,(y0+y1)/2/ppu]});
        this.validateCaptureSize(plan.width,plan.height);
        let left=plan.width,right=-1,top=plan.height,bottom=-1;
        for(let i=0;i<times.length;i++){
          cancel();const pixels=this.captureFrame(times[i],plan);
          for(let y=0;y<plan.height;y++)for(let x=0;x<plan.width;x++)if(pixels[(y*plan.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
          onProgress(.3+(i+1)/times.length*.7);await yieldFrame();
        }
        if(right>=left){
          plan.center[0]+=(left+right+1-plan.width)/2/ppu;plan.center[1]+=(plan.height-top-bottom-1)/2/ppu;
          plan.width=right-left+1;plan.height=bottom-top+1;
        }else Object.assign(plan,{width:1,height:1,center:[0,0]});
      }
      this.nativePlanCache={key,plan};return plan;
    }finally{this.sample(oldTime);}
  }
  validateCaptureSize(width,height) {
    const limit=this.renderer.capabilities.maxTextureSize;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>limit||height>limit||width*height>16777216)throw new Error('导出尺寸过大，请缩短范围或使用固定尺寸');
  }
  captureFrame(time,size,background=null) {
    const objectSize=typeof size==='object',cropped=objectSize&&!!size.viewport,native=objectSize&&!cropped,width=objectSize?size.width:size,height=objectSize?size.height:size;
    this.validateCaptureSize(width,height);
    if(cropped){
      const v=size.viewport,r=size.region;
      if(!r||![v.width,v.height,r.x,r.y,r.width,r.height].every(Number.isFinite)||v.width<=0||v.height<=0||r.width<=0||r.height<=0||r.x<0||r.y<0||r.x+r.width>v.width+.001||r.y+r.height>v.height+.001)throw new Error('导出范围无效，请重新框选');
    }
    if(!this.captureTarget||this.captureTarget.width!==width||this.captureTarget.height!==height){
      this.captureTarget?.dispose();this.captureTarget=new THREE.WebGLRenderTarget(width,height,{samples:4});
      // Shader output is already display RGB. An sRGB attachment would encode it
      // again before readback and amplify translucent colors during unpremultiplication.
      this.captureTarget.texture.colorSpace=THREE.NoColorSpace;
    }
    const target=this.captureTarget,renderer=this.renderer,oldTarget=renderer.getRenderTarget(),oldBackground=this.scene.background,oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha(),oldGrid=this.grid.visible;
    const left=this.camera.left,right=this.camera.right,top=this.camera.top,bottom=this.camera.bottom,position=this.camera.position.clone(),quaternion=this.camera.quaternion.clone(),half=Math.max(this.viewSize,this.fitSquareSize||this.viewSize)/this.zoom/2;
    try{
      this.resizeScreenCamera(cropped?size.viewport.width:width,cropped?size.viewport.height:height);
      const pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,compensation=this.camera.nativeViewportScale();
      if(native){
        this.camera.left=-width/size.pixelsPerUnit/2;this.camera.right=-this.camera.left;this.camera.top=height/size.pixelsPerUnit/2;
        const center=new THREE.Vector3(size.center[0],size.center[1]*compensation*Math.cos(pitch),-size.center[1]*compensation*Math.sin(pitch));
        this.camera.position.set(0,this.cameraConfig.distance*Math.sin(pitch),this.cameraConfig.distance*Math.cos(pitch)).add(center);this.camera.lookAt(center);
      }else if(cropped){
        const h=this.viewSize/this.zoom/2;this.camera.left=-h*size.viewport.width/size.viewport.height;this.camera.right=-this.camera.left;this.camera.top=h;
      }else{this.camera.left=-half;this.camera.right=half;this.camera.top=half;}
      this.camera.bottom=-this.camera.top;this.camera.updateProjectionMatrix();
      if(cropped){
        const v=size.viewport,r=size.region,crop=new THREE.Matrix4().set(v.width/r.width,0,0,(v.width-2*r.x-r.width)/r.width,0,v.height/r.height,0,(2*r.y+r.height-v.height)/r.height,0,0,1,0,0,0,0,1);
        // Apply after the native oblique projection, so its vertical scale does
        // not also scale the crop offset. Screen FX use the same preview crop.
        for(const camera of [this.camera,this.screenCamera]){camera.projectionMatrix.premultiply(crop);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
      }
      // Capture FX against transparency first. A bright matte must not participate
      // in additive particle blending, which clips the effect's color to white.
      this.scene.background=null;this.grid.visible=false;renderer.setClearColor(0,0);renderer.setRenderTarget(target);this.sample(time);
      const raw=new Uint8Array(width*height*4),flipped=new Uint8Array(raw.length);renderer.readRenderTargetPixels(target,0,0,width,height,raw);
      for(let y=0;y<height;y++)flipped.set(raw.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);
      // WebGL stores associated RGB; exporters consume straight sRGB RGBA.
      // Composite the matte afterwards, matching PNG/video's source-over path.
      const matte=background==null?null:new THREE.Color(background).getRGB({},THREE.SRGBColorSpace);
      const channels=matte?[matte.r*255,matte.g*255,matte.b*255]:null;
      for(let i=0;i<flipped.length;i+=4){
        const a=flipped[i+3];
        if(a>0&&a<255)for(let j=0;j<3;j++)flipped[i+j]=Math.min(255,Math.round(flipped[i+j]*255/a));
        if(channels){for(let j=0;j<3;j++)flipped[i+j]=Math.round(flipped[i+j]*a/255+channels[j]*(1-a/255));flipped[i+3]=255;}
      }
      return flipped;
    }finally{
      renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);this.scene.background=oldBackground;this.grid.visible=oldGrid;this.camera.left=left;this.camera.right=right;this.camera.top=top;this.camera.bottom=bottom;this.camera.position.copy(position);this.camera.quaternion.copy(quaternion);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.resizeScreenCamera(renderer.domElement.clientWidth,renderer.domElement.clientHeight);
    }
  }
}

/** Reuse particle sampling without allocating another canvas or WebGL context. */
export function createParticleSimulation(effect,{textures,geometries,index,camera,seed=12345}){
 const sim=Object.create(FxRuntime.prototype);Object.assign(sim,{textures,geometries,index,camera,group:new THREE.Group(),particles:[],statics:[],excluded:new Set(),frameCount:0,mapSimulation:true,
  renderer:{render(){}},resize(){},setView(){},quad:geometry({position:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],uv:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]})});
 sim.build(effect,seed);const original=sim.particles.slice(),birthCounts=new Map();for(const p of original)birthCounts.set(p.si,(birthCounts.get(p.si)||0)+1);
 for(const p of original){
  const s=p.s; p.delay=p.systemStart;if(!s.loop||Number.isFinite(effect.simulationDuration))continue;
  // Multiple cohorts retain older particles when lifetime exceeds one emission cycle.
  if(p.life>1e6)continue;const births=birthCounts.get(p.si),capacity=s.modules.InitialModule.maxNumParticles||1000;const cohorts=Math.min(32,Math.max(1,Math.floor(capacity/Math.max(1,births))),Math.max(1,Math.ceil(Math.min(p.life,120)/Math.max(.001,s.duration))));p.period=cohorts*s.duration;
  for(let i=1;i<cohorts;i++){const mesh=sim.createMesh(s,s.renderer.mesh?geometries[s.renderer.mesh]:sim.quad,{pivot:s.renderer.pivot});mesh.matrixAutoUpdate=false;sim.group.add(mesh);const cohort={...p,mesh,birth:p.birth+i*s.duration,birthFrame:p.birthFrame+i*s.duration,systemStart:p.systemStart+i*s.duration,noiseSteps:undefined,trail:undefined};sim.particles.push(cohort);if(s.modules.TrailModule?.mode===0&&s.trailMaterial)sim.createTrail(cohort);}
 }
 return sim;
}
