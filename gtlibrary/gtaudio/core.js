import {findClip,clipURL,loadHandles} from './catalog.js';
export * from './catalog.js';

/** Shared native AudioClip loader. Bounded decoded PCM cache; failed loads can retry. */
export class AudioBank{
 constructor(context,{maxBytes=64*1024*1024,binding}={}){this.context=context;this.maxBytes=maxBytes;this.binding=binding;this.entries=new Map();this.bytes=0;this.abort=new AbortController();this.disposed=false;}
 buffer(name){
  if(this.disposed)return Promise.reject(Error('AudioBank disposed'));
  const cached=this.entries.get(name);if(cached){this.entries.delete(name);this.entries.set(name,cached);return cached.promise;}
  const entry={bytes:0};entry.promise=(async()=>{
   const clip=await findClip(name,{binding:this.binding}),url=clipURL(clip),r=await (globalThis.GTResources?.fetch?.(url,{signal:this.abort.signal})??fetch(url,{signal:this.abort.signal}));
   if(!r.ok)throw Error(`AudioClip ${name}: HTTP ${r.status}`);
   const buffer=await this.context.decodeAudioData(await r.arrayBuffer());
   if(this.disposed)throw Error('AudioBank disposed');
   entry.bytes=buffer.length*buffer.numberOfChannels*4;this.bytes+=entry.bytes;
   for(const [key,old] of this.entries){if(this.bytes<=this.maxBytes)break;if(old.bytes){this.entries.delete(key);this.bytes-=old.bytes;}}
   return buffer;
  })().catch(e=>{if(this.entries.get(name)===entry)this.entries.delete(name);throw e;});
  this.entries.set(name,entry);return entry.promise;
 }
 dispose(){this.disposed=true;this.abort.abort();this.entries.clear();this.bytes=0;}
}

/** Browser mixer shared by GTOnline and future stages. No loudness normalization. */
export class AudioMixer{
 constructor(handles={}, {volume=.3,binding,onError=(e)=>console.debug('gtAudio',e)}={}){
  this.handles=handles;this.onError=onError;this.context=new AudioContext();this.gain=this.context.createGain();this.volume=volume;this.gain.gain.value=volume;this.gain.connect(this.context.destination);
  this.bank=new AudioBank(this.context,{binding});this.enabled=true;this.generation=0;this.pendingSounds=new Set();this.loops=new Map();this.loopGeneration=new Map();this.sources=new Set();
  this.nativeHandles=loadHandles().catch(e=>{this.onError(e);return {sfx:{},bgm:{}};});void this.context.resume().catch(this.onError);
 }
 buffer(name){return this.bank.buffer(name);}
 async spec(handle,kind='sfx'){const native=await this.nativeHandles;return this.handles[handle]||native[kind]?.[handle]||{};}
 async music(name){
  if(this.name===name)return;this.name=name;const token=++this.generation;
  if(!name){this.source?.stop();this.source=null;return;}
  try{const spec=await this.spec(name,'bgm'),b=await this.buffer(spec.Name||name);if(token!==this.generation||this.context.state==='closed')return;
   this.source?.stop();this.musicGain?.disconnect();this.source=this.context.createBufferSource();this.musicGain=this.context.createGain();this.musicGain.gain.value=spec.Volume??1;this.source.buffer=b;this.source.loop=true;this.source.connect(this.musicGain);this.musicGain.connect(this.gain);const source=this.source;source.onended=()=>source.disconnect();source.start();
  }catch(e){if(token===this.generation)this.name=null;if(this.context.state!=='closed')this.onError(e);}
 }
 async effect(handle){
  if(!handle)return;
  if(typeof handle==='object'){
   const key=handle.id||handle.name;
   if(handle.action==='stop'){
    this.loopGeneration.set(key,(this.loopGeneration.get(key)||0)+1);const loop=this.loops.get(key);
    if(loop){const now=this.context.currentTime,duration=handle.fadeOut??.5;loop.volume.gain.cancelScheduledValues(now);loop.volume.gain.setValueAtTime(loop.volume.gain.value,now);loop.volume.gain.linearRampToValueAtTime(0,now+duration);loop.source.stop(now+duration);this.loops.delete(key);}return;
   }
   if(handle.action==='start'){
    if(this.loops.has(key))return;const generation=(this.loopGeneration.get(key)||0)+1;this.loopGeneration.set(key,generation);
    try{const spec=await this.spec(handle.name),buffer=await this.buffer(spec.Name||handle.name);if(this.context.state==='closed'||this.loopGeneration.get(key)!==generation)return;
     const source=this.context.createBufferSource(),volume=this.context.createGain();source.buffer=buffer;source.loop=true;volume.gain.value=handle.volume??spec.Volume??1;source.playbackRate.value=spec.Pitch??1;source.connect(volume);volume.connect(this.gain);source.onended=()=>{source.disconnect();volume.disconnect();};source.start();this.loops.set(key,{source,volume});
    }catch(e){if(this.context.state!=='closed')this.onError(e);}return;
   }
   handle=handle.name;
  }
  // Match the existing per-dispatch duplicate suppression, before asynchronous loads.
  if(this.pendingSounds.has(handle))return;this.pendingSounds.add(handle);queueMicrotask(()=>this.pendingSounds.delete(handle));
  try{const spec=await this.spec(handle),b=await this.buffer(spec.Name||handle);if(this.context.state==='closed')return;
   const source=this.context.createBufferSource(),volume=this.context.createGain();source.buffer=b;volume.gain.value=spec.Volume??1;source.playbackRate.value=spec.Pitch??1;source.connect(volume);volume.connect(this.gain);this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();volume.disconnect();};source.start();
  }catch(e){if(this.context.state!=='closed')this.onError(e);}
 }
 setEnabled(value){this.enabled=!!value;this.gain.gain.value=this.enabled?this.volume:0;}
 pause(value){if(this.context.state!=='closed')void (value?this.context.suspend():this.context.resume()).catch(this.onError);}
 dispose(){if(this.context.state==='closed')return;this.bank.dispose();++this.generation;for(const key of this.loopGeneration.keys())this.loopGeneration.set(key,this.loopGeneration.get(key)+1);for(const loop of this.loops.values())loop.source.stop();this.loops.clear();for(const source of this.sources)source.stop();this.sources.clear();this.source?.stop();void this.context.close();}
}
