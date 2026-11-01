import {uid,clone,newTrack} from './model.js';
export function exportScope(project,shotId){
 const output=clone(project);if(!shotId)return output;const shot=output.shots.find(shot=>shot.id===shotId);if(!shot)throw Error('导出镜头不存在');output.name=shot.name;output.shots=[shot];output.clips=[{id:uid(),shot:shot.id,start:0,in:0,out:shot.duration,rate:1,layer:0,opacity:1,volume:1,muted:false}];output.audio=[];output.audioTracks=[{...newTrack('audio','audio'),name:'音轨 1',layer:0}];return output;
}
