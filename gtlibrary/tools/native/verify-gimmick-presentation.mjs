import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from '../../vendor/three.module.js';
import {MapSelection} from '../../gtmap/selection.js';
import {MapStates} from '../../gtmap/states.js';
import {bombPresentation} from '../../gtonline/gimmicks/bomb-presentation.js';
import {NativeFieldShake} from '../../gtonline/gimmicks/field-shake.js';
import {objectBounds} from '../../gtonline/gimmicks/bounds.js';
import {NativeJumpTiles,springVelocity} from '../../gtonline/gimmicks/jump-tiles.js';
import {NativePressureSwitches} from '../../gtonline/gimmicks/pressure-switches.js';
const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-1-2.json',import.meta.url)));
const calls=[],runtime={setWorldPosition(){},setActorState:(r,s)=>calls.push(s),playWorldGimmick:(...a)=>calls.push(a)},game={stage,runtime,keys:new Set(['a']),objects:[],state:{position:[0,0,0],collected:[]},clock:0,mode:'play',direction:'left',onSound(){},collision:{radius:.22},applyWorld(){}};
// Native AttachTo assigns Direction 4/8/1/2 for Euler Y 0/90/180/270.
const expected={0:[0,-1,'front'],1:[-1,0,'left'],2:[0,1,'back'],3:[1,0,'right']};
for(const o of stage.objects.filter(o=>o.kind==='jump')){
 const [x,z,face]=expected[o.rotation],b=objectBounds(o),origin=[(b[0]+b[3])/2,o.position[1],(b[2]+b[5])/2],v=springVelocity(o,origin);assert(Math.abs(v[0]-x*o.spec.FieldObjectBehaviour.HorizontalSpeed)<1e-10);assert(Math.abs(v[2]-z*o.spec.FieldObjectBehaviour.HorizontalSpeed)<1e-10,'native Bounds.center is used');
 game.state.position=origin.slice();game.objects=[o];game.springJump=null;const jumps=new NativeJumpTiles(game);jumps.contact();assert.equal(game.direction,face);assert(game.springJump);assert(calls.at(-1)[2].restart);assert.equal(jumps.off[0].at,1.5);
}
assert.equal(bombPresentation(1.99).active,false);assert.deepEqual(bombPresentation(2).color,[1,0,0,1]);assert.equal(bombPresentation(2.5).phase,5.25);assert(Math.abs(bombPresentation(2.5).color[1]-Math.abs(Math.sin(5.25)))<1e-7);
const shake=new NativeFieldShake(()=>.25);shake.add(2,.2,0);shake.add(1.4,.2,.1);assert(Math.abs(Math.hypot(...shake.sample(.1))-.7)<1e-6,'maximum pulse, not sum');assert.deepEqual(shake.sample(.31),[0,0,0]);
const assets=JSON.parse(gunzipSync(await readFile(new URL('../../gtmap/assets/states/e4179dcf1a47bfd9.json.gz',import.meta.url)))),spec=assets.templates['[GIMMICK]bomb1'],scene=new THREE.Scene(),selection=new MapSelection(scene),states=new MapStates(new THREE.PerspectiveCamera(),new Map(),selection,[],()=>null),tiles=[0,1].map(i=>({id:'bomb:'+i,name:'[GIMMICK]bomb1',x:i*3,y:0,z:0,rotation:1}));
for(const tile of tiles){selection.add(tile);states.register(spec,assets,[tile],scene,0);states.activate(selection.records.get(tile.id).gimmick);}
const a=selection.records.get('bomb:0'),b=selection.records.get('bomb:1'),node=spec.nodes.find(n=>n.path==='mesh/bomb1'),spark=spec.nodes.find(n=>n.path.endsWith('/Mesh_seq_loop'));
a.gimmick.materialOverrides.set(node.id,{_Color:[1,0,0,1]});a.gimmick.materialOverrides.set(spark.id,{_ShearOffset:-100});states.sample(0);
const body=r=>r.gimmick.parts.find(p=>p.part.node===node.id).mesh.material.uniforms._Color.value;
assert.deepEqual(body(a).toArray(),[1,0,0,1]);assert.notDeepEqual(body(b).toArray(),[1,0,0,1],'per-instance material block cannot color another bomb');
const snap=states.capture(a);states.reset([a]);states.sample(0);assert.deepEqual(body(a).toArray(),body(b).toArray());states.restore(a,snap);states.sample(0);assert.deepEqual(body(a).toArray(),[1,0,0,1]);
a.visualOffset=new THREE.Vector3(.01,.02,0);selection.update(a);assert(a.position.toArray().every(v=>v===0),'shake leaves physical position intact');assert(Math.abs(a.matrix.elements[12]-.01)<1e-9);assert(Math.abs(a.matrix.elements[13]-.02)<1e-9);
const button=structuredClone(stage.objects.find(o=>o.handle==='rock_switch'));game.objects=[button];game.springJump=null;game.thrown=[];game.state.position=[999,0,999];game.actors=new Map([['npc',{visible:true,position:{x:button.position[0],y:0,z:-button.position[2]}}]]);game.player={};game.runtime.setWorldNodeTransform=()=>{};const switches=new NativePressureSwitches(game);switches.update();assert(switches.on.has(button.id));button.spec.FieldObjectBehaviour.OnlyForManualCharacter=true;switches.update();assert(!switches.on.has(button.id));
states.clear();console.log('PASS: all 8 directed jump launches/facing, native bomb blink phase, max-pulse shake, actual prefab material isolation/reset, physical-vs-visual position and NPC/manual switch contact');
