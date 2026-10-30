import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import * as THREE from '../../vendor/three.module.js';
import {FxRuntime} from '../../gtfx/core.js';
import {FxActionPlayer} from '../../gtfx/action-player.js';
import {FxCharacterPlayer} from '../../gtfx/character-player.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon} from '../../gtfx/equipment-selection.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
const root=new URL('../../',import.meta.url),raw=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(raw(p));for(const p of ['vendor/spine-webgl.js','gtasset/core.js','gtasset/equipment.js'])runInThisContext(raw(p).toString());
const catalog=json('gtfx/assets/weapon-types.json'),reports=[];
for(const id of ['lina','maam','plaguedoctor','shuran','slimemilim','slimerimuru','xellos']){
 const native=json('gtfx/assets/native-characters/'+id+'.json'),index=json('gtfx/assets/characters/'+id+'.json'),appearance=native.profile.appearances[0],weapon=preferredWeaponSelection(native,native.profile,appearance),profile=equipmentProfile(native,native.profile,appearance,appearance,weapon,catalog),options={appearance,heroAppearance:appearance,weapon,profile,weaponEquipped:true,exclusiveWeapon:sourceExclusiveWeapon(native,profile,appearance,appearance,weapon),direction:'right',targetDistance:6,seed:12345},modules=actionModules(id,index,options,native,{[id]:native.plans}),combo=modules.find(m=>m.id==='basic-combo');assert(combo);const singles=modules.filter(m=>/^basic-\d+$/.test(m.id));assert.equal(singles.length,4);assert(Math.abs(combo.actor.end-singles.reduce((s,m)=>s+m.actor.end,0))<1e-8);const selected=[combo,...(id==='slimemilim'?[modules.find(m=>m.id==='support')]:[])],dimensions=new Map(Object.values(index.textures).map(t=>[t.url,{width:t.width,height:t.height}])),resources={textures:{},geometries:{},clear(){},setView(){},resize(){},camera:new THREE.OrthographicCamera(),cameraConfig:{}};
 await FxRuntime.prototype.load.call(resources,index,x=>x,{effect:selected.flatMap(m=>m.tracks.map(t=>t.effect)),loadImage:async url=>{const im=dimensions.get(url);assert(im,url);return im;}});
 const runtime={...resources,scene:new THREE.Scene(),screenScene:new THREE.Scene(),screenCamera:new THREE.OrthographicCamera(),seed:12345};runtime.camera.nativeViewportScale=()=>Math.SQRT1_2;runtime.characterPlayer={active:true,direction:'right',runtime,options,weapon,nativeWeapon:'',effectDefinition:FxCharacterPlayer.prototype.effectDefinition,bindNodes:FxCharacterPlayer.prototype.bindNodes};const row={id,appearance,comboEnd:combo.actor.end,comboTracks:combo.tracks.length,samples:[]};
 for(const module of selected){
  if(id==='slimemilim'&&module.id==='support'){
   const prefix='gtasset/assets/character/'+appearance,atlasText=raw(prefix+'.atlas').toString(),images=GTSpineCore.pages(atlasText).map(p=>{const b=raw('gtasset/assets/character/'+p);return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)}}),decoded=GTSpineCore.parse({spine,atlasText,bytes:raw(prefix+'_side.bytes'),images,createTexture:i=>({getImage:()=>i,setFilters(){},setWraps(){},dispose(){}})}),skeleton=GTSpineCore.createInstance(spine,decoded.data),skin=decoded.data.skins.find(s=>s.name===profile.defaultSkin)?.name||decoded.data.skins.find(s=>s.name!=='default')?.name||'default';skeleton.setSkinByName(skin);Object.assign(runtime.characterPlayer,{skeleton,skin,view:'side',group:new THREE.Group(),moduleMode:true,module,weaponSlots:[],applyPose:FxCharacterPlayer.prototype.applyPose});FxCharacterPlayer.prototype.prepareBoneTracks.call(runtime.characterPlayer,module);assert(module.tracks.find(t=>t.link.bone==='fx_follow').link.bonePath?.length||module.tracks.find(t=>t.link.bone==='fx_follow').link.motionPath?.length,'Prepared exact source bone follower');
  }
  const player=new FxActionPlayer(runtime);player.load(module,options);const time=module.id==='support'?.42:.25;player.sample(time);let visibleParticles=0;for(const entry of player.entries){visibleParticles+=entry.sim.particles.filter(p=>p.mesh.visible).length;for(const node of entry.sim.nodes.values())assert(node.matrixWorld.elements.every(Number.isFinite),id+' '+entry.track.effect.preset);}
  row.samples.push({module:module.id,time,visibleParticles,actor:sampleGraphPath(module.actor.graphPath,time)});
  if(id==='slimemilim'&&module.id==='support'){const proj=player.entries.find(e=>e.track.effect.preset==='fx_m_slimemilim_support_proj'),expected=sampleGraphPath(proj.track.link.uniformScalePath,.42)[0],rootScale=proj.sim.nodeRoot.scale.toArray();assert(expected>0);assert(Math.abs(rootScale[0]/proj.track.link.rootScaleX-expected)<1e-5);row.scale={time:.42,expected,actual:rootScale};}
  player.clear();
 }
 if(id==='shuran'){const role=modules.find(m=>m.id==='role');assert.equal(role.sourceTrace.launch,.2);assert.equal(role.sourceTrace.buffAt,.4);row.pill=role.sourceTrace;}
 if(id==='plaguedoctor'){const cwp=modules.find(m=>m.id==='cwp');assert.equal(cwp.actor.end,.3);assert.equal(cwp.sourceTrace.fieldEnd,2.4);row.field=cwp.sourceTrace;}
 reports.push(row);for(const t of Object.values(resources.textures))t.dispose();for(const g of Object.values(resources.geometries))g.dispose();
}
writeFileSync('E:/GTFiles/fx-batch5-b-mechanisms.json',JSON.stringify({passed:true,reports,browserOperations:0,pixelsRead:0},null,2)+'\n');console.log(JSON.stringify({passed:true,reports}));

