/** StageEventControllerSuperTutorial: enum values from the registered image. */
export const SuperState=Object.freeze({Began:0,SlimesEliminated:1,Equipped:2,WaitingForSuper:3,Cleared:4});
export class ForestSuperTutorial{
 constructor(game){this.game=game;game.state.controllers??={};this.state=game.state.controllers.superTutorial??={};this.box=game.objects.find(o=>o.handle==='super_tutorial_box');this.state.state=game.state.collected.includes(this.box.id)?SuperState.Cleared:SuperState.Began;}
 get cleared(){return this.state.state===SuperState.Cleared;}
 prepare(){const g=this.game;if(this.cleared){for(const o of g.objects)if(o.handle.startsWith('super_tutorial_door_'))g.doors.force(o,true);}else{g.state.dead=g.state.dead.filter(h=>!h.startsWith('tutorial_goblin_'));g.state.flags=g.state.flags.filter(h=>h!=='battle:super_tutorial_goblins');}}
 collected(loot){if(loot.object!==this.box||this.cleared)return;const item=loot.drops.find(d=>d.item.ItemId===9010020);if(!item)return;this.state.itemReceived=true;this.game.flag('sword');this.game.state.equipment??={};this.game.state.equipment.item1=9010020;this.state.state=SuperState.Equipped;this.game.restoreEquipment();}
 async afterLoot(){if(this.state.state!==SuperState.Equipped)return;await this.game.scene('super_goblins');}
 async afterScene(key){const g=this.game;if(key==='super_goblins'){this.state.state=SuperState.WaitingForSuper;g.controlLocks.request(this,0x17);g.groups.delete('super_tutorial_goblins');await g.battle('super_tutorial_goblins');}if(key==='super_end'){g.controlLocks.release(this);g.state.collected.includes(this.box.id)||g.state.collected.push(this.box.id);g.save(true);g.applyWorld();}}
 eliminated(group){if(group!=='super_tutorial_goblins'||this.cleared)return;const g=this.game;this.state.state=SuperState.Cleared;for(const o of g.objects)if(o.handle.startsWith('super_tutorial_door_'))g.doors.force(o,true);g.applyWorld();void g.scene('super_end');}
 handle(h){if(h.name!=='SuperActionFinished')return false;this.waitingForAction=true;this.update();return true;}
 update(){const g=this.game;if(this.waitingForAction&&!g.weaponSkills.active){this.waitingForAction=false;g.runtime.events.resolveCallback('SuperActionFinished');}}
 resolvePlan(plan){if(plan.nativeController!=='SuperTutorial.AppearGoblins')return;const p=this.game.state.position;for(const c of plan.commands){if(c.nativeSpawnOffset)c.position=p.map((v,i)=>v+c.nativeSpawnOffset[i]);if(c.nativeWaypointOffset){c.points=[p.map((v,i)=>v+c.nativeWaypointOffset[i])];c.duration=10/9;}}for(const a of plan.actors){const c=plan.commands.find(c=>c.target===a.handle&&c.op==='teleport');if(c)a.position=c.position.slice();}}
 battleSpec(){const g=this.game;return {...g.stage.battles.super_tutorial_goblins,dontMovePartyOnStart:true,positions:Object.fromEntries(g.stage.battles.super_tutorial_goblins.actors.map(h=>{const r=g.actors.get(h);return [h,[r.position.x,r.position.y,-r.position.z]];}))};}
}
