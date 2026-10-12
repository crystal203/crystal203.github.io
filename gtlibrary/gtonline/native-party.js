// CharacterControllerPartyFollowState: FollowLeaderOperation queue (Snake/Free).
// Constants.DistBetweenPartyMembers = float32(.7), native statics +0x1a4;
// SpeedFromDistance = min(distance / dt, max(8, dash horizontal speed)).
const position=r=>[r.position.x,r.position.y,-r.position.z];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const facing=(a,b)=>Math.abs(b[0]-a[0])>Math.abs(b[2]-a[2])?b[0]>a[0]?'right':'left':b[2]>a[2]?'back':'front';
export const PARTY_SPACING=.699999988079071;
export function followSpeed(distance,dt,dashSpeed=0){return dt>0?Math.min(Math.max(0,distance)/dt,Math.max(8,dashSpeed)):0;}
export class NativePartyFollow {
 constructor(runtime,collision,record,leader,index){Object.assign(this,{runtime,collision,record,index});this.reset(leader);}
 reset(leader,transfer=false){this.ops=[];this.lastLeader=leader.slice();this.jump=null;this.mode=distance(position(this.record),leader)>2?'free':'snake';this.freeRoute=null;this.routeTime=0;if(transfer){const p=this.collision.nearest([leader[0]-PARTY_SPACING*this.index,leader[1],leader[2]],2)||leader;this.runtime.setWorldPosition(this.record,p);}}
 enqueueJump(from,to,duration=.45,height=.7){this.recordWalk(from);this.ops.push({type:'jump',from:from.slice(),to:to.slice(),duration,height});this.lastLeader=to.slice();}
 recordWalk(leader,direction){if(distance(this.lastLeader,leader)>1e-6){this.ops.push({type:'walk',to:leader.slice(),direction:direction||facing(this.lastLeader,leader)});this.lastLeader=leader.slice();}}
 remaining(p){let n=0;for(const op of this.ops){n+=distance(p,op.to);p=op.to;}return n;}
 update(leader,settings,dt,{jumping=false}={}){
  if(!(dt>0))return;if(!jumping)this.recordWalk(leader,settings.direction);
  if(this.jump){const h=this.jump;h.elapsed+=dt;const u=Math.min(1,h.elapsed/h.duration),p=h.from.map((v,i)=>v+(h.to[i]-v)*u);p[1]+=u===1?0:Math.sin(u*Math.PI)*h.height;this.runtime.setWorldPosition(this.record,p);this.runtime.setActorState(this.record,{animation:'jump',direction:facing(h.from,h.to),loop:false});if(u===1)this.jump=null;return;}
  let p=position(this.record),moving=false,direction=this.record.character.settings.direction||settings.direction;
  if(this.mode==='free'){
   // Native Free joins the leader's trail through navigation; never distance-warp.
   this.routeTime-=dt;if(!this.freeRoute||this.routeTime<=0){const end=this.ops[0]?.type==='jump'?this.ops[0].from:this.ops[0]?.to||leader;this.freeRoute=this.collision.route(p,end)||[];this.routeTime=.5;}
   const target=this.freeRoute[0];if(target){const d=distance(p,target),step=Math.min(d,7*dt);if(d>1e-6){const q=this.collision.move(p,(target[0]-p[0])/d*step,(target[2]-p[2])/d*step);moving=distance(p,q)>1e-6;direction=facing(p,target);p=q;}if(distance(p,target)<.02)this.freeRoute.shift();}
   const first=this.ops[0],end=first?.type==='jump'?first.from:first?.to||leader;if(distance(p,end)<.05){this.mode='snake';this.freeRoute=null;}
  }
  if(this.mode==='snake'){
   let budget=followSpeed(this.remaining(p)-PARTY_SPACING*this.index,dt,settings.animation==='run'?5:0)*dt;
   while(this.ops.length){const op=this.ops[0],target=op.type==='jump'?op.from:op.to,d=distance(p,target);
    if(op.type==='jump'&&d<.03){this.ops.shift();this.jump={...op,from:p.slice(),elapsed:0};this.runtime.restartActorAnimation?.(this.record);break;}
    if(d<1e-6){this.ops.shift();continue;}if(budget<=1e-6)break;
    const step=Math.min(d,budget),q=this.collision.move(p,(target[0]-p[0])/d*step,(target[2]-p[2])/d*step),moved=distance(p,q);direction=op.direction||facing(p,target);moving||=moved>1e-6;p=q;budget-=step;
    if(distance(p,target)<.02){if(op.type==='walk')this.ops.shift();}else if(moved<step*.5){this.mode='free';this.freeRoute=null;break;}
   }
  }
  this.runtime.setWorldPosition(this.record,p);this.runtime.setActorState(this.record,{animation:moving?(settings.animation==='run'?'run':'walk'):'idle',direction,loop:true});
 }
}
