import {zip} from '../vendor/fflate.js';
export const utf8=text=>new TextEncoder().encode(text);
export function checkCancelled(signal){if(signal?.aborted)throw new DOMException('已取消导出','AbortError');}
export const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
export function downloadBlob(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);}
export function offerDownload(link,blob,name){if(link.dataset.objectUrl)URL.revokeObjectURL(link.dataset.objectUrl);link.href=link.dataset.objectUrl=URL.createObjectURL(blob);link.download=name;link.textContent='保存 '+name;link.hidden=false;if(!link.dataset.cleanup){link.dataset.cleanup='1';addEventListener('gt-dispose',()=>{if(link.dataset.objectUrl)URL.revokeObjectURL(link.dataset.objectUrl);},{once:true});}link.click();}
export function zipFiles(files,signal){checkCancelled(signal);return new Promise((resolve,reject)=>{const stop=zip(files,{level:0},(err,bytes)=>{signal?.removeEventListener('abort',cancel);err?reject(err):resolve(new Blob([bytes],{type:'application/zip'}));});function cancel(){stop();reject(new DOMException('已取消导出','AbortError'));}signal?.addEventListener('abort',cancel,{once:true});});}
export function canvasPng(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('无法生成 PNG（请检查贴图的跨域权限）')),'image/png'));}
