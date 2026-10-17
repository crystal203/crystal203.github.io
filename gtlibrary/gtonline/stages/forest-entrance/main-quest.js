import {dropPose} from '../../item-motion.js';
const pos=r=>[r.position.x,r.position.y,-r.position.z];
/** Quest 27, ForestMainNewSection8. Native callbacks stay with this stage. */
export class ForestMainQuest{
 constructor(game){this.game=game;game.state.quests??={};this.progress=game.state.quests[27]??={innerProgress:game.has('forest_phone')?8:7,grade:-1};}
 async prepare(){const g=this.game,r=await g.actor('maiden');if(this.progress.innerProgress===7){const p=g.stage.markers.default_start;g.state.position=p.slice();g.runtime.setWorldPosition(r,[p[0]+1,p[1],p[2]]);g.runtime.setActorState(r,{animation:'idle',direction:'left'});g.runtime.setWorldVisible(r,true);}else g.joinParty('maiden');}
 async enter(){if(this.progress.innerProgress===7)await this.game.scene('forest_phone');}
 beforeScene(key){if(key==='forest_phone'){this.drop?.sprite.dispose();this.drop=null;this.game.storyMessage=null;this.game.hudVisible=false;this.game.music=this.game.stage.music.field;}}
 handle(h){const g=this.game;
  if(h.name==='ForestPhoneDrop'){const from=pos(g.actors.get('maiden')),to=pos(g.player);to[0]+=.25;this.drop={sprite:g.runtime.spawnWorldItem(20017),from,to,at:g.clock};return true;}
  if(h.name==='ForestPhoneGet'){this.drop?.sprite.dispose();this.drop=null;g.flag('item:20017');if(h.skipped)return true;const events=g.runtime.events;events.playing=false;g.mode='loot';g.loot={popup:{ItemId:20017},popupAt:g.clock,drops:[],resumeMode:'scene',onFinish:()=>{events.resolveCallback('ForestPhoneGet');}};g.emit();return true;}
  if(h.name==='ForestPhoneSNS'){g.flag('follower:13');g.state.sns??=[];if(!g.state.sns.some(m=>m.code==='forest_main_s8_sns_0'))g.state.sns.push({from:'maiden',portrait:'maiden_2',code:'forest_main_s8_sns_0'});if(h.skipped)return true;g.storyMessage={title:g.stage.strings.maiden||'罗兰茵',text:g.stage.strings.forest_main_s8_sns_0};g.runtime.events.playing=false;g.emit();return true;}
  if(h.name==='ForestPhoneComplete'){this.progress.innerProgress=8;g.save(true);return true;}
  return false;
 }
 advance(){const g=this.game;if(!g.storyMessage)return false;g.storyMessage=null;g.runtime.events.resolveCallback('ForestPhoneSNS');g.emit();return true;}
 update(){if(this.drop){const d=this.drop;d.sprite.setPose(dropPose(d.from,d.to,Math.min(.6,this.game.clock-d.at)));}}
 afterScene(key){if(key==='forest_phone'){this.drop?.sprite.dispose();this.drop=null;this.game.storyMessage=null;this.game.hudVisible=true;this.game.direction='back';this.game.runtime.setActorState(this.game.player,{animation:'idle',direction:'back'});this.game.joinParty('maiden');}}
 dispose(){this.drop?.sprite.dispose();}
}
