/* Hero-local voice text. No audio or language fallback is implied. */
const languages=[['zhCN','中文'],['enUS','English'],['jaJP','日本語']];
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function plain(value){return String(value||'').replace(/\\n/g,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\[(?:c|C|\/?c|\/?C|[a-fA-F0-9]{6}|-)\]/g,'').trim();}
export class VoiceLines {
  constructor(host){
    this.host=host;this.groups=[];
    this.toolbar=node('div',undefined,'voice-toolbar');
    const version=node('label','台词版本 ');this.version=node('select');this.version.setAttribute('aria-label','台词版本');version.append(this.version);
    const language=node('label','显示语言 ');this.language=node('select');this.language.setAttribute('aria-label','台词显示语言');
    for(const [value,label] of [['all','三语对照'],...languages]){const o=node('option',label);o.value=value;this.language.append(o);}language.append(this.language);
    const search=node('label',undefined,'voice-search');this.search=node('input');this.search.type='search';this.search.placeholder='搜索台词或类型';this.search.setAttribute('aria-label','搜索台词或类型');search.append(this.search);
    this.toolbar.append(version,language,search);
    this.count=node('p',undefined,'section-note voice-count');this.count.setAttribute('role','status');
    this.body=node('div');host.append(this.toolbar,this.count,this.body);
    this.version.onchange=this.language.onchange=()=>this.render();this.search.oninput=()=>this.render();
  }
  setHero(hero){
    this.groups=hero.voiceLines||[];this.search.value='';
    this.version.replaceChildren(...this.groups.map(group=>{const o=node('option',group.label);o.value=group.id;return o;}));
    this.toolbar.hidden=!this.groups.length;this.render();
  }
  render(){
    this.body.replaceChildren();
    const group=this.groups.find(g=>g.id===this.version.value)||this.groups[0];
    if(!group){this.count.textContent='';this.body.append(node('p','当前数据未收录该角色的台词文本。','empty-panel'));return;}
    const langs=this.language.value==='all'?languages:languages.filter(([lang])=>lang===this.language.value);
    const query=this.search.value.trim().toLocaleLowerCase();
    const lines=group.lines.filter(row=>!query||[row.label,...langs.flatMap(([lang])=>row.texts[lang]||[])].some(text=>plain(text).toLocaleLowerCase().includes(query)));
    this.count.textContent=lines.length+' / '+group.lines.length+' 类台词 · '+langs.map(([lang,label])=>label+' '+lines.filter(row=>row.texts[lang]?.length).length).join(' · ');
    if(!lines.length){this.body.append(node('p','没有匹配的台词，请调整搜索。','empty-panel'));return;}
    const wrap=node('div',undefined,'voice-table-wrap panel'),table=node('table',undefined,'voice-table');
    const caption=node('caption',group.label+' · 英雄台词');table.append(caption);
    const head=node('thead'),heading=node('tr');heading.append(node('th','台词类型'));
    for(const [,label] of langs)heading.append(node('th',label));
    for(const th of heading.children)th.scope='col';head.append(heading);table.append(head);
    const body=node('tbody');
    for(const row of lines){
      const tr=node('tr'),type=node('th',row.label);type.scope='row';tr.append(type);
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
