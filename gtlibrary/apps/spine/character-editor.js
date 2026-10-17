/* Character composition UI. Rendering resources stay outside the JSON document. */
(function (root) {
  'use strict';
  const M=GTCharacterScene, $=id=>document.getElementById(id);
  const labels={x:'位置 X',y:'位置 Y',rotation:'旋转 °',scaleX:'缩放 X',scaleY:'缩放 Y',visible:'显示',direction:'人物朝向',skin:'皮肤',action:'Spine 动作',expression:'表情',sub:'子动画',speed:'动作速度',loop:'循环动作',equipment:'装备物品'};
  const inspectorProperties=M.properties.filter(property=>property!=='equipment');
  function describe(property,value){return property==='equipment'?(Object.entries(value).map(([slot,item])=>slot+': '+item).join('，')||'全部卸下'):String(value);}
  const directionLabels={front:'正面',back:'背面',left:'向左',right:'向右',side:'侧面'};
  function el(tag,attributes={},text) {
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function create(bridge) {
    const {canvas,stage,renderer,gl}=bridge;
    const state={version:1,duration:6,actors:[]};
    let active=false,selected=null,time=0,playing=false,selectedKey=null,serial=0,disposed=false,busy=0,drag=null;
    let queue=Promise.resolve(),revision=0,renderDirty=true,lastClock='',equipmentUI=null;
    const assets=new Map(), view={x:canvas.width/2,y:canvas.height*.35,zoom:3};
    const inspector=el('section',{id:'characterSceneInspector',class:'card',hidden:''});
    inspector.innerHTML='<h3>角色场景 <span id="sceneActorCount" class="badge">0</span></h3><p class="scene-help">点击资源列表添加角色，可重复添加。拖动角色放置，中键或 Alt＋拖动平移，滚轮缩放视图。</p><div id="sceneActors" aria-label="场景角色"></div><div class="row"><button id="sceneDuplicate" type="button">复制角色</button><button id="sceneRemove" type="button">删除角色</button><button id="sceneBack" type="button" title="向后移一层">下移图层</button><button id="sceneFront" type="button" title="向前移一层">上移图层</button></div><label class="field"><span>角色名称</span><input id="sceneActorName" type="text" maxlength="200"></label><div id="sceneProperties"></div>';
    document.querySelector('.sidebar').children[1].before(inspector);
    const panel=el('section',{id:'characterTimeline',hidden:'','aria-label':'角色时间轴'});
    panel.innerHTML='<div class="scene-toolbar"><strong>角色时间轴</strong><button id="scenePlay" type="button">播放</button><button id="sceneReset" type="button">回到起点</button><label>时长 <input id="sceneDuration" type="number" min="0.1" max="600" step="0.1" value="6"> s</label><label><input id="sceneRepeat" type="checkbox" checked>循环播放</label><label><input id="sceneRecord" type="checkbox" checked>自动关键帧</label><button id="sceneSave" type="button">导出场景</button><label class="scene-import">导入场景<input id="sceneOpen" type="file" accept=".json,application/json"></label><button id="sceneClear" type="button">清空</button></div><div class="scene-toolbar"><label>播放头 <input id="sceneTime" type="number" min="0" max="6" step="0.01" value="0"> s</label><input id="sceneScrub" type="range" min="0" max="6" step="0.01" value="0" aria-label="时间轴播放位置"><output id="sceneClock">0.00 / 6.00 s</output><label>时间轴缩放 <input id="sceneZoom" type="range" min="40" max="240" value="90" aria-label="时间轴缩放"></label></div><div id="sceneKeyTools" class="scene-toolbar" hidden><span id="sceneKeyLabel"></span><label>关键帧时间 <input id="sceneKeyTime" type="number" min="0" step="0.01"></label><label>插值 <select id="sceneInterpolation"><option value="linear">线性</option><option value="hold">保持</option></select></label><button id="sceneDeleteKey" type="button">删除关键帧</button></div><div id="sceneTracks" tabindex="0" aria-label="角色属性轨道"></div><p id="sceneStatus" role="status" class="scene-help">在起点设置初始属性，再移动播放头修改属性或点击 ◆ 插入关键帧。位置、旋转和缩放线性过渡，其余属性在关键帧处切换。</p>';
    document.querySelector('.app').append(panel);
    const outline=el('div',{id:'sceneSelection',hidden:''});stage.append(outline);
    const legacyCards=['skinSelector','trackAction'].map(id=>$(id).closest('.card'));
    const equipmentKey=el('button',{id:'sceneEquipmentKey',type:'button',class:'tiny',title:'在播放头记录当前角色的全部装备'},'◆ 记录装备关键帧');
    $('equipmentPanel').querySelector('h3').after(equipmentKey);
    const fields={};
    let pixelsPerSecond=90,actorListSignature='',lastInspectorUpdate=0;
    function status(message,error=false) { $('sceneStatus').textContent=message;$('sceneStatus').classList.toggle('error',error); }
    function current() { return state.actors.find(actor=>actor.id===selected); }
    function resourceKey(name,variant) { return name+'|'+variant; }
    function variantOf(actor,direction) {
      if(direction==='left'||direction==='right') return actor.variants.includes('side')?'side':actor.variants[0];
      return actor.variants.includes(direction)?direction:actor.variants[0];
    }
    function getAsset(name,variant) {
      const key=resourceKey(name,variant);
      if(!assets.has(key)) {
        const entry={promise:null,value:null};
        entry.promise=bridge.load(name,variant).then(value=>{entry.value=value;if(disposed){value.dispose();throw Error('页面已关闭');}return value;}).catch(error=>{if(assets.get(key)===entry)assets.delete(key);throw error;});
        assets.set(key,entry);
      }
      return assets.get(key).promise;
    }
    function releaseUnused() {
      const used=new Set(state.actors.flatMap(actor=>actor.variants.map(variant=>resourceKey(actor.resource,variant))));
      for(const [key,entry] of assets) if(!used.has(key)) {
        // Let pending operations finish before collecting their resources.
        if(entry.value){entry.value.dispose();assets.delete(key);}
      }
    }
    function runtime(asset) {
      const skeleton=GTSpineCore.createInstance(spine,asset.data);
      return {skeleton,animState:new spine.AnimationState(new spine.AnimationStateData(asset.data)),
        equipment:new GTEquipment.Equipment(skeleton),emotion:bridge.emotionData()?new GTEmotion.Overlay(spine,skeleton,bridge.emotionData().data):null,atlas:asset.atlas,
        names:asset.data.animations.map(a=>a.name),emoteNames:asset.data.animations.filter(a=>a.name.includes('[emo]')).map(a=>a.name),animations:new Map(asset.data.animations.map(a=>[a.name,a])),skins:new Map(asset.data.skins.map(s=>[s.name,s]))};
    }
    function getRuntime(actor,variant) {
      return actor.runtimes[variant]||(actor.runtimes[variant]=runtime(actor.assets[variant]));
    }
    async function prepare(input,variants) {
      const actor={...input,timelineView:input.timelineView||'full',variants:variants.slice(),runtimes:{},assets:{},options:{}};
      const results=await Promise.allSettled(variants.map(variant=>getAsset(actor.resource,variant)));
      const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
      const loaded=results.map(result=>result.value);
      variants.forEach((variant,i)=>actor.assets[variant]=loaded[i]);
      getRuntime(actor,variants[0]);
      if(Object.keys(actor.equipment).length||(actor.keys.equipment||[]).some(frame=>Object.keys(frame.value).length))await bridge.requireEquipment();
      return actor;
    }
    function serialize() {
      return {version:1,duration:state.duration,actors:state.actors.map(({id,label,resource,base,keys,equipment,opacity,enabled,timelineView})=>M.copy({id,label,resource,base,keys,equipment,opacity,enabled,timelineView}))};
    }
    function selectedRuntime(actor=current()) { return actor&&getRuntime(actor,variantOf(actor,M.frameAt(actor,'direction',time).value)); }
    function select(id) {
      selected=id;selectedKey=null;refresh();sample(time);
      if(active&&!state.actors.length)bridge.empty();
    }
    function choices(actor,property) {
      const data=selectedRuntime(actor).skeleton.data;
      if(property==='direction') return [...new Set([...actor.variants,...(actor.variants.includes('side')?['left','right']:[])])].map(value=>[value,directionLabels[value]||value]);
      if(property==='skin') return data.skins.map(skin=>[skin.name,skin.name]);
      if(actor.options[property])return actor.options[property];
      let names=Object.values(actor.assets).flatMap(asset=>asset.data.animations.map(animation=>animation.name));
      if(property==='expression') {
        names=names.filter(name=>name.includes('[emo]')).map(GTEmotion.key);
        const emotion=selectedRuntime(actor).emotion;
        if(emotion) names.push(...emotion.skeleton.data.animations.map(a=>GTEmotion.key(a.name)).filter(name=>name!=='empty'));
      } else {
        names=names.filter(name=>property==='sub'?name.includes('[sub]'):!name.includes('[emo]')&&!name.includes('[sub]'));
        if(property==='action'){
          actor.actionAliases=new Map();
          for(const name of names){const base=M.actionName(name);if(!actor.actionAliases.has(base))actor.actionAliases.set(base,[]);actor.actionAliases.get(base).push(name);}
          names=names.map(M.actionName);
        }
      }
      return actor.options[property]=[['','（不选）'],...[...new Set(names)].sort().map(name=>[name,name])];
    }
    for(const property of inspectorProperties) {
      const row=el('label',{class:'field scene-property'}), title=el('span',{},labels[property]);
      let input;
      if(typeof M.defaults[property]==='boolean') input=el('input',{type:'checkbox','aria-label':labels[property]});
      else if(typeof M.defaults[property]==='number') input=el('input',{type:'number',step:property==='rotation'?'1':'.1','aria-label':labels[property]});
      else input=el('select',{'aria-label':labels[property]});
      input.id='sceneProp-'+property;fields[property]=input;
      if(property==='action')input.title='动作自动匹配当前人物朝向，无需选择方向后缀';
      const key=el('button',{type:'button',class:'tiny scene-property-key','aria-label':'为'+labels[property]+'添加关键帧',title:'在播放头插入关键帧'},'◆');
      row.append(title,input,key);$('sceneProperties').append(row);
      input.onchange=()=>{const value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;edit(property,value);};
      key.onclick=event=>{event.preventDefault();const actor=current();if(!actor)return;const value=M.sample(actor,time)[property];M.putKey(actor,property,time,value);selectedKey={actor:actor.id,property,frame:actor.keys[property].find(f=>f.time===Math.round(time*1000)/1000)};refresh();sample(time);};
    }
    function edit(property,value) {
      const actor=current();if(!actor||busy)return;
      if(M.sample(actor,time)[property]===value)return;
      playing=false;
      if(!M.validValue(property,value)){status('角色属性无效：'+labels[property],true);refreshFields();return;}
      if($('sceneRecord').checked && (time>0 || actor.keys[property]?.length)) M.putKey(actor,property,time,value);
      else {if(property==='equipment')actor.equipment={...value};else actor.base[property]=value;M.touch(actor);}
      selectedKey=null;refresh();sample(time);status('已更新 '+actor.label+' · '+labels[property]);
    }
    function refreshFields() {
      const actor=current(),value=actor&&M.sample(actor,time);
      $('sceneActorName').disabled=!actor;$('sceneActorName').value=actor?.label||'';
      equipmentKey.disabled=!actor||!!busy;
      for(const property of inspectorProperties) {
        const input=fields[property];input.disabled=!actor;
        input.parentNode.querySelector('.scene-property-key').disabled=!actor;
        if(!actor)continue;
        if(input.tagName==='SELECT') {
          const options=choices(actor,property),signature=actor.id+'|'+(property==='skin'?M.frameAt(actor,'direction',time).value:'');
          if(input.dataset.options!==signature){input.replaceChildren(...options.map(([key,label])=>{const option=new Option(label,key);if(property==='action')option.dataset.favoriteAliases=JSON.stringify(actor.actionAliases.get(key)||[]);return option;}));input.dataset.options=signature;}
          input.value=value[property];
          if(input.value!==value[property])input.add(new Option(value[property],value[property]));
        }
        if(input.type==='checkbox')input.checked=value[property];
        else input.value=typeof value[property]==='number'?Math.round(value[property]*1000)/1000:value[property];
      }
      for(const id of ['sceneDuplicate','sceneRemove','sceneBack','sceneFront'])$(id).disabled=!actor||!!busy;
    }
    function refreshActors() {
      $('sceneActorCount').textContent=state.actors.length;
      const signature=JSON.stringify([selected,state.actors.map(actor=>[actor.id,actor.label])]);
      if(signature===actorListSignature)return;actorListSignature=signature;
      $('sceneActors').replaceChildren(...state.actors.map((actor,index)=>{
        const button=el('button',{type:'button',class:'scene-actor'+(actor.id===selected?' selected':''),'aria-pressed':String(actor.id===selected)},(index+1)+'. '+actor.label);
        button.onclick=()=>select(actor.id);return button;
      }));
    }
    function syncClock() {
      const signature=time+'|'+playing+'|'+state.duration+'|'+pixelsPerSecond;
      if(lastClock===signature)return;lastClock=signature;
      if(document.activeElement!==$('sceneTime'))$('sceneTime').value=time.toFixed(2);
      if(document.activeElement!==$('sceneScrub'))$('sceneScrub').value=time;
      $('sceneClock').textContent=time.toFixed(2)+' / '+state.duration.toFixed(2)+' s';
      $('scenePlay').textContent=playing?'暂停':'播放';
      panel.style.setProperty('--scene-head',time*pixelsPerSecond+'px');
    }
    function renderTracks() {
      const tracks=$('sceneTracks'),scrollTop=tracks.scrollTop,scrollLeft=tracks.scrollLeft;
      const content=el('div',{class:'scene-track-content'});content.style.setProperty('--scene-width',state.duration*pixelsPerSecond+'px');content.style.setProperty('--scene-grid',pixelsPerSecond+'px');
      const ruler=el('div',{class:'scene-ruler'}),spacer=el('div',{class:'scene-track-label'},'角色 / 属性');ruler.append(spacer);
      const ticks=el('div',{class:'scene-lane','aria-label':'时间刻度'});
      const tickStep=pixelsPerSecond>=80?1:2;
      for(let second=0;second<=state.duration;second+=tickStep){const tick=el('span',{class:'scene-tick'},second+'s');tick.style.left=second*pixelsPerSecond+'px';ticks.append(tick);}
      ticks.onpointerdown=event=>startScrub(event,ticks);ruler.append(ticks);content.append(ruler);
      for(const actor of state.actors) {
        const mode=actor.timelineView||'full';
        const header=el('div',{class:'scene-track-actor'+(actor.id===selected?' selected':''),'data-actor':actor.id});
        const collapse=el('button',{type:'button',class:'scene-track-collapse','aria-label':(mode==='collapsed'?'展开':'收起')+actor.label+'的时间轴','aria-expanded':String(mode!=='collapsed')},mode==='collapsed'?'▸':'▾');
        collapse.onclick=()=>{if(mode==='collapsed')actor.timelineView=actor.expandedView||'full';else{actor.expandedView=mode;actor.timelineView='collapsed';}renderTracks();};
        const name=el('button',{type:'button',class:'scene-track-name'},actor.label+' · '+actor.resource);name.onclick=()=>select(actor.id);
        const visibility=el('select',{class:'scene-track-view','aria-label':actor.label+'的时间轴显示方式'});
        visibility.append(new Option('完整轨道','full'),new Option('简略 · 仅 Spine 动作','action'),new Option('收起','collapsed'));visibility.value=mode;
        visibility.onchange=()=>{actor.timelineView=visibility.value;if(visibility.value!=='collapsed')actor.expandedView=visibility.value;renderTracks();};
        header.append(collapse,name,visibility);content.append(header);
        const shown=mode==='collapsed'?[]:mode==='action'?['action']:M.properties;
        for(const property of shown) {
          const row=el('div',{class:'scene-track-row'+(actor.id===selected?' selected':''),'data-actor':actor.id,'data-property':property});
          const label=el('button',{type:'button',class:'scene-track-label'},labels[property]);label.onclick=()=>{select(actor.id);if(property==='equipment')$('equipmentPanel').scrollIntoView({block:'nearest'});else fields[property].focus();};
          const lane=el('div',{class:'scene-lane','aria-label':actor.label+' · '+labels[property]});
          lane.onpointerdown=event=>{if(event.target!==lane||bridge.exporting()||busy)return;selected=actor.id;selectedKey=null;refreshActors();refreshFields();startScrub(event,lane);};
          lane.ondblclick=event=>{if(bridge.exporting()||busy)return;const at=laneTime(event,lane);M.putKey(actor,property,at,M.sample(actor,at)[property]);select(actor.id);seek(at);renderTracks();};
          for(const frame of actor.keys[property]||[]) {
            const key=el('button',{type:'button',class:'scene-key'+(selectedKey?.frame===frame?' selected':''),title:labels[property]+' · '+frame.time+'s · '+describe(property,frame.value),'aria-label':actor.label+' '+labels[property]+' '+frame.time+' 秒关键帧'},'◆');
            key.style.left=frame.time*pixelsPerSecond+'px';
            key.onpointerdown=event=>startKeyDrag(event,key,lane,actor,property,frame);
            key.onclick=()=>{selected=actor.id;selectedKey={actor:actor.id,property,frame};seek(frame.time);refresh();};
            key.onkeydown=event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();actor.keys[property]=actor.keys[property].filter(f=>f!==frame);M.touch(actor);selectedKey=null;refresh();sample(time);}};
            lane.append(key);
          }
          row.append(label,lane);content.append(row);
        }
      }
      tracks.replaceChildren(content);tracks.scrollTop=scrollTop;tracks.scrollLeft=scrollLeft;syncClock();
      const selection=selectedKey;$('sceneKeyTools').hidden=!selection;
      if(selection){$('sceneKeyLabel').textContent=labels[selection.property]+' · '+describe(selection.property,selection.frame.value);$('sceneKeyTime').value=selection.frame.time;$('sceneKeyTime').max=state.duration;$('sceneInterpolation').value=selection.frame.interpolation;$('sceneInterpolation').disabled=!M.continuous.has(selection.property);}
    }
    function laneTime(event,lane) {return Math.round(Math.max(0,Math.min(state.duration,(event.clientX-lane.getBoundingClientRect().left)/pixelsPerSecond))*100)/100;}
    function startScrub(event,lane) {
      if(event.button!==0||bridge.exporting()||busy)return;
      playing=false;const move=e=>seek(laneTime(e,lane));move(event);lane.setPointerCapture(event.pointerId);
      lane.onpointermove=move;lane.onpointerup=()=>{lane.onpointermove=null;lane.onpointerup=null;renderTracks();};
    }
    function moveKey(actor,property,frame,at) {
      actor.keys[property]=actor.keys[property].filter(f=>f!==frame);
      M.putKey(actor,property,at,frame.value,frame.interpolation);
      selectedKey={actor:actor.id,property,frame:actor.keys[property].find(f=>Math.abs(f.time-at)<.0005)};
      seek(at);refresh();
    }
    function startKeyDrag(event,key,lane,actor,property,frame) {
      if(event.button!==0||bridge.exporting()||busy)return;event.stopPropagation();playing=false;selected=actor.id;selectedKey={actor:actor.id,property,frame};
      key.setPointerCapture(event.pointerId);let at=frame.time,moved=false;
      key.onpointermove=e=>{if(Math.abs(e.clientX-event.clientX)<3&&!moved)return;moved=true;at=laneTime(e,lane);key.style.left=at*pixelsPerSecond+'px';};
      key.onpointerup=()=>{key.onpointermove=null;key.onpointerup=null;if(moved)moveKey(actor,property,frame,at);else{seek(frame.time);refresh();}};
    }
    function refresh() {refreshActors();refreshFields();renderTracks();}
    function seek(at) {time=Math.max(0,Math.min(state.duration,Number(at)||0));sample(time);syncClock();refreshFields();}
    function sample(at,automatic=false) {
      let changed=!automatic;
      for(const actor of state.actors) {
        const previous=actor.sampled;
        if(previous&&previous.time===at&&previous.revision===actor.revision&&previous.x===view.x&&previous.y===view.y&&previous.zoom===view.zoom)continue;
        changed=true;
        actor.sampled={time:at,revision:actor.revision,x:view.x,y:view.y,zoom:view.zoom};
        const value=M.sample(actor,at);actor.value=value;
        if(!value.visible){actor.bounds=null;continue;}
        const variant=variantOf(actor,value.direction),r=getRuntime(actor,variant),s=r.skeleton;
        actor.value=value;actor.runtime=r;
        const skin=r.skins.get(value.skin)||s.data.skins[s.data.skins.length-1];
        if(s.skin!==skin)s.setSkin(skin||null);
        bridge.equip(value.equipment,r);
        s.setToSetupPose();
        if(!r.clips||r.action!==value.action||r.sub!==value.sub||r.expression!==value.expression){
          r.action=value.action;r.sub=value.sub;r.expression=value.expression;
          if(!r.advancedNames)r.advancedNames=r.emotion?.face?r.emotion.skeleton.data.animations.map(a=>a.name):[];
          const expression=GTEmotion.route(r.emoteNames,r.advancedNames,value.expression,variant);
          r.advanced=expression.advanced;
          r.clips=[[M.resolveAction(r.names,value.action,variant),'action'],[expression.native,'expression'],[GTEquipment.inheritAnimation(r.names,value.sub,variant,''),'sub']].map(([name,property])=>[r.animations.get(name),property]);
        }
        for(const [animation,property] of r.clips) {
          if(animation)animation.apply(s,0,M.animationTime(actor,property,at),value.loop,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);
        }
        if(r.emotion){r.emotion.select(r.advanced);const track=r.emotion.state.getCurrent(0);if(track){track.trackTime=M.animationTime(actor,'expression',at);track.loop=value.loop;}}
        for(const slot of s.slots) if(actor.enabled[slot.data.name]===false)slot.color.a=0;else if(actor.opacity[slot.data.name]!==undefined)slot.color.a*=actor.opacity[slot.data.name];
        s.scaleX=value.scaleX*view.zoom*(value.direction==='left'?-1:1);s.scaleY=value.scaleY*view.zoom;
        s.x=view.x+value.x*view.zoom;s.y=view.y+value.y*view.zoom;
        if(s.bones[0])s.bones[0].rotation+=value.rotation;
        s.updateWorldTransform();actor.bounds=bridge.bounds(s);
      }
      const actor=current();if(active&&actor&&!bridge.exporting()) {
        bridge.bind(actor,actor.value.visible?actor.runtime:selectedRuntime(actor));
        const equipment=M.frameAt(actor,'equipment',at).value;
        if(equipmentUI!==equipment){equipmentUI=equipment;bridge.refreshEquipment();}
      }
      if(changed)updateOutline();renderDirty=renderDirty||changed;
    }
    function updateOutline() {
      const actor=current(),bounds=actor?.bounds;outline.hidden=!active||!bounds||!actor.value.visible;
      if(outline.hidden)return;
      outline.style.left=(bounds.minX/canvas.width*100)+'%';outline.style.top=((canvas.height-bounds.maxY)/canvas.height*100)+'%';
      outline.style.width=((bounds.maxX-bounds.minX)/canvas.width*100)+'%';outline.style.height=((bounds.maxY-bounds.minY)/canvas.height*100)+'%';outline.dataset.name=actor.label;
    }
    async function add(name,options={}) {
      const requestRevision=options.revision,variants=options.variants,pendingSkin=options.skin;
      if(requestRevision!==revision)return;
      if(state.actors.length>=100){status('场景最多容纳 100 个角色',true);return;}
      busy++;status('正在载入角色：'+name);refreshFields();
      try {
        const input={id:'actor-'+Date.now().toString(36)+'-'+(++serial),resource:name,label:bridge.label(name),base:{...M.defaults},keys:{},equipment:{},opacity:{},enabled:{}};
        const actor=await prepare(input,variants);
        if(disposed||requestRevision!==revision)return;
        const data=actor.runtimes[variants[0]].skeleton.data,skins=data.skins;
        actor.base.direction=variants.includes('front')?'front':variants[0];
        actor.base.skin=skins.find(s=>s.name===pendingSkin.name)?.name||skins.find(s=>pendingSkin.tier&&s.name.endsWith('_'+pendingSkin.tier))?.name||skins.at(-1)?.name||'';
        actor.base.action=M.actionName(data.animations.find(a=>a.name==='idle_'+variants[0])?.name||data.animations.find(a=>!a.name.includes('[')&&a.name.includes('idle'))?.name||'');
        actor.base.sub=data.animations.find(a=>a.name==='[sub]idle_'+variants[0])?.name||'';
        actor.base.x=state.actors.length*35;state.actors.push(actor);
        select(actor.id);if(state.actors.length===1)fit();status('已添加 '+actor.label+'。资源列表可继续添加其他角色。');
      }catch(error){status('角色加载失败：'+error.message,true);}
      finally{busy--;releaseUnused();refreshFields();}
    }
    function enqueue(name) {if(bridge.exporting())return;const options={revision,variants:bridge.variants(name),skin:bridge.pendingSkin()};queue=queue.then(()=>add(name,options));return queue;}
    async function loadDocument(input) {
      const document=M.validate(input),token=++revision;
      busy++;playing=false;status('正在载入场景……');
      try {
        const actors=[];
        for(const actor of document.actors)actors.push(await prepare(actor,bridge.variants(actor.resource)));
        if(disposed||token!==revision)return;
        state.duration=document.duration;state.actors=actors;time=0;selectedKey=null;
        for(const id of ['sceneTime','sceneScrub'])$(id).max=state.duration;
        $('sceneDuration').value=state.duration;select(actors[0]?.id||null);bridge.durationChanged();fit();status('已载入 '+actors.length+' 个角色');
      }finally{busy--;releaseUnused();refreshFields();}
    }
    function fit() {
      if(!state.actors.length)return;
      sample(time);const visible=state.actors.filter(a=>a.value.visible&&a.bounds);if(!visible.length)return;
      const minX=Math.min(...visible.map(a=>a.bounds.minX)),minY=Math.min(...visible.map(a=>a.bounds.minY)),maxX=Math.max(...visible.map(a=>a.bounds.maxX)),maxY=Math.max(...visible.map(a=>a.bounds.maxY));
      const factor=Math.min(canvas.width*.75/Math.max(1,maxX-minX),canvas.height*.75/Math.max(1,maxY-minY));
      view.x=canvas.width/2-((minX+maxX)/2-view.x)*factor;view.y=canvas.height/2-((minY+maxY)/2-view.y)*factor;view.zoom*=factor;
      view.zoom=Math.max(.05,Math.min(64,view.zoom));sample(time);
    }
    $('sceneActorName').onchange=()=>{if(current()){current().label=$('sceneActorName').value||current().resource;refresh();}};
    $('scenePlay').onclick=()=>{if(time>=state.duration)seek(0);playing=!playing;syncClock();};
    $('sceneReset').onclick=()=>{playing=false;seek(0);};
    $('sceneTime').onchange=()=>{playing=false;seek($('sceneTime').value);};$('sceneScrub').oninput=()=>{playing=false;seek($('sceneScrub').value);};
    $('sceneDuration').onchange=()=>{
      const value=Number($('sceneDuration').value),last=Math.max(0,...state.actors.flatMap(actor=>Object.values(actor.keys).flat().map(f=>f.time)));
      if(!Number.isFinite(value)||value<.1||value>600||value<last){$('sceneDuration').value=state.duration;status('时长须为 0.1–600 秒，且不能短于最后一个关键帧。',true);return;}
      state.duration=value;for(const id of ['sceneTime','sceneScrub'])$(id).max=value;bridge.durationChanged();seek(time);renderTracks();
    };
    $('sceneZoom').oninput=()=>{pixelsPerSecond=Number($('sceneZoom').value);renderTracks();};
    $('sceneDeleteKey').onclick=()=>{if(!selectedKey)return;const actor=current();actor.keys[selectedKey.property]=actor.keys[selectedKey.property].filter(frame=>frame!==selectedKey.frame);M.touch(actor);selectedKey=null;refresh();sample(time);};
    $('sceneKeyTime').onchange=()=>{if(!selectedKey)return;const at=Number($('sceneKeyTime').value);if(Number.isFinite(at)&&at>=0&&at<=state.duration)moveKey(current(),selectedKey.property,selectedKey.frame,at);else renderTracks();};
    $('sceneInterpolation').onchange=()=>{if(selectedKey){selectedKey.frame.interpolation=$('sceneInterpolation').value;M.touch(current());sample(time);}};
    equipmentKey.onclick=()=>{
      const actor=current();if(!actor||busy)return;playing=false;
      M.putKey(actor,'equipment',time,M.frameAt(actor,'equipment',time).value);
      selectedKey={actor:actor.id,property:'equipment',frame:M.frameAt(actor,'equipment',time)};refresh();sample(time);
    };
    $('sceneDuplicate').onclick=async()=>{
      const source=current();if(!source||busy)return;
      if(state.actors.length>=100){status('场景最多容纳 100 个角色',true);return;}
      busy++;const token=revision;refreshFields();
      const input=M.copy(serialize().actors.find(a=>a.id===source.id));input.id='actor-'+Date.now().toString(36)+'-'+(++serial);input.label+=' 副本';input.base.x+=20;
      for(const frame of input.keys.x||[])frame.value+=20;
      try{const actor=await prepare(input,source.variants);if(token===revision&&!disposed){state.actors.push(actor);select(input.id);}}
      catch(error){status('角色复制失败：'+error.message,true);}
      finally{busy--;releaseUnused();refreshFields();}
    };
    $('sceneRemove').onclick=()=>{if(busy)return;state.actors=state.actors.filter(a=>a.id!==selected);select(state.actors.at(-1)?.id||null);releaseUnused();};
    for(const [id,offset] of [['sceneBack',-1],['sceneFront',1]])$(id).onclick=()=>{const index=state.actors.findIndex(a=>a.id===selected),to=index+offset;if(index<0||to<0||to>=state.actors.length)return;[state.actors[index],state.actors[to]]=[state.actors[to],state.actors[index]];refresh();};
    $('sceneClear').onclick=()=>{revision++;state.actors=[];playing=false;time=0;select(null);releaseUnused();bridge.empty();};
    $('sceneSave').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(serialize(),null,2)],{type:'application/json'}));const link=el('a',{href:url,download:'character-scene.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('sceneOpen').onchange=async()=>{const file=$('sceneOpen').files[0];if(!file)return;try{if(file.size>5000000)throw Error('场景文件过大');await loadDocument(JSON.parse(await file.text()));}catch(error){status('场景导入失败：'+error.message,true);}finally{$('sceneOpen').value='';}};
    function point(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:canvas.height-(event.clientY-rect.top)*canvas.height/rect.height};}
    canvas.addEventListener('pointerdown',event=>{
      if(!active||bridge.exporting()||busy)return;
      const p=point(event),pan=event.button===1||event.altKey;
      if(!pan&&event.button!==0)return;
      playing=false;
      const actor=!pan&&state.actors.slice().reverse().find(a=>a.value?.visible&&a.bounds&&p.x>=a.bounds.minX&&p.x<=a.bounds.maxX&&p.y>=a.bounds.minY&&p.y<=a.bounds.maxY);
      if(actor)select(actor.id);
      if(!pan&&!actor){select(null);return;}
      drag={point:p,pan,actor:actor?.id,value:actor&&M.sample(actor,time),x:view.x,y:view.y};canvas.setPointerCapture(event.pointerId);event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
      if(!active||!drag)return;const p=point(event),dx=p.x-drag.point.x,dy=p.y-drag.point.y;
      if(drag.pan){view.x=drag.x+dx;view.y=drag.y+dy;sample(time);}
      else {const actor=current();if(!actor)return;for(const [property,delta] of [['x',dx],['y',dy]]) {const value=drag.value[property]+delta/view.zoom;if($('sceneRecord').checked&&(time>0||actor.keys[property]?.length))M.putKey(actor,property,time,value);else actor.base[property]=value;}M.touch(actor);sample(time);refreshFields();}
    });
    const endDrag=()=>{if(drag){drag=null;refresh();}};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
    canvas.addEventListener('wheel',event=>{
      if(!active||bridge.exporting())return;event.preventDefault();const p=point(event),next=Math.max(.05,Math.min(64,view.zoom*Math.exp(-event.deltaY*.0015))),factor=next/view.zoom;
      view.x=p.x-(p.x-view.x)*factor;view.y=p.y-(p.y-view.y)*factor;view.zoom=next;sample(time);
    },{passive:false});
    return {
      get active(){return active;},get duration(){return state.duration;},get time(){return time;},get selected(){return current();},
      hasActors(){return !!state.actors.length;},
      invalidate(){const actor=current();if(actor)M.touch(actor);sample(time);},
      requestDraw(){renderDirty=true;},
      equipmentState(){const actor=current();return actor?M.frameAt(actor,'equipment',time).value:{};},
      changeEquipment(value){edit('equipment',{...value});},
      restoreSelection(){select(selected||state.actors[0]?.id||null);},
      add:enqueue,serialize,loadDocument,fit,sample,seek,
      setActive(value){active=value;inspector.hidden=panel.hidden=equipmentKey.hidden=!value;document.body.classList.toggle('character-scene',value);for(const card of legacyCards)card.hidden=value;outline.hidden=!value;$('exportAutoDuration').parentElement.lastChild.textContent=value?' 时长自动锁定为场景长度':' 时长自动锁定为动画一周';$('pickToggle').parentElement.lastChild.textContent=value?' 在列表中选取组件':' 点选组件（画布⇄列表）';equipmentUI=null;renderDirty=true;if(value){$('skeletonVariantWrapper').style.display='none';refresh();sample(time);}else playing=false;},
      tick(delta){if(!active)return false;const wasPlaying=playing;if(playing&&!bridge.exporting()){time+=delta;if(time>=state.duration){if($('sceneRepeat').checked)time%=state.duration;else{time=state.duration;playing=false;}}}sample(time,true);syncClock();if(wasPlaying&&performance.now()-lastInspectorUpdate>100){lastInspectorUpdate=performance.now();if(!inspector.contains(document.activeElement))refreshFields();}const changed=renderDirty;renderDirty=false;return changed;},
      draw(){for(const actor of state.actors){if(!actor.value?.visible)continue;renderer.drawSkeleton(actor.runtime.skeleton,true);const emotion=actor.runtime.emotion;if(emotion&&emotion.update())renderer.drawSkeleton(emotion.skeleton,true);}},
      bounds(){const visible=state.actors.filter(actor=>actor.value?.visible&&actor.bounds);if(!visible.length)return null;return {minX:Math.min(...visible.map(a=>a.bounds.minX)),minY:Math.min(...visible.map(a=>a.bounds.minY)),maxX:Math.max(...visible.map(a=>a.bounds.maxX)),maxY:Math.max(...visible.map(a=>a.bounds.maxY))};},
      resize(oldW,oldH){view.x+=canvas.width/2-oldW/2;view.y+=canvas.height/2-oldH/2;sample(time);},
      dispose(){disposed=true;revision++;for(const entry of assets.values())entry.value?.dispose();assets.clear();},
      actualSize(){view.zoom=1;sample(time);},
      filter(){for(const entry of assets.values())if(entry.value)bridge.filter(entry.value.atlas);renderDirty=true;}
    };
  }
  root.GTCharacterEditor={create};
})(globalThis);
