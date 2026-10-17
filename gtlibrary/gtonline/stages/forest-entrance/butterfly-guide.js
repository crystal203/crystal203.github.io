import {inside} from '../../progress.js';
const position=r=>[r.position.x,r.position.y,-r.position.z];

/** ButterflyGuide's transient fields stay in its controller, outside save data.
 * 729e0fc / 729e1d8 test separate booleans; route 2 does not depend on route 1.
 * Concurrent ScreenPlay jobs and exact native region contact remain under audit.
 */
export class ButterflyGuideController{
 constructor(game){this.game=game;this.triggered=new Set();}
 async prepare(){
  const g=this.game,r=await g.actor('butterfly');if(g.cancelled)return;
  this.record=r;
  g.runtime.setWorldPosition(r,[49.5,0,-6]);
  g.runtime.setActorState(r,{animation:'sleep',direction:'front',shadow:false,alpha:1});
  g.runtime.setWorldVisible(r,true);
 }
 started(key){if(['butterfly_1','butterfly_2'].includes(key))this.triggered.add(key);}
 nextScene(){
  const g=this.game;
  for(const key of ['butterfly_1','butterfly_2'])
   if(!this.triggered.has(key)&&inside(g.state.position,g.stage.regions[key]))return key;
  return null;
 }
 resolvePlan(plan){
  if(!plan.id?.startsWith('forest-1-2:butterfly_')||!this.record)return;
  // ScreenPlay moves from the actor's actual position. A fixed route-1 endpoint
  // is wrong when route 2 is entered first or the actor was interrupted.
  const actor=plan.actors.find(a=>a.handle==='butterfly');actor.position=position(this.record);
  let from=actor.position;
  for(const command of plan.commands){
   if(command.op!=='move'||command.target!=='butterfly')continue;
   if(!(command.speed>0))throw Error('蝴蝶原生路线缺少速度');
   const points=[from,...command.points],duration=command.points.reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-points[i][j])),0)/command.speed;
   const previousEnd=command.at+command.duration,delta=duration-command.duration;
   command.duration=duration;
   for(const next of plan.commands)if(next!==command&&next.at>=previousEnd-1e-8)next.at+=delta;
   plan.duration+=delta;from=command.points.at(-1);
  }
 }
}
