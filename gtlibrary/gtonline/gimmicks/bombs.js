import {NativeFieldShake} from './field-shake.js';
import {bombPresentation} from './bomb-presentation.js';
import {objectBounds,sphereTouches} from './bounds.js';
/** BombFieldObjectBehaviour: separate spawned bomb, never move its flower. */
export class NativeBombs{
 constructor(game){this.game=game;this.entries=new Map();for(const o of game.objects)if(o.kind==='bomb'){const wick=o.record?.gimmick?.spec.nodes.find(n=>n.path==='mesh/bomb1/root_wick/wick');if(!wick)throw Error('Bomb prefab wick node missing: '+o.id);this.entries.set(o.id,{object:o,origin:o.position.slice(),wickY:wick.position.y,shake:new NativeFieldShake(),tickBit:false,state:'spawning',at:game.clock});o.unavailable=true;game.runtime.setWorldScale(o.record,[0,0,0]);game.runtime.setWorldNodeVisible(o.record,'mesh/bomb1/root_wick/wick/FX_BombSpark_mesh',false);}}
 resetPresentation(b){const g=this.game;b.shake.clear();b.tickBit=false;g.runtime.setWorldVisualOffset(b.object.record,null);g.runtime.setWorldNodeMaterial(b.object.record,'mesh/bomb1',null);g.runtime.setWorldNodeMaterial(b.object.record,'mesh/bomb1/root_wick/wick/FX_BombSpark_mesh/Mesh_seq_loop',null);}
 ready(o){return !o.unavailable;}
 pickup(o){const b=this.entries.get(o.id);if(!b||b.state!=='ready')return;this.firing(b,0);}
 firing(b,elapsed){const g=this.game;b.state='firing';b.at=g.clock-elapsed;g.runtime.setWorldNodeVisible(b.object.record,'mesh/bomb1/root_wick/wick/FX_BombSpark_mesh',true);g.onSound({name:'02_bomb_fuse_01',id:'bomb:'+b.object.id,action:'start'});}
 // ProvokeType is not inspected by OnEvent: all ready-bomb provokes leave 1s.
 provoke(o,type){const b=this.entries.get(o.id);if(!b||o.unavailable)return false;if(b.state==='ready')this.firing(b,4);return true;}
 explode(b){if(b.state==='exploded'||b.state==='spawning')return;const g=this.game,o=b.object,p=o.position.slice();b.state='exploded';b.at=g.clock;this.resetPresentation(b);o.unavailable=true;
  g.onSound({name:'02_bomb_fuse_01',id:'bomb:'+o.id,action:'stop',fadeOut:0});g.onSound('02_explosion_01');g.effect('FX_Explosion_Bomb_new',p,{duration:1.4});g.runtime.setWorldVisible(o.record,false);
  if(g.carrying===o){g.carrying=null;g.restoreEquipment();}g.thrown=g.thrown.filter(t=>t.object!==o);delete g.state.moved[o.id];
  for(const target of g.objects)if(target!==o&&!target.hidden&&!target.unavailable&&!g.state.collected.includes(target.id)&&target.spec.DamagedBehaviour&&sphereTouches(p,1.5,objectBounds(target)))g.damageObject(target,Math.trunc((target.stats?.Hp??1)*.1),'bomb');
  const q=g.state.position,r=g.collision.radius;if(sphereTouches(p,1.5,[q[0]-r,q[1],q[2]-r,q[0]+r,q[1]+.75,q[2]+r])){g.state.health=Math.max(0,g.state.health-10);g.damageUntil=g.clock+.65;if(!g.state.health)g.respawn();}
  for(const e of g.enemies)if(e.hp>0&&sphereTouches(p,1.5,[e.record.position.x-.275,e.record.position.y,-e.record.position.z-.225,e.record.position.x+.275,e.record.position.y+.75,-e.record.position.z+.225]))e.hp=Math.max(0,e.hp-Math.trunc(e.max*.1));
 }
 update(){const g=this.game;for(const b of this.entries.values()){const o=b.object;
   if(b.state==='exploded'){if(o.spec.FieldObjectBehaviour.CanBeRespawn===false)continue;b.state='spawning';b.at=g.clock;o.position=b.origin.slice();g.runtime.setWorldPosition(o.record,o.position);g.runtime.setWorldVisible(o.record,true);g.runtime.setWorldScale(o.record,[0,0,0]);g.runtime.setWorldNodeVisible(o.record,'mesh/bomb1/root_wick/wick/FX_BombSpark_mesh',false);g.runtime.setWorldNodeTransform(o.record,'mesh/bomb1/root_wick/wick',{position:[0,b.wickY,0]});g.onSound('02_bomb_respawn_01');}
   const t=g.clock-b.at;if(b.state==='spawning'){const s=Math.min(1,Math.max(0,t-.5));g.runtime.setWorldScale(o.record,[s,s,s]);if(s===1){b.state='ready';o.unavailable=false;}}
   else if(b.state==='firing'){const remaining=5-t,presentation=bombPresentation(t);b.shake.add(presentation.shakeRadius,.20000000298023224,g.clock);g.runtime.setWorldVisualOffset(o.record,b.shake.sample(g.clock));if(presentation.active){g.runtime.setWorldNodeMaterial(o.record,'mesh/bomb1',{_Color:presentation.color});g.runtime.setWorldNodeMaterial(o.record,'mesh/bomb1/root_wick/wick/FX_BombSpark_mesh/Mesh_seq_loop',{_ShearOffset:g.carrying===o?g.state.position[1]:-100});if((!g.runtime.isInCameraView||g.runtime.isInCameraView(o.position))&&presentation.tickBit!==b.tickBit){b.tickBit=presentation.tickBit;g.onSound('02_bomb_count_tick_01');}}g.runtime.setWorldNodeTransform(o.record,'mesh/bomb1/root_wick/wick',{position:[0,b.wickY*Math.max(0,1-Math.min(t,2)/2),0]});if(remaining<=0)this.explode(b);}
  }
 }
 dispose(){const g=this.game;for(const b of this.entries.values()){this.resetPresentation(b);g.onSound({name:'02_bomb_fuse_01',id:'bomb:'+b.object.id,action:'stop',fadeOut:0});b.object.instance?.dispose();}}
}
