import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon,shieldAllowedForWeapon} from '../../gtfx/equipment-selection.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url))),catalog=read('gtfx/assets/weapon-types.json');
function modules(id){const n=read('gtfx/assets/native-characters/'+id+'.json'),i=read('gtfx/assets/characters/'+id+'.json'),hero=n.profile.appearances[0],weapon=preferredWeaponSelection(n,n.profile,hero),profile=equipmentProfile(n,n.profile,hero,hero,weapon,catalog),exclusiveWeapon=sourceExclusiveWeapon(n,profile,hero,hero,weapon),shield=shieldAllowedForWeapon(n,profile,hero)?profile.shield||'':'';return {n,m:actionModules(id,i,{appearance:hero,heroAppearance:hero,weapon,profile,exclusiveWeapon,shield,direction:'right',targetDistance:6},n,{[id]:n.plans})};}
const hero=modules('heroai');assert(Math.abs(hero.m.find(m=>m.id==='basic-combo').actor.end-2)<1e-8);
const white=modules('whitedruid'),tiger=white.m.find(m=>m.id==='basic-combo-tiger');assert.equal(tiger.actor.skinPath[0].skin,'metamorph');assert.equal(tiger.actor.attachmentPath[0].slot,'weapon4');assert.equal(white.m.find(m=>m.id==='role').sourceTrace.buffEnd,5);
const jade=modules('jadeshaman'),drop=jade.m.find(m=>m.id==='support').tracks.find(t=>t.effect.preset==='fx_m_jade_shaman_support_summon_spine');assert.equal(sampleGraphPath(drop.link.motionPath,.7)[1],6);assert.equal(sampleGraphPath(drop.link.motionPath,1)[1],0);assert(jade.m.some(m=>m.id==='summon-basic-combo'));
const ninja=modules('ninjaleader'),fan=ninja.m.find(m=>m.id==='basic-2').tracks.filter(t=>t.effect.preset===ninja.n.projectiles.ninja_leader_manual_proj.PresetName);assert.equal(fan.length,5);assert.equal(new Set(fan.map(t=>t.link.graphDirection[2].toFixed(4))).size,5);const cwp=ninja.m.find(m=>m.id==='cwp'),bodies=cwp.tracks.filter(t=>t.effect.preset==='fx_cwp_ninja_leader_proj');assert.equal(bodies.length,3);assert(Math.abs(sampleGraphPath(bodies[1].link.motionPath,.6)[0]-6)<1e-8);assert(Math.abs(sampleGraphPath(bodies[1].link.motionPath,.9)[0]-.5)<1e-8);
console.log(JSON.stringify({characters:['heroai','whitedruid','jadeshaman','ninjaleader'],passed:true,heroCombo:2,tigerBuff:5,jadeHeight:6,ninjaFan:5,shurikenLanes:3,shurikenTurn:.6,shurikenReturn:.9}));

