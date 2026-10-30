import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,sourceExclusiveWeapon} from '../../gtfx/equipment-selection.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
import {runInThisContext} from 'node:vm';
import * as THREE from '../../vendor/three.module.js';
import {createParticleSimulation} from '../../gtfx/core.js';
const base=new URL('../../',import.meta.url),snapshots={},read=path=>{const raw=readFileSync(new URL(path,base));snapshots[path]=createHash('sha256').update(raw).digest('hex');return JSON.parse(raw);};
runInThisContext(readFileSync(new URL('vendor/spine-webgl.js',base),'utf8'));runInThisContext(readFileSync(new URL('gtasset/core.js',base),'utf8'));
const native=read('gtfx/assets/native-characters/rudolph.json'),index=read('gtfx/assets/characters/rudolph.json'),catalog=read('gtfx/assets/weapon-types.json'),hero='rudolph_5',records=[];
const atlasText=readFileSync(new URL('gtasset/assets/character/rudolph.atlas',base),'utf8'),bytes=readFileSync(new URL('gtasset/assets/character/rudolph_side.bytes',base));
const decoded=GTSpineCore.parse({spine,atlasText,bytes,images:GTSpineCore.pages(atlasText).map(()=>({width:4096,height:4096})),createTexture:image=>new spine.FakeTexture(image)});
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
for(const weapon of ['cwp_rudolph2','cwp_rudolph']){
 const profile=equipmentProfile(native,native.profile,hero,hero,weapon,catalog),options={appearance:hero,heroAppearance:hero,weapon,profile,exclusiveWeapon:sourceExclusiveWeapon(native,profile,hero,hero,weapon),weaponEquipped:true,direction:'right',targetDistance:6,seed:12345};
 const modules=actionModules('rudolph',index,options,native,{rudolph:native.plans}),get=id=>{const m=modules.find(m=>m.id===id);assert.ok(m,id);return m;},cwp=get('cwp'),support=get('support');
 if(weapon==='cwp_rudolph2'){
  assert.equal(get('basic-1').sourceTrace.operation,'persistent-spin');near(get('basic-continuous').actor.end,1.2);assert.equal(support.sourceTrace.operation,'clone-rush');
  near(cwp.actor.end,.5);near(cwp.sourceTrace.field.spawn,.25);near(cwp.sourceTrace.field.stop,.85);near(cwp.sourceTrace.field.death,1.05);near(cwp.sourceTrace.field.finish[0],11);assert.ok(cwp.tracks.filter(t=>/_(proj|trail)$/.test(t.effect.preset)).every(t=>t.link.fxEnd>=1.05));
  assert.deepEqual(sampleGraphPath(support.actor.graphPath,1),[0,0,0]);near(sampleGraphPath(support.actor.graphPath,.55)[0],6);near(sampleGraphPath(support.actor.graphPath,.65)[0],10);assert.ok(!modules.some(m=>m.id==='role'));
  const clone=support.tracks.filter(t=>t.effect.preset==='fx_m_rudolph2_support_spine');assert.equal(clone.length,2);assert.ok(clone.every(t=>t.effect.skeletons?.length));
  for(const t of clone){
   const effect={...t.effect,skeletonIdle:t.link.skeletonIdle,skeletonView:t.link.skeletonView,skeletonFlip:t.link.skeletonFlip,skeletonAlpha:t.link.skeletonAlpha},textures=Object.fromEntries(effect.skeletons.flatMap(s=>s.textures).map(k=>[k,new THREE.Texture({width:index.textures[k].width,height:index.textures[k].height})]));
   const sim=createParticleSimulation(effect,{textures:{...textures,white:new THREE.Texture()},geometries:{},index,camera:new THREE.OrthographicCamera()});sim.sample(.2);assert.equal(sim.skeletonEffects.length,1);const meshes=sim.group.children.filter(c=>c.isInstancedMesh);assert.ok(meshes.length);assert.ok(meshes.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)));sim.clear();
  }
 }else{
  near(get('basic-combo').actor.end,2.005);assert.equal(support.sourceTrace.operation,'native-apex-grenade');near(support.sourceTrace.flight.start[1],.375);near(support.sourceTrace.flight.arrival,.5);
  near(get('role').sourceTrace.charge.sourceMaxDistance,6);near(cwp.actor.end,.3);assert.ok(cwp.duration>=4.2);assert.deepEqual(cwp.sourceTrace.sleighTimings,[.8,2.9]);assert.equal(cwp.sourceTrace.impacts.length,8);assert.equal(cwp.tracks.filter(t=>t.effect.preset==='fx_cwp_rudolph_groundhit').length,24);assert.ok(cwp.tracks.some(t=>t.link.delay===2.9));
 }
 for(const m of modules)for(const c of m.actor.clips)assert.ok(decoded.data.findAnimation(c.name)||decoded.data.findAnimation(c.name+'_side'),'missing source clip '+c.name);
 records.push({weapon,modules:modules.map(m=>({id:m.id,end:m.actor.end,tracks:m.tracks.length,duration:m.duration,operation:m.sourceTrace?.operation})),cwpTrace:cwp.sourceTrace,supportTrace:support.sourceTrace});
}
decoded.dispose();
for(const file of ['gtfx/source-reindeer-actions.js','tools/fx/native_script_reindeer.py'])snapshots[file]=createHash('sha256').update(readFileSync(new URL(file,base))).digest('hex');
const out={format:'source-reindeer-fixed-scenes',scope:'Two actual UI source-weapon activation branches, one fixed right-facing 6-unit target scene; no browser, screenshot, pixel read, skin sweep or visual acceptance',records,inputSnapshots:snapshots};
const output=process.argv.indexOf('--output');if(output>=0)writeFileSync(process.argv[output+1],JSON.stringify(out,null,2));console.log(JSON.stringify({passed:true,scenes:records.map(r=>({weapon:r.weapon,modules:r.modules}))}));
