import {projectDuration,validateProject} from './model.js';
import {projectAudioMixer} from './audio.js';
export async function exportProject(project,{getFrame,signal,onProgress=()=>{},range}={}){
 const p=validateProject(project),total=projectDuration(p),start=range?.start??0,end=range?.end??total;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>total+1e-6||end<=start)throw Error('导出区间须位于时间轴内，且结束时间大于开始时间');const duration=end-start,frames=Math.max(1,Math.ceil(duration*p.fps-1e-7)),mb=await import('../vendor/mediabunny.js');
 if(!globalThis.VideoEncoder||!isSecureContext)throw Error('MP4 导出需要支持 WebCodecs 的 Chromium 浏览器和本机或 HTTPS 地址');
 if(!await mb.canEncodeVideo('avc',{width:p.width,height:p.height,bitrate:p.bitrate}))throw Error('设备不支持此 H.264 画幅，请降低分辨率');
 signal?.throwIfAborted();const mix=await projectAudioMixer(p,signal);if(mix&&!await mb.canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000}))throw Error('设备不支持 AAC 音频编码');
 const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()}),canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const ctx=canvas.getContext('2d'),video=new mb.CanvasSource(canvas,{codec:'avc',bitrate:p.bitrate,keyFrameInterval:2});
 // Fixed frame-rate metadata quantizes packet durations, including the short
 // final frame of an arbitrary export range. Keep the explicit timestamps.
 output.addVideoTrack(video);
 let audio,complete=false;if(mix){audio=new mb.AudioBufferSource({codec:'aac',bitrate:192000});output.addAudioTrack(audio);}
 try{await output.start();
  for(let i=0;i<frames;i++){signal?.throwIfAborted();const time=i/p.fps;if(audio&&i%p.fps===0)await audio.add(await mix(start+time,Math.min(1,duration-time)));await getFrame(ctx,start+time,p.width,p.height);signal?.throwIfAborted();await video.add(time,Math.min(1/p.fps,duration-time),{keyFrame:i%Math.round(p.fps*2)===0});onProgress((i+1)/frames);if(i%4===0)await new Promise(resolve=>setTimeout(resolve,0));}
  video.close();audio?.close();await output.finalize();complete=true;return new Blob([output.target.buffer],{type:'video/mp4'});
 }finally{if(!complete)await output.cancel().catch(()=>{});canvas.width=canvas.height=1;}
}
