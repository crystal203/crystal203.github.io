import {objectBounds,boundsTouch,actorBounds} from './bounds.js';
export const JUMP_GRAVITY=9.800000190734863,JUMP_TIME_SCALE=1.75;
// JumpTileBehaviour.AttachTo (0x6723880): Euler Y 0/90/180/270
// assigns Oak.Direction 4/8/1/2, respectively. The prefab arrow faces -Z.
export function springDirection(rotation){return [[0,0,-1],[-1,0,0],[0,0,1],[1,0,0]][rotation&3];}
// JumpTileBehaviour.CalculateTargetPosition (0x6724478): compensate for entry offset.
export function springVelocity(tile,from,entrySpeed=5){
 const f=tile.spec.FieldObjectBehaviour,v=f.JumpSpeed??11,h=f.HorizontalSpeed>0?f.HorizontalSpeed:entrySpeed*1.2000000476837158;
 const direction=springDirection(tile.rotation),range=2*h*Math.fround(4/7)*v/JUMP_GRAVITY;
 // CalculateTargetPosition takes (Source tile, Target character): slot 8 is
 // Source.Bounds, slot 2 is Target.Position. Target uses the tile Bounds.center.
 const b=objectBounds(tile),center=[(b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2];
 return [(center[0]+direction[0]*range-from[0])*h/range,v,(center[2]+direction[2]*range-from[2])*h/range];
}
export function springPose(from,velocity,elapsed){const t=elapsed*JUMP_TIME_SCALE;return [from[0]+velocity[0]*elapsed,from[1]+velocity[1]*t-.5*JUMP_GRAVITY*t*t,from[2]+velocity[2]*elapsed];}
export class NativeJumpTiles{
 constructor(game){this.game=game;this.contacts=new Set();this.off=[];}
 contact(){const g=this.game;this.off=this.off.filter(({object,at})=>{if(g.clock<at)return true;g.runtime.playWorldGimmick(object.record,'off',{restart:true});return false;});const p=g.state.position,now=new Set();
  for(const o of g.objects)if(o.kind==='jump'&&!o.hidden&&boundsTouch(objectBounds(o),actorBounds(g,p))){
   now.add(o.id);if(this.contacts.has(o.id)||g.springJump||g.hopping||g.pushing||g.knockback||g.mode!=='play')continue;
   const velocity=springVelocity(o,p,g.locomotion?.referenceSpeed??5);g.direction=Math.abs(velocity[0])>Math.abs(velocity[2])?(velocity[0]>0?'right':'left'):(velocity[2]>0?'back':'front');g.springJump={tile:o,from:p.slice(),velocity,at:g.clock,previous:p.slice()};g.keys.clear();g.onSound(o.spec.FieldObjectBehaviour.JumpTileJumpSfxHandleName||'03_jumptile_01');g.runtime.playWorldGimmick(o.record,'on',{speed:1.5,restart:true});this.off.push({object:o,at:g.clock+1.5});
  }this.contacts=now;
 }
 update(){const g=this.game,j=g.springJump;if(!j)return false;const t=g.clock-j.at,p=springPose(j.from,j.velocity,t),h=g.collision.height(p[0],p[2],p[1]);
  if(t*JUMP_TIME_SCALE>j.velocity[1]/JUMP_GRAVITY&&h!==null&&p[1]<=h&&j.previous[1]>=h){p[1]=h;g.springJump=null;}
  j.previous=p.slice();g.state.position=p;g.runtime.setWorldPosition(g.player,p);g.runtime.setActorState(g.player,{animation:g.springJump?'jump':'idle',direction:g.direction,loop:!g.springJump});
  g.pickups();g.updateHeldObject();g.updateParty(g.lastDelta||0);g.focus(p);g.emitThrottled();return true;
 }
}
