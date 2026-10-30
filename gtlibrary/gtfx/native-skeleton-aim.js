// SpineController.OnSkeletonAnimationUpdateLocal 0x6cc68b4 writes the native
// AimPoint XY directly into b.aim, negating X only for Direction.Left.
// IKSupportUtil 0x76222e0 obtains XY from two WorldToScreenPoint calls.
import * as THREE from '../vendor/three.module.js';
import {sampleGraphPath} from './graph-action.js';
export function nativeAimPoint(camera,origin,direction,viewport){
 camera.updateMatrixWorld(true);
 const project=p=>new THREE.Vector3(p[0],p[1],-p[2]).project(camera);
 const a=project(origin),b=project(origin.map((v,i)=>v+direction[i]));
 return [(b.x-a.x)*viewport.width/2,(b.y-a.y)*viewport.height/2];
}
export function applyNativeAim(player,link,time){
 const rule=link.nativeAim;if(!rule||time<0||time>=link.end)return;
 // AimPoint is nullable state. Reload does not clear it; it holds the most
 // recent shot's projected vector until the action exits. Authored IK mix
 // still decides whether the bones respond during reload/base animation.
 if(!rule.windows.some(w=>time>=w.at))return;
 const skeleton=player.skeleton,bone=skeleton.findBone(rule.bone);
 if(!bone)throw Error('Native aim bone missing: '+rule.bone);
 const runtime=player.runtime,renderer=runtime.renderer,canvas=renderer?.domElement;
 const size=renderer?.getDrawingBufferSize?renderer.getDrawingBufferSize(new THREE.Vector2()):null;
 const viewport=rule.viewport||{width:size?.x??canvas?.width,height:size?.y??canvas?.height};
 if(!(viewport.width>0&&viewport.height>0))throw Error('Native screen-space aim requires the render viewport dimensions');
 const origin=sampleGraphPath(link.graphPath,time);origin[1]+=rule.originHeight;
 let point;
 if(rule.originBone){
  // This source overload aims from a live slot bone to Bounds.center + dir.
  // The ordinary center-origin path below retains its original arithmetic.
  skeleton.updateWorldTransform();
  const key=rule.originBone,anchor=skeleton.slots.find(s=>s.data.name===key+'_'+player.view||s.data.name===key)?.bone;
  if(!anchor)throw Error('Native aim origin slot missing: '+key);
  if(rule.sourceTarget!=='owner-center-plus-direction')throw Error('Unsupported native aim target '+rule.sourceTarget);
  const owner=sampleGraphPath(link.graphPath,time),spine=sampleGraphPath(link.spinePath,time),flip=player.direction==='left'?-1:1,comp=runtime.camera.nativeViewportScale();
  if(!(comp>0))throw Error('Native aim origin requires viewport compensation');
  const anchorPosition=[owner[0]+spine[0]+anchor.worldX*.022*flip,owner[1]+spine[1]+anchor.worldY*.022/comp,owner[2]+spine[2]],target=origin.map((v,i)=>v+rule.direction[i]);
  point=nativeAimPoint(runtime.camera,anchorPosition,target.map((v,i)=>v-anchorPosition[i]),viewport);
 }else point=nativeAimPoint(runtime.camera,origin,rule.direction,viewport);
 bone.x=player.direction==='left'?-point[0]:point[0];bone.y=point[1];
 return {point,bone:bone.data.name,viewport};
}
