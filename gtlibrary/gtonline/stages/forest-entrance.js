import {OnlineGame} from '../game.js';
import {ButterflyGuideController} from './forest-entrance/butterfly-guide.js';
import {SealedKingdomController} from './forest-entrance/sealed-kingdom.js';
import {VampireIdolController} from './forest-entrance/vampire-idol.js';
import {ForestSuperTutorial} from './forest-entrance/super-tutorial.js';
import {ForestMainQuest} from './forest-entrance/main-quest.js';
/** Stage-local quest/controller composition; native presentation and branches remain under audit. */
export class ForestEntranceGame extends OnlineGame{
 onSceneStarted(key){this.butterfly?.started(key);}
 migrateProgress(state){return {...state,flags:state.flags.filter(f=>!['butterfly_1','butterfly_2'].includes(f))};}
 async prepareStage(){
  for(const [handle,spec] of Object.entries(this.stage.actors)){
   if(handle==='leader'||spec.monster||['maiden','butterfly'].includes(handle))continue;
   const r=await this.actor(handle);if(this.cancelled)return;
   this.runtime.setActorState(r,{animation:spec.animation,direction:spec.direction,expression:spec.expression,equipment:spec.equipment});
   this.runtime.setWorldPosition(r,spec.position);this.runtime.setWorldVisible(r,true);
  }
  this.butterfly=new ButterflyGuideController(this);await this.butterfly.prepare();
  if(this.cancelled)return;this.sealedKingdom=new SealedKingdomController(this);await this.sealedKingdom.prepare();
  this.vampireIdol=new VampireIdolController(this);
  this.mainQuest=new ForestMainQuest(this);await this.mainQuest.prepare();this.superTutorial=new ForestSuperTutorial(this);this.superTutorial.prepare();
 }
 async enterStage(){this.restoreEquipment();await this.mainQuest.enter();}
 quest(){return this.stage.strings.forest_main_s8_tracker_0;}
 canInteract(){return true;}
 afterCollect(loot){this.superTutorial.collected(loot);}
 finishLoot(){super.finishLoot();if(this.mode==='play')void this.superTutorial.afterLoot().catch(e=>this.fail(e));}
 canExit(){return this.mainQuest.progress.innerProgress>=8&&this.superTutorial.cleared&&this.has('battle:final');}
 battleTriggers(){return super.battleTriggers();}
 battleSpec(group){return group==='super_tutorial_goblins'?this.superTutorial.battleSpec():super.battleSpec(group);}
 afterBattle(group){this.superTutorial.eliminated(group);}
 afterRespawn(){if(this.superTutorial.state.state===3){this.groups.delete('super_tutorial_goblins');void this.battle('super_tutorial_goblins').catch(e=>this.fail(e));}}
 questMarkers(){const target=this.superTutorial?.cleared?this.stage.markers.entry_forest_1_3:this.objects.find(o=>o.handle==='super_tutorial_box')?.position;return target?[{id:'forest_main',type:'main',position:target}]:[];}
 resolveSceneRoutes(plan){this.butterfly?.resolvePlan(plan);this.superTutorial?.resolvePlan(plan);super.resolveSceneRoutes(plan);}
 beforeScene(key){this.sealedKingdom?.beforeScene(key);this.mainQuest?.beforeScene(key);}
 async afterScene(key){this.sealedKingdom?.afterScene(key);this.mainQuest?.afterScene(key);await this.superTutorial?.afterScene(key);}
 nextScene(){return this.sealedKingdom?.nextScene()||this.butterfly?.nextScene()||null;}
 updateStage(){this.vampireIdol?.update();this.mainQuest?.update();this.superTutorial?.update();}
 handleStageAction(h){if(this.mainQuest?.handle(h)||this.superTutorial?.handle(h))return;super.handleStageAction(h);}
 advance(){if(this.mainQuest?.advance())return;super.advance();}
 disposeStage(){this.sealedKingdom?.dispose();this.mainQuest?.dispose();}
}
export const Game=ForestEntranceGame;
