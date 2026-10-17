import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.js';
import {objectBounds} from '../../gtonline/gimmicks/bounds.js';
import {MapSelection} from '../../gtmap/selection.js';
import {NativeJumpTiles,springVelocity,springPose,JUMP_GRAVITY,JUMP_TIME_SCALE} from '../../gtonline/gimmicks/jump-tiles.js';

// Independent oracle: the native AttachTo branch assignments, not the JS table.
const native=await readFile(new URL('./evidence/gimmicks/native-jump-direction-attach-6723880.txt',import.meta.url),'utf8');
const assignments=[[0,'67239b8',4],[1,'67239d8',8],[2,'67239f8',1],[3,'6723a28',2]];
const vectors={1:[0,0,1],2:[1,0,0],4:[0,0,-1],8:[-1,0,0]},faces={1:'back',2:'right',4:'front',8:'left'};
for(const [,address,d] of assignments)assert(native.includes(`${address} mov      w1, #${d}`),'native direction assignment');
assert(native.includes('67239a4 bl       #0x945ee48'),'direction is read from transform Euler angles');
assert(native.includes('67239c0 mov      w8, #0x42b40000')); // 90 degrees
assert(native.includes('67239e0 mov      w8, #0x43340000')); // 180 degrees
assert(native.includes('6723a10 mov      w8, #0x43870000')); // 270 degrees
const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-1-2.json',import.meta.url)));
const scene=new THREE.Scene(),selection=new MapSelection(scene);
const tiles=stage.objects.filter(o=>o.kind==='jump');
assert.equal(tiles.length,8);
// Also check all quarter turns independently of a particular stage's coverage.
for(const [rotation] of assignments)tiles.push({...structuredClone(tiles[0]),id:`quarter:${rotation}`,rotation});
for(const tile of tiles){
 const d=assignments[tile.rotation][2],expected=vectors[d],speed=tile.spec.FieldObjectBehaviour.HorizontalSpeed;
 const box=objectBounds(tile),origin=[(box[0]+box[3])/2,tile.position[1],(box[2]+box[5])/2];
 const v=springVelocity(tile,origin);
 assert(Math.abs(v[0]-expected[0]*speed)<1e-10&&Math.abs(v[2]-expected[2]*speed)<1e-10,`${tile.id}: native launch direction`);
 const record=selection.add({id:tile.id,name:tile.name,x:tile.position[0],y:tile.position[1]*2,z:tile.position[2],rotation:tile.rotation});
 const renderedArrow=new THREE.Vector3(0,0,1).transformDirection(selection.matrixFor(record)); // native -Z reflected into render +Z
 const renderedVelocity=new THREE.Vector3(v[0],0,-v[2]).normalize();
 assert(renderedArrow.dot(renderedVelocity)>1-1e-12,`${tile.id}: visible arrow and launch agree`);
 const from=[origin[0]+.13,origin[1],origin[2]-.09],offsetV=springVelocity(tile,from);
 const elapsed=2*v[1]/JUMP_GRAVITY/JUMP_TIME_SCALE;
 const a=springPose(origin,v,elapsed),b=springPose(from,offsetV,elapsed);
 assert(Math.hypot(a[0]-b[0],a[2]-b[2])<1e-6,'entry offset still lands at native tile target');
 const game={stage,objects:[tile],state:{position:origin.slice()},clock:0,mode:'play',keys:new Set(),runtime:{playWorldGimmick(){}},onSound(){},collision:{radius:.22}};
 new NativeJumpTiles(game).contact();assert(game.springJump);assert.equal(game.direction,faces[d]);
}
console.log('PASS: native AttachTo assignments, all four rotations, all eight stage tiles, render arrow/launch agreement, landing compensation and actor facing');

