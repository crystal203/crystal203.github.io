import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.js';
import {nativeDeviation,nativeSquish,nativeColorPulse} from '../../gtmap/spine-motion.js';
import {MapEventPlayer} from '../../gtmap/event-player.js';
import {MapCharacters} from '../../gtmap/characters.js';
import {SealedKingdomController} from '../../gtonline/stages/forest-entrance/sealed-kingdom.js';
const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-1-2.json',import.meta.url),'utf8'));
const plan=stage.scenes.sealed_kingdom,commands=plan.commands;
const talks=commands.filter(c=>c.op==='dialogue');
assert.deepEqual(talks.map(c=>c.code),Array.from({length:10},(_,i)=>'stage_event_forest_1_2_'+i));
assert.equal(talks[0].at,8);assert.equal(talks[0].typeSpeed,Math.fround(.05));
assert.deepEqual(commands.filter(c=>c.op==='camera').map(c=>c.duration),[3,2,.5]);
assert.deepEqual(commands.find(c=>c.op==='camera').position,[Math.fround(50.7),0,60]);
assert.equal(commands.filter(c=>c.op==='camera').at(-1).follow,'leader');
const hit=commands.find(c=>c.op==='squish'),attack=commands.find(c=>c.op==='pose'&&c.animation==='attack');
assert.equal(hit.at-attack.at,Math.fround(.2));
assert.equal(hit.frequency,1);assert.equal(hit.broad,Math.fround(1.2));assert.equal(hit.narrow,Math.fround(.8));
assert.equal(commands.filter(c=>c.op==='sound'&&c.name==='01_hit_comic_01').length,1);
const girl=commands.find(c=>c.op==='deviate'&&c.target==='kid_girl2');assert.equal(girl.duration,2*Math.fround(.2));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,actual+' != '+expected);
near(nativeDeviation([.2,0,0],.05,.1,.1)[0],.2*Math.SQRT1_2);
near(nativeDeviation([.2,0,0],.15,.1,.1)[0],.1);
assert.deepEqual(nativeDeviation([.2,0,0],.2,.1,.1),[0,0,0]);
const squeeze=nativeSquish(1.2,.8,1,.06,.3,.2,.6);near(squeeze[0],.8);near(squeeze[1],1.2);
const opposite=nativeSquish(1.2,.8,1,.18,.3,.2,.6);near(opposite[0],1.2);near(opposite[1],.8);
assert.deepEqual(nativeSquish(1.2,.8,1,.3,.3,.2,.6),[1,1,1]);
const target=stage.nativeMechanics.spineMotion.damageColor.value;
assert.deepEqual(nativeColorPulse(target,1,1,.15,.3),[1,0.3500000238418579,0.3500000238418579]);
assert.deepEqual(nativeColorPulse(target,1,1,.3,.3),[1,1,1]);
// Real timeline evaluation combines motions without moving the character's collider.
const player=new MapEventPlayer({}),record={tile:{}};player.baselines=new Map([[record,{position:[1,1,2],visible:true,settings:{animation:'idle'}}]]);
const pose=player.evaluateActor(record,[{...hit,at:0},{...commands.find(c=>c.op==='colorPulse'),at:0}],.06);
assert.deepEqual(pose.position,[1,1,2]);near(pose.settings.spineScale[0],.8);
// Renderer per-axis scale retains the old matrix when the new channel is absent.
const characters=Object.create(MapCharacters.prototype);characters.camera=new THREE.OrthographicCamera();characters.camera.nativeViewportScale=()=>.5;
const e={scale:.02,settings:{direction:'left'}};const original=characters.matrix(e).elements;
near(original[0],-.02);near(original[5],.04);
e.settings.spineScale=[.8,1.2,1];const scaled=characters.matrix(e).elements;near(scaled[0],-.016);near(scaled[5],.048);
// Persist native key 1 before starting a performance; interruption must not replay it.
let disposed=0,saved;const flags=[];
const game={stage,state:{position:stage.regions.sealed_kingdom.center},clock:0,hudVisible:true,music:stage.music.field,
 has:k=>flags.includes(k),flag:k=>flags.push(k),save(){saved={flags:flags.slice(),hud:this.hudVisible};},
 runtime:{spawnWorldEffect(name,p){assert.equal(name,'bg_sealedkingdom');assert.deepEqual(p,[Math.fround(50.7),0,59.5]);return{dispose(){disposed++;}};}}};
const controller=new SealedKingdomController(game);await controller.prepare();assert.equal(controller.nextScene(),'sealed_kingdom');
controller.beforeScene('sealed_kingdom');assert.deepEqual(saved,{flags:['native-custom-data:1'],hud:false});assert.equal(game.music,'bgm_sealed_castle');
assert.equal(new SealedKingdomController(game).nextScene(),null);
controller.afterScene('sealed_kingdom');assert.equal(game.hudVisible,true);assert.equal(game.music,stage.music.field);
controller.dispose();controller.dispose();assert.equal(disposed,1);
assert.equal(stage.audit.storyParityCertified,false);
console.log('PASS source dialogue/camera/callback order, native motion sample values, collider independence, renderer defaults, stage key-1 interruption/reentry, HUD/music restoration and disposal.');
