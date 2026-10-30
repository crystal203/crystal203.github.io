import assert from 'node:assert/strict';
import {readFileSync as readFile} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon} from '../../gtfx/equipment-selection.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
const root=new URL('../../',import.meta.url),raw=p=>readFile(new URL(p,root)),json=p=>JSON.parse(raw(p)),catalog=json('gtfx/assets/weapon-types.json'),receipts=[];
for(const p of ['vendor/spine-webgl.js','gtasset/core.js'])runInThisContext(raw(p).toString());
for(const id of ['stark','frieren']){
 const n=json('gtfx/assets/native-characters/'+id+'.json'),index=json('gtfx/assets/characters/'+id+'.json'),hero=n.profile.appearances[0],weapon=preferredWeaponSelection(n,n.profile,hero),profile=equipmentProfile(n,n.profile,hero,hero,weapon,catalog),ms=actionModules(id,index,{profile,appearance:hero,heroAppearance:hero,weapon,exclusiveWeapon:sourceExclusiveWeapon(n,profile,hero,hero,weapon),weaponEquipped:true,direction:'right',targetDistance:6},n,{[id]:n.plans}),get=k=>{const v=ms.find(m=>m.id===k);assert(v,k);return v;};
 assert(index.materialValidation.passed);assert.equal(n.sourcePlanResolution.legacyFallbackActions.length,0);
 if(id==='stark'){
  assert.equal(get('basic-combo').actor.end,1.8);assert.equal(get('basic-3').tracks[0].link.delay,.65);
  const support=get('support');assert.equal(sampleGraphPath(support.actor.graphPath,.2)[0],5.5);assert(Math.abs(sampleGraphPath(support.actor.graphPath,.7)[0])<1e-9);assert.equal(support.tracks.find(t=>t.effect.preset.endsWith('slash')).link.delay,.2);
  const c=get('cwp');assert.equal(sampleGraphPath(c.actor.graphPath,.2)[0],3);assert.equal(sampleGraphPath(c.actor.spinePath,.55)[1],3);assert(c.tracks.some(t=>t.link.screen&&t.link.delay===.6));
 }else{
  const b=get('basic-1'),body=b.tracks.filter(t=>t.effect.preset==='fx_m_frieren_1st_proj');assert.equal(body.length,2);assert.equal(body[0].link.delay,.15);assert.equal(body[1].link.delay,.3);assert(body[0].link.motionPath[0].position.every((v,i)=>Math.abs(v-[.5,.375,.21][i])<1e-6));assert(!b.tracks.some(t=>t.link.delay>.3&&t.effect.preset==='fx_m_frieren_1st_hit'&&b.tracks.filter(s=>s.link.delay===t.link.delay&&s.effect.preset===t.effect.preset).length>1));
  assert(get('basic-combo').actor.nativeAim);assert.equal(get('basic-3').tracks.find(t=>t.effect.preset==='fx_m_frieren_3rd_laser').link.delay,.4);assert.equal(get('support').tracks.find(t=>t.effect.preset==='fx_m_frieren_support_explosion').link.delay,.6);
  const c=get('cwp'),explosions=c.tracks.filter(t=>t.effect.preset==='fx_cwp_frieren_explosion');assert.equal(explosions.length,3);assert(Math.abs(explosions.at(-1).link.delay-(.9+.4*2/3))<1e-9);assert(c.duration>=2);assert.equal(c.actor.end,.9);
 }
 const png=raw('gtasset/assets/character/'+hero+'.png'),atlas=raw('gtasset/assets/character/'+hero+'.atlas').toString(),decoded=GTSpineCore.parse({spine,atlasText:atlas,bytes:raw('gtasset/assets/character/'+hero+'_side.bytes'),images:[{width:png.readUInt32BE(16),height:png.readUInt32BE(20)}],createTexture:image=>new spine.FakeTexture(image)});
 for(const m of ms)for(const clip of m.actor.clips)assert(decoded.data.findAnimation(clip.name+'_side')||decoded.data.findAnimation(clip.name),'Missing source clip '+clip.name);
 if(id==='frieren'){assert(decoded.data.findBone('b.aim'));assert(decoded.data.slots.some(s=>s.name==='[base]weapon1_side'||s.name==='[base]weapon1'));}decoded.dispose();receipts.push({id,hero,weapon,modules:ms.map(m=>m.id),materialValidation:index.materialValidation});
}
console.log(JSON.stringify({passed:true,receipts,browserOperations:0,pixelsRead:0}));
