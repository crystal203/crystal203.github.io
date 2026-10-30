// One source-defined right/distance6 scene, including the authored embedded Spine.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {actionModules} from '../../gtfx/action-modules.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),json=p=>JSON.parse(read(p));
const n=json('gtfx/assets/native-characters/whitedaygirgas.json'),i=json('gtfx/assets/characters/whitedaygirgas.json'),o={appearance:n.profile.defaultSkin,heroAppearance:n.profile.defaultSkin,profile:n.profile,weapon:n.profile.weapon,direction:'right',targetDistance:6};
const ms=actionModules('whitedaygirgas',i,o,n,{whitedaygirgas:n.plans}),support=ms.find(m=>m.id==='support'),cwp=ms.find(m=>m.id==='cwp'),combo=ms.find(m=>m.id==='basic-combo');
assert.equal(ms.length,6);assert.equal(combo.actor.end,1.3);assert.equal(support.actor.end,1.25);assert.equal(cwp.actor.end,.5);
const horse=support.tracks.find(t=>t.effect.preset==='fx_m_whiteday_girgas_support_pinata');
assert.deepEqual(sampleGraphPath(support.actor.graphPath,.1),[1,0,0]);assert.deepEqual(sampleGraphPath(support.actor.graphPath,.94),[1,0,0]);assert.deepEqual(sampleGraphPath(support.actor.graphPath,.95),[0,0,0]);
assert.deepEqual(sampleGraphPath(horse.link.motionPath,.6),[1.8,.03,-.3]);assert.deepEqual(sampleGraphPath(horse.link.motionPath,1.05),[6,.03,-.3]);assert.equal(horse.link.fxEnd,1.25);assert.equal(horse.link.skeletonClips[0].loop,true);assert.equal(horse.link.skeletonAlpha[0].duration,.15);
assert(support.tracks.some(t=>t.effect.preset==='fx_m_whiteday_girgas_support_explosion'&&t.link.delay===1.05));
assert.equal(cwp.tracks.find(t=>t.effect.preset==='fx_cwp_whiteday_girgas_attack').link.delay,.3);assert(Math.abs(sampleGraphPath(cwp.actor.graphPath,.3)[0]-2.5)<1e-9);assert.equal(sampleGraphPath(cwp.actor.spinePath,.3)[1],0);assert.equal(Math.max(...cwp.actor.spinePath.map(p=>p.position[1])),3);
for(const p of ['vendor/spine-webgl.js','gtasset/core.js'])runInThisContext(read(p));
const s=horse.effect.skeletons[0],decoded=GTSpineCore.parse({spine,atlasText:s.atlas,bytes:Buffer.from(s.bytes,'base64'),images:s.textures.map(k=>({width:i.textures[k].width,height:i.textures[k].height})),createTexture:image=>new spine.FakeTexture(image)});
const animation=decoded.data.findAnimation(horse.link.skeletonIdle);assert(animation);const instance=GTSpineCore.createInstance(spine,decoded.data);animation.apply(instance,0,.2,true,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);instance.updateWorldTransform();assert(instance.bones.every(b=>[b.worldX,b.worldY,b.a,b.b,b.c,b.d].every(Number.isFinite)));decoded.dispose();
assert(i.materialValidation.passed);console.log(JSON.stringify({passed:true,modules:ms.map(m=>m.id),comboEnd:combo.actor.end,supportEnd:support.actor.end,horseHold:sampleGraphPath(horse.link.motionPath,.6),horseTarget:sampleGraphPath(horse.link.motionPath,1.05),pinataAnimation:horse.link.skeletonIdle,sourceBodyPoseFinite:true,materialValidation:i.materialValidation,browserOperations:0,pixelsRead:0}));
