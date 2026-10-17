import {evaluateConditions} from './conditions.js';
import {objectBounds,boundsTouch} from './bounds.js';
export class NativeDoors{
 constructor(game){this.game=game;this.entries=new Map();}
 // DoorBehaviour.Open / UpdateState: explicit events enter the open state (2),
 // which does not run the conditional door's maintain-open countdown.
 force(o,open){this.entries.set(o.id,{open,forced:open,until:0});}
 actual(kind,handle){const g=this.game,o=g.objects.find(o=>o.handle===handle);
  if(kind==='Switch')return !!o&&g.switches.on.has(o.id);
  if(kind==='Brazier')return !!o&&g.state.lit.includes(o.id);
  if(kind==='Elimination')return g.groups.get(handle)==='done'||g.state.flags.includes('battle:'+handle);
  if(kind==='FiledObjectDestroyed')return !!o&&g.state.collected.includes(o.id);
  if(kind==='Tesla')return !!o&&!!o.teslaOn;
  return false;
 }
 isOpen(o){const g=this.game,f=o.spec.FieldObjectBehaviour||{},s=this.entries.get(o.id)||{open:!!f.OpenOnStart,until:0};this.entries.set(o.id,s);
  const satisfied=g.state.opened.includes(o.id)||evaluateConditions(f,(k,h)=>this.actual(k,h));
  if(satisfied){s.open=true;s.until=g.clock+(f.MaintainOpenDuration??2);}
  else if(s.open&&!s.forced&&!f.StayOpen&&g.clock>=s.until){const p=g.state.position,r=g.collision.radius;if(!boundsTouch(objectBounds(o),[p[0]-r,p[1],p[2]-r,p[0]+r,p[1]+.75,p[2]+r]))s.open=false;}
  if(s.open&&f.SaveOpenedState&&!g.state.opened.includes(o.id))g.state.opened.push(o.id);
  return s.open;
 }
 update(){const g=this.game;if(g.objects.some(o=>o.kind==='door'&&o.doorState!==this.isOpen(o)))g.applyWorld();}
}
