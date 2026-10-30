import {nativeRendererOrder} from './native-renderer-order.js';
import {clipTime} from './character-link.js';
import {sampleGraphPath} from './graph-action.js';
import * as THREE from '../vendor/three.module.js';
import {SpineThreeRenderer} from '../gtasset/three-renderer.js';
let loading;
export function ensureEffectSkeletonRuntime(){
 if(globalThis.spine&&globalThis.GTSpineCore)return Promise.resolve();
 return loading||(loading=(async()=>{for(const [path,key] of [['../vendor/spine-webgl.js','spine'],['../gtasset/core.js','GTSpineCore'],['../gtasset/equipment.js','GTEquipment']]){if(globalThis[key])continue;await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL(path,import.meta.url);tag.onload=resolve;tag.onerror=reject;document.head.append(tag);});}})());
}
export function createEffectSkeletons(effect,sim){
 return (effect.skeletons||[]).filter(source=>!effect.skeletonView||effect.skeletons.length===1||source.name.includes('_'+effect.skeletonView+'_')).map(source=>{
  if(!globalThis.spine||!globalThis.GTSpineCore)throw Error('Spine effect runtime has not loaded');
  const bytes=Uint8Array.from(atob(source.bytes),c=>c.charCodeAt(0));
  const decoded=GTSpineCore.parse({spine,atlasText:source.atlas,bytes,images:source.textures.map(k=>{const image=sim.textures[k]?.image;if(!image)throw Error('Spine effect atlas missing: '+k);return image;}),createTexture:image=>SpineThreeRenderer.texture(spine,image)});
  const skeleton=GTSpineCore.createInstance(spine,decoded.data),querySkeleton=GTSpineCore.createInstance(spine,decoded.data),skin=effect.skeletonSkin||source.skin;
  if(skin&&decoded.data.findSkin(skin)){skeleton.setSkinByName(skin);querySkeleton.setSkinByName(skin);}skeleton.setSlotsToSetupPose();querySkeleton.setSlotsToSetupPose();
  const record={refs:[],visible:true,matrix:new THREE.Matrix4()},selection={records:new Map([['effect',record]]),attach:(_id,mesh)=>record.refs.push({mesh,local:new THREE.Matrix4()})};
  const renderer=new SpineThreeRenderer(spine,sim.group,{id:'effect',character:{resource:source.name}},selection,[]);
  const requested=effect.skeletonAnimation||effect.skeletonIdle||source.animation,find=name=>decoded.data.findAnimation(name+'_'+(effect.skeletonView||'front'))||decoded.data.findAnimation(name),animation=find(requested);
  if(!animation)throw Error('Spine effect animation missing: '+requested);
  const attachments=new Map(),equipment=new Map();
  if(effect.skeletonAttachments?.length)for(const target of [skeleton,querySkeleton])equipment.set(target,new GTEquipment.Equipment(target));
  function pose(target,time){
   target.setToSetupPose();animation.apply(target,0,time*source.speed,effect.skeletonAnimation?false:source.loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);
   for(const track of ['Base','Upper','Emotion']){const clip=effect.skeletonClips?.filter(c=>(c.track||'Base')===track&&time>=c.start&&time<(c.end??Infinity)).at(-1);if(!clip)continue;
    let anim=find(clip.name);if(!anim)throw Error('召唤骨骼缺少动作 '+clip.name);let elapsed=clipTime(clip,time,anim.duration),loop=!!clip.loop;
    if(clip.nextName&&elapsed>=anim.duration){elapsed-=anim.duration;anim=find(clip.nextName);if(!anim)throw Error('召唤骨骼缺少后续动作 '+clip.nextName);loop=true;}
    anim.apply(target,0,elapsed,loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);
   }
   for(const event of effect.skeletonAttachments||[])if(time>=event.at){const slot=target.findSlot(event.slot+'_'+(effect.skeletonView||'front'))||target.findSlot(event.slot);if(!slot)throw Error('召唤骨骼缺少附件槽 '+event.slot);const name=event.name==='empty'||!event.name?null:event.name;let attachment=null;if(name){if(attachments.has(name))attachment=attachments.get(name);else{attachment=decoded.data.findSkin(skin)?.getAttachment(slot.data.index,name)||decoded.data.defaultSkin?.getAttachment(slot.data.index,name);if(!attachment){const assets=effect.skeletonEquipmentAssets,frame=assets?.data.frames[name];if(!frame)throw Error('召唤骨骼缺少附件 '+event.slot+':'+name);attachment=GTEquipment.createAttachment(spine,name,frame,assets.texture,assets.image.naturalWidth,assets.image.naturalHeight);}attachments.set(name,attachment);}}equipment.get(target).equip(slot,attachment);}
   target.color.a=1;
   for(const event of effect.skeletonAlpha||[])if(time>=event.at){const u=event.duration?Math.min(1,(time-event.at)/event.duration):1;target.color.a=(event.from??1)+((event.to??1)-(event.from??1))*u;}
   target.updateWorldTransform();
  }
  function matrixAt(time){
   const node=sim.nodes.get(source.node),matrix=node.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(source.scale*(effect.skeletonFlip?-1:1),source.scale*(effect.rootScaleFactor||1)/(sim.camera.nativeViewportScale?.()||1),source.scale));
   if(effect.skeletonRotationPath){
    const angle=sampleGraphPath(effect.skeletonRotationPath,time)[0]*Math.PI/180,pivot=effect.skeletonRotationPivot||[0,.385,0],pixels=pivot.map(v=>v/source.scale),turn=new THREE.Matrix4().makeTranslation(...pixels).multiply(new THREE.Matrix4().makeRotationZ(angle)).multiply(new THREE.Matrix4().makeTranslation(...pixels.map(v=>-v)));matrix.multiply(turn);
   }
   if(effect.skeletonOffsetPath){const offset=sampleGraphPath(effect.skeletonOffsetPath,time);matrix.elements[12]+=offset[0];matrix.elements[13]+=offset[1];matrix.elements[14]+=offset[2];}
   return matrix;
  }
  const boneCache=new Map();
  return {get meshes(){return renderer.meshes;},sample(time){
   pose(skeleton,time);const matrix=matrixAt(time);const order=nativeRendererOrder(sim.index,source.sorting||{},0);renderer.draw(skeleton,matrix,order);renderer.place(record,matrix,true,order);
  },bonePosition(name,time){
   const key=name+':'+time+':'+(sim.camera.nativeViewportScale?.()||1);if(boneCache.has(key))return boneCache.get(key).slice();
   const states=[...sim.nodes.values()].map(node=>[node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]),cache=sim.animationCache;
   try{
    sim.animationCache=null;sim.animateNodes(time);pose(querySkeleton,time);const bone=querySkeleton.findBone(name);if(!bone)throw Error('实体骨骼挂点不存在 '+name);
    const position=new THREE.Vector3(bone.worldX,bone.worldY,0).applyMatrix4(matrixAt(time)).toArray();boneCache.set(key,position);return position.slice();
   }finally{for(const[node,p,q,s]of states){node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);}sim.nodeRoot.updateMatrixWorld(true);sim.animationCache=cache;}
  },clear(){renderer.clear();decoded.dispose();}};
 });
}

