import {clone,validateProject} from './model.js';
// Cold legacy shots are compacted one at a time. Newly edited shots already
// contain deltas; no decoded map or renderer belongs in the portable document.
export async function projectDocument(project,{captureLegacy,signal}={}){
 const output=clone(project);for(const shot of output.shots){signal?.throwIfAborted();if(shot.edits&&!shot.edits.delta||shot.tracks.some(track=>['follow','cameraTarget'].includes(track.property)||track.keys.some(key=>key.follow))){if(!captureLegacy)throw Error('旧项目需要读取地图基准后再导出');await captureLegacy(shot,signal);}if(shot.edits){shot.edits.history=[];shot.edits.future=[];shot.edits.ids=[];}}
 return validateProject(output);
}
