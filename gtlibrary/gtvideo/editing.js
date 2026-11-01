import * as THREE from '../vendor/three.module.js';
import {clone,newTrack,setKey,stateSegmentKinds,setStateSegment,migrateCharacterTrack} from './model.js';
import {cameraViewOffsetAt} from './camera.js';
export const poseProperties=['position','rotation3D','scale','visible','alpha','direction','skin','animation','expression','sub','speed','equipment','itemFloating','itemShadow'];
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function readPose(record){
 const rotation=record.quaternion?new THREE.Euler().setFromQuaternion(record.quaternion,'YXZ'):new THREE.Euler(0,-record.rotation*Math.PI/180,0,'YXZ');
 const settings=record.character?.settings||{},pose={position:[record.position.x,record.position.y,-record.position.z],rotation3D:[rotation.x,-rotation.y,-rotation.z].map(v=>v*180/Math.PI),scale:record.scale.toArray(),visible:record.visible};
 if(record.character)for(const property of poseProperties)if(!['position','rotation3D','scale','visible'].includes(property)){const defaults={alpha:1,speed:1,direction:'front',skin:'',animation:'idle',expression:'idle',sub:'idle',equipment:{}};pose[property]=clone(settings[property]??defaults[property]);}if(record.itemSettings)Object.assign(pose,{alpha:record.itemSettings.alpha??1,itemFloating:record.itemSettings.floating!==false,itemShadow:record.itemSettings.shadow!==false});return pose;
}
export function poseDifference(before,after){return Object.fromEntries(poseProperties.filter(key=>after[key]!==undefined&&!same(before[key],after[key])).map(key=>[key,clone(after[key])]));}
export function cameraValues(camera){return {cameraPosition:camera.position,cameraViewOffset:camera.target.map((value,index)=>value-camera.position[index]),span:camera.span,cameraNear:camera.near,cameraFar:camera.far,cameraProjection:camera.nativeProjection!==false};}
export function recordValues(shot,target,values,time,baseline={},{create=false}={}){
 const position=target==='camera'?shot.tracks.find(track=>track.target==='camera'&&track.property==='cameraPosition'):null,viewOffset=values.cameraPosition?(values.cameraViewOffset||cameraViewOffsetAt(shot,position,time)):null;
 for(const [property,value] of Object.entries(values)){
  if(property==='cameraViewOffset'||property==='cameraTarget')continue;
  const state=stateSegmentKinds.has(property);let track=shot.tracks.find(t=>t.target===target&&t.property===property&&(state||t.type==='key'));
  if(!track){if(!create)continue;track=newTrack(target,property);shot.tracks.push(track);}
  if(state){migrateCharacterTrack(track,shot.duration);track.enabled=true;setStateSegment(track,time,value,shot.duration,baseline[property]);continue;}
  track.type='key';
  track.enabled=true;if(!track.keys.length&&time>1e-5&&baseline[property]!==undefined)setKey(track,0,baseline[property],typeof value==='number'||Array.isArray(value)?'linear':'hold');
  setKey(track,time,value,typeof value==='number'||Array.isArray(value)?'linear':'hold');
  if(property==='cameraPosition'){const key=track.keys.find(key=>Math.abs(key.time-time)<1e-5);key.viewOffset=clone(viewOffset);if(!track.keys[0].viewOffset)track.keys[0].viewOffset=clone(baseline.cameraViewOffset||viewOffset);}
 }
}
