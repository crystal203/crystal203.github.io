export function followSpan(keys,time){
 if(!keys?.length)return null;let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(keys[mid].time<=time)lo=mid+1;else hi=mid;}const left=keys[lo-1],right=keys[lo];return left?.trajectory?.type==='follow'&&left.trajectory.to===right?.id&&time<right.time?{left,right,object:left.trajectory.object}:null;
}
// Baseline queries only move backwards in time. Testing each interval's left
// boundary therefore also finds cycles that arise from historical baselines.
export function hasPositionFollowCycle(tracks){
 const byTarget=new Map();for(const track of tracks)if(track.enabled!==false&&track.property==='position'){if(!byTarget.has(track.target))byTarget.set(track.target,[]);byTarget.get(track.target).push(track);}
 const visiting=new Map(),done=new Map(),visit=(id,time)=>{if(visiting.get(id)?.has(time))return true;if(done.get(id)?.has(time))return false;if(!visiting.has(id))visiting.set(id,new Set());visiting.get(id).add(time);for(const track of byTarget.get(id)||[]){const span=followSpan(track.keys,time);if(span&&(visit(span.object,time)||visit(span.object,span.left.time)))return true;}visiting.get(id).delete(time);if(!done.has(id))done.set(id,new Set());done.get(id).add(time);return false;};
 for(const track of tracks)if(track.enabled!==false&&track.property==='position')for(const key of track.keys)if(followSpan(track.keys,key.time)&&visit(track.target,key.time))return true;return false;
}
export class PositionSampler {
 constructor({tracks,record,base,sample,visual,override,related}){Object.assign(this,{record,base,sample,visual,override,related});this.tracks=new Map();this.rawCache=new Map();this.visualCache=new Map();this.visiting=new Map();for(const track of tracks)if(track.enabled!==false&&track.property==='position'){const owner=record(track.target);if(!owner)continue;if(!this.tracks.has(owner))this.tracks.set(owner,[]);this.tracks.get(owner).push(track);}}
 raw(record,time){
  if(this.rawCache.get(record)?.has(time))return this.rawCache.get(record).get(time);let position=this.base(record).slice();if(this.visiting.get(record)?.has('raw:'+time))return position;this.enter(record,'raw:'+time);
  try{for(const track of this.tracks.get(record)||[])position=this.sample(track.keys,time,position,(id,at)=>this.position(id,at));position=this.override?.(record,time)?.position||position;if(!this.rawCache.has(record))this.rawCache.set(record,new Map());this.rawCache.get(record).set(time,position);return position;}finally{this.leave(record,'raw:'+time);}
 }
 position(id,time){
  const record=typeof id==='string'?this.record(id):id;if(!record)return null;if(this.visualCache.get(record)?.has(time))return this.visualCache.get(record).get(time);if(this.visiting.get(record)?.has('visual:'+time))return this.base(record).slice();this.enter(record,'visual:'+time);
  try{const ordinary=this.raw(record,time),position=this.visual?.(record,time,ordinary,this)||ordinary;if(!this.visualCache.has(record))this.visualCache.set(record,new Map());this.visualCache.get(record).set(time,position);return position;}finally{this.leave(record,'visual:'+time);}
 }
 enter(record,key){if(!this.visiting.has(record))this.visiting.set(record,new Set());this.visiting.get(record).add(key);}
 leave(record,key){this.visiting.get(record)?.delete(key);}
 dependencies(record){const records=new Set(),visit=owner=>{if(!owner||records.has(owner))return;records.add(owner);for(const track of this.tracks.get(owner)||[])for(const key of track.keys)if(key.trajectory?.type==='follow')visit(this.record(key.trajectory.object));for(const id of this.related?.(owner)||[])visit(this.record(id));};visit(record);return records;}
 affected(records,time){
  const result=new Set(records);let changed=true;
  while(changed){changed=false;for(const [record,tracks] of this.tracks){if(result.has(record))continue;if(tracks.some(track=>{const span=followSpan(track.keys,time);return span&&result.has(this.record(span.object));})||(this.related?.(record,time)||[]).some(id=>result.has(this.record(id)))){result.add(record);changed=true;}}}
  return result;
 }
}
