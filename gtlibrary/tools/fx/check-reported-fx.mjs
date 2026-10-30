// Four reported cases, numeric only; no browser screenshots or appearance sweep.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../vendor/three.module.js';
import {FxRuntime} from '../../gtfx/core.js';
import {FxActionPlayer} from '../../gtfx/action-player.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {sampleAnimator} from '../../core/custom-animator.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const load=id=>({index:read('gtfx/assets/characters/'+id+'.json'),pack:read('gtfx/assets/native-characters/'+id+'.json')});
const options=pack=>({appearance:pack.profile.appearances[0],direction:'right',targetDistance:6,profile:pack.profile});
const g=load('gnomedoctor');
const gm=actionModules('gnomedoctor',g.index,{...options(g.pack),appearance:'gnome_doctor'},g.pack,{gnomedoctor:g.pack.plans});
assert(gm.find(m=>m.id==='basic-1')?.tracks.length);assert(gm.every(m=>Number.isFinite(m.duration)));
const c=load('carpgirl'),effect=c.index.effects.find(e=>e.preset==='fx_carp_girl_myth_attack');
const rt=Object.create(FxRuntime.prototype);Object.assign(rt,{effect,index:c.index,textures:{white:new THREE.Texture()},scriptByNode:new Map()});
let maskChecks=0;
for(const s of effect.statics){
 const scripts=effect.scripts.filter(x=>x.node===s.node&&x.type==='CustomAnimator');
 if(!scripts.some(x=>x.fields.States.some(st=>st.Curves.some(c=>c.CustomTexture==='_Mask'))))continue;
 rt.scriptByNode.set(s.node,scripts);const mat=rt.createMaterial(s.material);const p={s,mesh:{material:mat}};
 for(const t of [0,.2]){
  rt.animateMaterial(p,t);
  const curves=scripts.flatMap(x=>sampleAnimator(x.fields,t));
  for(const v of curves.filter(x=>x.texture==='_Mask'&&[18,19].includes(x.key))){assert.deepEqual(mat.uniforms[v.key===18?'maskOffset':'maskScale'].value.toArray(),v.vector.slice(0,2));maskChecks++;}
  const main=[s.material.offset.x,s.material.offset.y];
  for(const v of curves.filter(x=>x.texture==='_MainTex')){if(v.key===18)main.splice(0,2,...v.vector.slice(0,2));if(v.key===11)main[0]=v.value;if(v.key===12)main[1]=v.value;}
  assert.deepEqual(mat.uniforms.uvOffset.value.toArray(),main);
 }
 mat.dispose();
}
assert(maskChecks>0);
const d=load('dokkaebi'),duck=d.index.effects.find(e=>e.preset==='fx_m_dokkaebi_support_fall_duck');
rt.index=d.index;const dm=rt.createMaterial(duck.systems.find(s=>s.material.shader==='MatCap/Detail').material);
assert.equal(dm.uniforms.gradation.value,false);assert.equal(dm.uniforms.cutoff.value,0);assert.equal(dm.uniforms.colorGain.value,3);dm.dispose();
const opts=options(d.pack),modules=actionModules('dokkaebi',d.index,opts,d.pack,{dokkaebi:d.pack.plans});
const module=modules.find(m=>m.id==='basic-continuous');assert(module);assert(module.actor.clips.every(c=>c.loop&&c.end===Infinity));
const resources={textures:{},geometries:{},clear(){},setView(){},resize(){},camera:new THREE.OrthographicCamera(),cameraConfig:{}};
await FxRuntime.prototype.load.call(resources,d.index,x=>x,{effect:module.tracks.map(t=>t.effect),loadImage:async()=>({width:1,height:1})});
const runtime={...resources,scene:new THREE.Scene(),screenScene:new THREE.Scene(),seed:12345,characterPlayer:{direction:'right',effectDefinition:(effect,link)=>({...effect}),bindNodes(){}}};
const player=new FxActionPlayer(runtime);player.load(module,opts);
const period=module.continuous.period;player.sample(period-.0001);assert(player.entries.some(e=>e.sim.group.visible));const firstState=player.randomStateAfter;
player.sample(period+.0001);assert.equal(player.cycle,1);assert(player.entries.some(e=>e.sim.group.visible));assert.notDeepEqual(player.randomStateAfter,firstState);
const secondState=player.randomStateAfter;player.sample(0);player.sample(period+.0001);assert.deepEqual(player.randomStateAfter,secondState,'replay must reproduce native random progression');
player.sample(period*2+.0001);assert.equal(player.cycle,2);assert.equal(runtime.scene.children.length,module.tracks.length,'repeat must not leak scene objects');player.clear();
console.log(JSON.stringify({passed:true,gnomeOrdinary:gm.map(m=>m.id),carpMaskValues:maskChecks,matcap:'native Detail formula',continuous:{period,cyclesChecked:3,randomReplay:true},imagesRead:0}));
