import {restoreInn as restore} from '../../gtonline/stages/inn-progress.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.js';
import {InnGame as OnlineGame} from '../../gtonline/stages/inn.js';
import {fresh,isTreasure} from '../../gtonline/progress.js';
import {StageMiniMap} from '../../gtonline/native-minimap.js';
const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-1-1.json',import.meta.url),'utf8'));
const records=stage.objects.map(o=>({tile:{id:o.id},position:new THREE.Vector3(o.position[0],o.position[1],-o.position[2]),visible:true}));
let hud;const fx=[];const runtime={events:{},frameListeners:new Set(),getWorldRecords:()=>records,async createActor(s){return {visible:s.visible,position:new THREE.Vector3(s.position[0],s.position[1],-s.position[2]),character:{settings:{direction:'front',animation:'idle'}}};},setWorldPosition(r,p){r.position.set(p[0],p[1],-p[2]);},setActorState(r,s){Object.assign(r.character.settings,s);},setWorldVisible(r,v){r.visible=v;},setWorldGimmick(){},playWorldGimmick(){},focusWorld(){},clearWorldSpeech(){},spawnWorldEffect(n,p,o){fx.push([n,p,o]);return{dispose(){}};},restartActorAnimation(){},actorSpineEffectPosition(){return [17.5,0,-12];}};
const saved=fresh(stage);saved.flags=['opening','section_2','first_fight','sword','gloves','dragon_intro','princess_run_2','section_4_1','section_4_2','section_5'];saved.position=[17.5,0,-12];saved.lit=[];
const g=new OnlineGame(runtime,stage,{saved,storage:null,onChange:s=>hud=s});g.player=await g.actor('leader');runtime.setWorldPosition(g.player,g.state.position);g.mode='play';g.clock=2;g.lastTime=2;
// Opposite movement input must not turn an active first/fourth hit or its effect.
for(const comboIndex of [-1,2]){g.direction='right';g.attackUntil=g.clock-.001;g.comboIndex=comboIndex;g.attack();const start=g.state.position.slice();g.keys.add('a');g.tick(g.lastTime+.05);assert.equal(g.direction,'right');assert.equal(g.player.character.settings.direction,'right');assert.equal(g.pendingAttack.direction,'right');assert.deepEqual(g.state.position,start);g.keys.clear();g.clock=g.attackUntil+.01;}
g.keys.add('a');g.tick(g.lastTime+.05);assert.equal(g.direction,'left');g.keys.clear();
// Real room gate: outside member enters with battle preparation, with no combat trail backlog.
const r=await g.actor('maiden');runtime.setWorldPosition(r,[32.5,0,-37.6]);g.state.position=[32.5,0,-38.5];runtime.setWorldPosition(g.player,g.state.position);g.joinParty('maiden');g.direction='front';await g.battle('room_3');const f=g.partyFollowers.get('maiden');assert.ok(f.jump,'outside member gets battle preparation');for(let i=0;i<180;i++){g.state.position=[32.5+Math.sin(i/15)*.3,0,-39.5];g.updateParty(.025);assert.equal(f.ops.length,0);}assert.ok(-r.position.z<-38.22,'member crosses the closed gate into the arena');g.completeBattle('room_3');assert.equal(f.ops.length,0);
// Native wall cells render dark and hidden cells do not leak.
const map=new StageMiniMap({collision:{floors:[[0,0,0]]},nativeMechanics:{minimapWalls:[[1,0],[20,20]]},camera:{span:2}},{state:{explored:[],position:[0,0,0]},objects:[],aspect:1});const draws=[],ctx={clearRect(){},fillRect(...p){draws.push([this.fillStyle,...p]);},drawImage(){}};map.draw({width:60,height:60,getContext:()=>ctx});assert.equal(draws.filter(d=>d[0]==='rgba(91,100,29,.752941)').length,1);assert.ok(!map.visible.has('20,20'));
// Native treasure list is glove box + sword + shield + costume, including restored saves.
const treasures=stage.objects.filter(isTreasure);assert.deepEqual(treasures.map(o=>o.handle).sort(),['costume','mole_glove_box','shield','sword']);g.state.collected=treasures.map(o=>o.id);g.state=restore(stage,g.state);g.emit();assert.equal(hud.chests,4);assert.ok(!isTreasure(stage.objects.find(o=>o.id==='7:337')));
// Running crash restores the visual offset after the native bounce/pulse time.
g.state.position=[17.5,0,-12];runtime.setWorldPosition(g.player,g.state.position);const hp=g.state.health;g.direction='right';g.bounceFromRun(g.state.position,[18,0,-12]);assert.equal(g.knockback.duration,stage.nativeMechanics.runCollision.bounceTime);assert.equal(g.state.health,hp);g.clock+=g.knockback.duration;g.tick(g.lastTime+.01);assert.equal(g.knockback,null);assert.deepEqual(g.player.character.settings.spineOffset,[0,0,0]);
console.log('PASS minimal smoke: attack direction lock/release; room entry and no follower backlog; native minimap wall/fog; 4 treasure items after restore; run bounce cleanup.');
