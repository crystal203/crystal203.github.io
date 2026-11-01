import {clone,sampleKeys,sampledSegments,setKey} from './model.js';
import {followSpan} from './position-follow.js';
const fields={cameraPosition:'position',cameraTarget:'target',span:'span',cameraNear:'near',cameraFar:'far',cameraProjection:'nativeProjection'};
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
export const cameraFollowPoint=(point,native=true)=>point?[point[0],point[1]*(native?Math.SQRT1_2:1),-point[2]]:null;
export const cameraFollowEndTime=(left,right)=>right.time-Math.min(1e-7,(right.time-left.time)*1e-6);
export function isCameraFollowEndpoint(keys,index){return index>0&&keys[index-1].trajectory?.type==='follow'&&keys[index-1].trajectory.to===keys[index].id;}
function keyIndexAt(keys,time){let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(keys[mid].time<=time)lo=mid+1;else hi=mid;}return lo-1;}
export function cameraFollowReferences(keys,time){const result=[],index=keyIndexAt(keys,time);for(let i=index;i>0&&isCameraFollowEndpoint(keys,i);i--){const left=keys[i-1],right=keys[i];result.push({object:left.trajectory.object,time:left.time},{object:left.trajectory.object,time:cameraFollowEndTime(left,right)});}return result;}
function projectionAt(shot,tracks,time){let native=shot.camera.nativeProjection!==false;for(const track of tracks)if(track.enabled!==false&&track.target==='camera'&&track.property==='cameraProjection'){if(track.type==='key')native=sampleKeys(track.keys,time,native);else for(const clip of sampledSegments(track,time))native=clip.value;}return native;}
// End frames are evaluated references, never values baked into the document.
// This also makes direct seeking and later target edits reproduce the same pose.
export function cameraPositionKeys(shot,tracks,track,time,positionAt){
 if(!positionAt||!track?.keys.length)return track?.keys||[];const keys=track.keys,index=keyIndexAt(keys,time);if(index<0||!isCameraFollowEndpoint(keys,index))return keys;const resolved=keys.slice(),fallback=subtract(shot.camera.target,shot.camera.position);let first=index;while(isCameraFollowEndpoint(keys,first))first--;const targets=tracks.filter(row=>row.enabled!==false&&row.target==='camera'&&row.property==='cameraTarget');if(targets.length){let aim=clone(shot.camera.target);for(const target of targets)aim=sampleKeys(target.keys,keys[first].time,aim);resolved[first]={...keys[first],viewOffset:subtract(aim,keys[first].value)};}
 for(let i=first+1;i<=index;i++){const left=resolved[i-1],right=keys[i],at=cameraFollowEndTime(left,right),native=projectionAt(shot,tracks,at),start=cameraFollowPoint(positionAt(left.trajectory.object,left.time),native),end=cameraFollowPoint(positionAt(left.trajectory.object,at),native);resolved[i]={...right,value:start&&end?left.value.map((value,axis)=>value+end[axis]-start[axis]):clone(left.value),viewOffset:clone(left.viewOffset||fallback)};}
 return resolved;
}
// Position frames own their viewing direction. Moving a frame also pans its
// view; orbiting and capturing a camera records a new direction on that frame.
export function cameraViewOffsetAt(shot,track,time){
 const fallback=subtract(shot.camera.target,shot.camera.position),span=track&&followSpan(track.keys,time);
 if(span)return clone(span.left.viewOffset||fallback);
 return sampleKeys((track?.keys||[]).filter(key=>key.viewOffset).map(key=>({...key,value:key.viewOffset,ease:key.viewEase||key.ease,trajectory:undefined})),time,fallback);
}
export function cameraPoseAt(shot,tracks,time,resolveFollow,positionAt){
 const camera=clone(shot.camera);let linkedTarget;
 const targets=tracks.filter(track=>track.enabled!==false&&track.target==='camera'&&track.property==='cameraTarget');
 const explicitTarget=targets.some(track=>track.keys.length);
 for(const track of tracks){if(track.enabled===false||track.target!=='camera')continue;const field=fields[track.property];if(!field)continue;
  if(track.type==='key'){const keys=track.keys.filter(key=>!key.follow||resolveFollow).map(key=>key.follow?{...key,value:resolveFollow(key).position}:key);camera[field]=sampleKeys(keys,time,camera[field]);
   if(resolveFollow&&track.property==='cameraPosition'&&!explicitTarget&&track.keys.some(key=>key.follow)){const keys=track.keys.map(key=>({...key,value:key.follow?resolveFollow(key).target:shot.camera.target}));linkedTarget=sampleKeys(keys,time,camera.target);}
  }else if(track.property==='cameraProjection')for(const clip of sampledSegments(track,time))camera.nativeProjection=clip.value;
 }
 if(linkedTarget)camera.target=linkedTarget;
 const source=tracks.find(track=>track.enabled!==false&&track.target==='camera'&&track.property==='cameraPosition'),position=source?{...source,keys:cameraPositionKeys(shot,tracks,source,time,positionAt)}:null,span=position&&followSpan(position.keys,time);if(source&&position.keys!==source.keys&&positionAt)camera.position=sampleKeys(position.keys,time,camera.position,(id,at)=>cameraFollowPoint(positionAt(id,at),camera.nativeProjection!==false));
 if(positionAt&&span){camera.position=sampleKeys(position.keys,time,camera.position,(id,at)=>cameraFollowPoint(positionAt(id,at),camera.nativeProjection!==false));
  let offset=cameraViewOffsetAt(shot,position,time);
  if(targets.length&&position.keys===source.keys){let aim=clone(shot.camera.target);for(const target of targets)aim=sampleKeys(target.keys,span.left.time,aim);offset=subtract(aim,span.left.value);}
  camera.target=camera.position.map((value,index)=>value+offset[index]);
 }else if(!targets.length&&!linkedTarget||source&&position.keys!==source.keys){const offset=cameraViewOffsetAt(shot,position,time);camera.target=camera.position.map((value,index)=>value+offset[index]);}
 return camera;
}
// Retain old camera compositions while dropping the obsolete target lane.
export function migrateCameraTargets(shot,poseAt){
 const targets=shot.tracks.filter(track=>track.target==='camera'&&track.property==='cameraTarget'),position=shot.tracks.find(track=>track.target==='camera'&&track.property==='cameraPosition');
 if(!position||!targets.length&&position.keys.every(key=>key.viewOffset))return false;
 const oldStatic=!targets.length&&!position.keys.some(key=>key.viewOffset),times=[...new Set([...position.keys.map(key=>key.time),...targets.filter(track=>track.enabled!==false).flatMap(track=>track.keys.map(key=>key.time))])].sort((a,b)=>a-b),poses=times.map(time=>{const pose=poseAt?poseAt(time):cameraPoseAt(shot,shot.tracks,time);if(oldStatic)pose.target=clone(shot.camera.target);return [time,pose];});
 for(const [time,pose] of poses){const previous=position.keys.find(key=>Math.abs(key.time-time)<1e-5);setKey(position,time,pose.position,previous?.ease||'linear');const key=position.keys.find(key=>Math.abs(key.time-time)<1e-5);key.viewOffset=subtract(pose.target,pose.position);}
 shot.tracks=shot.tracks.filter(track=>!targets.includes(track));
 if(shot.inspectorDrafts)for(const track of targets)for(const item of [track,...track.keys,...track.clips]){delete shot.inspectorDrafts[item.id];if(shot.inspectorDraftTimes)delete shot.inspectorDraftTimes[item.id];}
 return true;
}
export function followCameraPose(camera,start,point,offset=[0,0,0]){
 const delta=camera.position.map((value,index)=>value-start.position[index]),scale=camera.nativeProjection===false?1:Math.SQRT1_2,center=[point[0]+offset[0],(point[1]+offset[1])*scale,-point[2]-offset[2]],target=center.map((value,index)=>value+delta[index]),ray=start.position.map((value,index)=>value-start.target[index]);
 let radius=Math.hypot(ray[0],ray[2]);if(radius<.001){radius=Math.max(.001,Math.abs(ray[1]));ray[2]=radius;}ray[1]=radius;
 return {...camera,target,position:target.map((value,index)=>value+ray[index])};
}
