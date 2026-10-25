/* Hero-local text with explicit, language-specific gtAudio bindings. */
import {findClip,clipURL} from '../gtaudio/catalog.js';
const languages=[['zhCN','中文'],['enUS','English'],['jaJP','日本語']];
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function plain(value){return String(value||'').replace(/\\n/g,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\[(?:c|C|\/?c|\/?C|[a-fA-F0-9]{6}|-)\]/g,'').trim();}
export class VoiceLines {
  constructor(host){
    this.host=host;this.groups=[];this.playToken=0;this.dead=false;this.active=null;
    this.toolbar=node('div',undefined,'voice-toolbar');
    const version=node('label','台词版本 ');this.version=node('select');this.version.setAttribute('aria-label','台词版本');version.append(this.version);
    const language=node('label','显示语言 ');this.language=node('select');this.language.setAttribute('aria-label','台词显示语言');
    for(const [value,label] of [['all','三语对照'],...languages]){const o=node('option',label);o.value=value;this.language.append(o);}language.append(this.language);
    const search=node('label',undefined,'voice-search');this.search=node('input');this.search.type='search';this.search.placeholder='搜索台词或类型';this.search.setAttribute('aria-label','搜索台词或类型');search.append(this.search);
    const voice=node('label','语音语言 ');this.voiceLanguage=node('select');this.voiceLanguage.setAttribute('aria-label','语音语言');
    for(const [value,label] of languages){const o=node('option',label);o.value=value;this.voiceLanguage.append(o);}voice.append(this.voiceLanguage);
    this.toolbar.append(version,language,voice,search);
    this.count=node('p',undefined,'section-note voice-count');this.count.setAttribute('role','status');
    this.playerPanel=node('div',undefined,'voice-player');this.playerPanel.hidden=true;
    this.status=node('p',undefined,'voice-playback-status');this.status.setAttribute('role','status');
    this.audio=node('audio');this.audio.controls=true;this.audio.preload='none';this.audio.volume=.5;this.audio.setAttribute('aria-label','角色台词播放器');this.audio.hidden=true;
    this.playerPanel.append(this.status,this.audio);
    this.body=node('div');host.append(this.toolbar,this.count,this.playerPanel,this.body);
    this.version.onchange=this.language.onchange=this.voiceLanguage.onchange=()=>this.render();this.search.oninput=()=>this.render();
    this.audio.onplay=this.audio.onpause=()=>this.updateButton();
    this.audio.onended=()=>{this.updateButton();if(this.active)this.status.textContent=this.active.label+' · 播放完毕';};
    this.audio.onerror=()=>{if(this.active&&this.audio.getAttribute('src')){this.status.textContent='语音读取失败，请点击播放重试。';this.updateButton();}};
  }
  updateButton(){
    if(!this.active)return;
    const button=this.active.button,playing=!this.audio.paused&&!this.audio.ended;
    button.textContent=(playing?'Ⅱ 暂停':'▶ 播放')+this.active.language;button.setAttribute('aria-pressed',String(playing));
    if(playing)this.status.textContent=this.active.label;
  }
  stop(){
    ++this.playToken;this.audio.pause();this.updateButton();if(this.active)this.active.button.disabled=false;this.active=null;
    this.audio.removeAttribute('src');this.audio.load();this.audio.hidden=true;this.playerPanel.hidden=true;this.status.textContent='';
  }
  async play(id,row,button){
    if(this.dead||!id)return;
    if(this.active?.button===button&&this.active.id===id&&!this.audio.error&&this.audio.getAttribute('src')){
      if(!this.audio.paused){this.audio.pause();return;}
      try{await this.audio.play();}catch(e){if(this.active?.button===button&&e.name!=='AbortError')this.status.textContent='无法播放，请点击重试。';}return;
    }
    this.stop();const token=++this.playToken,language=languages.find(([lang])=>lang===this.voiceLanguage.value)[1];
    this.active={id,button,language,label:row.label+' · '+language};button.disabled=true;button.textContent='正在读取…';
    this.playerPanel.hidden=false;this.status.textContent='正在读取：'+this.active.label;
    try{
      const clip=await findClip(id);if(this.dead||token!==this.playToken)return;
      this.audio.src=clipURL(clip);this.audio.hidden=false;this.status.textContent=this.active.label;
      await this.audio.play();
    }catch(e){if(!this.dead&&token===this.playToken&&e.name!=='AbortError')this.status.textContent='语音播放失败，请点击播放重试。';}
    finally{if(!this.dead&&token===this.playToken){button.disabled=false;this.updateButton();}}
  }
  dispose(){if(this.dead)return;this.stop();this.dead=true;this.audio.onplay=this.audio.onpause=this.audio.onended=this.audio.onerror=null;}
  setHero(hero){
    this.groups=hero.voiceLines||[];this.search.value='';
    this.version.replaceChildren(...this.groups.map(group=>{const o=node('option',group.label);o.value=group.id;return o;}));
    this.toolbar.hidden=!this.groups.length;this.render();
  }
  render(){
    this.stop();
    this.body.replaceChildren();
    const group=this.groups.find(g=>g.id===this.version.value)||this.groups[0];
    if(!group){this.count.textContent='';this.body.append(node('p','当前数据未收录该角色的台词文本。','empty-panel'));return;}
    const langs=this.language.value==='all'?languages:languages.filter(([lang])=>lang===this.language.value);
    const query=this.search.value.trim().toLocaleLowerCase();
    const lines=group.lines.filter(row=>!query||[row.label,...langs.flatMap(([lang])=>row.texts[lang]||[])].some(text=>plain(text).toLocaleLowerCase().includes(query)));
    const voiceLang=this.voiceLanguage.value,voiceLabel=languages.find(([lang])=>lang===voiceLang)[1];
    this.count.textContent=lines.length+' / '+group.lines.length+' 类台词 · '+langs.map(([lang,label])=>label+' '+lines.filter(row=>row.texts[lang]?.length).length).join(' · ')+' · '+voiceLabel+'语音 '+lines.filter(row=>row.audio?.[voiceLang]?.length).length;
    if(!lines.length){this.body.append(node('p','没有匹配的台词，请调整搜索。','empty-panel'));return;}
    const wrap=node('div',undefined,'voice-table-wrap panel'),table=node('table',undefined,'voice-table');
    const caption=node('caption',group.label+' · 英雄台词');table.append(caption);
    const head=node('thead'),heading=node('tr');heading.append(node('th','台词类型'));
    for(const [,label] of langs)heading.append(node('th',label));
    for(const th of heading.children)th.scope='col';head.append(heading);table.append(head);
    const body=node('tbody');
    for(const row of lines){
      const tr=node('tr'),type=node('th');type.append(node('span',row.label));type.scope='row';tr.append(type);
      const refs=row.audio?.[voiceLang]||[],action=node('div',undefined,'voice-audio-action');
      const button=node('button',refs.length?'▶ 播放'+voiceLabel:'暂无'+voiceLabel+'语音','voice-play');button.type='button';button.disabled=!refs.length;
      button.setAttribute('aria-label','播放'+voiceLabel+'语音：'+row.label);button.setAttribute('aria-pressed','false');
      let take;
      if(refs.length>1){take=node('select',undefined,'voice-take');take.setAttribute('aria-label',row.label+'录音版本');for(const [i,id] of refs.entries()){const o=node('option','录音 '+(i+1));o.value=id;take.append(o);}take.onchange=()=>{if(this.active?.button===button)this.stop();};action.append(take);}
      button.onclick=()=>this.play(take?.value||refs[0],row,button);action.append(button);type.append(action);
      for(const [lang,label] of langs){
        const cell=node('td');cell.dataset.language=label;cell.lang={zhCN:'zh-CN',enUS:'en',jaJP:'ja'}[lang];
        const texts=row.texts[lang]||[];
        if(!texts.length)cell.append(node('span','未收录','voice-missing'));
        for(const [i,text] of texts.entries()){
          const p=node('p',undefined,'voice-text');
          if(texts.length>1)p.append(node('small','文本 '+(i+1),'voice-alternative'));
          p.append(document.createTextNode(plain(text)));cell.append(p);
        }
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);wrap.append(table);this.body.append(wrap);
  }
}
