import * as THREE from '../vendor/three.module.js';

/** Native ViewportScaler: P' = Sy(1/cos(pitch)) P; V' = V Sy(cos(pitch)).
 * Keep the physical camera transform and character transforms unchanged.
 * The inverse view matrix also serves unprojection/picking and native shaders.
 * Source: OnPreCull 0x5daf580; CalculateViewportScaleY 0x5daf734 (cosf).
 */
export function installNativeProjection(camera,isEnabled){
 const worldScale=new THREE.Matrix4(),inverseWorldScale=new THREE.Matrix4(),screenScale=new THREE.Matrix4();
 const forward=new THREE.Vector3();
 const scale=()=>{if(!isEnabled())return 1;forward.set(0,0,-1).applyQuaternion(camera.quaternion);const pitch=THREE.MathUtils.radToDeg(Math.atan2(-forward.y,Math.hypot(forward.x,forward.z)));return Math.cos(THREE.MathUtils.degToRad(pitch>=0&&pitch<=90?Math.min(45,pitch):0));};
 const projection=camera.updateProjectionMatrix.bind(camera),world=camera.updateMatrixWorld.bind(camera),worldParents=camera.updateWorldMatrix.bind(camera);
 let projectionScale=NaN,physicalDepth=0;
 camera.updateProjectionMatrix=()=>{projection();projectionScale=scale();screenScale.makeScale(1,1/projectionScale,1);camera.projectionMatrix.premultiply(screenScale);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();};
 const applyView=()=>{if(physicalDepth)return;const s=scale();worldScale.makeScale(1,s,1);inverseWorldScale.makeScale(1,1/s,1);camera.matrixWorldInverse.multiply(worldScale);camera.matrixWorld.premultiply(inverseWorldScale);if(s!==projectionScale)camera.updateProjectionMatrix();};
 camera.updateMatrixWorld=force=>{world(true);applyView();};
 camera.updateWorldMatrix=(parents,children)=>{worldParents(parents,children);applyView();};
 // Object3D.lookAt/getWorld* read matrixWorld. Keep their physical transform
 // separate from the inverse of the native render view (also needed by picking).
 for(const name of ['lookAt','getWorldPosition','getWorldQuaternion','getWorldScale','getWorldDirection']){
  const original=camera[name].bind(camera);
  camera[name]=(...args)=>{physicalDepth++;try{return original(...args);}finally{physicalDepth--;if(!physicalDepth)camera.updateMatrixWorld(true);}};
 }
 camera.nativeViewportScale=scale;
 camera.updateProjectionMatrix();
}
