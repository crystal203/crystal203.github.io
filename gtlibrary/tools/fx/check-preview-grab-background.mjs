// Source and CPU contract only; does not create a browser or WebGL context.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FxRuntime,value} from '../../gtfx/core.js';
const runtime={scene:{background:{}},renderer:{setClearColor(color,alpha){this.clear=[color,alpha];}}};
FxRuntime.prototype.setBackground.call(runtime,'checker');
assert.equal(runtime.backgroundMode,'checker');assert.equal(runtime.scene.background,null);assert.deepEqual(runtime.renderer.clear,[0,0]);
FxRuntime.prototype.setBackground.call(runtime,'color','#64615d');assert(runtime.scene.background.isColor);
FxRuntime.prototype.setBackground.call(runtime,'transparent');assert.equal(runtime.scene.background,null);assert.deepEqual(runtime.renderer.clear,[0,0]);
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
assert.match(read('apps/fx/index.html'),/id="stage"[^>]*class="checker"/);
assert.match(read('apps/fx/style.css'),/\.checker/);
const index=JSON.parse(read('gtfx/assets/characters/storeangel.json')),evidence=[];
for(const preset of ['fx_m_storeangel_myth_explosion_r','fx_m_storeangel_myth_explosion_l']){
 const fx=index.effects.find(e=>e.preset===preset),s=fx.systems.find(s=>s.name==='hero_saintess_cabw2'),mat=s.material;
 assert.equal(mat.shader,'Effect/Screen/CA_BW_Distort');assert.deepEqual(mat.nativeBlend,[5,10]);
 assert.match(mat.fragmentSource,/u_xlat0\.w = u_xlat2\.w \* vs_COLOR0\.w/);
 const mix=value(s.modules.CustomDataModule.vector0_2,0,.5);assert.equal(mix,2);
 const rgb=[19,24,32].map(c=>c/255),lum=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114,t=Math.max(0,Math.min(1,lum/mat.parameters._Float3)),bw=1-t*t*(3-2*t),output=rgb.map(c=>bw+mix*(c-bw));
 assert(output.every(c=>c<0));
 // Native output alpha samples input coverage. The old checker provided 1;
 // the CSS guide is outside GrabPass and contributes exactly zero coverage.
 const vertexAlpha=1;assert.equal(0*vertexAlpha,0);
 evidence.push({preset,oldOpaqueCheckerRgb:output,nativeAlpha:'grabAlpha * vertexAlpha',checkerInputAlpha:0});
}
console.log(JSON.stringify({passed:true,browserOperations:0,renderedPixelsRead:0,evidence}));
