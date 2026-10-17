import {objectBounds,sphereTouches} from './bounds.js';
const ordinary='Oak.CombustibleBehaviour',brazier='Oak.BrazierCombustibleBehaviour';
/** Shared native combustible protocol; specialised combustion stays in its own component. */
export class NativeCombustion{
 constructor(game){this.game=game;this.refreshed=new Map();}
 ignite(o){const g=this.game,f=o.spec.CombustibleBehaviour;
  if(!f||f.IsCombustible===false||f.IsAffectedBurn===false||o.hidden||g.state.collected.includes(o.id))return false;
  if(f.__class__==='Oak.BombCombustibleBehaviour')return g.bombs?.provoke(o,'fire')||false;
  if(![ordinary,brazier].includes(f.__class__))return false;
  if(f.__class__===brazier)this.refreshed.set(o.id,g.clock);
  if(g.state.lit.includes(o.id))return true;
  g.state.lit.push(o.id);g.fireStarted.set(o.id,g.clock);
  g.onSound(f.FireSfxHandleName||'01_catch_fire_01');
  if(f.__class__===brazier){g.runtime.setWorldGimmick(o.record,{lit:true});g.applyWorld();}else this.start(o);
  return true;
 }
 start(o){const g=this.game,n=g.stage.nativeMechanics.burn,f=o.spec.CombustibleBehaviour,tick=f.damageTick??n.damageTick;
  // Existing v2 saves store the remaining time to the first burn-damage tick.
  const life=Math.ceil(n.damageDelay/tick)*tick,saved=g.state.burning[o.id],elapsed=Number.isFinite(saved)?Math.max(0,life-saved):0,at=g.clock-elapsed;
  g.fireStarted.set(o.id,at);g.burning.set(o.id,{at,last:elapsed,life,effect:g.effect('FX_field_fire',o.position,{follow:()=>o.position,state:'on'})});
 }
 contact(source,p=source.position){const g=this.game,n=g.stage.nativeMechanics.burn,f=source.spec.CombustibleBehaviour;
  if(!f||!g.state.lit.includes(source.id)||g.clock-(g.fireStarted.get(source.id)??0)<n.spreadDelay)return;
  if(![ordinary,brazier].includes(f.__class__))return;
  for(const target of g.objects)if(target!==source&&!target.hidden&&!g.state.collected.includes(target.id)&&target.spec.CombustibleBehaviour&&sphereTouches(p,f.burnRadius??n.radius,objectBounds(target)))this.ignite(target);
 }
 update(){const g=this.game,n=g.stage.nativeMechanics.burn;
  for(const o of g.objects){if(!g.state.lit.includes(o.id)||g.state.collected.includes(o.id))continue;const f=o.spec.CombustibleBehaviour;if(!f)continue;
   if(f.__class__===brazier){const life=f.BurnLifeTime??0;if(life>0&&g.clock-(this.refreshed.get(o.id)??g.fireStarted.get(o.id)??0)>=life){g.state.lit=g.state.lit.filter(id=>id!==o.id);g.fireStarted.delete(o.id);g.runtime.setWorldGimmick(o.record,{lit:false});g.onSound(f.LightTurnOffSfxHandleName||'01_light_turn_off_01');g.applyWorld();continue;}}
   const b=g.burning.get(o.id);if(b){const elapsed=Math.fround(g.clock-b.at),tick=f.damageTick??n.damageTick;g.state.burning[o.id]=Math.max(0,b.life-elapsed);
    // Native UpdateFrame emits one damage command on an interval crossing.
    if(elapsed>=n.damageDelay&&Math.trunc(elapsed/tick)>Math.trunc(b.last/tick))g.damageObject(o,n.damage,'burn');b.last=elapsed;
   }
   if(!g.state.collected.includes(o.id))this.contact(o);
  }
 }
}
