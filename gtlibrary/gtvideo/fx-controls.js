import * as THREE from '../vendor/three.module.js';
export const takeoverLabels={position:'位置',rotation:'旋转',scale:'缩放',animation:'Spine 动作',direction:'朝向',equipment:'装备',skin:'皮肤',expression:'表情',sub:'子动画',speed:'动画速度',visible:'显示',alpha:'透明度'};
export function fxTakeover(clip){return Object.fromEntries(Object.keys(takeoverLabels).map(key=>[key,clip.takeover?.[key]!==false]));}
export function poseQuaternion(rotation=[0,0,0]){return new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0]*Math.PI/180,-rotation[1]*Math.PI/180,-rotation[2]*Math.PI/180,'YXZ'));}
export function relativeTransform(base,pose,actor={},owns=fxTakeover({})){
 const rotation=poseQuaternion(base.rotation3D),scale=new THREE.Vector3(...base.scale),inverse=new THREE.Matrix4().compose(new THREE.Vector3(...[base.position[0],base.position[1],-base.position[2]]),rotation,scale).invert();
 const relative=new THREE.Matrix4().multiplyMatrices(inverse,new THREE.Matrix4().compose(new THREE.Vector3(pose.position[0],pose.position[1],-pose.position[2]),poseQuaternion(pose.rotation3D),new THREE.Vector3(...pose.scale)));
 const offset=owns.position?(actor.positionOffset||[0,0,0]):[0,0,0],turn=owns.rotation?actor.rotationOffset:[0,0,0],factor=owns.scale?(actor.scaleMultiplier||[1,1,1]):[1,1,1];relative.multiply(new THREE.Matrix4().compose(new THREE.Vector3(offset[0],offset[1],-offset[2]),poseQuaternion(turn),new THREE.Vector3(...factor)));
 const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),relativeScale=new THREE.Vector3();relative.decompose(position,quaternion,relativeScale);return {matrix:relative,position,quaternion,scale:relativeScale,inverse};
}
