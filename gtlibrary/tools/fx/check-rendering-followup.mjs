// Targeted numerical regression: one landing moment, one mesh, one screen FX, one magazine.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../vendor/three.module.js';
import {FxRuntime,createParticleSimulation} from '../../gtfx/core.js';
import {FxActionPlayer} from '../../gtfx/action-player.js';
import {actionModules} from '../../gtfx/action-modules.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const load=id=>({index:read('gtfx/assets/characters/'+id+'.json'),pack:read('gtfx/assets/native-characters/'+id+'.json')});
async function resources(index,effects){const r={textures:{},geometries:{},clear(){},setView(){},resize(){},camera:new THREE.OrthographicCamera(),cameraConfig:index.camera};await FxRuntime.prototype.load.call(r,index,x=>x,{effect:effects,loadImage:async()=>({width:1,height:1})});return r;}
const g=load('gnomedoctor'),gm=actionModules('gnomedoctor',g.index,{appearance:'gnome_doctor',direction:'right',targetDistance:6,profile:g.pack.profile},g.pack,{gnomedoctor:g.pack.plans});
const magazine=gm.find(m=>m.id==='basic-magazine');assert(magazine);assert.equal(magazine.magazine.sequence.length,10);assert.equal(magazine.magazine.remaining,0);assert.equal(magazine.actor.end,4);
for(const [i,round] of magazine.magazine.sequence.entries()){assert(Math.abs(round.time-i*.4)<1e-8);assert.equal(round.breakAttack,i===9);assert.equal(round.remaining,200-(i+1)*20);}
assert(magazine.tracks.filter(t=>t.effect.preset.includes('enhance')).every(t=>Math.abs(t.at-3.6)<1e-8));assert(magazine.duration>magazine.actor.end,'keep projectile tails');
const c=load('carpgirl'),cm=actionModules('carpgirl',c.index,{appearance:'carp_girl_myth',direction:'right',targetDistance:6,profile:c.pack.profile},c.pack,{carpgirl:c.pack.plans}).find(m=>m.id==='myth');
const landing=cm.tracks.find(t=>t.effect.preset==='fx_carp_girl_myth_landing'),r=await resources(c.index,[landing.effect]);
const sim=createParticleSimulation(landing.effect,r);sim.cameraConfig=c.index.camera;sim.sample(1.201-landing.link.delay);
const p=sim.particles.find(p=>p.s.renderer.mode===4&&p.mesh.visible);assert(p,'the blue mesh must be alive at 1.201 s');
const a=p.startRotation,expected=p.node.matrixWorld.clone().multiply(new THREE.Matrix4().makeRotationY(a.y)).multiply(new THREE.Matrix4().makeRotationX(a.x)).multiply(new THREE.Matrix4().makeRotationZ(a.z));
const actualAxis=[],expectedAxis=[];for(let axis=0;axis<3;axis++){const actual=new THREE.Vector3().setFromMatrixColumn(p.mesh.matrix,axis).normalize(),wanted=new THREE.Vector3().setFromMatrixColumn(expected,axis).normalize();assert(actual.distanceTo(wanted)<1e-6,'native extrinsic Z-X-Y axis '+axis);actualAxis.push(actual.toArray());expectedAxis.push(wanted.toArray());}
sim.clear();
const d=load('dokkaebi'),duck=d.index.effects.find(e=>e.preset==='fx_m_dokkaebi_support_fall_duck'),ds=duck.systems.find(s=>s.renderer.mesh),dr=await resources(d.index,[duck]);
assert.equal(d.index.meshes[ds.renderer.mesh].normal.length,0);const normal=dr.geometries[ds.renderer.mesh].attributes.normal;
for(let i=0;i<normal.count;i++)assert.deepEqual([normal.getX(i),normal.getY(i),normal.getZ(i)],[0,0,-1]);
const duckSim=createParticleSimulation(duck,dr),duckMesh=duckSim.particles.find(p=>p.s.renderer.mode===4).mesh;
assert.equal(duckMesh.material.uniforms.missingMeshParticleNormal.value,true,'native BakeMesh outputs zero normals for this missing stream');duckSim.clear();
const screen=d.index.effects.find(e=>e.scripts?.some(s=>s.type==='ScreenEffectObject'));assert(screen);
const sr=await resources(d.index,[screen]);sr.screenCamera=new THREE.OrthographicCamera();FxRuntime.prototype.resizeScreenCamera.call(sr,1200,600);sr.screenCamera.position.z=10;sr.screenCamera.lookAt(0,0,0);sr.screenCamera.updateMatrixWorld(true);
const project=v=>new THREE.Vector3(...v).project(sr.screenCamera),o=project([0,0,0]),x=project([1,0,0]),y=project([0,1,0]);assert(Math.abs((x.x-o.x)*1200-(y.y-o.y)*600)<1e-6,'screen projection must preserve square pixel proportions');
Object.assign(sr,{scene:new THREE.Scene(),screenScene:new THREE.Scene(),characterPlayer:{direction:'right',effectDefinition:e=>({...e}),bindNodes(){}}});
const sp=new FxActionPlayer(sr);sp.load({tracks:[{effect:screen,at:0,link:{delay:0,fxEnd:screen.duration,clips:[]}}]},{});
assert.equal(sp.entries[0].sim.camera,sr.screenCamera);assert.equal(sp.entries[0].sim.group.parent,sr.screenScene);sp.sample(.15);assert.equal(sp.entries[0].track.link.screen,true);sp.clear();
console.log(JSON.stringify({passed:true,gnome:{rounds:10,interval:.4,finalRound:10},carp:{time:1.201,axes:actualAxis},duck:{nativeDefaultNormals:normal.count},screen:{pixelsPerUnitXYEqual:true,initialCamera:'screen'},imagePixelsRead:0}));
