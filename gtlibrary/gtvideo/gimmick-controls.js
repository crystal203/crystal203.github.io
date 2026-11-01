export function gimmickGroups(record,bridge){
 const controls=bridge.states.controls(record),door=bridge.doors?.controls(record);
 return [...(controls?.groups||[]),...(door?[door]:[]),...(controls?.nodes||[]).map(node=>({id:'node:'+node.id,name:node.name,value:!!node.checked,boolean:true,options:[{value:true,label:'显示'},{value:false,label:'隐藏'}]}))];
}
export function gimmickChoice(record,bridge,clip={}){
 const groups=gimmickGroups(record,bridge);let group=groups.find(group=>group.id===clip.group||group.name===clip.group);
 if(!group&&clip.value!==undefined)group=groups.find(group=>group.id.startsWith('controller:')&&record.gimmick.spec.controllers[Number(group.id.split(':')[1])].states.some(state=>state.name===clip.value));
 group??=groups[0];if(!group)return null;let value=clip.value;if(group.boolean)value=typeof value==='boolean'?value:group.value;else if(!group.options.some(option=>String(option.value)===String(value))){const controller=group.id.startsWith('controller:')&&record.gimmick.spec.controllers[Number(group.id.split(':')[1])],index=controller?controller.states.findIndex(state=>state.name===value):-1;value=index>=0?String(index):group.value;}return {groups,group,value};
}
export function placeGimmickSegment(shot,track,time,{group,value,still=true,speed=1},uid){
 let clip=track.clips.find(clip=>Math.abs(clip.start-time)<1e-5&&clip.group===group);
 if(!clip){const end=Math.min(shot.duration,...track.clips.filter(clip=>clip.start>time).map(clip=>clip.start));for(const previous of track.clips)if(previous.start<time&&previous.start+previous.duration>time){previous.duration=Math.max(.001,time-previous.start);delete previous.initial;}clip={id:uid(),start:time,duration:Math.max(.001,end-time)};track.clips.push(clip);}
 delete clip.initial;Object.assign(clip,{group,value,still,speed});track.enabled=true;track.clips.sort((a,b)=>a.start-b.start);return clip;
}
