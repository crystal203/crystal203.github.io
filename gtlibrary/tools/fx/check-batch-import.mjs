// Five fixed myth/right/distance-6 cases. No browser images or appearance sweep.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInThisContext,runInContext,createContext} from 'node:vm';
import * as THREE from '../../vendor/three.module.js';
import {nativeScriptRandomInt} from '../../gtfx/native-random.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
import {createParticleSimulation} from '../../gtfx/core.js';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const resourceContext=createContext({URL,fetch,document:{currentScript:{src:new URL('core/resources.js',root).href},baseURI:root.href}});runInContext(readFileSync(new URL('core/resources.js',root),'utf8'),resourceContext);
runInThisContext(readFileSync(new URL('vendor/spine-webgl.js',root),'utf8'));
runInThisContext(readFileSync(new URL('gtasset/core.js',root),'utf8'));
const cases=[['fallenqueen','fallen_queen_myth'],['dokkaebi','dokkaebi_myth'],['carpgirl','carp_girl_myth'],['gnomedoctor','gnome_doctor_myth'],['invaderknight','invader_knight_myth']];
assert.equal(nativeScriptRandomInt({nextFloat:()=>1},0,4),0);
assert.equal(nativeScriptRandomInt({nextFloat:()=>.75},0,4),3);
const summary=[];
for(const [id,appearance] of cases){
 const index=read('gtfx/assets/characters/'+id+'.json'),pack=read('gtfx/assets/native-characters/'+id+'.json');
 const modules=actionModules(id,index,{appearance,direction:'right',targetDistance:6,profile:pack.profile},pack,{[id]:pack.plans});
 for(const required of ['basic-1','role','support','cwp','myth'])assert(modules.some(m=>m.id===required),id+' missing '+required);
 assert.equal(new Set(modules.map(m=>m.id)).size,modules.length);
 for(const m of modules){assert(m.tracks.length&&m.duration>0&&Number.isFinite(m.duration),id+' '+m.id);
  for(const t of m.tracks){assert(!t.effect.unavailable);assert([t.at,t.link.delay,t.link.fxEnd??m.duration].every(Number.isFinite));for(const p of t.link.motionPath||[])assert(p.position.every(Number.isFinite));}
  for(const p of [...m.actor.graphPath||[],...m.actor.spinePath||[]])assert(p.position.every(Number.isFinite));
 }
 for(const t of Object.values(index.textures))assert(existsSync(new URL(resourceContext.GTResources.url(new URL(t.url,new URL('gtfx/assets/characters/',root)).href))),id+' texture '+t.url);
 const atlasText=readFileSync(new URL('gtasset/assets/character/'+appearance+'.atlas',root),'utf8'),bytes=readFileSync(new URL('gtasset/assets/character/'+appearance+'_side.bytes',root));
 const images=GTSpineCore.pages(atlasText).map(()=>({width:4096,height:4096}));
 const decoded=GTSpineCore.parse({spine,atlasText,bytes,images,createTexture:img=>new spine.FakeTexture(img)});
 const missingAnimations=new Set();for(const m of modules)for(const c of m.actor.clips)if(!decoded.data.findAnimation(c.name)&&!decoded.data.findAnimation(c.name+'_side'))missingAnimations.add(c.name);
 assert.deepEqual([...missingAnimations],[],id+' animation references');decoded.dispose();
 if(id==='fallenqueen'){
  const m=modules.find(m=>m.id==='cwp'),bursts=m.tracks.filter(t=>t.effect.preset.endsWith('_explosion'));
  assert.equal(bursts.length,4);assert.deepEqual(bursts.map(t=>Number(t.link.delay.toFixed(3))),[.4,.475,.55,.625]);
  assert.equal(modules.find(m=>m.id==='basic-3').tracks.filter(t=>t.effect.preset.endsWith('3rd_proj')).length,9);
  assert.equal(sampleGraphPath(modules.find(m=>m.id==='basic-combo').actor.graphPath,2)[0],0,'stationary joystick input');
 }
 if(id==='dokkaebi'){assert(sampleGraphPath(modules.find(m=>m.id==='cwp').actor.graphPath,1)[0]<0,'recoil must move backward');assert.equal(modules.find(m=>m.id==='support').tracks.filter(t=>/_fall_/.test(t.effect.preset)).length,1);}
 if(id==='invaderknight'){assert.equal(modules.filter(m=>/^basic-\d$/.test(m.id)).length,4);assert(Math.abs(sampleGraphPath(modules.find(m=>m.id==='cwp').actor.graphPath,.4)[0]-2.7)<1e-6);}
 if(id==='gnomedoctor'){
  assert(modules.find(m=>m.id==='basic-break').tracks.some(t=>t.effect.preset.includes('enhance')));
  const tracks=modules.find(m=>m.id==='support').tracks.filter(t=>t.effect.skeletons?.length);assert.equal(tracks.length,2);
  for(const t of tracks){const effect={...t.effect,skeletonSkin:t.link.skeletonSkin,skeletonAnimation:t.link.skeletonAnimation};
   const textures=Object.fromEntries(effect.skeletons.flatMap(s=>s.textures).map(k=>[k,new THREE.Texture({width:index.textures[k].width,height:index.textures[k].height})]));
   const sim=createParticleSimulation(effect,{textures:{...textures,white:new THREE.Texture()},geometries:{},index,camera:new THREE.OrthographicCamera()});sim.sample(.2);
   assert.equal(sim.skeletonEffects.length,1);const meshes=sim.group.children.filter(c=>c.isInstancedMesh);assert(meshes.length>0);assert(meshes.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)));sim.clear();
  }
 }
 summary.push({character:id,modules:modules.map(m=>m.id),referencedEffects:new Set(modules.flatMap(m=>m.tracks.map(t=>t.effect.preset))).size});
}
console.log(JSON.stringify({passed:true,configuration:'myth/right/distance 6',cases:summary}));
