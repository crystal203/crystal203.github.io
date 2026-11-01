import {samplePlayback} from '../shared/playback-time.js';
const clock=(entry,time,loop,playback)=>{entry.loop=loop!==false;entry.trackTime=samplePlayback(playback,entry.animationEnd-entry.animationStart,entry.loop,time);};
export function sampleAnimationMix(state,skeleton,mix,resolve){
 if(!mix||mix.duration<=0||mix.elapsed>=mix.duration)return false;const from=resolve(mix.from.name),to=resolve(mix.to.name);if(!from||!to)return false;
 let entry=state.getCurrent(0);if(entry?.animation!==to||entry.mixingFrom?.animation!==from){state.clearTrack(0);const previous=state.setAnimation(0,from.name,mix.from.loop!==false);clock(previous,mix.from.time,mix.from.loop,mix.from.playback);state.apply(skeleton);entry=state.setAnimation(0,to.name,mix.to.loop!==false);}entry.mixDuration=mix.duration;entry.mixTime=Math.max(0,mix.elapsed);clock(entry,mix.to.time,mix.to.loop,mix.to.playback);clock(entry.mixingFrom,mix.from.time,mix.from.loop,mix.from.playback);entry.timelinesRotation.length=0;entry.mixingFrom.timelinesRotation.length=0;return true;
}
export function finishAnimationMix(state){const entry=state.getCurrent(0);if(entry?.mixingFrom){const {animation,trackTime,loop}=entry;state.clearTrack(0);const fresh=state.setAnimation(0,animation.name,loop);fresh.trackTime=trackTime;}}
