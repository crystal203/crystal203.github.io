/** Original AudioClips and SoundHandleSpec volumes; no per-clip normalization. */
export class StageAudio{
 constructor(handles={}){this.handles=handles;this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=.3;this.gain.connect(this.context.destination);this.buffers=new Map();this.enabled=true;this.generation=0;this.pendingSounds=new Set();void this.context.resume();}
 async buffer(name){if(!this.buffers.has(name))this.buffers.set(name,GTResources.fetch(new URL('./assets/audio/'+name+'.ogg',import.meta.url)).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}).then(b=>this.context.decodeAudioData(b)));return this.buffers.get(name);}
 async music(name){if(this.name===name)return;this.name=name;const token=++this.generation;try{const b=await this.buffer(name);if(token!==this.generation||this.context.state==='closed')return;this.source?.stop();this.source=this.context.createBufferSource();this.source.buffer=b;this.source.loop=true;this.source.connect(this.gain);this.source.start();}catch{}}
 async effect(handle){const spec=this.handles[handle]||{},name=spec.Name||handle;if(this.pendingSounds.has(name))return;this.pendingSounds.add(name);queueMicrotask(()=>this.pendingSounds.delete(name));try{const b=await this.buffer(name);if(this.context.state==='closed')return;const s=this.context.createBufferSource(),volume=this.context.createGain();s.buffer=b;volume.gain.value=spec.Volume??1;s.playbackRate.value=spec.Pitch??1;s.connect(volume);volume.connect(this.gain);s.onended=()=>{s.disconnect();volume.disconnect();};s.start();}catch{}}
 setEnabled(value){this.enabled=value;this.gain.gain.value=value?.3:0;}
 pause(value){if(this.context.state==='closed')return;if(value)void this.context.suspend();else void this.context.resume();}
 dispose(){++this.generation;this.source?.stop();void this.context.close();}
}
