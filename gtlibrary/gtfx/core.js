import * as THREE from '../vendor/three.module.js';
import {sampleAnimator} from '../core/custom-animator.js';

const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
const mix = (a,b,t) => a+(b-a)*t;
const vec = (v={}) => new THREE.Vector3(v.x||0,v.y||0,v.z||0);
const rgba = (c={r:1,g:1,b:1,a:1}) => [c.r,c.g,c.b,c.a];
const rand = seed => { let x = seed>>>0; return () => { x += 0x6D2B79F5; let t=x; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };

import {curve} from '../core/animation-curve.js';
export {curve} from '../core/animation-curve.js';
export function value(c,t=0,r=.5,fallback=0) {
  if(!c)return fallback;
  switch(c.minMaxState) {
    case 1:return curve(c.maxCurve,t)*c.scalar;
    case 2:return mix(curve(c.minCurve,t)*c.scalar,curve(c.maxCurve,t)*c.scalar,r);
    case 3:return mix(c.minScalar,c.scalar,r);
    default:return c.scalar??fallback;
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
function limitedMotion(p,age) {
  const m=p.s.modules,mod=m.ClampVelocityModule,n=Math.max(1,Math.ceil(age*60)),dt=age/n,pos=p.sh.clone(),velocity=p.velocity.clone();
  for(let i=0;i<n;i++){
    const u=(i+.5)*dt/p.life;
    if(m.ForceModule)velocity.addScaledVector(new THREE.Vector3(...['x','y','z'].map((k,j)=>value(m.ForceModule[k],u,p.r[j+6]))),dt);
    velocity.y-=9.81*value(m.InitialModule.gravityModifier,0,p.r[9])*dt;
    const drag=Math.max(0,value(mod.drag,u,p.r[0])),length=velocity.length(),factor=1-Math.pow(1-clamp(mod.dampen||0),dt*60);
    if(mod.separateAxis){for(const k of ['x','y','z']){const limit=Math.max(0,value(mod[k],u,p.r[0],Infinity));velocity[k]=mix(velocity[k],clamp(velocity[k],-limit,limit),factor);}}
    else{const limit=Math.max(0,value(mod.magnitude,u,p.r[0],Infinity));if(length>limit&&length)velocity.multiplyScalar(mix(1,limit/length,factor));}
    if(drag)velocity.multiplyScalar(Math.exp(-drag*dt*(mod.multiplyDragByParticleVelocity?velocity.length():1)*(mod.multiplyDragByParticleSize?p.startSize.length()/Math.sqrt(3):1)));
    pos.addScaledVector(velocity,dt);
  }
  return pos;
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
  const s=sh.m_Scale||{x:1,y:1,z:1};position.multiply(vec(s));
  const rot=vec(sh.m_Rotation).multiplyScalar(Math.PI/180);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x,rot.y,rot.z,'ZXY'));
  position.applyQuaternion(q).add(vec(sh.m_Position));direction.applyQuaternion(q);
  if(sh.randomDirectionAmount){const random=new THREE.Vector3(rng()*2-1,rng()*2-1,rng()*2-1).normalize();direction.lerp(random,sh.randomDirectionAmount).normalize();}
  return {position,direction};
}
const vertexShader=`attribute vec4 rgba; varying vec2 vUv; varying vec2 vMaskUv; varying vec4 vColor; varying vec3 vNormal; varying float vHeight;
uniform vec4 uvRect; uniform vec4 particleColor; uniform vec2 uvScale; uniform vec2 uvOffset;
uniform vec2 spriteSize; uniform vec3 particlePivot; uniform bool spriteRotated; uniform vec2 maskScale; uniform vec2 maskOffset;
void main(){vec2 spriteUv=spriteRotated?vec2(uv.y,1.0-uv.x):uv;
vUv=uvRect.xy+(spriteUv*uvScale+uvOffset)*uvRect.zw;
vMaskUv=(uvRect.xy+spriteUv*uvRect.zw)*maskScale+maskOffset;vColor=rgba*particleColor;
vec3 vertex=position;vertex.xy*=spriteSize;vertex+=particlePivot;
vNormal=normalize(normalMatrix*normal);vHeight=vertex.y;
gl_Position=projectionMatrix*modelViewMatrix*vec4(vertex,1.0);}`;
const fragmentShader=`uniform sampler2D map; uniform sampler2D maskMap; uniform bool masked; uniform sampler2D matcapMap; uniform bool matcap; uniform bool opaque;
uniform vec4 gradColor; uniform vec2 gradRange; uniform bool gradation; uniform float cutoff;
uniform vec4 tint;uniform bool additive;uniform float colorGain;varying vec2 vUv;varying vec2 vMaskUv;varying vec4 vColor;varying vec3 vNormal;varying float vHeight;
void main(){gl_FragColor=texture2D(map,vUv)*vColor*tint*colorGain;
// Match GTCharFx.BuildParticleShader: multiply mask RGB and alpha independently.
// Its UV transform must stay independent of scrolling/tiling on the main texture.
if(masked)gl_FragColor*=texture2D(maskMap,vMaskUv);
if(matcap){
  vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
  // Orthographic Unity camera: MatCap lookup is the view-space surface normal.
  gl_FragColor.rgb*=texture2D(matcapMap,n.xy*0.5+0.5).rgb;
  if(gradation&&abs(gradRange.y-gradRange.x)>0.00001){float g=clamp((vHeight-gradRange.x)/(gradRange.y-gradRange.x),0.0,1.0);gl_FragColor.rgb*=mix(vec3(1.0),gradColor.rgb,g);}
  if(gl_FragColor.a<cutoff)discard;
  if(opaque)gl_FragColor.a=1.0;
}
gl_FragColor.a=clamp(gl_FragColor.a,0.0,1.0);
#include <colorspace_fragment>
// Additive textures may contain opaque black. Black contributes no light and
// must not turn into opaque black coverage when the canvas/GIF is transparent.
gl_FragColor.rgb*=gl_FragColor.a;
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
    if(data.normal)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));else g.computeVertexNormals();
  }
  const count=g.attributes.position.count, colors=data.color;
  let out=Array(count*4).fill(1);
  if(colors){if(colors.length===count*4)out=colors;else for(let i=0;i<count;i++)for(let j=0;j<3;j++)out[i*4+j]=colors[i*3+j];}
  g.setAttribute('rgba',new THREE.Float32BufferAttribute(out,4));return g;
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
    this.cameraConfig={pitchDeg:45,oblique:true,orthographicSize:.5,near:.01,far:82,distance:20};
    this.topView=false;this.setView(false);this.zoom=1;this.viewSize=16;
    this.group=new THREE.Group();this.group.scale.z=-1;this.scene.add(this.group);
    this.grid=new THREE.GridHelper(40,40,0x263b58,0x162436);this.grid.position.y=-.05;this.scene.add(this.grid);
    this.quad=geometry({position:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],uv:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]});
    this.textures={};this.geometries={};this.particles=[];this.statics=[];this.excluded=new Set();this.frameCount=0;
  }
  resize() {
    const w=this.renderer.domElement.clientWidth,h=this.renderer.domElement.clientHeight;
    this.renderer.setSize(w,h,false);if(this.backgroundMode==='checker'&&this.checker)this.checker.repeat.set(w/192,h/192);const aspect=w/Math.max(h,1),size=this.viewSize/this.zoom;
    // GTObliqueCamera.Apply: +/- halfH * aspect horizontally; +/- halfH * sin(pitch) vertically.
    const sinPitch=this.topView?1:this.cameraConfig.oblique?Math.sin(this.cameraConfig.pitchDeg*Math.PI/180):1;
    this.camera.left=-size*aspect/2;this.camera.right=size*aspect/2;this.camera.top=size*sinPitch/2;this.camera.bottom=-size*sinPitch/2;
    this.camera.updateProjectionMatrix();
  }
  clear() {
    for(const p of [...this.particles,...this.statics]){this.group.remove(p.mesh);for(const material of materialsOf(p.mesh))material.dispose();}
    this.statics=[];
    this.particles=[];
  }
  dispose() {
    ++this.loadGeneration;this.clear();
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
        tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=t.repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;
        tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;loaded[key]=tex;
      }));
    }catch(e){Object.values(loaded).forEach(t=>t.dispose());throw e;}
    if(generation!==this.loadGeneration){Object.values(loaded).forEach(t=>t.dispose());return;}
    this.clear();Object.values(this.textures).forEach(t=>t.dispose());Object.values(this.geometries).forEach(g=>g.dispose());
    this.index=index;this.textures=loaded;this.geometries=Object.fromEntries(Object.entries(index.meshes).map(([k,v])=>[k,geometry(v)]));
    this.cameraConfig={...this.cameraConfig,...index.camera};this.camera.near=this.cameraConfig.near;this.camera.far=this.cameraConfig.far;this.setView(this.topView);this.resize();
    const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;this.textures.white=white;
  }
  build(effect,seed=12345) {
    this.clear();this.effect=effect;this.seed=seed;this.excluded.clear();
    this.nativePlanCache=null;
    this.viewCenter=new THREE.Vector3();this.setView(this.topView);
    const nodes=new Map();
    for(const n of effect.nodes){const o=new THREE.Object3D();o.position.copy(vec(n.position));o.quaternion.set(n.rotation.x,n.rotation.y,n.rotation.z,n.rotation.w);o.scale.copy(vec(n.scale));o.visible=n.active;nodes.set(n.id,o);}
    for(const n of effect.nodes){if(nodes.has(n.parent))nodes.get(n.parent).add(nodes.get(n.id));}
    const root=nodes.get(effect.root);root.position.set(0,0,0);
    const d=effect.direction,forward=new THREE.Vector3(...d).normalize();
    if(forward.lengthSq()>0)root.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(forward,new THREE.Vector3(),new THREE.Vector3(0,1,0)));
    root.scale.set(effect.scale[0],Math.abs(effect.scale[1]),Math.abs(effect.scale[2]));root.updateMatrixWorld(true);
    this.nodes=nodes;this.nodeRoot=root;
    this.scriptByNode=new Map();
    for(const script of effect.scripts||[]){if(!this.scriptByNode.has(script.node))this.scriptByNode.set(script.node,[]);this.scriptByNode.get(script.node).push(script);}
    for(const node of nodes.values())node.userData.base={position:node.position.clone(),rotation:node.quaternion.clone(),scale:node.scale.clone()};
    let end=effect.duration;
    for(let si=0;si<effect.systems.length;si++){
      const s=effect.systems[si],node=nodes.get(s.node);let active=true;
      for(let n=node;n;n=n.parent)if(!n.visible)active=false;
      if((!active&&!effect.includeInactive)||s.renderer.mode===5)continue;
      const rng=rand((seed+si*971+s.seed)>>>0),m=s.modules,initial=m.InitialModule;
      const delay=value(s.delay,0,rng()),em=m.EmissionModule,births=[];
      if(em){
        for(const b of em.m_Bursts||[]){for(let cycle=0;cycle<(b.cycleCount||1);cycle++){
          if(rng()>(b.probability??1))continue;
          const bt=b.time+cycle*b.repeatInterval; if(bt>s.duration)continue;
          const n=Math.round(value(b.countCurve,bt/s.duration,rng()));for(let i=0;i<n;i++)births.push(bt+delay);
        }}
        let emitted=0;
        for(let t=0;t<s.duration;t+=1/120){emitted+=value(em.rateOverTime,t/s.duration,.5)/120;while(emitted>=1){births.push(t+delay);emitted--;}}
      }
      const worldPos=new THREE.Vector3(),worldRot=new THREE.Quaternion(),worldScale=new THREE.Vector3();node.matrixWorld.decompose(worldPos,worldRot,worldScale);
      for(const birth of births.slice(0,Math.min(initial.maxNumParticles||1000,1500))){
        const r=Array.from({length:12},rng),life=Math.max(.001,value(initial.startLifetime,birth/s.duration,r[0]));
        const sh=shapeSample(m.ShapeModule,rng);const velocity=sh.direction.multiplyScalar(value(initial.startSpeed,birth/s.duration,r[1]));
        const mesh=this.createMesh(s,s.renderer.mesh?this.geometries[s.renderer.mesh]:this.quad,{pivot:s.renderer.pivot});
        mesh.frustumCulled=false;mesh.visible=false;mesh.matrixAutoUpdate=false;
        mesh.renderOrder=(s.material.name.toLowerCase().includes('top')?100:0)+s.renderer.sort;
        this.group.add(mesh);
        const p={mesh,s,si,r,birth,life,sh:sh.position,velocity,worldPos,worldRot,worldScale,node,matrix:node.matrixWorld.clone(),
          startColor:color(initial.startColor,birth/s.duration,r[2]),
          startSize:new THREE.Vector3(value(initial.startSize,0,r[3],1),value(initial.size3D?initial.startSizeY:initial.startSize,0,initial.size3D?r[4]:r[3],1),value(initial.size3D?initial.startSizeZ:initial.startSize,0,initial.size3D?r[5]:r[3],1)),
          startRotation:new THREE.Vector3(initial.rotation3D?value(initial.startRotationX,0,r[6]):0,initial.rotation3D?value(initial.startRotationY,0,r[7]):0,value(initial.startRotation,0,r[8]))};
        this.particles.push(p);end=Math.max(end,(birth+life)/s.speed);
      }
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
    let alive=0;
    this.animationCache=new Map();
    this.animateNodes(time);
    const cameraQ=this.camera.quaternion.clone(); // compensate the reflected Unity coordinate group
    cameraQ.set(-cameraQ.x,-cameraQ.y,cameraQ.z,cameraQ.w);
    for(const p of this.particles){
      const {s,r,mesh,life}=p,m=s.modules;let age=time*s.speed-p.birth;if(this.mapSimulation&&s.loop&&p.period)age=((age%p.period)+p.period)%p.period;const u=age/life;
      mesh.visible=age>=0&&age<life&&!this.excluded.has(p.si)&&(!this.mapSimulation||time*s.speed>=p.delay);if(!mesh.visible)continue;alive++;
      if(s.local)p.matrix.copy(p.node.matrixWorld);
      const local=m.ClampVelocityModule?limitedMotion(p,age):p.sh.clone().addScaledVector(p.velocity,age);
      if(m.VelocityModule){const v=m.VelocityModule;const offset=new THREE.Vector3(...['x','y','z'].map((k,i)=>integral(v[k],age,life,r[i+3])));
        if(v.inWorldSpace)offset.applyQuaternion(p.worldRot.clone().invert());local.add(offset.multiplyScalar(value(v.speedModifier,u,r[0],1)));}
      if(m.ForceModule&&!m.ClampVelocityModule){const f=m.ForceModule;const off=new THREE.Vector3(...['x','y','z'].map((k,i)=>integral(f[k],age,life,r[i+6],true)));
        if(f.inWorldSpace)off.applyQuaternion(p.worldRot.clone().invert());local.add(off);}
      if(!m.ClampVelocityModule)local.y-=.5*9.81*value(m.InitialModule.gravityModifier,0,r[9])*age*age;
      if(m.NoiseModule){const noise=m.NoiseModule,freq=noise.frequency||.5,scroll=value(noise.scrollSpeed,u,r[0]),amount=value(noise.positionAmount,u,r[1],1);
        for(const [i,k] of ['x','y','z'].entries()){
          const phase=r[i+6]*Math.PI*2,coord=(p.sh.x+p.sh.y+p.sh.z)*freq+phase,a=age*(scroll+freq);
          const signal=(Math.sin(coord+a*2.1)+Math.sin(coord*1.71+a*3.3)*.5)/1.5-(Math.sin(coord)+Math.sin(coord*1.71)*.5)/1.5;
          local[k]+=signal*value(noise.separateAxes&&i?noise['strength'+k.toUpperCase()]:noise.strength,u,r[i])*amount;
        }
      }
      mesh.position.copy(local.clone().applyMatrix4(p.matrix));
      const size=p.startSize.clone();
      if(m.SizeModule){const mod=m.SizeModule,x=value(mod.curve,u,r[0],1);size.multiply(new THREE.Vector3(x,mod.separateAxes?value(mod.y,u,r[1],1):x,mod.separateAxes?value(mod.z,u,r[2],1):x));}
      if(s.renderer.mode===1)size.y*=Math.max(1,s.renderer.length+p.velocity.length()*s.renderer.velocityScale);
      mesh.scale.copy(size).multiply(p.worldScale);
      const angles=p.startRotation.clone();
      if(m.RotationModule){const rot=m.RotationModule;angles.z+=integral(rot.curve,age,life,r[0]);if(rot.separateAxes){angles.x+=integral(rot.x,age,life,r[1]);angles.y+=integral(rot.y,age,life,r[2]);}}
      // Unity billboard rotation is clockwise; mesh rotation uses its 3D axes.
      const spinZ=s.renderer.mode===4?angles.z:-angles.z;
      const spin=new THREE.Quaternion().setFromEuler(new THREE.Euler(angles.x,angles.y,spinZ,'ZXY'));
      if(s.renderer.mode===4){
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
        // Keep parent reflection/nonuniform scale BEFORE particle rotation. Decomposing
        // it into worldScale and applying it afterwards reverses mirrored slash motion.
        mesh.matrix.compose(local,spin,size).premultiply(p.matrix);
      }
      else if(s.renderer.mode===2)mesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2,0,spinZ));
      else if(s.renderer.mode===3)mesh.quaternion.setFromEuler(new THREE.Euler(0,0,spinZ));
      else if(s.renderer.alignment===1)mesh.quaternion.copy(spin);
      else mesh.quaternion.copy(cameraQ).multiply(spin);
      if(s.renderer.mode!==4&&s.renderer.alignment!==2)mesh.updateMatrix();
      const over=m.ColorModule?color(m.ColorModule.gradient,u,r[1]):[1,1,1,1];
      uniformsOf(mesh).particleColor.value.set(...p.startColor.map((c,i)=>c*over[i]));
      const uv=m.UVModule;
      if(uv){
        const phase=value(uv.frameOverTime,u,r[2])*(uv.cycles||1)+value(uv.startFrame,0,r[3]);
        const frame=((phase%1)+1)%1;
        if(uv.mode===1&&uv.sprites?.length){
          const sprite=this.index.sprites[uv.sprites[Math.min(uv.sprites.length-1,Math.floor(clamp(frame,0,.999999)*uv.sprites.length))]];
          if(sprite){
            uniformsOf(mesh).spriteRotated.value=!!sprite.rotated;uniformsOf(mesh).uvRect.value.set(...sprite.uv);
            for(const mat of materialsOf(mesh)){mat.uniforms.map.value=this.textures[sprite.texture];mat.uniforms.uvScale.value.set(1,1);mat.uniforms.uvOffset.value.set(0,0);}
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
          const nx=uv.tilesX||1,ny=uv.tilesY||1,single=uv.animationType===1,n=single?nx:nx*ny,idx=Math.floor(clamp(frame,0,.999999)*n),row=single?(uv.randomRow?Math.floor(r[9]*ny):(uv.rowIndex||0)):Math.floor(idx/nx);
          uniformsOf(mesh).uvRect.value.set(idx%nx/nx,(ny-1-row)/ny,1/nx,1/ny);
        }
      }
    }
    for(const p of this.statics){p.mesh.matrix.copy(p.node.matrixWorld);for(const [i,mat] of materialsOf(p.mesh).entries())mat.uniforms.tint.value.set(...rgba((p.s.materials?.[i]||p.s.material).tint));this.animateMaterial(p,time);}
    for(const p of this.particles)if(p.mesh.visible)this.animateMaterial(p,time);
    this.alive=alive;this.renderer.render(this.scene,this.camera);this.frameCount++;
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
    this.effect.sampleNodes?.(this,time);
    this.nodeRoot.updateMatrixWorld(true);
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
      if(['FxUvanim','FxUvanim_frac_Main','FxUvanim_add'].includes(script.type))uniforms.uvOffset.value.set((p.s.material.offset.x||0)+(script.fields.scrollSpeed_X||0)*time,(p.s.material.offset.y||0)+(script.fields.scrollSpeed_Y||0)*time);
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
    const bounds=new THREE.Box2(),point=new THREE.Vector3(),pitch=this.cameraConfig.pitchDeg*Math.PI/180;
    bounds.makeEmpty();
    const meshes=[...this.particles,...this.statics];
    for(const t of [.025,.08,.18,.35,.6].map(v=>Math.min(v,this.duration*.8))){
      this.sample(t);
      for(const p of meshes){
        const mesh=p.mesh;if(!mesh.visible)continue;
        const geo=mesh.geometry;if(!geo.boundingBox)geo.computeBoundingBox();const b=geo.boundingBox,uniforms=uniformsOf(mesh);
        for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
          point.set(x*uniforms.spriteSize.value.x,y*uniforms.spriteSize.value.y,z).add(uniforms.particlePivot.value).applyMatrix4(mesh.matrix);
          bounds.expandByPoint(new THREE.Vector2(point.x,point.y*Math.cos(pitch)+point.z*Math.sin(pitch)));
        }
      }
    }
    if(bounds.isEmpty())return;
    const size=bounds.getSize(new THREE.Vector2()),center=bounds.getCenter(new THREE.Vector2()),aspect=this.renderer.domElement.clientWidth/Math.max(1,this.renderer.domElement.clientHeight);
    const compensation=Math.sin(pitch);this.fitViewSize=Math.max(2,Math.min(160,Math.max(size.x/aspect,size.y/compensation)*1.3));
    this.fitSquareSize=Math.max(2,Math.max(size.x,size.y/compensation)*1.3);this.viewSize=this.fitViewSize;this.zoom=1;
    this.viewCenter=new THREE.Vector3(center.x,center.y*Math.cos(pitch),-center.y*Math.sin(pitch));
    this.setView(this.topView);this.resize();
  }
  nativePixelsPerUnit() {
    const counts=new Map();
    const refs=this.effect.systems.flatMap(s=>s.modules.UVModule?.sprites||[]).concat((this.effect.statics||[]).map(s=>s.sprite));
    for(const ref of refs){const ppu=this.index.sprites[ref]?.pixelsToUnits;if(ppu>0&&Number.isFinite(ppu))counts.set(ppu,(counts.get(ppu)||0)+1);}
    return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||100;
  }
  createMaterial(mat,{sprite=null,size=[1,1],pivot={},atlas=false,shared=null}={}) {
    const opaque=mat.blend==='opaque',gradation=mat.gradation;
    const uniforms={map:{value:this.textures[sprite?.texture||mat.texture]||this.textures.white},
      masked:{value:!!mat.mask},maskMap:{value:this.textures[mat.mask?.texture]||this.textures.white},
      maskScale:{value:new THREE.Vector2(mat.mask?.scale.x??1,mat.mask?.scale.y??1)},
      maskOffset:{value:new THREE.Vector2(mat.mask?.offset.x??0,mat.mask?.offset.y??0)},
      uvRect:{value:new THREE.Vector4(...(sprite?.uv||[0,0,1,1]))},particleColor:{value:new THREE.Vector4(1,1,1,1)},
      tint:{value:new THREE.Vector4(...rgba(mat.tint))},uvScale:{value:new THREE.Vector2(sprite?1:mat.scale.x,sprite?1:mat.scale.y)},
      uvOffset:{value:new THREE.Vector2(sprite?0:mat.offset.x,sprite?0:mat.offset.y)},spriteSize:{value:new THREE.Vector2(...size)},
      particlePivot:{value:vec(pivot)},spriteRotated:{value:!!sprite?.rotated},additive:{value:mat.blend==='add'},
      colorGain:{value:mat.colorGain??(atlas?1:2)},matcap:{value:mat.surface==='matcap'},matcapMap:{value:this.textures[mat.matcap]||this.textures.white},
      opaque:{value:opaque},gradation:{value:!!gradation},gradRange:{value:new THREE.Vector2(gradation?.start||0,gradation?.end||0)},
      gradColor:{value:new THREE.Vector4(...rgba(gradation?.color))},cutoff:{value:mat.cutoff||0}};
    if(shared)for(const key of ['uvRect','particleColor','spriteSize','particlePivot','spriteRotated'])uniforms[key]=shared[key];
    return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent:!opaque,
      side:mat.cull==='back'?THREE.FrontSide:mat.cull==='front'?THREE.BackSide:THREE.DoubleSide,
      depthWrite:mat.depthWrite??opaque,depthTest:true,blending:opaque?THREE.NoBlending:THREE.CustomBlending,
      blendSrc:THREE.OneFactor,blendDst:mat.blend==='add'?THREE.OneFactor:THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
  }
  createMesh(s,geo,options={}) {
    const defs=s.materials?.length?s.materials:[s.material],materials=[];
    const count=Math.max(defs.length,...geo.groups.map(g=>g.materialIndex+1),1);
    for(let i=0;i<count;i++)materials.push(this.createMaterial(defs[Math.min(i,defs.length-1)],{...options,shared:materials[0]?.uniforms}));
    const mesh=new THREE.Mesh(geo,materials.length===1?materials[0]:materials);
    if(materials.length>1&&!geo.groups.length){geo.addGroup(0,geo.index?.count||geo.attributes.position.count,0);}
    return mesh;
  }
  projectedBounds() {
    const bounds=new THREE.Box2().makeEmpty(),point=new THREE.Vector3(),pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,compensation=this.topView?1:this.cameraConfig.oblique?Math.sin(pitch):1;
    for(const {mesh} of [...this.particles,...this.statics]){
      if(!mesh.visible)continue;
      const geo=mesh.geometry;if(!geo.boundingBox)geo.computeBoundingBox();const b=geo.boundingBox,u=uniformsOf(mesh);
      for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
        point.set(x*u.spriteSize.value.x,y*u.spriteSize.value.y,z).add(u.particlePivot.value).applyMatrix4(mesh.matrix);
        bounds.expandByPoint(new THREE.Vector2(point.x,(point.y*Math.cos(pitch)+point.z*Math.sin(pitch))/compensation));
      }
    }
    return bounds;
  }
  async measureNative(times,{onProgress=()=>{},isCancelled=()=>false}={}) {
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
    const native=typeof size==='object',width=native?size.width:size,height=native?size.height:size;
    this.validateCaptureSize(width,height);
    if(!this.captureTarget||this.captureTarget.width!==width||this.captureTarget.height!==height){this.captureTarget?.dispose();this.captureTarget=new THREE.WebGLRenderTarget(width,height,{samples:4});this.captureTarget.texture.colorSpace=THREE.SRGBColorSpace;}
    const target=this.captureTarget,renderer=this.renderer,oldTarget=renderer.getRenderTarget(),oldBackground=this.scene.background,oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha(),oldGrid=this.grid.visible;
    const left=this.camera.left,right=this.camera.right,top=this.camera.top,bottom=this.camera.bottom,position=this.camera.position.clone(),quaternion=this.camera.quaternion.clone(),half=Math.max(this.viewSize,this.fitSquareSize||this.viewSize)/this.zoom/2;
    try{
      const pitch=(this.topView?89.999:this.cameraConfig.pitchDeg)*Math.PI/180,compensation=this.topView?1:this.cameraConfig.oblique?Math.sin(pitch):1;
      if(native){
        this.camera.left=-width/size.pixelsPerUnit/2;this.camera.right=-this.camera.left;this.camera.top=height/size.pixelsPerUnit/2*compensation;
        const center=new THREE.Vector3(size.center[0],size.center[1]*compensation*Math.cos(pitch),-size.center[1]*compensation*Math.sin(pitch));
        this.camera.position.set(0,this.cameraConfig.distance*Math.sin(pitch),this.cameraConfig.distance*Math.cos(pitch)).add(center);this.camera.lookAt(center);
      }else{this.camera.left=-half;this.camera.right=half;this.camera.top=half*compensation;}
      this.camera.bottom=-this.camera.top;this.camera.updateProjectionMatrix();
      this.scene.background=null;this.grid.visible=false;renderer.setClearColor(background||0,background?1:0);renderer.setRenderTarget(target);this.sample(time);
      const raw=new Uint8Array(width*height*4),flipped=new Uint8Array(raw.length);renderer.readRenderTargetPixels(target,0,0,width,height,raw);
      for(let y=0;y<height;y++)flipped.set(raw.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);
      // WebGL blending stores associated RGB. GIF quantization needs straight RGB.
      if(!background)for(let i=0;i<flipped.length;i+=4){const a=flipped[i+3];if(a>0&&a<255)for(let j=0;j<3;j++)flipped[i+j]=Math.min(255,Math.round(flipped[i+j]*255/a));}
      return flipped;
    }finally{
      renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);this.scene.background=oldBackground;this.grid.visible=oldGrid;this.camera.left=left;this.camera.right=right;this.camera.top=top;this.camera.bottom=bottom;this.camera.position.copy(position);this.camera.quaternion.copy(quaternion);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    }
  }
}

/** Reuse particle sampling without allocating another canvas or WebGL context. */
export function createParticleSimulation(effect,{textures,geometries,index,camera}){
 const sim=Object.create(FxRuntime.prototype);Object.assign(sim,{textures,geometries,index,camera,group:new THREE.Group(),particles:[],statics:[],excluded:new Set(),frameCount:0,mapSimulation:true,
  renderer:{render(){}},resize(){},setView(){},quad:geometry({position:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],uv:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]})});
 sim.build(effect);const original=sim.particles.slice(),birthCounts=new Map();for(const p of original)birthCounts.set(p.si,(birthCounts.get(p.si)||0)+1);
 for(const p of original){
  const s=p.s; p.delay=value(s.delay,0,.5);if(!s.loop)continue;
  // Multiple cohorts retain older particles when lifetime exceeds one emission cycle.
  if(p.life>1e6)continue;const births=birthCounts.get(p.si),capacity=s.modules.InitialModule.maxNumParticles||1000;const cohorts=Math.min(32,Math.max(1,Math.floor(capacity/Math.max(1,births))),Math.max(1,Math.ceil(Math.min(p.life,120)/Math.max(.001,s.duration))));p.period=cohorts*s.duration;
  for(let i=1;i<cohorts;i++){const mesh=sim.createMesh(s,s.renderer.mesh?geometries[s.renderer.mesh]:sim.quad,{pivot:s.renderer.pivot});mesh.matrixAutoUpdate=false;sim.group.add(mesh);sim.particles.push({...p,mesh,birth:p.birth+i*s.duration});}
 }
 return sim;
}
