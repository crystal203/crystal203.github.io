import {loadCatalog,loadHandles,loadProvenance,resolveClip,clipURL,searchClips} from '../../gtaudio/core.js';
const $=id=>document.getElementById(id),labels={music:'BGM',sfx:'音效',voice:'语音'},params=new URLSearchParams(location.search),size=80,player=$('player');
let catalog,filtered=[],selected=null,page=0,dead=false,selectionToken=0,provenance,handles;
player.volume=.5;
const duration=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'—';
function route(){const p=new URLSearchParams();if(selected)p.set('clip',selected.id);for(const key of ['query','kind','group'])if($(key).value)p.set(key,$(key).value);history.replaceState(null,'','?'+p);GTBridge.selection({clip:selected?.id||'',q:$('query').value,kind:$('kind').value,group:$('group').value});}
function updateButtons(){const index=filtered.indexOf(selected);$('previous').disabled=index<=0;$('next').disabled=index<0||index===filtered.length-1;$('play').disabled=!selected;$('play').textContent=player.paused?'播放':'暂停';}
function render(){
 $('list').replaceChildren();const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.max(0,Math.min(page,pages-1));$('count').textContent=`${filtered.length.toLocaleString()} 项`;$('page').textContent=`${page+1} / ${pages}`;$('prev-page').disabled=page===0;$('next-page').disabled=page===pages-1;
 for(const clip of filtered.slice(page*size,(page+1)*size)){const button=document.createElement('button'),text=document.createElement('span'),name=document.createElement('strong'),group=document.createElement('small'),time=document.createElement('time');button.className='clip';button.setAttribute('aria-current',String(clip===selected));name.textContent=clip.name;group.textContent=labels[clip.kind]+' · '+clip.group;time.textContent=duration(clip.duration);text.append(name,group);button.append(text,time);button.onclick=()=>select(clip,true);$('list').append(GTFavorites.row(button,'audio/clip',clip.id,clip.name));}
 if(!filtered.length){const p=document.createElement('p');p.textContent='没有匹配的内码。';$('list').append(p);}updateButtons();
}
function filter(save=true){filtered=GTFavorites.order(searchClips(catalog.clips,{query:$('query').value,kind:$('kind').value,group:$('group').value}),clip=>['audio/clip',clip.id]);page=0;render();if(save)route();}
async function play(){try{await player.play();}catch(e){if(!dead&&e.name!=='AbortError')$('message').textContent='无法播放：'+e.message;}}
async function select(clip,autoplay=false){
 const token=++selectionToken;selected=clip;player.pause();player.src=clipURL(clip);player.load();$('name').textContent=clip.name;$('badge').textContent=labels[clip.kind];$('selected-group').textContent=clip.group;$('message').textContent='';$('details').replaceChildren();
 for(const [key,value] of Object.entries({'时长':duration(clip.duration),'采样率':clip.sampleRate?clip.sampleRate+' Hz':'原始格式','声道':clip.channels??'—','大小':(clip.bytes/1024).toFixed(1)+' KiB','内码路径':clip.id})){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;$('details').append(dt,dd);}
 $('download').hidden=false;$('download').href=clipURL(clip);$('download').download=clip.name+'.'+clip.file.split('.').pop();$('source-details').hidden=false;$('source').textContent='展开以读取来源和 SoundHandleSpec。';render();route();if(autoplay)void play();
 if($('source-details').open)await sourceInfo(token);
}
async function sourceInfo(token=selectionToken){try{[provenance,handles]=await Promise.all([provenance||loadProvenance(),handles||loadHandles()]);if(dead||token!==selectionToken)return;$('source').textContent=JSON.stringify({sha256:selected.sha256,...provenance[selected.id],handles:Object.values(handles.sfx).filter(h=>h.Name===selected.name||h.Id===selected.name)},null,2);}catch(e){if(token===selectionToken)$('source').textContent=e.message;}}
function adjacent(delta){const i=filtered.indexOf(selected);if(i>=0&&filtered[i+delta]){page=Math.floor((i+delta)/size);void select(filtered[i+delta],true);}}
$('filters').onsubmit=e=>e.preventDefault();let timer;$('query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>filter(),120);};for(const key of ['kind','group'])$(key).onchange=()=>filter();
$('prev-page').onclick=()=>{page--;render();};$('next-page').onclick=()=>{page++;render();};$('previous').onclick=()=>adjacent(-1);$('next').onclick=()=>adjacent(1);$('play').onclick=()=>player.paused?void play():player.pause();$('loop').onchange=()=>player.loop=$('loop').checked;$('source-details').ontoggle=()=>{if($('source-details').open&&selected)void sourceInfo();};
player.onplay=player.onpause=updateButtons;player.onended=()=>{updateButtons();if($('continuous').checked)adjacent(1);};player.onerror=()=>{if(!dead&&selected)$('message').textContent='音频读取失败，请重新选择后重试。'+(player.error?.message||'');};
window.addEventListener('gt-dispose',()=>{dead=true;++selectionToken;clearTimeout(timer);player.pause();player.removeAttribute('src');player.load();},{once:true});
try{catalog=await loadCatalog();if(!dead){const s=catalog.summary;$('summary').textContent=`${s.counts.music.toLocaleString()} 首 BGM · ${s.counts.sfx.toLocaleString()} 个音效 · ${s.counts.voice.toLocaleString()} 个语音`;
 for(const group of [...new Set(catalog.clips.map(c=>c.group))].sort()){const o=document.createElement('option');o.value=group;o.textContent=group;$('group').append(o);}
 $('query').value=params.get('query')||params.get('q')||'';for(const key of ['kind','group'])$(key).value=params.get(key)||'';filter(false);
 const name=params.get('clip')||params.get('resource')?.replace(/^audio:/,'');if(name)try{const c=resolveClip(catalog,name);page=Math.max(0,Math.floor(filtered.indexOf(c)/size));await select(c);}catch(e){$('message').textContent=e.message;}
}}catch(e){$('summary').textContent='音频目录读取失败：'+e.message;}
