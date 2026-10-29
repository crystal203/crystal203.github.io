// One fixed acceptance case: default myth appearance, right, distance 6.
// No browser, screenshots, skin sweep, or direction sweep.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../vendor/three.module.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
import {createParticleSimulation} from '../../gtfx/core.js';
import {nativeShapeSamples} from '../../gtfx/native-shapes.js';
import {UnityRand4,nativeMeshParticleFlip} from '../../gtfx/native-random.js';
const read=p=>JSON.parse(readFileSync(new URL('../../gtfx/assets/'+p,import.meta.url),'utf8'));
const index=read('characters/adelanoble.json'),pack=read('native-characters/adelanoble.json');
const options={appearance:'adela_noble_myth',direction:'right',targetDistance:6,profile:pack.profile};
const modules=actionModules(index.character,index,options,pack,{[index.character]:pack.plans});
assert.deepEqual(modules.map(m=>m.id),['basic-1','basic-2','basic-3','basic-4','basic-combo','role','support','cwp','myth']);
for(const m of modules){
 assert(Number.isFinite(m.duration)&&m.duration>0,m.id);
 for(const t of m.tracks)assert([t.at,t.link.delay,t.link.fxEnd??m.duration].every(Number.isFinite),m.id);
 for(const p of m.actor.graphPath||[])assert(p.position.every(Number.isFinite));
 const traces=Array.isArray(m.graphTrace)?m.graphTrace:[m.graphTrace];
 for(const trace of traces.filter(Boolean)){
  const events=trace.events.filter(e=>e.type==='PlayEffect'||e.type==='PlayScreenEffect');
  assert.equal(new Set(events.map(e=>e.node+':'+e.time.toFixed(6))).size,events.length,'duplicate timer event');
 }
}
const cwp=modules.find(m=>m.id==='cwp'),support=modules.find(m=>m.id==='support');
assert(Math.abs(sampleGraphPath(cwp.actor.graphPath,.45)[0]-3)<1e-8,'ShortDash must integrate speed * duration / 2');
assert(Math.abs(sampleGraphPath(cwp.actor.graphPath,.2)[0])<1e-8,'dash started early');
assert(Math.abs(sampleGraphPath(support.actor.graphPath,1.1)[0])<1e-8,'support did not return');
assert(cwp.tracks.some(t=>t.effect.preset==='fx_cwp_adela_noble_myth_smash'));
assert(!cwp.tracks.some(t=>t.effect.preset.endsWith('_rev')),'wrong directional resource');
// A renamed imported character/graph must produce the same result.
const renamed=structuredClone(pack);renamed.graphs={};
for(const [i,[key,graph]] of Object.entries(pack.graphs).entries()){
 const alias='fixture:graph-'+i;renamed.graphs[alias]=graph;
 for(const a of Object.values(renamed.actions))if(a.GraphName===key)a.GraphName=alias;
}
assert.deepEqual(actionModules('fixture',index,options,renamed,{fixture:pack.plans}),modules);
const geometries=Object.fromEntries(Object.entries(index.meshes).map(([key,m])=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.position,3));
 if(m.uv?.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(m.uv,2));if(m.indices?.length)g.setIndex(m.indices);return [key,g];
}));
let particles=0,spiralParticles=0,maxSpiralPivot=0;
for(const track of cwp.tracks){
 const sim=createParticleSimulation(track.effect,{index,geometries,textures:{white:new THREE.Texture()},camera:new THREE.OrthographicCamera()});
 sim.sample(.25); // cast spiral starts at .21 seconds
 for(const p of sim.particles)if(p.mesh.visible)assert(p.mesh.matrix.elements.every(Number.isFinite),p.s.name);
 // The cast's FX_ring4 must stay around its emitter; raw pivot.z=.4 used
 // to move it by several world units after Start Size and random rotation.
 if(track.effect.preset==='fx_cwp_adela_noble_myth_cast'){
  const rings=sim.particles.filter(p=>index.meshes[p.s.renderer.mesh]?.name==='FX_ring4'&&p.mesh.visible);
  assert(rings.length>=3,'cast spiral missing');
  for(const p of rings){
   const u=p.mesh.material.uniforms,pivot=u.particlePivot.value;
   assert(Math.abs(pivot.y-.005092866902558402)<1e-8);
   assert(Math.abs(pivot.z-(-.03667945068094314))<1e-8);
   assert.deepEqual(p.flip,[1,0,0],'mesh flip axes');
   assert.deepEqual(u.flipUv.value.toArray(),[0,0],'mesh flip must not reverse atlas UVs');
   assert(p.mesh.matrix.determinant()*p.node.matrixWorld.determinant()<0,'mesh X reflection missing');
   const offset=pivot.clone().applyMatrix4(p.mesh.matrix).sub(new THREE.Vector3().setFromMatrixPosition(p.mesh.matrix)).length();
   const oldOffset=new THREE.Vector3(0,.01,.4).applyMatrix4(p.mesh.matrix).sub(new THREE.Vector3().setFromMatrixPosition(p.mesh.matrix)).length();
   assert(offset<oldOffset*.12,'mesh pivot still spreads the spiral');
   maxSpiralPivot=Math.max(maxSpiralPivot,offset);spiralParticles++;
  }
  // A differently sized mesh exercises all pivot axes without character data.
  const geo=new THREE.BoxGeometry(2,4,6),fixture={...rings[0].s,renderer:{mode:4}};
  const mesh=sim.createMesh(fixture,geo,{pivot:{x:.25,y:-.5,z:.75}});
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const material of materials){assert.deepEqual(material.uniforms.particlePivot.value.toArray(),[.5,-2,-4.5]);material.dispose();}
  geo.dispose();
 }
 particles+=sim.particles.length;sim.clear();
}
assert(spiralParticles>=3);
assert.deepEqual(nativeMeshParticleFlip(12345,{x:1,y:0,z:1}),[1,0,1]);
for(const g of Object.values(geometries))g.dispose();
const rng=new UnityRand4(123),ref=new UnityRand4(123),x=ref.nextFloat4(),y=ref.nextFloat4();
assert.deepEqual(nativeShapeSamples({type:18},rng,4,{normalize:false}),x.map((v,i)=>({position:[Math.fround(v-.5),Math.fround(y[i]-.5),0],direction:[0,0,1]})));
assert.deepEqual(rng.lanes,ref.lanes);
console.log(JSON.stringify({passed:true,case:options.appearance,direction:'right',distance:6,modules:modules.length,cwpDistance:3,cwpParticles:particles,spiralParticles,maxSpiralPivot,graphNamesIndependent:true}));
