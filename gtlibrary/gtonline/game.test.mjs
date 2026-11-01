import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadStageCatalog,loadStage} from './stages/registry.js';
import {OnlineGame} from './game.js';
import {restore,saveKey} from './progress.js';

globalThis.GTResources={fetch:async url=>new Response(await readFile(url))};
const entries=await loadStageCatalog();
const {stage,Game}=await loadStage(entries[0]);

function fixture(GameClass=OnlineGame){
 const records=stage.objects.map(o=>({tile:o,position:{x:o.position[0],y:o.position[1],z:-o.position[2]},visible:true}));
 const events={characters:{warm:async()=>{}},time:0,duration:0,playing:false,
  async load(plan){this.plan=plan;this.duration=plan.duration;},
  play(){this.playing=!this.playing;},seek(t){this.time=t;},finish(){this.plan=null;this.playing=false;},stop(){this.finish();},advanceDialogue(){this.advanced=true;}};
 const runtime={events,frameListeners:new Set(),getWorldRecords:()=>records,
  async createActor(spec){return {position:{x:spec.position[0],y:spec.position[1],z:-spec.position[2]},visible:spec.visible,character:{settings:{}}};},
  setWorldPosition(r,p){r.position={x:p[0],y:p[1],z:-p[2]};},
  setWorldVisible(r,value){r.visible=value;},setActorState(r,s){Object.assign(r.character.settings,s);},
  setWorldGimmick(){},playWorldGimmick(){},restartActorAnimation(){},setWorldNodeTransform(){},focusWorld(){},clearWorldSpeech(){},
  spawnWorldEffect:()=>({dispose(){}}),spawnWorldItem:()=>({setPose(){},dispose(){}})};
 const saves=new Map(),game=new GameClass(runtime,structuredClone(stage),{storage:{setItem:(k,v)=>saves.set(k,v)}});
 return {game,runtime,saves};
}

test('the playable catalog loads the inn and its full object bindings',()=>{
 assert.deepEqual(entries.map(e=>e.id),['1-1']);
 const {game}=fixture(Game);
 assert.deepEqual(game.bindingErrors,[]);
 assert.deepEqual(stage.totals,{coins:26,stars:3,chests:4});
 game.dispose();
});

test('the inn opening can start, pause, skip, and save for continuing',async()=>{
 const {game,runtime,saves}=fixture(Game);
 await game.start();
 assert.equal(game.mode,'scene');
 assert.equal(game.currentScene,'opening');
 game.pause();assert.equal(game.mode,'paused');
 await game.skipScene();
 assert.equal(game.mode,'play');
 assert.ok(game.has('opening'));
 assert.ok(restore(stage,saves.get(saveKey(stage))));
 assert.equal(runtime.frameListeners.size,1);
 game.dispose();assert.equal(runtime.frameListeners.size,0);
});

test('movement, running and normal attacks work without tutorial controllers',async()=>{
 const {game}=fixture();
 await game.start();
 const from=game.state.position.slice();
 game.keys.add('d');game.tick(0);game.tick(.05);
 assert.ok(game.state.position[0]>from[0]);
 game.keys.add(' ');assert.ok(game.isDashing());
 game.keys.clear();game.direction='right';
 const p=game.state.position,r={position:{x:p[0]+.5,y:p[1],z:-p[2]},character:{settings:{}}};
 game.enemies.push({handle:'test-enemy',record:r,hp:45,group:'test'});
 game.attack();game.attackFrame();
 assert.equal(game.enemies[0].hp,27);
 game.dispose();
});

test('holding, throwing and floor-switch contacts still operate',async()=>{
 const {game}=fixture();await game.start();
 const pot=game.objects.find(o=>o.spec.Holdable),floor=game.objects.find(o=>o.kind==='switch');
 assert.ok(pot);assert.ok(floor);
 game.near=()=>pot;game.interact();assert.equal(game.carrying,pot);
 game.clock+=1;game.interact();assert.equal(game.carrying,null);assert.equal(game.thrown.length,1);
 game.clock+=1;game.objectTick(.05);assert.equal(game.thrown.length,0);
 game.state.position=floor.position.slice();game.runtime.setWorldPosition(game.player,game.state.position);
 game.switches.update();assert.ok(game.switches.on.has(floor.id));
 game.dispose();
});

test('inn dialogue branches and loot dismissal retain their behavior',async()=>{
 const {game,runtime}=fixture();await game.start();
 game.scenePlan=structuredClone(stage.scenes.section_4_1);
 const choice=game.scenePlan.commands.find(c=>c.op==='choice');assert.ok(choice);
 game.mode='scene';runtime.events.choiceCommand=choice;
 await game.choose(0);assert.equal(runtime.events.plan.waitForDialogue,true);
 assert.equal(runtime.events.playing,true);
 game.mode='loot';game.loot={popup:{ItemId:30017},popupAt:game.clock};
 game.clock+=2;game.dismissItem();assert.equal(game.mode,'play');assert.equal(game.loot,null);
 game.dispose();
});
