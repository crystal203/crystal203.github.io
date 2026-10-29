// Four representative construction cases; no skin or direction enumeration.
import * as THREE from '../../vendor/three.module.js';
import {createParticleSimulation} from '../../gtfx/core.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(readFileSync(new URL('../../gtfx/assets/'+p,import.meta.url),'utf8'));
const cases=[['hana','fx_m_hana_hook','hana'],['milkywaygirl','fx_m_milkyway_girl_role_cast_lv1','milkyway_girl'],['peimei','fx_m_chinaheroascent_support_cast_pei','china_hero_boy_ascent'],['idolcaptain','fx_idolcaptainmyth_myth_festival','idol_captain_myth']];
const results=[];
for(const [character,preset,appearance] of cases){
 const index=read('characters/'+character+'.json'),pack=read('native-characters/'+character+'.json');
 const modules=actionModules(character,index,{appearance,profile:pack.profile},pack,{[character]:pack.plans});
 assert(modules.length>0);assert(modules.every(m=>m.tracks.length&&m.tracks.every(t=>Number.isFinite(t.at)&&Number.isFinite(t.link.delay))));
 const effect=index.effects.find(e=>e.preset===preset||e.assetName===preset);assert(effect);
 const geometries=Object.fromEntries(Object.entries(index.meshes).filter(([,m])=>m.position).map(([key,m])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.position,3));if(m.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(m.uv,2));if(m.indices)g.setIndex(m.indices);return[key,g];}));
 const sim=createParticleSimulation(effect,{index,geometries,textures:{white:new THREE.Texture()},camera:new THREE.OrthographicCamera()});
 sim.sample(.2);sim.sample(.65);
 for(const p of sim.particles)if(p.mesh.visible)assert(p.mesh.matrix.elements.every(Number.isFinite),p.s.name);
 const trails=sim.trails.filter(p=>p.trail.visible);
 for(const p of trails)assert(p.trail.geometry.attributes.position.array.every(Number.isFinite));
 if(character==='milkywaygirl')assert(trails.some(p=>p.trail.geometry.drawRange.count>0),'active trail geometry missing');
 if(character==='peimei'){const meshParticles=sim.particles.filter(p=>p.s.modules.ShapeModule?.type===6);assert(meshParticles.length>0);assert(meshParticles.every(p=>p.randomSource==='native-initial-and-shape'));}
 if(character==='hana'){const sprites=effect.statics.filter(s=>s.customSprite);assert(sprites.length>0);assert(sprites.every(s=>s.size[0]>1.4&&s.size[1]>1.3));}
 const snapshot=sim.particles.map(p=>p.mesh.matrix.elements.slice());sim.sample(.2);sim.sample(.65);assert.deepEqual(sim.particles.map(p=>p.mesh.matrix.elements.slice()),snapshot,'seek changed trajectory');
 results.push({character,preset,actions:modules.map(m=>m.id),particles:sim.particles.length,visibleTrails:trails.length,alive:sim.alive});sim.clear();
}
console.log(JSON.stringify(results,null,2));
