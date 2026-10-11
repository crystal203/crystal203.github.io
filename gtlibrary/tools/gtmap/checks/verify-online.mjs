import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../../vendor/three.module.js';
import {MapCollision} from '../../../gtmap/collision.js';
import {MapEventPlayer} from '../../../gtmap/event-player.js';
import {OnlineGame} from '../../../gtonline/game.js';
import {fresh,restore,nextScene,collect,distance} from '../../../gtonline/progress.js';
const stage=JSON.parse(await readFile(new URL('../../../gtonline/assets/stage-1-1.json',import.meta.url),'utf8'));
assert.equal(stage.map,'alt_forest_1_1_2_2');
{
 const floors=Array.from({length:30},(_,i)=>[i%6,Math.floor(i/6),0]),c=new MapCollision({floors,walls:[[2,0,3,4]]});
 const p=c.move([1,0,1],15,0);assert.ok(p[0]<1.79,'swept move must not tunnel through a wall');assert.ok(!c.canStand(-1,1));
 const slide=c.move([1.7,0,1],1,1);assert.ok(slide[2]>1.9&&slide[0]<1.79,'slide along the wall');
 assert.ok(Math.abs(p[0]-(2-c.radius))<.001,'contact point must not depend on step size');
 const left=c.move([1.7,0,1],.3,.6),right=c.move([1.7,0,3],.3,-.6);assert.ok(Math.abs(left[2]+right[2]-4)<.001,'symmetric wall sliding');
 c.dynamic=[{enabled:()=>true,rect:()=>[0,2,2,3]}];assert.ok(c.move([1,0,1],0,2)[2]<1.79);
}
// Native connectivity, including the source cave/stair links. Doors and rocks are removable.
{
 const c=new MapCollision(stage.collision),seen=new Set(),queue=[];
 const add=p=>{p=p.map(n=>Math.round(n*1000)/1000);p=c.nearest(p,4);if(!p)return;const key=p[0]+','+p[2]+','+p[1];if(!seen.has(key)){seen.add(key);queue.push(p);}};add(stage.spawn);
 for(let i=0;i<queue.length;i++){
  const a=queue[i];for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const b=c.move(a,dx,dz);if(Math.abs(b[0]-a[0]-dx)<1e-6&&Math.abs(b[2]-a[2]-dz)<1e-6)add(b);}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const h=c.drop(a,dx,dz);if(h)add(h);}
  for(const o of stage.objects)if(o.kind==='portal'&&distance(a,o.position)<2.1){const p=stage.markers[o.spec.Interactable.MoveStage?.OpenWaypoint];if(p)add(p);}
 }
 for(const [name,r] of Object.entries(stage.regions))assert.ok(queue.some(p=>Math.abs(p[0]-r.center[0])<r.size[0]/2&&Math.abs(p[2]-r.center[2])<r.size[2]/2),'region unreachable: '+name);
 for(const o of stage.objects.filter(o=>['coin','star','item','chest','portal'].includes(o.kind)))assert.ok(queue.some(p=>distance(p,o.position)<(o.kind==='portal'?2.1:1.7)),'object unreachable: '+o.id+' '+o.kind);
 console.log('PASS native floor/wall connectivity and all pickups/portals:',queue.length,'samples');
}
{
 const c=new MapCollision(stage.collision),up=c.move([3.5,0,10],0,3),east=c.move([61.5,0,-27.5],-3,0);
 assert.ok(Math.abs(up[2]-13)<.01&&Math.abs(up[1]-1)<.01,'north staircase must be walkable');
 assert.ok(Math.abs(east[0]-58.5)<.01&&Math.abs(east[1]-1)<.01,'east staircase must be walkable');
 assert.ok(c.onStair([3.5,.5,11]));assert.ok(c.drop([-3,1,12.3],0,-1),'native low ledge must permit downward jump');
 assert.equal(c.drop([.5,1,13.7],0,1),null,'fenced ledge must reject jump');assert.equal(c.drop([.5,0,10.7],0,1),null,'arbitrary upward jump must be rejected');
 console.log('PASS native stair ascent, stair detection, designated drops and fenced ledge rejection');
}
{const c=new MapCollision(stage.collision);assert.ok(!c.canStand(4.6,3,0),'stump western face uses native centered collider');assert.ok(c.canStand(5.8,3,0),'stump eastern path must remain open');assert.equal(c.height(5.6,3),0);console.log('PASS native tile centers align stump, walls and floor cells');}
const s=fresh(stage);assert.equal(restore(stage,'bad'),null);assert.equal(restore(stage,{...s,map:'newnew_forest_1_1'}),null);assert.equal(restore(stage,{...s,position:[NaN,0,0]}),null);assert.equal(nextScene(stage,s),'opening');assert.ok(collect(s,'coin'));assert.ok(!collect(s,'coin'));
function fixture(){
 const records=new Map(stage.objects.map(o=>[o.id,{tile:{id:o.id,name:o.name,layer:o.layer},position:new THREE.Vector3(o.position[0],o.position[1],-o.position[2]),visible:true}]));
 const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,1000);camera.position.set(0,50,50);const controls={target:new THREE.Vector3(),enableDamping:false,update(){}};
 const characters={entries:[],time:0,async prepareActor(spec){if(records.has(spec.handle))return records.get(spec.handle);const r={tile:{id:spec.handle,character:{handle:spec.handle}},position:new THREE.Vector3(...[spec.position[0],spec.position[1],-spec.position[2]]),visible:spec.visible,character:{settings:{animation:'idle',direction:'front',alpha:1}}};records.set(spec.handle,r);return r;},removePreviewActors(){},async warm(){},change(r,s){Object.assign(r.character.settings,s);},restore(r,s){r.character.settings={...s};},sample(){}};
 const selection={records,matrix(){},update(){},refresh(){},values(){return []}},player=new MapEventPlayer({selection,characters,states:{capture(){return null;},restore(){}},doors:{},camera,controls,scene:new THREE.Scene(),canvas:{focus(){}},onGroups(){}});player.mapName=stage.map;
 const runtime={events:player,frameListeners:new Set(),getWorldRecords:()=>[...records.values()],createActor:s=>characters.prepareActor(s),setWorldPosition(r,p){r.position.set(p[0],p[1],-p[2]);},setWorldVisible(r,b){r.visible=b;},setWorldGimmick(){},setActorState:(r,s)=>characters.change(r,s),focusWorld(){}};return{runtime,records,player};
}
{
 const {runtime,player,records}=fixture();let saved;const game=new OnlineGame(runtime,stage,{storage:{setItem(k,v){saved=v;}}});await game.start();
 let time=0;async function complete(key){for(let i=0;i<2000&&(game.mode!=='play'||game.currentScene);i++){time+=.1;player.sample(time);if(player.waitingDialogue)player.advanceDialogue();game.tick(time);await new Promise(r=>setImmediate(r));}assert.equal(game.mode,'play','scene stalled: '+key);assert.ok(game.has(key));}
 const wake=stage.scenes.opening.commands.find(c=>c.op==='pose'&&c.target==='leader'&&c.animation==='idle'&&c.at>0).at;for(let t=0;t<wake;t+=.1){player.seek(t);assert.equal(records.get('leader').character.settings.animation,'prostrate','rider stood up at '+t);}player.seek(0);player.playing=true;
 await complete('opening');assert.equal(player.plan,null);assert.ok(!records.get('leader').character.preview);assert.ok(saved);
 game.state.position=stage.regions.goblin_event_1.center.slice();await game.scene('section_2');assert.equal(game.mode,'play','pursuit must not lock controls');const before=game.state.position[0];game.keys.add('d');time+=.1;game.tick(time);game.keys.clear();assert.ok(game.state.position[0]>before,'player moves during pursuit');game.clock+=1;game.attack();assert.ok(game.attackUntil>game.clock,'player attacks during pursuit');const knight=game.state.position.slice();player.seek(player.duration);await game.endScene();assert.deepEqual(game.state.position,knight,'background handoff must not teleport player');await complete('section_2');assert.equal(game.groups.has('first'),false,'entry scene must not seal the room before the player crosses the gate');assert.ok(!game.inFirstArena());game.state.position=[.5,0,-11.5];assert.ok(game.inFirstArena());await game.battle('first');assert.equal(game.groups.get('first'),'active');assert.ok(game.objects.filter(o=>o.kind==='gate'&&o.handle.startsWith('first_goblin')).every(o=>game.gateClosed(o)));
 game.state.checkpoint=[.5,0,-8.8];game.respawn();assert.ok(!game.groups.has('first'),'respawn outside a room must release its gates');assert.ok(game.objects.filter(o=>o.handle.startsWith('first_goblin_gate')).every(o=>!game.gateClosed(o)));game.state.position=[.5,0,-11.5];await game.battle('first');
 // Defeat both first-room enemies through the real attack controller.
 for(const e of game.enemies){while(e.hp>0){game.state.position=[e.record.position.x,0,-e.record.position.z+.5];game.direction='front';game.clock+=.5;game.attack();}}
 assert.ok(game.has('first_fight'));assert.ok(game.objects.filter(o=>o.handle.startsWith('first_goblin_gate')).every(o=>!game.gateClosed(o)));
 for(const key of ['section_3','section_4_1','section_4_2','section_5']){await game.scene(key);await complete(key);}
 assert.ok(game.companion);assert.ok(game.objects.filter(o=>o.handle.startsWith('trio_door')).every(o=>game.isOpen(o)));
 const chest=game.objects.find(o=>o.handle==='mole_glove_box');game.state.position=[chest.position[0],chest.position[1],chest.position[2]-.76];game.direction='back';game.interact();assert.ok(game.has('gloves'));
 const coin=game.objects.find(o=>o.kind==='coin');game.state.position=coin.position.slice();game.pickups();game.pickups();assert.equal(game.state.collected.filter(id=>id===coin.id).length,1);
 const source=game.objects.find(o=>o.handle==='forest_brazier_1');game.state.position=[source.position[0],source.position[1],source.position[2]-.66];game.direction='back';game.interact();assert.equal(game.carrying,source);for(const b of game.objects.filter(o=>o.handle.startsWith('secret_brazier_'))){game.fireContact(source,b.position);}assert.ok(game.isOpen(game.objects.find(o=>o.handle==='secret_door')));
 game.carrying=null;const portal=game.objects.find(o=>o.kind==='portal'&&o.spec.Interactable.MoveStage?.OpenWaypoint==='cave_in_east');game.state.position=portal.position.slice();game.interact();assert.ok(distance(game.state.position,stage.markers.cave_in_east)<3);
 const exit=game.objects.find(o=>o.handle==='exit_forest_1_2');game.state.position=exit.position.slice();game.interact();assert.equal(game.mode,'clear');assert.ok(game.state.cleared);assert.ok(restore(stage,saved).cleared);game.dispose();assert.equal(runtime.frameListeners.size,0);
 assert.ok(records.get('leader').character.settings.animation!=='attack_1');
 console.log('PASS seven native timelines, clicked dialogue, committed scene state, combat gates, pickup deduplication, gloves, fire conditions, portals, clear and save');
}
// Editor previews still restore their starting state; gameplay finish deliberately commits it.
{
 const {player,records}=fixture(),plan={version:1,map:stage.map,duration:2,waitForDialogue:true,actors:[stage.actors.leader],commands:[{at:0,op:'move',target:'leader',points:[[4,0,0]],duration:2},{at:0,op:'dialogue',target:'leader',text:'等待点击',duration:1}]};
 await player.load(plan);player.play();for(let t=0;t<3;t+=.1)player.sample(t);assert.ok(player.waitingDialogue);assert.ok(player.time<1);player.advanceDialogue();for(let t=3;t<5;t+=.1)player.sample(t);player.finish();assert.equal(records.get('leader').position.x,4);player.stop();assert.equal(records.get('leader').position.x,4);
 await player.load({...plan,waitForDialogue:false});player.seek(1);player.stop();assert.equal(records.get('leader').position.x,4);
 console.log('PASS dialogue wait and gameplay/editor scene handoff semantics');
}
