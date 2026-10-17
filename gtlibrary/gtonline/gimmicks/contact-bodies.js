import {actorBounds,objectBounds} from './bounds.js';
export function contactActors(game,manualOnly=false){
 const result=[],records=game.actors||new Map();let hasLeader=false;
 for(const [handle,r] of records){if(r===game.player)hasLeader=true;if(r.visible===false||game.state.dead?.includes(handle)||manualOnly&&r!==game.player)continue;if(r===game.player&&(game.hopping||game.springJump))continue;const p=[r.position.x,r.position.y,-r.position.z];result.push(actorBounds(game,p));}
 if(!hasLeader&&game.player?.visible!==false&&!game.hopping&&!game.springJump)result.push(actorBounds(game));return result;
}
export function contactObjects(game,except){return game.objects.filter(o=>o!==except&&!o.hidden&&!o.unavailable&&o!==game.carrying&&!game.thrown.some(t=>t.object===o)&&!game.state.collected.includes(o.id)&&(o.spec.Holdable||o.spec.Pushable)&&o.spec.FieldObjectBehaviour?.__class__!=='Oak.IngredientBehaviour'&&(o.stats?.Mass??0)>=0).map(objectBounds);}
