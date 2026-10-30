import fs from 'node:fs';import assert from 'node:assert/strict';import * as THREE from '../../vendor/three.module.js';import {FxRuntime} from '../../gtfx/core.js';import {materialBlend,materialColorGain} from '../../gtfx/material-blend.js';
const read=p=>JSON.parse(fs.readFileSync(p)),index=read('gtfx/assets/characters/legendaryhero.json');
const materials=e=>[...e.systems,...e.statics].flatMap(s=>[s.material,s.trailMaterial,...s.materials||[]]).filter(Boolean);
const role=index.effects.find(e=>e.preset==='fx_m_legendaryhero_role'),screen=index.effects.find(e=>e.preset==='fx_cwp_lenendaryhero_screen');
const line=materials(role).find(m=>m.name==='FX_Cyc_line03'),ring=materials(screen).find(m=>m.name==='FX_Electric_wave_yellow');
assert.deepEqual(line.nativeBlend,[5,1]);assert.deepEqual(ring.nativeBlend,[5,1]);assert(ring.mask?.texture);assert(index.textures[ring.mask.texture]);
const fixture={index,textures:{white:new THREE.Texture()}};
for(const src of [line,ring,...materials(index.effects.find(e=>e.preset==='fx_cwp_lenendaryhero_explosion')).filter(m=>m.nativeBlend?.[0]===3)]){
 const mat=FxRuntime.prototype.createMaterial.call(fixture,src);assert.equal(mat.uniforms.additive.value,true,src.name);assert.equal(mat.blendDst,THREE.OneFactor);assert.equal(mat.uniforms.nativeSourceFactor.value,src.nativeBlend[0]);assert.equal(mat.uniforms.masked.value,!!src.mask);mat.dispose();
}
assert.equal(materialBlend({nativeBlend:[3,10]}).source,3);assert.equal(materialBlend({nativeBlend:[1,0]}).opaque,true);assert.throws(()=>materialBlend({name:'unsupported',nativeBlend:[7,2]}));
assert.equal(materialColorGain({shader:'Effect/Mask_Additive_Blend_2Tex',colorGain:2}),4);
assert.equal(materialColorGain({shader:'Effect/Mask_Alphablend_Tint',colorGain:1}),2);
console.log(JSON.stringify({passed:true,checks:['shield streak source blending','weapon ring mask binding','SrcColor additive shader uniforms','unsupported blending rejected','native mask RGBA multipliers'],imageTests:0}));
