import {FxRuntime} from '../../gtfx/core.js';
import {outputSize,nearestResize} from '../../gtfx/gif-sizing.js';
const $=id=>document.getElementById(id);
let manifestUrl,effectGeneration=0,loadedEffect=null,disposed=false;
let mediaAbort=null;
let runtime,catalog,index,character,effect,playing=false,time=0,last=performance.now(),queue=null,gap=0,generation=0,exporting=false,cancelled=false,worker=null,downloadUrl=null,measuring=false,nativePlan=null;
let avatarImage=null,avatarFrames={};
function message(text=''){$('message').textContent=text;$('message').hidden=!text;}
function error(e){message(e.message||String(e));playing=false;update();}
async function json(url){const response=await GTResources.fetch(url);if(!response.ok)throw new Error('文件读取失败：'+url);return response.json();}
function avatar(char){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=40;canvas.className='avatar';
  const draw=()=>{const context=canvas.getContext('2d'),entry=avatarFrames[char.id],image=avatarImage;
    context.clearRect(0,0,40,40);
    if(!entry||!image){context.fillStyle='#93aee6';context.font='19px system-ui';context.textAlign='center';context.fillText(char.name[0]||'·',20,27);return;}
    const r=entry.frame,w=entry.rotated?r.h:r.w,h=entry.rotated?r.w:r.h,scale=Math.min(36/w,36/h);
    context.save();context.imageSmoothingEnabled=false;context.translate(20,20);if(entry.rotated)context.rotate(-Math.PI/2);context.drawImage(image,r.x,r.y,r.w,r.h,-r.w*scale/2,-r.h*scale/2,r.w*scale,r.h*scale);context.restore();};
  draw();return canvas;
}
async function loadAvatars(){
  try{const [data,image]=await Promise.all([json('../../resources/previews/fx.json'),GTResources.image('../../resources/previews/fx.webp')]);
    if(disposed)return;avatarFrames=data.frames;avatarImage=image;renderCharacters();
  }catch(error){console.debug('列表头像暂不可用',error);}
}
function renderCharacters(){
  const query=$('search').value.trim().toLowerCase(),list=catalog.characters.filter(c=>c.name.toLowerCase().includes(query)||c.id.toLowerCase().includes(query)||c.key?.toLowerCase().includes(query)||c.aliases?.some(a=>a.toLowerCase().includes(query)));
  $('characters').replaceChildren(...list.map(char=>{const button=document.createElement('button');button.className='character'+(character?.id===char.id?' active':'');button.title=char.id;button.setAttribute('aria-pressed',String(character?.id===char.id));
    const name=document.createElement('span');name.className='name';name.textContent=char.name;const count=document.createElement('small');count.textContent=char.count;button.append(avatar(char),name,count);button.onclick=()=>selectCharacter(char);return button;}));
  $('count').textContent=`${list.length} / ${catalog.characters.length}`;
}
function label(e){
  let name=e.assetName.replace(/^fx_(?:cwp_)?/,'');
  const key=(character.key||character.id).replace(/_\d+$/,'');
  for(const prefix of [character.id,key])if(name.startsWith(prefix+'_'))name=name.slice(prefix.length+1);
  const terms={basic:'普攻',linkatk:'连锁',last:'专武',explosion:'爆炸',dash:'冲刺',screenfx:'屏幕',proj:'弹体',bullet:'弹体',hit:'命中',cast:'施放',charge:'蓄力',loop:'循环',start:'开始',end:'结束',chainhold:'链条束缚',slash:'斩击',hookshot:'钩锁','1st':'第一段','2nd':'第二段','3rd':'第三段','4th':'第四段',trail:'轨迹',contrail:'尾迹',support:'辅助',buff:'增益',debuff:'减益',myth:'开花'};
  return name.split('_').map(part=>terms[part]||part).join(' · ')+(e.unavailable?'（'+e.unavailable+'）':'');
}
async function selectCharacter(char){
  if(exporting||measuring)return;++effectGeneration;runtime.loadGeneration=(runtime.loadGeneration||0)+1;const current=++generation;character=char;playing=false;queue=null;effect=null;
  GTBridge.selection({character:char.id});$('sidebar').classList.remove('open');$('current-character').textContent=char.name;renderCharacters();message('加载中');$('effect').disabled=true;
  for(const id of ['replay','play','step','all','export'])$(id).disabled=true;
  runtime.clear();
  try{
    manifestUrl=new URL('../../resources/fx/'+char.index,location.href);const data=await json(manifestUrl);
    if(current!==generation)return;
    index=data;loadedEffect=null;++effectGeneration;
    $('effect').replaceChildren(...index.effects.map((e,i)=>{const option=new Option(label(e),String(i));option.title=e.assetName;option.disabled=!!e.unavailable;return option;}));
    $('effect').disabled=false;$('all').disabled=false;
    const desiredEffect=new URLSearchParams(location.search).get('effect');const initial=index.effects.findIndex(e=>!e.unavailable&&(desiredEffect?e.id===desiredEffect:e.assetName==='fx_hana_linkatk_chainhold'));const first=initial>=0?initial:index.effects.findIndex(e=>!e.unavailable&&(e.systems.length||e.statics?.length));
    if(first>=0)await selectEffect(first);else message('没有可播放素材');
    const url=new URL(location.href);url.searchParams.set('character',char.id);history.replaceState(null,'',url);
  }catch(e){if(current===generation)error(e);}
}
async function selectEffect(position,auto=true){
  try{
    $('download-gif').hidden=true;$('export-status').textContent='';nativePlan=null;const selected=index.effects[position];if(!selected||selected.unavailable)return;
    const current=++effectGeneration;playing=false;effect=null;message('加载中');
    for(const id of ['replay','play','step','export','all'])$(id).disabled=true;
    if(loadedEffect!==selected){await runtime.load(index,p=>GTResources.url(p,manifestUrl),{effect:selected,loadImage:p=>GTResources.image(p)});if(current!==effectGeneration||disposed)return;loadedEffect=selected;}
    effect=selected;$('all').disabled=false;
    $('effect').value=String(position);runtime.build(effect,Number($('seed').value)>>>0);runtime.autoFit();
    GTBridge.selection({character:character.id,effect:effect.id});
    time=0;gap=0;playing=auto;$('seek').max=runtime.duration;$('end').value=runtime.duration.toFixed(3);$('start').value='0';$('duration').textContent=runtime.duration.toFixed(3)+' s';$('zoom').value='1';
    for(const id of ['replay','play','step','export'])$(id).disabled=false;
    $('quality').hidden=!effect.limitations?.length;$('quality').title=(effect.limitations||[]).join('、');
    $('layers').replaceChildren(...effect.systems.map((system,i)=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;label.append(check,system.name);check.onchange=()=>{check.checked?runtime.excluded.delete(i):runtime.excluded.add(i);sample();refreshNativeSize();};return label;}));
    message(effect.systems.length||effect.statics?.length?'':'仅有游戏脚本');sample();refreshNativeSize();
  }catch(e){if(!disposed)error(e);}
}
function update(){$('play').textContent=playing?'暂停':'播放';$('seek').value=time;$('time').textContent=time.toFixed(3);}
function sample(){if(effect)runtime.sample(time);update();}
function tick(now){
  if(disposed)return;
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!document.hidden&&effect&&playing&&!exporting&&!measuring){
    if(gap>0){gap-=dt;if(gap<=0){if(queue?.length)selectEffect(queue.shift());else if(queue){queue=null;playing=false;}else time=0;}}
    else{time+=dt*Number($('speed').value);if(time>=runtime.duration){time=runtime.duration;if(queue||$('loop').checked)gap=.25;else playing=false;}}
    sample();
  }
  requestAnimationFrame(tick);
}
function workerRequest(data,transfer=[]){return new Promise((resolve,reject)=>{worker.onmessage=e=>{e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data);};worker.onerror=e=>reject(new Error(e.message||'GIF 编码失败'));worker.postMessage(data,transfer);});}
function exportTimes(){
  const start=Number($('start').value),end=Number($('end').value),fps=Number($('fps').value),speed=Number($('speed').value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>runtime.duration+.001)throw new Error('请检查导出起止时间');
  const frames=Math.ceil((end-start)/speed*fps);if(frames>1800)throw new Error('导出最多 1800 帧，请缩短范围');
  return {start,end,fps,speed,times:Array.from({length:frames},(_,i)=>Math.min(end-1e-6,start+i*speed/fps))};
}
function showNativeDimensions(){
  if(!nativePlan)return;
  try{const size=outputSize(nativePlan,Number($('native-scale').value));$('native-dimensions').textContent=`${size.width} × ${size.height} px`;$('native-dimensions').title=`原始：${nativePlan.width} × ${nativePlan.height} px；${nativePlan.pixelsPerUnit} px / Unity 单位`;}catch(e){$('native-dimensions').textContent='—';}
}
async function refreshNativeSize(){
  const native=$('size').value==='native';$('native-scale-label').hidden=$('native-dimensions').hidden=!native;
  if(!native||!effect||exporting||measuring)return;
  let times;try{times=exportTimes().times;}catch(e){nativePlan=null;$('native-dimensions').textContent='—';return;}
  const oldTime=time,oldPlaying=playing;measuring=true;playing=false;cancelled=false;
  const disabled=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');disabled.forEach(el=>el.disabled=true);
  $('native-dimensions').textContent='计算中';$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;update();
  try{nativePlan=await runtime.measureNative(times,{onProgress:value=>$('progress').value=value,isCancelled:()=>cancelled});showNativeDimensions();}
  catch(e){nativePlan=null;$('native-dimensions').textContent='—';if(!cancelled)message(e.message);}
  finally{measuring=false;disabled.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;time=oldTime;playing=oldPlaying;runtime.resize();sample();}
}
async function exportGif(){
  if(exporting||measuring||!effect)return;
  let config;try{config=exportTimes();if($('size').value==='native')outputSize({width:1,height:1},Number($('native-scale').value));}catch(e){message(e.message);return;}
  const {start,end,fps,speed,times}=config,oldTime=time,oldPlaying=playing;exporting=true;playing=false;cancelled=false;update();
  const disabled=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');disabled.forEach(el=>el.disabled=true);
  $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;$('export').textContent='导出中';message('');
  try{
    const native=$('size').value==='native',transparent=$('background').value==='transparent';let captureSize=Number($('size').value),dimensions={width:captureSize,height:captureSize};
    if(native){nativePlan=await runtime.measureNative(times,{onProgress:value=>$('progress').value=value*.25,isCancelled:()=>cancelled});captureSize=nativePlan;dimensions=outputSize(nativePlan,Number($('native-scale').value));showNativeDimensions();}
    if(cancelled)throw new Error('已取消');
    worker=new Worker(new URL('../../gtfx/gif-worker.js',import.meta.url),{type:'module'});
    await workerRequest({type:'start',...dimensions,transparent,threshold:Number($('threshold').value)});
    for(let i=0;i<times.length;i++){
      if(cancelled)throw new Error('已取消');
      const rgba=runtime.captureFrame(times[i],captureSize,transparent?null:$('color').value);
      const elapsed=i/fps,remaining=(end-start)/speed-elapsed,frameDuration=Math.min(1/fps,remaining),delay=Math.max(10,Math.round((elapsed+frameDuration)*100)*10-Math.round(elapsed*100)*10);
      await workerRequest({type:'frame',index:i,rgba:rgba.buffer,delay},[rgba.buffer]);$('progress').value=(native ? .25 : 0)+(i+1)/times.length*(native ? .75 : 1);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const result=await workerRequest({type:'finish'});if(cancelled)throw new Error('已取消');
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([result.bytes],{type:'image/gif'}));
    const a=$('download-gif');a.hidden=false;a.href=downloadUrl;a.download=effect.assetName+(native?`_${dimensions.width}x${dimensions.height}`:'')+(transparent?'_transparent':'_matte')+'.gif';a.click();$('export-status').textContent='导出完成 · '+dimensions.width+' × '+dimensions.height+' px';
  }catch(e){if(!cancelled)message(e.message);}
  finally{worker?.terminate();worker=null;exporting=false;disabled.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;time=oldTime;playing=oldPlaying;runtime.resize();sample();}
}
$('search').oninput=renderCharacters;$('menu').onclick=()=>$('sidebar').classList.toggle('open');
$('effect').onchange=()=>{queue=null;selectEffect(Number($('effect').value));};
$('play').onclick=()=>{queue=null;gap=0;if(time>=runtime.duration)time=0;playing=!playing;sample();};
$('replay').onclick=()=>{queue=null;time=0;gap=0;playing=true;sample();};
$('step').onclick=()=>{queue=null;gap=0;playing=false;time=Math.min(runtime.duration,time+1/60);sample();};
$('seek').oninput=()=>{queue=null;gap=0;playing=false;time=Number($('seek').value);sample();};
$('all').onclick=()=>{queue=index.effects.map((e,i)=>e.unavailable?null:i).filter(i=>i!==null);selectEffect(queue.shift());};
$('fit').onclick=()=>{runtime.autoFit();$('zoom').value='1';sample();};
$('zoom').oninput=()=>{runtime.zoom=Number($('zoom').value);runtime.resize();sample();};
$('seed').onchange=()=>{const t=time,wasPlaying=playing;selectEffect(Number($('effect').value),wasPlaying);time=t;sample();};
$('view').onchange=()=>{runtime.setView($('view').value==='top');sample();refreshNativeSize();};
$('size').onchange=refreshNativeSize;$('native-scale').oninput=showNativeDimensions;
for(const id of ['start','end','fps','speed'])$(id).onchange=refreshNativeSize;
$('grid').onchange=()=>{runtime.grid.visible=$('grid').checked;sample();};
function setPreviewBackground(){const solid=$('preview-background').value==='color';$('preview-color').hidden=!solid;$('stage').classList.toggle('checker',!solid);runtime.setBackground(solid?'color':'checker',$('preview-color').value);sample();}
$('preview-background').onchange=setPreviewBackground;$('preview-color').oninput=setPreviewBackground;
$('background').onchange=()=>{$('color').hidden=$('background').value==='transparent';};
$('canvas').onwheel=e=>{e.preventDefault();if(exporting)return;runtime.zoom=Math.min(6,Math.max(.25,runtime.zoom*Math.exp(-e.deltaY*.001)));$('zoom').value=runtime.zoom;runtime.resize();sample();};
let drag;
$('canvas').onpointerdown=e=>{if(exporting||!effect)return;drag={x:e.clientX,y:e.clientY};$('canvas').setPointerCapture(e.pointerId);};
$('canvas').onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,scale=runtime.viewSize/runtime.zoom/$('canvas').clientHeight,pitch=runtime.cameraConfig.pitchDeg*Math.PI/180;runtime.viewCenter.x-=dx*scale;runtime.viewCenter.y+=dy*scale*Math.cos(pitch)*Math.sin(pitch);runtime.viewCenter.z-=dy*scale*Math.sin(pitch)**2;drag={x:e.clientX,y:e.clientY};runtime.setView(runtime.topView);sample();};
$('canvas').onpointerup=()=>{drag=null;};$('canvas').onpointercancel=()=>{drag=null;};
async function exportMedia(){
 if(exporting||measuring||!effect)return;
 const format=$('media-format').value;if(format==='gif')return exportGif();
 let config;try{config=exportTimes();}catch(e){message(e.message);return;}
 const oldTime=time,oldPlaying=playing;exporting=true;playing=false;cancelled=false;mediaAbort=new AbortController();
 const locked=[...document.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.id!=='cancel');locked.forEach(el=>el.disabled=true);
 $('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;$('export').textContent='导出中';update();message('');
 try{
  const native=$('size').value==='native',transparent=$('background').value==='transparent';let captureSize=Number($('size').value),dimensions={width:captureSize,height:captureSize};
  if(native){nativePlan=await runtime.measureNative(config.times,{onProgress:p=>$('progress').value=p*.2,isCancelled:()=>cancelled});dimensions=outputSize(nativePlan,Number($('native-scale').value));captureSize=nativePlan;showNativeDimensions();}
  const {exportAnimation}=await import('../../core/animation-export.js'),{offerDownload}=await import('../../core/export-utils.js');
  const result=await exportAnimation({format,...dimensions,frames:config.times.length,fps:config.fps,duration:(config.end-config.start)/config.speed,transparent,background:$('color').value,signal:mediaAbort.signal,getFrame:i=>{const rgba=runtime.captureFrame(config.times[i],captureSize);return native?nearestResize(rgba,nativePlan.width,nativePlan.height,dimensions.width,dimensions.height):rgba;},onProgress:p=>$('progress').value=(native?.2:0)+p*(native?.8:1)});
  if(!cancelled){offerDownload($('download-gif'),result.blob,effect.assetName+'.'+result.extension);$('export-status').textContent=`导出完成 · ${result.width} × ${result.height} px`;}
 }catch(e){if(!cancelled&&e.name!=='AbortError')message(e.message);}
 finally{exporting=false;mediaAbort=null;locked.forEach(el=>el.disabled=false);$('cancel').hidden=true;$('progress').hidden=true;$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;time=oldTime;playing=oldPlaying;if(!disposed){runtime.resize();sample();}}
}

$('export').onclick=exportMedia;$('cancel').onclick=()=>{cancelled=true;mediaAbort?.abort();};
$('media-format').onchange=()=>{const video=['mp4','mov'].includes($('media-format').value);$('background').querySelector('option[value=transparent]').disabled=video;if(video)$('background').value='color';$('color').hidden=$('background').value==='transparent';$('export').textContent='导出 '+$('media-format').selectedOptions[0].textContent;};
$('info').onclick=()=>{$('info-text').textContent=effect?`${character.name} / ${character.id}\n${effect.assetName}\n${effect.preset}\n${effect.systems.length} 个粒子系统 · ${effect.statics?.length||0} 个静态图层\n${runtime.duration.toFixed(3)} s\n\n${effect.limitations?.length?'近似项：'+effect.limitations.join('、'):'基础粒子渲染'}\n\n全部素材随站点打包。GIF 支持 1 位透明，半透明边缘会量化。\n原始尺寸：按素材 PPU（无记录时 100 px / Unity 单位）与整段动画可见边界计算，倍率采用最近邻缩放。`:'角色特效播放器';$('info-dialog').showModal();};
$('close-info').onclick=()=>$('info-dialog').close();
async function init(){try{runtime=new FxRuntime($('canvas'));runtime.grid.visible=false;runtime.setBackground('checker');new ResizeObserver(()=>{if(!exporting&&!measuring){runtime.resize();sample();}}).observe($('stage'));runtime.resize();catalog=await json('../../resources/fx/catalog.json');const registry=await GTRegistry.load();catalog={...catalog,characters:catalog.characters.map(c=>{const entity=GTRegistry.resolve(registry,{character:c.id});return {...c,name:entity?.name||c.name,aliases:entity?.aliases||[]};})};renderCharacters();const desired=new URL(location.href).searchParams.get('character')||'hana';const selected=catalog.characters.find(c=>c.id===desired);if(selected)await selectCharacter(selected);else message('当前索引没有对应角色：'+desired);if(!disposed)loadAvatars();}catch(e){error(e);}requestAnimationFrame(tick);}
init();

window.addEventListener("gt-dispose",()=>{disposed=true;++generation;++effectGeneration;cancelled=true;mediaAbort?.abort();worker?.terminate();if(downloadUrl)URL.revokeObjectURL(downloadUrl);runtime?.dispose();});
