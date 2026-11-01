import {fxSourceTime,fxSourceTimelineTime} from './fx-playback.js';
import {playbackTime,samplePlayback,playbackSpec} from '../shared/playback-time.js';
import {sampleAnimationMix} from '../gtasset/animation-mix.js';
import * as THREE from '../vendor/three.module.js';
import {FxRuntime} from '../gtfx/core.js';
import {FxCharacterPlayer} from '../gtfx/character-player.js';
import {FxActionPlayer} from '../gtfx/action-player.js';
import {actionModules} from '../gtfx/action-modules.js';
import {fxTakeover,poseQuaternion,relativeTransform} from './fx-controls.js';
import {equipmentCatalog} from './equipment-ui.js';
import {readPose} from './editing.js';
import {renderOrder} from '../gtmap/render-order.js';
import {sampleKeys} from './model.js';
import {sampleGraphPath} from '../gtfx/graph-action.js';
import {equipmentProfile,sourceExclusiveWeapon} from '../gtfx/equipment-selection.js';
import {mainWeaponSlots} from '../gtfx/equipment-options.js';
import {selectDirectionView} from '../gtfx/character-direction-views.js';
import {clipTime} from '../gtfx/character-link.js';
import {profiles} from '../gtfx/character-link.js';
import {groupCharacters,resolveCharacter,mergeCharacterIndexes,mergeNativeCharacterPacks} from '../gtfx/character-catalog.js';

const root=new URL('../',import.meta.url),json=async path=>{const r=await GTResources.fetch(new URL(path,root));if(!r.ok)throw Error('特效资源读取失败：'+path);return r.json();};
let catalogs;
export function fxCatalog(){return catalogs??=Promise.all([json('resources/fx/catalog.json'),json('gtfx/assets/character-groups.json'),json('gtfx/assets/native-actions.json'),json('gtfx/assets/native-action-plans.json')]).then(([catalog,groups,actions,plans])=>({characters:groupCharacters(catalog,groups),actions,plans})).catch(e=>{catalogs=null;throw e;});}
const packs=new Map();
export async function fxCharacter(id){
 if(!packs.has(id))packs.set(id,(async()=>{const c=await fxCatalog(),character=resolveCharacter(c.characters,id);if(!character)throw Error('角色未注册 GTFX：'+id);const imported=await Promise.all(character.members.map(async member=>{const r=await GTResources.fetch(new URL('gtfx/assets/native-characters/'+member.id+'.json',root));return r.ok?r.json():null;}));const native=mergeNativeCharacterPacks(character,imported)||c.actions,profile=native.profile||profiles[character.id];if(!profile)throw Error('角色缺少 GTFX 动作配置');const index=mergeCharacterIndexes(character,await Promise.all(character.members.map(m=>json('resources/fx/'+m.index))));return {character,native,profile,index:{...index,effects:index.effects.map(e=>native.presetDirections?.[e.preset]?{...e,direction:native.presetDirections[e.preset]}:e)},plans:native.plans?{...c.plans,[character.id]:native.plans}:c.plans};})().catch(e=>{packs.delete(id);throw e;}));
 return packs.get(id);
}
export function moduleChoices(pack,appearance,overrides={}){const {character,index,native,plans,profile}=pack;return actionModules(character.id,index,{direction:'right',weapon:profile.weapon,weaponEquipped:true,appearance:appearance||profile.appearances[0],skin:profile.defaultSkin,profile,targetDistance:6,seed:12345,summoned:true,...overrides},native,plans);}

const facing={front:[0,0,-1],back:[0,0,1],left:[-1,0,0],right:[1,0,0]};
export function fxActorOptions(pack,clip,pose,catalog,record){
 const owned=fxTakeover(clip),actor=clip.actor||{},base=pack.profile,equipment=owned.equipment?(actor.equipment||{}):(pose.equipment||{}),slots=mainWeaponSlots(base.weaponType,base.weaponSlots),appearance=base.appearances.includes(clip.appearance)?clip.appearance:base.appearances.includes(pose.resource)?pose.resource:base.appearances[0];
 const inherited=key=>{const slot=record?.character?.skeleton?.slots.find(s=>GTEquipment.slotKey(s.data.name)===key),binding=slot&&record.character.equipment.bindings[slot.data.index];return binding?.attachment?.name;};
 const code=key=>equipment[key]!==undefined?(equipment[key]===0?'':catalog.byId.get(Number(equipment[key]))?.sprite):!owned.equipment?inherited(key):undefined;
 const weapon=owned.equipment?(slots.map(n=>code('[base]weapon'+n)).find(v=>v!==undefined)??clip.weapon??base.weapon):base.weapon,shield=owned.equipment&&!slots.includes(2)?code('[base]weapon2')??clip.shield??'':'';
 const profile=weapon?equipmentProfile(pack.native,base,appearance,appearance,weapon,catalog.types):base,direction=(owned.direction?(actor.direction||clip.direction):pose.direction)||pose.direction||'right';
 return {direction,weapon,weaponEquipped:!!weapon,shield,appearance,skin:(owned.skin?(actor.skin||clip.skin):pose.skin)||profile.defaultSkin,profile,heroAppearance:appearance,targetDistance:6,seed:clip.seed??12345,summoned:true,exclusiveWeapon:sourceExclusiveWeapon(pack.native,profile,appearance,appearance,weapon),centerHeight:.375,showTarget:false};
}

// Object targets use their world position exclusively; distance values belong to distance mode.
export function fxTargetOptions(clip,base,frame=new THREE.Matrix4(),records,resolveRecord){
 const inverse=new THREE.Matrix4().compose(new THREE.Vector3(base.position[0],base.position[1],-base.position[2]),poseQuaternion(base.rotation3D),new THREE.Vector3(...base.scale)).invert(),frameInverse=frame.clone().invert();
 const point=(id,offset)=>{if(!id)return offset.slice();const target=records?.get(id)||resolveRecord?.(id);if(!target)throw Error('GTFX 目标不存在：'+id);const at=target.videoPosition||[target.position.x,target.position.y,-target.position.z],p=new THREE.Vector3(at[0],at[1],-at[2]).applyMatrix4(inverse).applyMatrix4(frameInverse);return [p.x,p.y,-p.z];};
 const targetPosition=point(clip.target,clip.targetOffset||[6,0,0]);return {targetPosition,targetDistance:Math.hypot(targetPosition[0],targetPosition[2]),secondaryTargets:(clip.secondary||[]).map(target=>point(target.object,target.offset||[0,0,0]))};
}

export class FxLayer {
 constructor(bridge,clip,record,{poseAt,resolveRecord}={}){Object.assign(this,{bridge,clip,record,poseAt,resolveRecord});this.poseAt??=()=>readPose(record);this.attachments=new Map();this.equipmentStates=new WeakMap();this.renderOrders=new WeakMap();this.moduleCache=new Map();this.emotions=new WeakMap();this.animationMixers=new WeakMap();this.expressionRenderers=new WeakSet();this.preparedBones=new WeakSet();}
 options(records,pose=this.poseAt(this.clip.start),frame=new THREE.Matrix4()){
  return {...fxActorOptions(this.pack,this.clip,pose,this.catalog,this.record),...fxTargetOptions(this.clip,this.poseAt(this.clip.start),frame,records,this.resolveRecord)};
 }
 async load(){
  [this.pack,this.catalog]=await Promise.all([fxCharacter(this.clip.character),equipmentCatalog()]);const shared=this.bridge.renderer,facade={domElement:shared.domElement,setPixelRatio(){},setClearColor(){},setSize(){},render(){},clearDepth(){},dispose(){},forceContextLoss(){},autoClear:true,getRenderTarget:()=>null};
  const rt=this.rt=new FxRuntime(shared.domElement,{renderer:facade});rt.characterPlayer=new FxCharacterPlayer(rt);rt.modulePlayer=new FxActionPlayer(rt);const actions=rt.modulePlayer,anchor=actions.anchor.bind(actions);actions.anchor=(track,time)=>{const options=actions.options,entry=actions.entries.find(entry=>entry.track===track);if(entry?.placementOptions)actions.options=entry.placementOptions;try{return anchor(track,time);}finally{actions.options=options;}};rt.grid.visible=false;
  this.bodyRoot=new THREE.Group();this.bodyRoot.matrixAutoUpdate=false;rt.scene.add(this.bodyRoot);this.bodyRoot.add(rt.characterPlayer.group);this.renderActor??=true;
  const options=this.options(),module=this.module(options),url=new URL('resources/fx/'+this.pack.character.members[0].index,root);await rt.load(this.pack.index,path=>GTResources.url(path,url),{effect:module.tracks.map(t=>t.effect),loadImage:path=>GTResources.image(path)});
  await rt.characterPlayer.load(options.appearance,options.direction,options.skin,options.profile,options.weapon,options.shield);
  const first=module.tracks[0]?.effect||this.pack.index.effects[0],node=first.nodes.find(n=>n.id===first.root),definition={...first,id:'video:'+this.clip.id,nodes:[node],systems:[],statics:[],skeletons:[],scripts:[],duration:module.duration};
  rt.build(definition,options.seed);const player=rt.characterPlayer,original=player.applyPose.bind(player);player.applyPose=(link,time)=>this.applyPose(original,link,time);
  player.configure(module.actor,options,definition);player.moduleMode=true;player.module=module;await this.prepareViews(module,options);this.prepareBones(module);rt.group.visible=false;rt.modulePlayer.load(module,options);rt.duration=module.duration;this.nativeDuration=module.duration;
  rt.camera=this.bridge.camera;for(const entry of rt.modulePlayer.entries)if(!entry.track.link.screen)entry.sim.camera=rt.camera;rt.setView=()=>{};rt.resize=()=>{};this.bridge.scene.add(rt.scene);this.visible(false);this.currentOptions=options;
 }
 module(options){const key=JSON.stringify([this.clip.module,options.direction,options.weapon,options.weaponEquipped,options.shield,options.appearance,options.skin,options.seed,options.targetPosition,options.secondaryTargets,options.profile.nativeStyle,options.profile.weaponType,options.exclusiveWeapon,this.bridge.camera.nativeViewportScale()]);if(this.moduleCache.has(key))return this.moduleCache.get(key);const {character,index,native,plans,profile}=this.pack;let module=actionModules(character.id,index,options,native,plans).find(module=>module.id===this.clip.module);if(!module)module=moduleChoices(this.pack,options.appearance,{...options,weapon:profile.weapon,weaponEquipped:true,profile,exclusiveWeapon:true}).find(module=>module.id===this.clip.module);if(!module)throw Error('GTFX 动作已不可用：'+this.clip.module);if(this.moduleCache.size>=32)this.moduleCache.delete(this.moduleCache.keys().next().value);this.moduleCache.set(key,module);return module;}
 actorAt(time){const actor={...this.clip.actor};if(fxTakeover(this.clip).position&&actor.positionOffsetKeys){const offset=sampleKeys(actor.positionOffsetKeys,time,[0,0,0]);actor.positionOffset=(actor.positionOffset||[0,0,0]).map((value,index)=>value+offset[index]);}return actor;}
 frameAt(time,base,pose=this.poseAt(time)){return relativeTransform(base,pose,this.actorAt(time),fxTakeover(this.clip));}
 followsActor(link){return link.hook||link.anchor==='hook'||['character','weapon','bone','hand','feet','center','symbol'].includes(link.anchor)||link.bone||link.weaponAttachment||link.entityBoneFollower||link.graphFollow;}
 async placeEntries(time,records,base,current,relative){
  const player=this.rt.characterPlayer,prepared=new Set([player.module]);
  for(const entry of this.rt.modulePlayer.entries){if(entry.track.link.screen)continue;const reference=player.module.tracks[entry.instance]||entry.track,following=this.followsActor(reference.link),birth=fxSourceTimelineTime(this.clip,reference.at+(reference.link.delay||0),this.nativeDuration),pose=following?current:this.poseAt(birth),frame=following?relative:this.frameAt(birth,base,pose),options=this.options(records,pose,frame.matrix),module=this.module(options),source=module.tracks[entry.instance];
   if(source?.effect.id===entry.track.effect.id){if(module!==player.module&&!prepared.has(module)){await this.prepareViews(module,options);this.prepareBones(module);prepared.add(module);}const link=entry.track.link,screen=link.screen;for(const key of Object.keys(link))if(!Object.hasOwn(source.link,key)&&key!=='screen')delete link[key];Object.assign(link,source.link,{screen});entry.track.at=source.at;}
   if(!entry.actorWrapper){const wrapper=entry.actorWrapper=new THREE.Group();wrapper.matrixAutoUpdate=false;this.rt.scene.add(wrapper);wrapper.add(entry.sim.group);}entry.actorWrapper.matrix.copy(frame.matrix);entry.following=following;entry.placementFrame=frame;entry.placementOptions=options;if(!entry.sampleInFrame){const sample=entry.sim.sample.bind(entry.sim);entry.sim.sample=(...args)=>{const actorOptions=player.options,actionOptions=this.rt.modulePlayer.options;player.options={...actorOptions,...entry.placementOptions};this.rt.modulePlayer.options=entry.placementOptions;try{return sample(...args);}finally{player.options=actorOptions;this.rt.modulePlayer.options=actionOptions;}};entry.sampleInFrame=true;}
   const rotationKey=JSON.stringify([options.direction,options.targetPosition,options.secondaryTargets,options.weapon,options.shield]);if(entry.rotationKey!==rotationKey){const definition=player.effectDefinition(entry.track.effect,entry.track.link);if(definition.rootRotation){entry.sim.nodeRoot.userData.base.rotation.fromArray(definition.rootRotation);entry.sim.nativePlanCache=null;}entry.rotationKey=rotationKey;}
  }
 }
 keepBornParticles(entry,base){if(!entry.following)return;const group=entry.sim.group;group.updateMatrix();const inverse=group.matrix.clone().invert(),current=entry.placementFrame.matrix.clone().invert(),matrices=new Map();for(const particle of [...entry.sim.particles,...entry.sim.trails]){if(particle.s.local)continue;const mesh=particle.mesh||particle.trail;if(!mesh?.visible)continue;const birth=fxSourceTimelineTime(this.clip,entry.track.at+(entry.track.link.delay||0)+particle.birth/(particle.s.speed||1),this.nativeDuration),delta=matrices.get(birth)||inverse.clone().multiply(current).multiply(this.frameAt(birth,base).matrix).multiply(group.matrix);matrices.set(birth,delta);mesh.matrix.premultiply(delta);}}
 prepareBones(module){if(this.preparedBones.has(module))return;this.preparingBones=true;try{this.rt.characterPlayer.prepareBoneTracks(module);this.preparedBones.add(module);}finally{this.preparingBones=false;}}

 async prepareViews(module,options){
  const player=this.rt.characterPlayer,path=[...(module.actor.directionPath||[]),{time:module.duration+1,position:facing[options.direction]||facing.right}],views=new Set(path.map(point=>Math.abs(point.position[0])>=Math.abs(point.position[2])?'side':point.position[2]>0?'back':'front'));
  if(player.directionViews&&[...views].every(view=>player.directionViews.contexts.has(view))){this.bindExpressionRenderers();return;}
  for(const view of player.directionViews?.contexts.keys()||[])path.push({time:module.duration+2,position:facing[view==='side'?'right':view]});
  await player.prepareDirectionViews({...module,actor:{...module.actor,directionPath:path}});this.bindExpressionRenderers();
 }

 bindExpressionRenderers(){
  const player=this.rt.characterPlayer,renderers=new Set([player.renderer,...[...player.directionViews?.contexts.values()||[]].map(context=>context.renderer)]);for(const renderer of renderers){if(this.expressionRenderers.has(renderer))continue;const draw=renderer.draw.bind(renderer);renderer.draw=(skeleton,local,order,overlay)=>{if(this.renderActor===false)return;const emotion=this.emotions.get(skeleton);if(emotion){Object.assign(emotion.skeleton.color,{r:skeleton.color.r,g:skeleton.color.g,b:skeleton.color.b,a:skeleton.color.a});if(emotion.update())overlay=emotion.skeleton;}return draw(skeleton,local,order,overlay);};this.expressionRenderers.add(renderer);}
 }
 expression(player,name,time,loop,playback){
  const source=this.record.character.emotion,emotionAPI=globalThis.GTEmotion;if(!emotionAPI)return name;let overlay=this.emotions.get(player.skeleton);if(!overlay&&source){overlay=new emotionAPI.Overlay(spine,player.skeleton,source.skeleton.data);this.emotions.set(player.skeleton,overlay);}const route=emotionAPI.route(player.skeleton.data.animations.filter(animation=>animation.name.startsWith('[emo]')).map(animation=>animation.name),overlay?.face?overlay.skeleton.data.animations.map(animation=>animation.name):[],emotionAPI.key(name||''),player.view);if(overlay){overlay.select(route.advanced);const track=overlay.state.getCurrent(0);if(track){track.trackTime=samplePlayback(playback,track.animation.duration,loop,time);track.loop=loop;}}return route.native;
 }
 binding(player,id){const item=this.catalog.byId.get(Number(id));if(!item)return null;const frame=player.itemsData.data.frames[item.sprite];if(!frame)return null;const key=player.appearance+':'+id;if(!this.attachments.has(key))this.attachments.set(key,GTEquipment.createAttachment(spine,item.sprite,frame,player.itemsData.texture,player.itemsData.image.naturalWidth,player.itemsData.image.naturalHeight));return this.attachments.get(key);}
 equip(pose,owned){
  const player=this.rt.characterPlayer,settings=this.clip.actor?.equipment||{},equipment=owned.equipment?settings:(pose.equipment||{}),source=this.record.character,sourceBindings=source.skeleton.slots.filter(s=>/weapon|item/i.test(s.data.name)).map(s=>[GTEquipment.slotKey(s.data.name),source.equipment.bindings[s.data.index]?.attachment?.name||'']);
  const signature=JSON.stringify([owned.equipment,equipment,player.weapon,player.shield,sourceBindings]);if(this.equipmentStates.get(player.skeleton)===signature)return;
  player.equipment.clear();player.setWeapon(this.currentOptions?.weapon??player.weapon);if(player.shieldSlot&&!player.weaponSlots.includes(player.shieldSlot))player.setShield(this.currentOptions?.shield??player.shield);
  for(const slot of player.skeleton.slots){if(!/weapon|item/i.test(slot.data.name))continue;const key=GTEquipment.slotKey(slot.data.name);if(equipment[key]!==undefined)player.equipment.equip(slot,Number(equipment[key])===0?null:this.binding(player,equipment[key]));else if(!owned.equipment){const original=source.skeleton.slots.find(s=>GTEquipment.slotKey(s.data.name)===key),binding=original&&source.equipment.bindings[original.data.index];player.equipment.equip(slot,binding?.attachment||original?.getAttachment()||null);}}
  this.equipmentStates.set(player.skeleton,signature);
 }
 applyPose(original,link,time){
  const owned=fxTakeover(this.clip),actor=this.clip.actor||{},ordinary=this.poseAt(fxSourceTimelineTime(this.clip,time,this.nativeDuration)),pose={...ordinary,...(!this.preparingBones&&this.currentPose||{})},player=this.rt.characterPlayer,forceDirection=!owned.direction?pose.direction:actor.direction||this.clip.direction,poseLink={...link};
  if(forceDirection)poseLink.directionPath=[{time:0,position:facing[forceDirection]||facing.right}];selectDirectionView(player,poseLink,time);
  if(!owned.skin||actor.skin){const skin=!owned.skin?pose.skin:actor.skin;player.skin=player.skeleton.data.findSkin(skin)?skin:player.skeleton.data.findSkin(this.pack.profile.defaultSkin)?this.pack.profile.defaultSkin:'default';poseLink.skinPath=[];}
  if(!owned.equipment)poseLink.attachmentPath=[];this.equip(pose,owned);original(poseLink,time);const nativePosition=player.group.position.clone(),nativeRotation=player.group.quaternion.clone(),nativeScale=player.group.scale.clone(),nativeAlpha=player.skeleton.color.a;this.nativePose={position:nativePosition,quaternion:nativeRotation,scale:nativeScale};
  const speed=owned.speed?(actor.speed??1):(pose.speed??1),apply=(name,at,loop,prefix='',playback)=>{if(!name)return false;const full=prefix&&!name.startsWith(prefix)?prefix+name:name,directed=GTEquipment.inheritAnimation(player.skeleton.data.animations.map(a=>a.name),full,player.view,full),animation=player.skeleton.data.findAnimation(directed)||player.skeleton.data.findAnimation(full+'_'+player.view)||player.skeleton.data.findAnimation(full)||player.skeleton.data.findAnimation(name+'_'+player.view)||player.skeleton.data.findAnimation(name);if(!animation)return false;animation.apply(player.skeleton,0,samplePlayback(playback,animation.duration,loop,at),loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);return true;};
  const reset=!owned.animation||!!actor.animation;if(reset){player.skeleton.setToSetupPose();let mixed=false;if(!owned.animation&&pose.animationMix){let state=this.animationMixers.get(player.skeleton);if(!state){state=new spine.AnimationState(new spine.AnimationStateData(player.skeleton.data));this.animationMixers.set(player.skeleton,state);}mixed=sampleAnimationMix(state,player.skeleton,pose.animationMix,name=>{const full=GTEquipment.inheritAnimation(player.skeleton.data.animations.map(a=>a.name),name,player.view,name);return player.skeleton.data.findAnimation(full)||player.skeleton.data.findAnimation(name+'_'+player.view)||player.skeleton.data.findAnimation(name);});if(mixed)state.apply(player.skeleton);}if(!mixed)apply(owned.animation?actor.animation:pose.animation,owned.animation?time*speed:(pose.animationTime??time*speed),owned.animation?actor.loop!==false:pose.loop!==false,'',owned.animation?playbackSpec(time,speed):pose.animationPlayback);}else if(speed!==1){original(poseLink,playbackTime(time,speed,this.rt.duration));player.group.position.copy(nativePosition);player.group.quaternion.copy(nativeRotation);player.group.scale.copy(nativeScale);}
  if(owned.expression&&!actor.expression)this.expression(player,'',0,true);
  for(const [property,track,prefix] of [['sub','Sub','[sub]'],['expression','Emotion','[emo]']]){if(!owned[property]||actor[property]){const at=owned[property]?time*speed:(pose[property+'Time']??time*speed),loop=owned[property]?true:pose[property+'Loop']!==false,name=owned[property]?actor[property]:pose[property];const playback=owned[property]?playbackSpec(time,speed):pose[property+'Playback'];apply(property==='expression'?this.expression(player,name,at,loop,playback):name,at,loop,prefix,playback);}else if(reset){const clip=link.clips?.filter(c=>c.track===track&&time>=c.start&&time<(c.end??link.end)).at(-1);if(clip){const animation=player.skeleton.data.findAnimation(clip.name+'_'+player.view)||player.skeleton.data.findAnimation(clip.name);if(animation)apply(clip.name,clipTime(clip,time,animation.duration),clip.loop);}else apply('idle',time,true,prefix);}}
  if(!owned.equipment)for(const binding of Object.values(player.equipment.bindings))binding.slot.setAttachment(binding.attachment);if(!owned.position)player.group.position.set(0,0,0);if(!owned.rotation)player.group.quaternion.identity();if(!owned.scale)player.group.scale.set(1,1,1);player.skeleton.color.a=owned.alpha?nativeAlpha*(actor.alpha??1):(pose.alpha??1);player.group.visible=owned.visible?player.group.visible&&actor.visible!==false:pose.visible!==false;player.skeleton.updateWorldTransform();
 }
 // Native GTFX orders use 65536 per layer; GTMap uses 100000 plus material queue.
 // Sharing the camera alone leaves FX bodies underneath transparent map surfaces.
 mapOrder(order,index){
  const character=this.record.character,mapLayers=this.bridge.characters.sortingLayers||[],source=index?.nativeSortingLayers?.layers,base=source?.findIndex(layer=>layer.uniqueID===0),rank=source?Math.floor((order+32768)/65536):0,sort=source?order-rank*65536:order,layer=source?.[base+rank],mapped=layer&&mapLayers.find(candidate=>(candidate.uniqueID>>>0)===(layer.uniqueID>>>0)||candidate.name===layer.name);
  return mapped?renderOrder(3000,character.layer,mapped.name,sort,mapLayers):60000+character.layer+rank*100000+sort*.001;
 }
 syncMapRendering(){
  const player=this.rt.characterPlayer,character=this.record.character,layers=this.bridge.characters.sortingLayers||[],actorOrder=renderOrder(3000,character.layer,character.settings.sortingLayer||0,character.settings.sortingOrder||0,layers),distance=this.record.position.dot(this.bridge.camera.position)*.00000001;
  const body=(renderer)=>{renderer.groundDepth=character.settings.groundDepth!==false;renderer.groundY=this.record.position.y+.03;for(const mesh of renderer.meshes)mesh.renderOrder=actorOrder+mesh.renderOrder*.001+distance;};
  body(player.renderer);for(const mirage of player.mirageRenderer.instances)if(mirage.group.visible)body(mirage.renderer);
  for(const entry of this.rt.modulePlayer.entries){if(entry.track.link.screen)continue;entry.sim.group.traverse(mesh=>{if(!mesh.isMesh)return;const previous=this.renderOrders.get(mesh);if(previous&&mesh.renderOrder===previous.mapped)return;const mapped=this.mapOrder(mesh.renderOrder,entry.sim.index);mesh.renderOrder=mapped;this.renderOrders.set(mesh,{mapped});});}
 }
 visible(value){if(this.rt){this.active=value;this.rt.scene.visible=value;this.rt.screenScene.visible=value&&this.clip.screenfx!==false;}}
 worldPositionAt(time,{basePose,pose,records}){
  const clip=this.clip,owned=fxTakeover(clip),actor={...clip.actor};if(owned.position&&actor.positionOffsetKeys){const offset=sampleKeys(actor.positionOffsetKeys,clip.start+time,[0,0,0]);actor.positionOffset=(actor.positionOffset||[0,0,0]).map((value,index)=>value+offset[index]);}
  const relative=relativeTransform(basePose,pose,actor,owned),module=this.module(this.options(records,pose,relative.matrix)),at=fxSourceTime(clip,time,module.duration),path=owned.position&&module.actor.graphPath?sampleGraphPath(module.actor.graphPath,at):[0,0,0],offset=owned.position&&module.actor.graphPath?sampleGraphPath(module.actor.spinePath,at):[0,0,0],stage=new THREE.Matrix4().compose(new THREE.Vector3(basePose.position[0],basePose.position[1],-basePose.position[2]),poseQuaternion(basePose.rotation3D),new THREE.Vector3(...basePose.scale)),point=new THREE.Vector3(path[0]+offset[0],path[1]+offset[1],-path[2]-offset[2]).applyMatrix4(relative.matrix).applyMatrix4(stage);return [point.x,point.y,-point.z];
 }
 async sample(time,{records,basePose,pose,renderActor=true}={}){
  this.renderActor=renderActor;const rt=this.rt,c=this.clip,owned=fxTakeover(c),base=basePose||this.poseAt(c.start),current=pose||this.poseAt(c.start+time),actor={...c.actor};this.currentPose=current;
  if(owned.position&&actor.positionOffsetKeys){const offset=sampleKeys(actor.positionOffsetKeys,c.start+time,[0,0,0]);actor.positionOffset=(actor.positionOffset||[0,0,0]).map((v,i)=>v+offset[i]);}
  const relative=relativeTransform(base,current,actor,owned);rt.scene.position.set(base.position[0],base.position[1],-base.position[2]);rt.scene.quaternion.copy(poseQuaternion(base.rotation3D));rt.scene.scale.fromArray(base.scale);this.bodyRoot.matrix.copy(relative.matrix);
  const options=this.options(records,current,relative.matrix),signature=JSON.stringify([options.targetPosition,options.secondaryTargets,options.weapon,options.shield,options.direction,options.profile.nativeStyle,options.skin,this.bridge.camera.nativeViewportScale(),c.seed,c.takeover,c.actor?.equipment,c.actor?.animation,c.actor?.sub,c.actor?.expression,c.actor?.speed]);
  if(signature!==this.targetSignature){const module=this.module(options),player=rt.characterPlayer,entries=rt.modulePlayer.entries;if(options.profile.weaponType!==player.weaponType){await player.load(options.appearance,options.direction,options.skin,options.profile,options.weapon,options.shield);await this.prepareViews(module,options);}else{player.profile=options.profile;player.setWeapon(options.weapon);if(player.shieldSlot&&!player.weaponSlots.includes(player.shieldSlot))player.setShield(options.shield);}
   await this.prepareViews(module,options);this.currentOptions=options;player.skin=options.skin;rt.seed=c.seed??12345;player.configure(module.actor,options,{duration:module.duration});player.module=module;this.prepareBones(module);
   if(entries.length===module.tracks.length&&entries.every(e=>e.track.effect.id===module.tracks[e.instance]?.effect.id)){rt.modulePlayer.module=module;rt.modulePlayer.options=options;entries.forEach(entry=>{const next=module.tracks[entry.instance],link=entry.track.link,screen=link.screen;for(const key of Object.keys(link))if(!Object.hasOwn(next.link,key)&&key!=='screen')delete link[key];Object.assign(link,next.link,{screen});entry.track.at=next.at;});}else{for(const entry of entries)entry.actorWrapper?.removeFromParent();rt.modulePlayer.load(module,options);}rt.duration=module.duration;this.nativeDuration=module.duration;this.targetSignature=signature;
  }
  await this.placeEntries(time,records,base,current,relative);
  rt.resizeScreenCamera(this.bridge.renderer.domElement.width,this.bridge.renderer.domElement.height);rt.sample(fxSourceTime(c,time,rt.duration));
  for(const entry of rt.modulePlayer.entries){const {sim,track}=entry;if(track.link.screen){sim.group.visible&&=c.screenfx!==false;continue;}if(!owned.position&&this.nativePose&&entry.following)sim.group.position.sub(this.nativePose.position);this.keepBornParticles(entry,base);}

  this.syncMapRendering();rt.scene.updateMatrixWorld(true);const at=rt.characterPlayer.group.getWorldPosition(new THREE.Vector3());this.bodyRoot.visible=renderActor;if(renderActor)this.record.videoPosition=[at.x,at.y,-at.z];
 }
 screen(){if(!this.active||this.clip.screenfx===false)return;const renderer=this.bridge.renderer,auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(this.rt.screenScene,this.rt.screenCamera);renderer.autoClear=auto;}
 dispose(){this.rt?.scene.removeFromParent();this.rt?.dispose();this.attachments.clear();}
}

