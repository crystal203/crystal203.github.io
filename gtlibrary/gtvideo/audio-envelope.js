export function audioEnvelope(event){
 const duration=event.envelopeDuration??event.audioEnvelope?.duration??event.duration,start=event.envelopeStart??event.start-(event.audioEnvelope?.offset||0);let fadeIn=Math.max(0,event.fadeIn||0),fadeOut=Math.max(0,event.fadeOut||0);const total=fadeIn+fadeOut;if(total>duration){fadeIn*=duration/total;fadeOut*=duration/total;}return {start,duration,fadeIn,fadeOut};
}
export function audioEnvelopeAt(event,time){const {start,duration,fadeIn,fadeOut}=audioEnvelope(event),elapsed=time-start;if(elapsed<0||elapsed>duration)return 0;return Math.max(0,Math.min(1,fadeIn?elapsed/fadeIn:1,fadeOut?(duration-elapsed)/fadeOut:1));}
export function scheduleAudioGain(parameter,event,when,from,to){
 const envelope=audioEnvelope(event),points=[envelope.start+envelope.fadeIn,envelope.start+envelope.duration-envelope.fadeOut,envelope.start+envelope.duration],volume=event.volume??1;parameter.cancelScheduledValues(when);parameter.setValueAtTime(volume*audioEnvelopeAt(event,from),when);for(const time of [...new Set(points)].sort((a,b)=>a-b))if(time>from&&time<to)parameter.linearRampToValueAtTime(volume*audioEnvelopeAt(event,time),when+time-from);parameter.linearRampToValueAtTime(volume*audioEnvelopeAt(event,to),when+to-from);
}
export function sliceAudioEnvelope(clip,offset=0){return {offset:(clip.audioEnvelope?.offset||0)+offset,duration:clip.audioEnvelope?.duration??clip.duration};}
