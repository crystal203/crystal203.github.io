import {objectBounds,boundsTouch,actorBounds} from './bounds.js';
import {contactActors,contactObjects} from './contact-bodies.js';
/** FloorSwitchCrashBehaviour + FloorSwitch.UpdateFrame, independent of stage handles. */
export class NativePressureSwitches{
 constructor(game){this.game=game;this.on=new Set();}
 update(){const g=this.game;let changed=false;
  for(const o of g.objects){const f=o.spec.FieldObjectBehaviour;if(f?.__class__!=='Oak.FloorSwitchBehaviour'||o.hidden)continue;
   const b=objectBounds(o),actors=contactActors(g,f.OnlyForManualCharacter).some(a=>boundsTouch(b,a));
   const objects=!f.OnlyForManualCharacter&&contactObjects(g,o).some(a=>boundsTouch(b,a));
   const on=actors||objects;if(on===this.on.has(o.id))continue;changed=true;if(on)this.on.add(o.id);else this.on.delete(o.id);
   g.runtime.setWorldNodeTransform?.(o.record,'mesh/switch2',{position:[0,on?-.07999999821186066:0,0]});
   if(on)g.onSound(f.SwitchButtonSfxHandleName||'02_switch_button_01');
  }
  if(changed)g.applyWorld();
 }
}
