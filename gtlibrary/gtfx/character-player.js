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
  this.runtime=runtime;this.cache=new Map();this.token=0;this.group=new THREE.Group();runtime.scene.add(this.group);
  this.pickables=[];this.record={refs:[],visible:true,matrix:new THREE.Matrix4()};
  this.selection={records:new Map([['fx-character',this.record]]),attach:(_id,mesh)=>this.record.refs.push({mesh,local:new THREE.Matrix4()})};
  this.target=new THREE.Mesh(new THREE.RingGeometry(.22,.25,32),new THREE.MeshBasicMaterial({color:0x8ab9e8,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
  // Match the FX display-RGB pipeline when capturing into an RGBA byte target.
  this.target.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor=sRGBTransferOETF(gl_FragColor);');};
  this.target.rotation.x=-Math.PI/2;this.target.position.y=.005;this.target.visible=false;runtime.scene.add(this.target);
 }
 async load(appearance,direction,skin,profile,weapon=profile.weapon){
  const token=++this.token;this.active=false;this.group.visible=false;this.target.visible=false;await scripts();
  const view=direction==='left'||direction==='right'?'side':direction,key=appearance+':'+view;
  if(!this.cache.has(key)){
   const promise=(async()=>{
    const prefix='gtasset/assets/character/'+appearance;
    const [atlasText,bytes]=await Promise.all([read(asset(prefix+'.atlas')),read(asset(prefix+'_'+view+'.bytes'),'arrayBuffer')]);
    const images=await Promise.all(GTSpineCore.pages(atlasText).map(page=>GTResources.image(asset('gtasset/assets/character/'+page))));
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
  const equipment=new GTEquipment.Equipment(skeleton),weaponSlots=(profile.weaponSlots||[1]).map(number=>skeleton.slots.find(s=>new RegExp(`^\\[base\\]weapon${number}_${view}$`).test(s.data.name)));
  if(weaponSlots.some(slot=>!slot))throw Error('缺少 '+appearance+' 原生武器挂点');
  this.renderer?.clear();this.renderer=new SpineThreeRenderer(spine,this.group,{id:'fx-character',character:{resource:appearance}},this.selection,this.pickables);
  Object.assign(this,{skeleton,equipment,slot:weaponSlots[0],weaponSlots,weaponType:profile.weaponType,nativeWeapon:profile.weaponByAppearance?.[appearance]||profile.weapon,itemsData:items,view,direction,appearance,skin,skins});
  this.setWeapon(weapon);return {skins,skin};
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
 configure(link,options,effect){
  this.link=link;this.options=options;this.fxDuration=effect.duration;this.active=!!link;this.group.visible=this.active;
  this.runtime.nativePlanCache=null;
 }
 effectDefinition(effect,link=this.link){
  if(!this.active)return effect;
  // HookShot.SetFromTo uses Vector3.forward, independently of EffectPreset.Direction.
  const rotation=effectRotation(link.hook?[0,0,1]:link.referenceDirection||effect.direction,link.directed===false?null:(link.graphDirection||castDirection(link,this.direction)),link.rotationType);
  const quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation.yaw)
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),rotation.roll));
  if(link.anchor==='meteor'){
   const side=link.meteorSide||1,height=link.meteorHeight||4.5;
   quaternion.setFromUnitVectors(new THREE.Vector3(...effect.direction).normalize(),new THREE.Vector3(this.direction==='right'?side:-side,-height,-height).normalize());
  }
  const definition={...effect,rootRotation:quaternion.toArray(),rootScaleZ:link.mirrorZForLeft&&this.direction==='left'?-1:1,rootScaleFactor:link.scaleFactor||1};
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
 beforeSample(time){return this.active&&!this.moduleMode?Math.max(0,time-this.link.delay):time;}
 afterSample(time){
  const runtime=this.runtime;if(!this.active)return;
  const {options,skeleton,view}=this,link=this.moduleMode?this.module.actor:this.link;
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
  skeleton.setToSetupPose();
  // Apply native lower/base pose, sub track, then the battle action's upper pose.
  const apply=(name,t,loop)=>{const anim=skeleton.data.findAnimation(name+'_'+view)||skeleton.data.findAnimation(name);if(anim)anim.apply(skeleton,0,t,loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);return anim;};
  if(!apply(this.weaponType+'_idle',time,true))apply('idle',time,true);
  apply('[sub]idle',time,true);
  if(link.graphPath){
   const position=sampleGraphPath(link.graphPath,time);this.group.position.set(position[0],position[1],-position[2]);
   for(const track of ['Base','Upper','Emotion']){const c=link.clips.filter(c=>c.track===track&&time>=c.start&&time<(c.end??link.end)).at(-1);if(c){const anim=skeleton.data.findAnimation(c.name+'_'+view)||skeleton.data.findAnimation(c.name);if(anim)apply(c.name,clipTime(c,time,anim.duration),c.loop);}}
  }else this.group.position.set(0,0,0);
  const selected=link.graphPath?{name:'idle'}:actionClip(link,time,this.direction),animation=skeleton.data.findAnimation(selected.name+'_'+view)||skeleton.data.findAnimation(selected.name);
  if(animation&&selected.name!=='idle')apply(selected.name,clipTime(selected,time,animation.duration),selected.loop);
  const weaponHidden=this.moduleMode
   ?this.module.tracks.some(t=>t.link.hideWeaponUntil&&time>=t.at&&time<t.at+t.link.hideWeaponUntil)
   :link.hideWeaponUntil&&time<link.hideWeaponUntil;
  if(weaponHidden)for(const slot of this.weaponSlots)slot.setAttachment(null);
  skeleton.updateWorldTransform();
  const scale=.022,flip=this.direction==='left'?-1:1;
  // Spine's native viewport compensation cancels the 45-degree camera squeeze.
  const matrix=new THREE.Matrix4().makeScale(scale*flip,scale/runtime.camera.nativeViewportScale(),scale);
  this.renderer.draw(skeleton,matrix,0);this.renderer.place(this.record,matrix,true,0);
  const targetDistance=options.targetDistance,d=directions[this.direction];
  this.target.visible=options.showTarget!==false&&!runtime.renderer.getRenderTarget()&&(this.moduleMode?(!!link.graphPath||this.module.tracks.some(t=>['target','projectile','meteor','hook'].includes(t.link.anchor)||t.link.hook)):link.anchor==='target'||link.anchor==='hook'||link.anchor==='projectile'||!!link.hook);
  this.target.position.set(d[0]*targetDistance,.005,-d[2]*targetDistance);
 }
 bounds(){
  const result=new THREE.Box2().makeEmpty();if(!this.active)return result;
  const runtime=this.runtime,pitch=(runtime.topView?89.999:runtime.cameraConfig.pitchDeg)*Math.PI/180,comp=runtime.camera.nativeViewportScale(),point=new THREE.Vector3(),matrix=new THREE.Matrix4();
  this.group.updateMatrixWorld(true);
  for(const mesh of this.renderer?.meshes||[]){if(!mesh.visible)continue;mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);const b=mesh.geometry.boundingBox;
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y]){point.set(x,y,0).applyMatrix4(matrix);result.expandByPoint(new THREE.Vector2(point.x,point.y*Math.cos(pitch)-point.z*Math.sin(pitch)/comp));}
  }return result;
 }
 clear(){++this.token;this.active=false;this.group.visible=false;this.target.visible=false;this.runtime.group.position.set(0,0,0);this.runtime.group.visible=true;this.moduleMode=false;this.module=null;this.runtime.nativePlanCache=null;}
 dispose(){this.disposed=true;this.clear();this.renderer?.clear();this.group.removeFromParent();this.target.removeFromParent();this.target.geometry.dispose();this.target.material.dispose();for(const value of this.cache.values())value.then(d=>d.dispose(),()=>{});this.cache.clear();this.items?.then(i=>i.texture.dispose(),()=>{});}
}
