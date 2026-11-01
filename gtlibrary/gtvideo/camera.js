import {clone,sampleKeys,sampledSegments} from './model.js';
const fields={cameraPosition:'position',cameraTarget:'target',span:'span',cameraNear:'near',cameraFar:'far',cameraProjection:'nativeProjection'};
// Follow references are resolved from the ordinary camera curve, never from themselves.
export function cameraPoseAt(shot,tracks,time,resolveFollow){
 const camera=clone(shot.camera);let linkedTarget;
 const explicitTarget=tracks.some(track=>track.enabled!==false&&track.target==='camera'&&track.property==='cameraTarget'&&track.keys.length);
 for(const track of tracks){if(track.enabled===false||track.target!=='camera')continue;const field=fields[track.property];if(!field)continue;
  if(track.type==='key'){const keys=track.keys.filter(key=>!key.follow||resolveFollow).map(key=>key.follow?{...key,value:resolveFollow(key).position}:key);camera[field]=sampleKeys(keys,time,camera[field]);
   if(resolveFollow&&track.property==='cameraPosition'&&!explicitTarget&&track.keys.some(key=>key.follow)){const targets=track.keys.map(key=>({...key,value:key.follow?resolveFollow(key).target:shot.camera.target}));linkedTarget=sampleKeys(targets,time,camera.target);}
  }else if(track.property==='cameraProjection')for(const clip of sampledSegments(track,time))camera.nativeProjection=clip.value;
 }
 if(linkedTarget)camera.target=linkedTarget;return camera;
}
export function followCameraPose(camera,start,point,offset=[0,0,0]){
 const delta=camera.position.map((value,index)=>value-start.position[index]),scale=camera.nativeProjection===false?1:Math.SQRT1_2,center=[point[0]+offset[0],(point[1]+offset[1])*scale,-point[2]-offset[2]],target=center.map((value,index)=>value+delta[index]),ray=start.position.map((value,index)=>value-start.target[index]);
 let radius=Math.hypot(ray[0],ray[2]);if(radius<.001){radius=Math.max(.001,Math.abs(ray[1]));ray[2]=radius;}ray[1]=radius;
 return {...camera,target,position:target.map((value,index)=>value+ray[index])};
}
