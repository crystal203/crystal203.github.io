import {projectDuration,validateProject} from './model.js';
import {projectAudioMixer} from './audio.js';
export async function exportProject(project,{getFrame,signal,onProgress=()=>{}}){
 const p=validateProject(project),duration=projectDuration(p),frames=Math.ceil(duration*p.fps),mb=await import('../vendor/mediabunny.js');
 if(!globalThis.VideoEncoder||!isSecureContext)throw Error('MP4 导出需要支持 WebCodecs 的 Chromium 浏览器和本机或 HTTPS 地址');
 if(!await mb.canEncodeVideo('avc',{width:p.width,height:p.height,bitrate:p.bitrate}))throw Error('设备不支持此 H.264 画幅，请降低分辨率');
 signal?.throwIfAborted();const mix=await projectAudioMixer(p,signal);if(mix&&!await mb.canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000}))throw Error('设备不支持 AAC 音频编码');
 const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()}),canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const ctx=canvas.getContext('2d'),video=new mb.CanvasSource(canvas,{codec:'avc',bitrate:p.bitrate,keyFrameInterval:2});output.addVideoTrack(video,{frameRate:p.fps});
 let audio,complete=false;if(mix){audio=new mb.AudioBufferSource({codec:'aac',bitrate:192000});output.addAudioTrack(audio);}
 try{await output.start();
  for(let i=0;i<frames;i++){signal?.throwIfAborted();if(audio&&i%p.fps===0)await audio.add(await mix(i/p.fps,Math.min(1,duration-i/p.fps)));await getFrame(ctx,i/p.fps,p.width,p.height);signal?.throwIfAborted();await video.add(i/p.fps,Math.min(1/p.fps,duration-i/p.fps),{keyFrame:i%Math.round(p.fps*2)===0});onProgress((i+1)/frames);if(i%4===0)await new Promise(resolve=>setTimeout(resolve,0));}
  video.close();audio?.close();await output.finalize();complete=true;return new Blob([output.target.buffer],{type:'video/mp4'});
 }finally{if(!complete)await output.cancel().catch(()=>{});canvas.width=canvas.height=1;}
}
