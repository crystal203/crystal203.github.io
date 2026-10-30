import fs from 'node:fs';
import assert from 'node:assert/strict';
import {actionModules} from '../../gtfx/action-modules.js';
import {nativeGrenadeFlight,nativeApexFlight} from '../../gtfx/native-grenade-operations.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const index=read('gtfx/assets/characters/madscientist.json'),native=read('gtfx/assets/native-characters/madscientist.json');
const originalFlask=index.effects.find(e=>e.preset==='fx_m_dark_flask');assert.equal(originalFlask.statics.length,2);assert.ok(originalFlask.statics.every(s=>index.sprites[s.sprite]&&s.customSprite.atlasFrameKey==='dark_energy_plask'));
// One native source scene, one appearance and one facing; no image comparison.
const modules=actionModules('madscientist',index,{appearance:'mad_scientist_myth',heroAppearance:'mad_scientist_myth',weapon:'cwp_madscientist_myth',targetPosition:[3,0,0],direction:'right',profile:native.profile},native,{madscientist:native.plans});
const byId=id=>modules.find(m=>m.id===id),normal=byId('basic-1'),last=byId('basic-break'),magazine=byId('basic-magazine'),support=byId('support'),cwp=byId('cwp'),role=byId('role');
assert.equal(normal.actor.end,.5);assert.equal(normal.actor.clips[0].end,.33);
assert.ok(normal.tracks.some(t=>t.effect.preset==='fx_m_mad_scientist_ascent_flask'));
assert.ok(last.tracks.some(t=>t.effect.preset==='fx_m_mad_scientist_ascent_flask_break'));
assert.equal(magazine.magazine.count,10);assert.equal(magazine.actor.end,5);
assert.equal(magazine.tracks.filter(t=>t.effect.preset==='fx_m_mad_scientist_ascent_flask').length,9);
assert.equal(magazine.tracks.filter(t=>t.effect.preset==='fx_m_mad_scientist_ascent_flask_break').length,1);
assert.equal(support.nativeGrenade.flightDuration,.8);assert.equal(cwp.nativeGrenade.flightDuration,.8);
assert.ok(cwp.tracks.some(t=>t.effect.preset==='fx_cwp_mad_scientist_ascent_screen'));
assert.ok(cwp.actor.clips.some(c=>c.track==='Emotion'&&c.name==='burning'));
assert.equal(role.tracks[0].effect.preset,'fx_m_mad_scientist_role_cast');
assert.ok(role.graphTrace.events.some(e=>e.type==='BuffAddListen'&&e.buffId===3300311&&e.target==='owner'));
const ordinary=nativeGrenadeFlight({start:[.5,0,0],end:[3,0,0]}),apex=nativeApexFlight({start:[0,0,0],end:[3,0,0]});
assert.equal(ordinary.duration,.8);assert.deepEqual(ordinary.position,[3,0,0]);
assert.ok(Math.abs(ordinary.path.find(p=>p.time===.4).position[1]-2.5)<1e-9);
assert.ok(Math.abs(apex.gravity-37.5)<1e-9);assert.ok(Math.abs(apex.path.find(p=>p.time===.4).position[1]-3)<1e-9);
for(const m of modules){assert.ok(Number.isFinite(m.duration));for(const row of [...m.actor.graphPath||[],...m.actor.spinePath||[],...m.tracks.flatMap(t=>t.link.motionPath||[])])assert.ok(row.position.every(Number.isFinite));}
console.log(JSON.stringify({passed:true,modules:modules.map(m=>({id:m.id,tracks:m.tracks.length,end:m.actor.end,duration:m.duration})),magazine:magazine.magazine,ordinaryFlight:ordinary.duration,supportGravity:apex.gravity,imageTests:0}));
