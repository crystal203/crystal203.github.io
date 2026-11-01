import {loadCatalog,clipURL} from '../gtaudio/catalog.js';
import {scheduleAudioGain} from './audio-envelope.js';
const buffers=new Map();let decodedBytes=0;
export async function audioBuffer(id,context){
 const catalog=await loadCatalog(),clip=catalog.byId.get(id);if(!clip)throw Error('音源不存在：'+id);const key=clip.sha256||clip.file||id;if(buffers.has(key)){const entry=buffers.get(key);buffers.delete(key);buffers.set(key,entry);return entry.promise;}
 const entry={bytes:0,promise:null};entry.promise=(async()=>{const response=await GTResources.fetch(clipURL(clip));if(!response.ok)throw Error('音源加载失败：'+clip.name);const buffer=await context.decodeAudioData(await response.arrayBuffer());entry.bytes=buffer.length*buffer.numberOfChannels*4;decodedBytes+=entry.bytes;for(const [cachedKey,cached] of buffers){if(buffers.size<=32&&decodedBytes<=64*1024*1024)break;if(cachedKey!==key&&cached.bytes){decodedBytes-=cached.bytes;buffers.delete(cachedKey);}}return buffer;})().catch(error=>{if(buffers.get(key)===entry)buffers.delete(key);throw error;});buffers.set(key,entry);return entry.promise;
}

export function audioEvents(project){
 const events=project.audio.filter(c=>!c.muted&&project.audioTracks?.find(track=>track.layer===c.layer)?.enabled!==false).map(c=>({...c,rate:1}));
 for(const cut of project.clips.filter(c=>!c.muted)){const shot=project.shots.find(s=>s.id===cut.shot),rate=cut.rate||1;for(const t of shot.tracks.filter(t=>t.enabled!==false&&t.property==='audio'))for(const c of t.clips){const from=Math.max(c.start,cut.in),to=Math.min(c.start+c.duration,cut.out);if(to<=from)continue;events.push({...c,start:cut.start+(from-cut.in)/rate,duration:(to-from)/rate,in:(c.in||0)+from-c.start,rate,envelopeStart:cut.start+(c.start-cut.in-(c.audioEnvelope?.offset||0))/rate,envelopeDuration:(c.audioEnvelope?.duration??c.duration)/rate,fadeIn:(c.fadeIn||0)/rate,fadeOut:(c.fadeOut||0)/rate,volume:(c.volume??1)*(cut.volume??1)});}}
 return events;
}
export class AudioPlayback {
 constructor(){this.sources=[];this.generation=0;}
 async play(events,time){this.stop();const token=this.generation;this.context??=new AudioContext();await this.context.resume();const prepared=await Promise.all(events.filter(e=>e.start+e.duration>time).map(async e=>[e,await audioBuffer(e.clip,this.context)]));if(token!==this.generation)return;const now=this.context.currentTime+.05;for(const [e,buffer] of prepared){const elapsed=Math.max(0,time-e.start),offset=(e.in||0)+elapsed*(e.rate||1),duration=e.duration-elapsed;if(offset>=buffer.duration||duration<=0)continue;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.playbackRate.value=e.rate||1;const when=now+Math.max(0,e.start-time),from=Math.max(time,e.start),to=from+Math.min(duration,(buffer.duration-offset)/(e.rate||1));scheduleAudioGain(gain.gain,e,when,from,to);source.connect(gain).connect(this.context.destination);source.start(when,offset,(to-from)*(e.rate||1));this.sources.push(source);}}
 stop(){++this.generation;for(const source of this.sources){try{source.stop();}catch{}source.disconnect();}this.sources=[];}
 dispose(){this.stop();this.context?.close();}
}
export async function projectAudioMixer(project,signal){
 const events=audioEvents(project);if(!events.length)return null;
 const decoder=new OfflineAudioContext(2,1,48000),prepared=[];
 for(const e of events){signal?.throwIfAborted();prepared.push([e,await audioBuffer(e.clip,decoder)]);}
 return async(start,duration)=>{signal?.throwIfAborted();const context=new OfflineAudioContext(2,Math.max(1,Math.round(duration*48000)),48000);for(const [e,buffer] of prepared){const from=Math.max(start,e.start),to=Math.min(start+duration,e.start+e.duration),offset=(e.in||0)+(from-e.start)*(e.rate||1);if(to<=from||offset>=buffer.duration)continue;const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=e.rate||1;const end=Math.min(to,from+(buffer.duration-offset)/(e.rate||1));scheduleAudioGain(gain.gain,e,from-start,from,end);source.connect(gain).connect(context.destination);source.start(from-start,offset,(end-from)*(e.rate||1));}return context.startRendering();};
}
