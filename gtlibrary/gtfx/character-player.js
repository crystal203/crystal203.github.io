import {applyNativeAim} from './native-skeleton-aim.js';
import {prepareDirectionViews,selectDirectionView,clearDirectionViews} from './character-direction-views.js';
import {GraphMirageRenderer} from './graph-mirage-renderer.js';
import {applyTimelineSkin} from './melee-timeline.js';
import {effectDirectionNodes} from './effect-direction.js';
import {mainWeaponSlots} from './equipment-options.js';
import {targetPositions,snapshotPlaybackTargets} from './targeting.js';
import {sampleGraphPath} from './graph-action.js';
import * as THREE from '../vendor/three.module.js';
import {SpineThreeRenderer} from '../gtasset/three-renderer.js';
import {directions,castDirection,effectRotation,actionClip,clipTime,anchorPosition,hookDistance} from './character-link.js';

const asset=path=>new URL('../'+path,import.meta.url);
async function read(url,type='text'){
 const response=await GTResources.fetch(url);if(!response.ok)throw Error('人物资源读取失败：'+url);return response[type]();
}
let bootstrap;
function scripts(){return bootstrap||(bootstrap=(async()=>{
 for(const [path,key] of [['vendor/spine-webgl.js','spine'],['gtasset/core.js','GTSpineCore'],['gtasset/equipment.js','GTEquipment']]){
  if(globalThis[key])continue;
  await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=asset(path);tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('人物运行库加载失败'));};document.head.append(tag);});
 }
})().catch(error=>{bootstrap=null;throw error;}));}

/** One native skeleton in the same Three scene/camera/capture target as the FX. */
export class FxCharacterPlayer {
 constructor(runtime){
  this.runtime=runtime;this.mirageRenderer=new GraphMirageRenderer(this);this.cache=new Map();this.token=0;this.group=new THREE.Group();runtime.scene.add(this.group);
  this.pickables=[];this.record={refs:[],visible:true,matrix:new THREE.Matrix4()};
  this.selection={records:new Map([['fx-character',this.record]]),attach:(_id,mesh)=>this.record.refs.push({mesh,local:new THREE.Matrix4()})};
  this.target=new THREE.Mesh(new THREE.RingGeometry(.22,.25,32),new THREE.MeshBasicMaterial({color:0x8ab9e8,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
  // Match the FX display-RGB pipeline when capturing into an RGBA byte target.
  this.target.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor=sRGBTransferOETF(gl_FragColor);');};
  this.secondaryMarkers=[];this.target.rotation.x=-Math.PI/2;this.target.position.y=.005;this.target.visible=false;runtime.scene.add(this.target);
 }
 async load(appearance,direction,skin,profile,weapon=profile.weapon,shield=''){
  clearDirectionViews(this);this.profile=profile;
  const token=++this.token;this.mirageRenderer.clear();this.active=false;this.group.visible=false;this.target.visible=false;this.secondaryMarkers.forEach(m=>m.visible=false);await scripts();
  const revision=profile.appearanceSources?.[appearance]?.bundleSha256||'',suffix=revision?'?v='+revision:'';
  const view=direction==='left'||direction==='right'?'side':direction,key=appearance+':'+view+':'+revision;
  if(!this.cache.has(key)){
   const promise=(async()=>{
    const prefix='gtasset/assets/character/'+appearance;
    const [atlasText,bytes]=await Promise.all([read(asset(prefix+'.atlas'+suffix)),read(asset(prefix+'_'+view+'.bytes'+suffix),'arrayBuffer')]);
    const images=await Promise.all(GTSpineCore.pages(atlasText).map(page=>GTResources.image(asset('gtasset/assets/character/'+page+suffix))));
    const decoded=GTSpineCore.parse({spine,atlasText,bytes,images,createTexture:image=>SpineThreeRenderer.texture(spine,image)});
    if(this.disposed){decoded.dispose();throw Error('人物播放器已关闭');}return decoded;
   })();this.cache.set(key,promise);promise.catch(()=>{if(this.cache.get(key)===promise)this.cache.delete(key);});
  }
  const decoded=await this.cache.get(key);
  if(!this.items){this.items=(async()=>{const data=await read(asset('gtatlas/assets/items.json'),'json'),image=await GTResources.image(asset('gtatlas/assets/'+data.meta.image));const texture=SpineThreeRenderer.texture(spine,image);if(this.disposed){texture.dispose();throw Error('人物播放器已关闭');}return {data,image,texture};})().catch(error=>{this.items=null;throw error;});}
  const items=await this.items;if(token!==this.token||this.disposed)return null;
  const skeleton=GTSpineCore.createInstance(spine,decoded.data),skins=decoded.data.skins.map(s=>s.name);
  skin=skins.includes(skin)?skin:skins.includes(profile.defaultSkin)?profile.defaultSkin:skins.find(s=>s!=='default')||'default';
  skeleton.setSkinByName(skin);skeleton.setSlotsToSetupPose();
  const equipment=new GTEquipment.Equipment(skeleton),weaponSlots=mainWeaponSlots(profile.weaponType,profile.weaponSlots).map(number=>skeleton.slots.find(s=>new RegExp(`^\\[base\\]weapon${number}_${view}$`).test(s.data.name)));
  if(weaponSlots.some(slot=>!slot))throw Error('缺少 '+appearance+' 原生武器挂点');
  this.renderer?.clear();this.renderer=new SpineThreeRenderer(spine,this.group,{id:'fx-character',character:{resource:appearance}},this.selection,this.pickables);
  Object.assign(this,{skeleton,equipment,slot:weaponSlots[0],weaponSlots,weaponType:profile.weaponType,nativeWeapon:profile.weaponByAppearance?.[appearance]||profile.weapon,itemsData:items,idleAnimation:profile.idleAnimation,view,direction,appearance,skin,skins});
  this.shieldSlot=skeleton.slots.find(s=>new RegExp(`^\\[base\\]weapon2_${view}$`).test(s.data.name));
  this.setWeapon(weapon);this.setShield(shield);return {skins,skin};
 }
 setWeapon(name){
  if(!this.skeleton||!this.equipment)return;
  const items=this.itemsData;
  // itemsData is the resolved atlas retained by load for instant switching.
  if(name&&!items?.data.frames[name])throw Error('武器图集缺少 '+name);
  const attachment=name?GTEquipment.createAttachment(spine,name,items.data.frames[name],items.texture,items.image.naturalWidth,items.image.naturalHeight):null;
  for(const slot of this.weaponSlots)this.equipment.equip(slot,attachment);
  this.weapon=name;
 }
 setShield(name){
  if(name&&(!this.shieldSlot||this.weaponSlots.includes(this.shieldSlot)))throw Error('当前骨骼没有可用副手盾牌挂点');
  if(name&&!this.itemsData.data.frames[name])throw Error('盾牌图集缺少 '+name);
  this.shield=name||'';
  if(this.shieldSlot&&!this.weaponSlots.includes(this.shieldSlot)){
   const {data,texture,image}=this.itemsData;
   this.equipment.equip(this.shieldSlot,name?GTEquipment.createAttachment(spine,name,data.frames[name],texture,image.naturalWidth,image.naturalHeight):null);
  }
 }
 configure(link,options,effect){
  if(link?.idleAnimation!==undefined)this.idleAnimation=link.idleAnimation;
  this.link=link;this.options=snapshotPlaybackTargets(options,this.direction);this.fxDuration=effect.duration;this.active=!!link;this.group.visible=this.active;
  this.runtime.nativePlanCache=null;
 }
 effectDefinition(effect,link=this.link){
  if(!this.active)return effect;
  // HookShot.SetFromTo uses Vector3.forward, independently of EffectPreset.Direction.
  const rotation=effectRotation(link.hook?[0,0,1]:link.referenceDirection||effect.direction,link.directed===false?null:(link.graphDirection||castDirection(link,this.direction,this.options)),link.rotationType);
  const quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation.yaw)
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),rotation.roll));
  if(link.anchor==='meteor'){
   const side=link.meteorSide||1,height=link.meteorHeight||4.5;
   quaternion.setFromUnitVectors(new THREE.Vector3(...effect.direction).normalize(),new THREE.Vector3(this.direction==='right'?side:-side,-height,-height).normalize());
  }
  const definition={...effect,nativeTileAnimation:!!link.nativeTileAnimation,nativeStretchVelocity:!!link.nativeStretchVelocity,skeletonSkin:link.skeletonSkin,skeletonAnimation:link.skeletonAnimation,skeletonView:link.skeletonView,skeletonFlip:link.skeletonFlip,skeletonClips:link.skeletonClips,skeletonAttachments:link.skeletonAttachments,skeletonEquipmentAssets:link.skeletonAttachments?.length?this.itemsData:undefined,skeletonAlpha:link.skeletonAlpha,skeletonOffsetPath:link.skeletonOffsetPath,skeletonRotationPath:link.skeletonRotationPath,skeletonRotationPivot:link.skeletonRotationPivot,skeletonIdle:link.skeletonIdle,rootRotation:quaternion.toArray(),rootUniformScale:link.uniformScale??1,rootScaleY:link.rootScaleY??1,rootScaleX:link.rootScaleX??1,rootScaleZ:(link.rootScaleZ||1)*(link.mirrorZForLeft&&this.direction==='left'?-1:1),rootScaleFactor:link.scaleFactor||1};
  definition.nodes=effectDirectionNodes(effect,this.direction);
  if(link.attachmentNodePaths?.length){
   definition.sampleNodes=(simulation,localTime)=>{
    effect.sampleNodes?.(simulation,localTime);const time=localTime+(link.delay||0);
    for(const row of link.attachmentNodePaths){const node=simulation.nodes.get(row.node);if(!node)throw Error('Native WeaponAttachment follower node missing: '+row.node);const p=sampleGraphPath(row.position,time),r=sampleGraphPath(row.rotation,time),scale=sampleGraphPath(row.scale,time);node.position.set(p[0],p[1],-p[2]);node.rotation.z=r[0];node.scale.set(...scale);}
   };
  }
  // The native hook replaces CustomSprite.LeftObject/RightObject with the
  // currently equipped item. Apply that binding by atlas metadata, so other
  // weapon-carrying effects can use the same rule without character branches.
  const frame=this.itemsData?.data.frames[this.weapon];
  if(frame&&this.nativeWeapon&&this.runtime.index){
   const atlas=this.runtime.index.sprites;
   const width=this.itemsData.image.naturalWidth,height=this.itemsData.image.naturalHeight;
   definition.statics=effect.statics.map(s=>{
    const source=atlas[s.sprite];if(source?.name!==this.nativeWeapon)return s;
    const f=frame.frame,key=`equipped:${this.weapon}:${s.sprite}`;
    atlas[key]={...source,name:this.weapon,atlasFrame:frame,
     uv:[f.x/width,(height-f.y-f.h)/height,f.w/width,f.h/height],
     size:[frame.sourceSize.w,frame.sourceSize.h],rotated:frame.rotated||false};
    const trim=frame.spriteSourceSize||frame.sourceSize,custom=s.customSprite;
    const size=custom?[trim.w*custom.pixelToWorld*custom.localScale.x,trim.h*custom.pixelToWorld*custom.localScale.y]:s.size;
    return {...s,sprite:key,size};
   });
  }
  if(!link.hook)return definition;
  const chain=effect.nodes.find(n=>n.name==='chain'),head=effect.nodes.find(n=>n.name==='head');
  if(!chain||!head)return definition;
  const layer=effect.statics.find(s=>s.node===chain.id),unit=chain.scale.y;
  if(!layer||!unit)return definition;
  const count=Math.ceil(Math.max(0,Math.min(this.options.targetDistance,link.hookMax??Infinity)-1.15)/unit);
  const segments=Array.from({length:count},(_,i)=>({...chain,id:chain.id+':'+i,name:'chain:'+i}));
  definition.nodes=effect.nodes.filter(n=>n!==chain).concat(segments);
  definition.statics=definition.statics.filter(s=>s.node!==chain.id).concat(segments.map((n,i)=>({...layer,node:n.id,chainIndex:i})));
  definition.sampleNodes=(sim,time)=>{
   effect.sampleNodes?.(sim,time);
   const length=hookDistance(link,time+(link.delay||0),this.options);
   const span=Math.max(0,length-1.15),h=sim.nodes.get(head.id);
   // Native head offset = .65 - .2; short throws also shrink the hook head.
   h.position.z=span+.45;h.scale.multiplyScalar(Math.min(1,length/1.15));
   segments.forEach((segment,i)=>{
    const node=sim.nodes.get(segment.id),size=Math.min(unit,Math.max(0,span-i*unit));
    node.position.y=i*unit+size/2;node.scale.y=size;
   });
  };
  return definition;
 }
 bindNodes(effect,simulation=this.runtime){for(const n of effect.nodes){const node=simulation.nodes.get(n.id);if(node)node.userData.linkName=n.name;}}
 async prepareDirectionViews(module){return prepareDirectionViews(this,module);}
 applyPose(link,time){
  selectDirectionView(this,link,time);
  const runtime=this.runtime,{skeleton,view}=this;
  const fade=link.alpha?.filter(a=>a.at<=time).at(-1),fadeProgress=fade?.duration?Math.min(1,(time-fade.at)/fade.duration):1;
  const actorAlpha=fade?(fade.from??fade.value)+(fade.value-(fade.from??fade.value))*fadeProgress:1;
  this.group.visible=actorAlpha>0;
  applyTimelineSkin(this,link,time);
  skeleton.setToSetupPose();skeleton.color.a=actorAlpha;
  const anglePath=link.spineRotationPath||link.spinePath||[];let angle=0;
  if(anglePath.length){let lo=0,hi=anglePath.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(anglePath[mid].time<=time)lo=mid;else hi=mid-1;}const a=anglePath[lo],b=anglePath[Math.min(lo+1,anglePath.length-1)],u=b.time>a.time?Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))):0;angle=(a.angle||0)+((b.angle||0)-(a.angle||0))*u;}
  this.group.rotation.z=angle*Math.PI/180;
  // Apply native lower/base pose, sub track, then the battle action's upper pose.
  const apply=(name,t,loop)=>{const anim=skeleton.data.findAnimation(name+'_'+view)||skeleton.data.findAnimation(name);if(anim)anim.apply(skeleton,0,t,loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);return anim;};
  const buffIdle=link.buffIdlePath?.find(e=>time>=e.at&&time<e.end)?.name;
  if(!apply(buffIdle||this.idleAnimation||this.weaponType+'_idle',time,true))apply('idle',time,true);
  apply('[sub]idle',time,true);
  if(link.graphPath){
   const position=sampleGraphPath(link.graphPath,time),offset=sampleGraphPath(link.spinePath,time);this.group.position.set(position[0]+offset[0],position[1]+offset[1],-position[2]-offset[2]);
   for(const track of ['Base','Sub','Upper','Emotion']){const c=link.clips.filter(c=>c.track===track&&time>=c.start&&time<(c.end??link.end)).at(-1);if(c){const anim=skeleton.data.findAnimation(c.name+'_'+view)||skeleton.data.findAnimation(c.name);if(anim){const elapsed=clipTime(c,time,anim.duration);if(c.nextAnimation&&!c.loop&&elapsed>=anim.duration){if(typeof c.nextAnimation!=='string')throw Error('Unsupported native NextAnimation metadata');const next=skeleton.data.findAnimation(c.nextAnimation+'_'+view)||skeleton.data.findAnimation(c.nextAnimation);if(!next)throw Error('Native next animation missing: '+c.nextAnimation);apply(c.nextAnimation,elapsed-anim.duration,false);}else apply(c.name,elapsed,c.loop);}}}
  }else this.group.position.set(0,0,0);
  const selected=link.graphPath?{name:'idle'}:actionClip(link,time,this.direction),animation=skeleton.data.findAnimation(selected.name+'_'+view)||skeleton.data.findAnimation(selected.name);
  if(animation&&selected.name!=='idle')apply(selected.name,clipTime(selected,time,animation.duration),selected.loop);
  for(const event of link.attachmentPath||[]){
   if(time<event.at||time>=(event.end??link.end))continue;
   const slot=skeleton.findSlot(event.slot+'_'+view)||skeleton.findSlot(event.slot);if(!slot)throw Error('Native actor attachment slot missing: '+event.slot);
   let attachment=null;if(event.weapon){
    const items=this.itemsData,frame=items?.data.frames[event.weapon];if(!frame)throw Error('原生临时武器图集缺少 '+event.weapon);
    const cache=this.namedAttachmentCache||(this.namedAttachmentCache=new Map());if(!cache.has(event.weapon))cache.set(event.weapon,GTEquipment.createAttachment(spine,event.weapon,frame,items.texture,items.image.naturalWidth,items.image.naturalHeight));attachment=cache.get(event.weapon);
   }else if(event.equipment){const source=skeleton.findSlot((event.fromSlot||event.slot)+'_'+view)||skeleton.findSlot(event.fromSlot||event.slot);attachment=source?this.equipment.bindings[source.data.index]?.attachment:null;}
   else if(event.name&&event.name!=='empty')attachment=skeleton.getAttachment(slot.data.index,event.name);
   slot.setAttachment(attachment);
  }
  const weaponHidden=this.moduleMode
   ?this.module.tracks.some(t=>t.link.hideWeaponUntil&&time>=t.at+(t.link.delay||0)&&time<Math.min(t.at+(t.link.delay||0)+t.link.hideWeaponUntil,t.at+(t.link.hideWeaponEnd??Infinity)))
   :link.hideWeaponUntil&&time<link.hideWeaponUntil;
  if(weaponHidden)for(const slot of this.weaponSlots)slot.setAttachment(null);
  applyNativeAim(this,link,time);
  skeleton.updateWorldTransform();
 }
 prepareBoneTracks(module){
  module.tracks=module.tracks.flatMap(track=>{const source=track.link.spineEvent;if(!source)return [track];
   const animation=this.skeleton.data.findAnimation(source.animation+'_'+this.view)||this.skeleton.data.findAnimation(source.animation);
   if(!animation)throw Error('原生回调动作缺失：'+source.animation);
   const matched=source.complete?[{time:animation.duration}]:animation.timelines.flatMap(t=>t.events||[]).filter(e=>e.data.name===source.event),events=source.index==null?matched:matched.filter((_,i)=>i===source.index);
   if(!events.length)throw Error('原生骨骼事件缺失：'+source.animation+'/'+source.event);
   const occurrences=events.flatMap(event=>Array.from({length:source.repeat??1},(_,i)=>({...event,time:event.time+i*animation.duration})));
   return occurrences.filter((_,i)=>source.occurrenceIndex==null||source.occurrenceIndex===i).map(event=>{const link={...track.link},old=link.delay||0,elapsed=source.rateChangeAt!=null&&source.speedAfter>0?(event.time<=source.rateChangeAt*source.speed?event.time/source.speed:source.rateChangeAt+(event.time-source.rateChangeAt*source.speed)/source.speedAfter):source.targetDuration?event.time/animation.duration*source.targetDuration:event.time/source.speed;link.delay=source.clipStart+elapsed;const shift=link.delay-old;
    if(source.relativeEnd||link.sourceRelativeMotion)link.fxEnd+=shift;
    if(link.sourceRelativeMotion){for(const key of ['motionPath','eulerPath'])if(link[key])link[key]=link[key].map(p=>({...p,time:p.time+shift}));if(link.emissionEnd!=null)link.emissionEnd+=shift;}
    if(link.graphPath){const owner=sampleGraphPath(link.graphPath,link.delay);if(link.graphPosition&&link.graphOwnerAtBirth)link.graphPosition=link.graphPosition.map((v,i)=>v+owner[i]-link.graphOwnerAtBirth[i]);link.graphOwnerAtBirth=owner;}
    return {...track,link};});
  });
  module.duration=Math.max(module.duration,...module.tracks.map(t=>(t.at||0)+(t.link.fxEnd||0)));
  // WeaponAttachment assigns its two serialized BoneFollowers to the actor.
  // Build their source position/rotation and weapon-bone scale once per track.
  for(const track of module.tracks){
   if(!track.link.weaponAttachment)continue;
   const source=track.effect.scripts?.find(s=>s.type==='WeaponAttachment');if(!source)throw Error('Missing native WeaponAttachment component');
   const fields=source.fields,followers=track.effect.scripts.filter(s=>s.type==='BoneFollower'),nodes=[...new Set(followers.map(s=>s.node))];if(!nodes.length)throw Error('Missing native WeaponAttachment BoneFollowers');
   const position=[],rotation=[],scale=[],start=track.link.delay||0,end=track.link.fxEnd??start+track.effect.duration;
   for(let i=0;i<=Math.ceil((end-start)*60);i++){
    const time=Math.min(end,start+i/60);this.applyPose(module.actor,(track.at||0)+time);
    const find=name=>this.skeleton.findBone(name+'_'+this.view)||this.skeleton.findBone(name),axis=find(fields.axisFollowerBoneName),weapon=find(fields.scaleFollowerBoneName);if(!axis||!weapon)throw Error('Native WeaponAttachment axis/scale bone missing');
    const flip=this.direction==='left'?-1:1,comp=this.runtime.camera.nativeViewportScale();
    position.push({time,position:[axis.worldX*.022*flip,axis.worldY*.022/comp,0]});
    rotation.push({time,position:[Math.atan2(axis.c,axis.a)*flip,0,0]});
    scale.push({time,position:[Math.hypot(weapon.a,weapon.c)*flip,Math.hypot(weapon.b,weapon.d),1]});
   }
   track.link.attachmentNodePaths=nodes.map(node=>({node,position,rotation,scale}));
  }
  for(const track of module.tracks){const link=track.link;if(!link.bone)continue;
   const slot=key=>this.skeleton.slots.find(s=>s.data.name===key+'_'+this.view||s.data.name===key)?.bone||this.skeleton.findBone(key+'_'+this.view)||this.skeleton.findBone(key);
   const start=link.delay||0,end=link.fxEnd??start+track.effect.duration,path=[],directions=[];
   for(let i=0;i<=Math.ceil((end-start)*60);i++){
    const time=Math.min(end,start+i/60),poseTime=link.boneFollowUntil!=null?Math.min(time,link.boneFollowUntil):time;this.applyPose(module.actor,track.at+poseTime);
    const key=link.boneByFacing?.[this.direction]||link.bone,bone=slot(key),directionBone=link.directionBone?slot(link.boneByFacing?.[this.direction]||link.directionBone):bone;
    if(!bone||!directionBone)throw Error('技能骨骼锚点不存在：'+key);
    const flip=this.direction==='left'?-1:1,angle=Math.atan2(directionBone.c,directionBone.a)+(link.boneAngleDegreesByFacing?.[this.direction]||0)*Math.PI/180,direction=[Math.cos(angle)*flip,0,Math.sin(angle)];
    const owner=this.group.position,offset=(link.boneOffset||0)+(link.boneExtraOffsetByFacing?.[this.direction]||0),side=link.boneSideOffsetByFacing?.[this.direction]||0;
    const worldOffset=link.boneWorldOffset||[0,0,0];path.push({time,position:[owner.x+bone.worldX*.022*flip+direction[0]*offset-direction[2]*side+worldOffset[0],owner.y+bone.worldY*.022/this.runtime.camera.nativeViewportScale()+worldOffset[1],-owner.z+direction[2]*offset+direction[0]*side+worldOffset[2]]});directions.push({time,position:direction});
   }
   link.motionPath=path;if(link.boneDirection!==false){if(link.directed!==false)link.directionPath=directions;link.graphDirection=directions[0].position;}
  }
  this.applyPose(module.actor,0);
 }
 beforeSample(time){return this.active&&!this.moduleMode?Math.max(0,time-this.link.delay):time;}
 afterSample(time){
  const runtime=this.runtime;if(!this.active)return;
  const {options}=this,link=this.moduleMode?this.module.actor:this.link;
  if(!this.moduleMode){const position=anchorPosition(link,time,this.direction,options);
  runtime.group.position.set(position[0],position[1],-position[2]);
  runtime.group.visible=time>=link.delay&&time<Math.min(link.fxEnd??Infinity,link.delay+this.fxDuration);
  if(link.anchor==='hook')for(const p of runtime.particles){if(!p.mesh.visible||p.s.local)continue;
   const born=anchorPosition(link,p.birth/p.s.speed+link.delay,this.direction,options);
   const elements=p.mesh.matrix.elements;elements[12]+=born[0]-position[0];elements[13]+=born[1]-position[1];elements[14]+=born[2]-position[2];
  }
  if(link.hook)for(const p of runtime.statics){
   const name=p.node.userData.linkName;if(name==='Left'||name==='Right')p.mesh.visible=name===(this.direction==='right'?'Right':'Left');
   if(p.s.chainIndex!=null){
    p.mesh.visible=p.node.scale.y>0;
    // Crop the last link's UVs with its geometry, preserving texel density.
    for(const mat of (Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material]))mat.uniforms.uvScale.value.y=p.node.scale.y/.2;
   }
  }
  }
  this.applyPose(link,time);
  const {skeleton,view}=this;
  const scale=.022,flip=this.direction==='left'?-1:1;
  // Spine's native viewport compensation cancels the 45-degree camera squeeze.
  const matrix=new THREE.Matrix4().makeScale(scale*flip,scale/runtime.camera.nativeViewportScale(),scale);
  const sorting=link.sorting?.filter(s=>s.at<=time).at(-1)?.order??0;
  this.renderer.draw(skeleton,matrix,sorting);this.renderer.place(this.record,matrix,true,sorting);
  this.mirageRenderer.sample(link,time);
  const points=targetPositions(options,this.direction);
  this.target.visible=options.showTarget!==false&&!runtime.renderer.getRenderTarget();
  this.target.position.set(points[0][0],.005,-points[0][2]);
  while(this.secondaryMarkers.length<points.length-1){const marker=this.target.clone();marker.material=this.target.material.clone();marker.material.color.set(0xf0b66e);runtime.scene.add(marker);this.secondaryMarkers.push(marker);}
  this.secondaryMarkers.forEach((marker,i)=>{marker.visible=this.target.visible&&i+1<points.length;if(points[i+1])marker.position.set(points[i+1][0],.005,-points[i+1][2]);});
 }
 bounds(){
  const result=new THREE.Box2().makeEmpty();if(!this.active)return result;
  const runtime=this.runtime,pitch=(runtime.topView?89.999:runtime.cameraConfig.pitchDeg)*Math.PI/180,comp=runtime.camera.nativeViewportScale(),point=new THREE.Vector3(),matrix=new THREE.Matrix4();
  this.group.updateMatrixWorld(true);
  for(const mesh of this.renderer?.meshes||[]){if(!mesh.visible)continue;mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);const b=mesh.geometry.boundingBox;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y]){point.set(x,y,0).applyMatrix4(matrix);result.expandByPoint(new THREE.Vector2(point.x,point.y*Math.cos(pitch)-point.z*Math.sin(pitch)/comp));}
  }return result;
 }
 clear(){clearDirectionViews(this);this.mirageRenderer.clear();this.secondaryMarkers.forEach(m=>m.visible=false);++this.token;this.active=false;this.group.visible=false;this.target.visible=false;this.runtime.group.position.set(0,0,0);this.runtime.group.visible=true;this.moduleMode=false;this.module=null;this.runtime.nativePlanCache=null;}
 dispose(){for(const m of this.secondaryMarkers){m.removeFromParent();m.material.dispose();}this.secondaryMarkers=[];this.disposed=true;this.clear();this.renderer?.clear();this.group.removeFromParent();this.target.removeFromParent();this.target.geometry.dispose();this.target.material.dispose();for(const value of this.cache.values())value.then(d=>d.dispose(),()=>{});this.cache.clear();this.items?.then(i=>i.texture.dispose(),()=>{});}
}


