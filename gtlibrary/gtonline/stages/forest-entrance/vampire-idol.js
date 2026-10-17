import {inside} from '../../progress.js';
/** StageEventControllerVampireIdol: transient area music, independent of quests. */
export class VampireIdolController{
 constructor(game){this.game=game;this.contacts=new Set();this.changed=false;}
 update(){
  const g=this.game,spec=g.stage.nativeMechanics.vampireIdolMusic;
  const idol=g.actors.get(spec.actor);if(!idol?.visible)return;
  for(const [name,music] of Object.entries(spec.zones)){
   if(!inside([idol.position.x,idol.position.y,-idol.position.z],g.stage.regions[name]))continue;
   const contact=!!inside(g.state.position,g.stage.regions[name]),previous=this.contacts.has(name);
   if(contact===previous)continue;
   if(contact){this.contacts.add(name);if(!this.changed){this.previousMusic=g.music;g.music=music;this.changed=true;}}
   else{this.contacts.delete(name);if(this.changed){g.music=this.previousMusic;this.changed=false;}}
  }
 }
}
