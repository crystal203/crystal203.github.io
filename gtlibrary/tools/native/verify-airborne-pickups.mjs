import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OnlineGame} from '../../gtonline/game.js';
import {NativeJumpTiles,springVelocity} from '../../gtonline/gimmicks/jump-tiles.js';
import {objectBounds} from '../../gtonline/gimmicks/bounds.js';
const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-1-2.json',import.meta.url)));
const tile=stage.objects.find(o=>o.id==='8:115'),b=objectBounds(tile),from=[(b[0]+b[3])/2,0,(b[2]+b[5])/2];
// All current stage tiles explicitly override horizontal speed. Entering at a
// walk/run speed must NOT introduce an extra invented momentum term.
assert.deepEqual(springVelocity(tile,from,3.5),springVelocity(tile,from,5));
const fallback=structuredClone(tile);fallback.spec.FieldObjectBehaviour.HorizontalSpeed=-1;
assert(Math.abs(springVelocity(fallback,from,5)[2]/springVelocity(fallback,from,3.5)[2]-5/3.5)<1e-10);
for(const id of ['8:115','8:116','8:117','8:118']){
 const o=stage.objects.find(o=>o.id===id),box=objectBounds(o),p=[(box[0]+box[3])/2,0,(box[2]+box[5])/2];
 const g={stage,objects:stage.objects,state:{position:p,collected:[],flags:[]},clock:0,mode:'play',keys:new Set(),collision:{height:()=>0},player:{},runtime:{setWorldPosition(){},setActorState(){},playWorldGimmick(){},collectWorldItem(){}},onSound(){},effect(){},save(){},has(){return false;},restoreEquipment(){},updateHeldObject(){},updateParty(){},focus(){},emitThrottled(){},pickups:OnlineGame.prototype.pickups};
 g.springJump={tile:o,from:p.slice(),velocity:springVelocity(o,p),at:0,previous:p.slice()};const jumps=new NativeJumpTiles(g);
 for(let n=1;n<=160&&g.springJump;n++){g.clock=n/120;jumps.update();}
 assert(g.state.collected.some(coin=>['8:119','8:120','8:121','8:122'].includes(coin)),`${id}: collect a native elevated coin during the jump`);
}
console.log('PASS: native walk/run fallback, explicit speed overrides and four elevated purple coins collected in flight');
