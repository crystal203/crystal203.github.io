import {checkCancelled,yieldTask,zipFiles,utf8,canvasPng} from './export-utils.js';

/** A deterministic RGBA frame provider; independent of Spine/FX UI and playback clocks. */
export async function exportAnimation({format='mp4',width,height,frames,fps=30,duration=frames/fps,getFrame,background='#00ff00',transparent=false,signal,onProgress=()=>{}}){
 if(!['mp4','mov','png'].includes(format))throw new Error('未知动画导出格式');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8388608)throw new Error('导出尺寸须在 1–4096 px 以内，总像素不超过 8M');
 if(!Number.isFinite(fps)||fps<1||fps>120||!Number.isInteger(frames)||frames<1||frames>3600||!Number.isFinite(duration)||duration<=0||Math.ceil(duration*fps)!==frames)throw new Error('请检查时长与帧率；最多导出 3600 帧');
 checkCancelled(signal);
 const video=format!=='png',w=video?Math.ceil(width/2)*2:width,h=video?Math.ceil(height/2)*2:height;
 const pixels=document.createElement('canvas');pixels.width=width;pixels.height=height;const pc=pixels.getContext('2d');
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:!video});
 let output,source,finished=false;const files={};let memory=0;
 try{
  if(video){
   if(!globalThis.VideoEncoder||!isSecureContext)throw new Error('此浏览器无法使用 WebCodecs 视频编码。请使用新版 Chromium 浏览器，或导出 PNG 序列');
   const mb=await import('../vendor/mediabunny.js');
   const bitrate=Math.round(Math.max(1500000,Math.min(24000000,w*h*fps*.16)));
   if(!await mb.canEncodeVideo('avc',{width:w,height:h,bitrate}))throw new Error('此设备不支持当前尺寸的 H.264 编码。请降低尺寸，或导出 PNG 序列');
   output=new mb.Output({format:format==='mov'?new mb.MovOutputFormat():new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()});
   source=new mb.CanvasSource(canvas,{codec:'avc',bitrate,keyFrameInterval:2});output.addVideoTrack(source,{frameRate:fps});await output.start();
  }
  for(let i=0;i<frames;i++){
   checkCancelled(signal);const rgba=await getFrame(i,i/fps);checkCancelled(signal);
   if(rgba.length!==width*height*4)throw new Error('捕获帧尺寸与导出计划不一致');
   pc.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer,rgba.byteOffset,rgba.byteLength),width,height),0,0);
   ctx.clearRect(0,0,w,h);if(video||!transparent){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}ctx.drawImage(pixels,0,0);
   const frameDuration=Math.min(1/fps,duration-i/fps);
   if(video)await source.add(i/fps,frameDuration,{keyFrame:i===0});
   else{const bytes=new Uint8Array(await (await canvasPng(canvas)).arrayBuffer());memory+=bytes.byteLength;if(memory>512*1024*1024)throw new Error('PNG 序列超过 512 MiB，请缩短范围或降低尺寸');files['frames/'+String(i+1).padStart(6,'0')+'.png']=bytes;}
   onProgress((i+1)/frames*.95);await yieldTask();
  }
  checkCancelled(signal);
  if(video){source.close();await output.finalize();finished=true;checkCancelled(signal);onProgress(1);return {blob:new Blob([output.target.buffer],{type:format==='mov'?'video/quicktime':'video/mp4'}),extension:format,width:w,height:h,frames,duration};}
  files['sequence.json']=utf8(JSON.stringify({format:'GTAnimationSequence',version:1,width:w,height:h,fps,frames,duration,alpha:transparent,frameDurations:Array.from({length:frames},(_,i)=>Math.min(1/fps,duration-i/fps))},null,2));
  files['README.txt']=utf8('按 frames/000001.png 起导入图像序列，帧率见 sequence.json。透明背景保留完整 Alpha。\nMP4/MOV 使用 H.264，无透明通道与音轨。');
  const blob=await zipFiles(files,signal);onProgress(1);return {blob,extension:'zip',width:w,height:h,frames,duration};
 }finally{if(output&&!finished)await output.cancel().catch(()=>{});canvas.width=pixels.width=1;canvas.height=pixels.height=1;}
}
