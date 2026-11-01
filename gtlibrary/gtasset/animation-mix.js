const clock=(entry,time,loop)=>{entry.loop=loop!==false;entry.trackTime=entry.loop?Math.max(0,time):Math.max(0,Math.min(time,entry.animationEnd-entry.animationStart));};
export function sampleAnimationMix(state,skeleton,mix,resolve){
 if(!mix||mix.duration<=0||mix.elapsed>=mix.duration)return false;const from=resolve(mix.from.name),to=resolve(mix.to.name);if(!from||!to)return false;
 let entry=state.getCurrent(0);if(entry?.animation!==to||entry.mixingFrom?.animation!==from){state.clearTrack(0);const previous=state.setAnimation(0,from.name,mix.from.loop!==false);clock(previous,mix.from.time,mix.from.loop);state.apply(skeleton);entry=state.setAnimation(0,to.name,mix.to.loop!==false);}entry.mixDuration=mix.duration;entry.mixTime=Math.max(0,mix.elapsed);clock(entry,mix.to.time,mix.to.loop);clock(entry.mixingFrom,mix.from.time,mix.from.loop);entry.timelinesRotation.length=0;entry.mixingFrom.timelinesRotation.length=0;return true;
}
export function finishAnimationMix(state){const entry=state.getCurrent(0);if(entry?.mixingFrom){const {animation,trackTime,loop}=entry;state.clearTrack(0);const fresh=state.setAnimation(0,animation.name,loop);fresh.trackTime=trackTime;}}
