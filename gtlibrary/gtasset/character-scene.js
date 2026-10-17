/* Serializable character scene and deterministic, seekable property tracks. */
(function (root) {
  'use strict';
  const defaults = {x:0,y:0,rotation:0,scaleX:1,scaleY:1,visible:true,direction:'front',skin:'',action:'',expression:'idle',sub:'',speed:1,loop:true};
  const continuous = new Set(['x','y','rotation','scaleX','scaleY']);
  const properties = [...Object.keys(defaults),'equipment'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const speedCache = new WeakMap();
  const actionSuffix=/_(front|back|side)(\d*(?:\[[^\]]*\])?)$/;
  const actionName=name=>String(name||'').replace(actionSuffix,'$2');
  const actionDirection=name=>String(name||'').match(actionSuffix)?.[1]||'';
  function resolveAction(names,wanted,view,fallback='idle') {
    const base=actionName(wanted);if(!base)return '';
    const pick=key=>names.find(name=>actionName(name)===key&&actionDirection(name)===view)
      ||names.find(name=>name===key)
      ||(!['front','back','side'].includes(view)&&names.find(name=>actionName(name)===key))||'';
    return pick(base)||(base!==fallback&&fallback?pick(actionName(fallback)):'');
  }
  function touch(actor) { actor.revision=(actor.revision||0)+1; }
  function upperBound(frames,time) {
    let low=0,high=frames.length;
    while(low<high){const mid=(low+high)>>>1;if(frames[mid].time<=time)low=mid+1;else high=mid;}
    return low;
  }
  function frameAt(actor, property, time) {
    const frames = actor.keys[property] || [];
    const index=upperBound(frames,time);
    const previous=index?frames[index-1]:{time:0,value:property==='equipment'?(actor.equipment||{}):actor.base[property]},next=frames[index];
    if (continuous.has(property) && next && time >= previous.time && previous.interpolation !== 'hold') {
      const mix = Math.max(0,Math.min(1,(time-previous.time)/(next.time-previous.time)));
      return {...previous,value:previous.value+(next.value-previous.value)*mix};
    }
    return previous;
  }
  function sample(actor,time) {
    const result={};for(const property of properties)result[property]=frameAt(actor,property,time).value;result.action=actionName(result.action);return result;
  }
  function putKey(actor,property,time,value,interpolation='linear') {
    if (!properties.includes(property)) throw Error('未知角色属性');
    const frames = (actor.keys[property] || []).slice();
    time = Math.round(Math.max(0,time)*1000)/1000;
    const index=upperBound(frames,time),existing=index&&Math.abs(frames[index-1].time-time)<.0005;
    const frame={time,value:property==='equipment'?{...value}:property==='action'?actionName(value):value,interpolation};
    if(existing)frames[index-1]=frame;else frames.splice(index,0,frame);
    actor.keys[property]=frames;touch(actor);
  }
  // Integrate speed changes instead of multiplying by the speed at the playhead.
  // Action keys restart the action, even if two adjacent keys name the same clip.
  function animationTime(actor,property,time) {
    const start = frameAt(actor,property,time).time;
    const frames=actor.keys.speed;
    let cache=speedCache.get(actor);
    if(!cache||cache.frames!==frames||cache.base!==actor.base.speed){
      const areas=[];let area=0,last=0,speed=actor.base.speed;
      for(const frame of frames||[]){area+=(frame.time-last)*speed;areas.push(area);last=frame.time;speed=frame.value;}
      cache={frames,base:actor.base.speed,areas};speedCache.set(actor,cache);
    }
    function integral(at){const index=upperBound(frames||[],at);return index?cache.areas[index-1]+(at-frames[index-1].time)*frames[index-1].value:at*cache.base;}
    return integral(time)-integral(start);
  }
  function validValue(property,value) {
    if(property==='equipment')return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=1000&&Object.entries(value).every(([slot,item])=>slot.length<=300&&typeof item==='string'&&item.length<=300);
    if (typeof defaults[property] === 'number') return Number.isFinite(value) && Math.abs(value)<=1000000 && (property!=='speed'||value>=0&&value<=100) && (!property.startsWith('scale')||value>=.001&&value<=1000);
    if (typeof defaults[property] === 'boolean') return typeof value === 'boolean';
    return typeof value === 'string' && value.length<=300;
  }
  function validate(value) {
    if (!value || value.version!==1 || !Array.isArray(value.actors) || value.actors.length>100 || !Number.isFinite(value.duration)||value.duration<.1||value.duration>600) throw Error('无效的角色场景（版本 1，时长 0.1–600 秒，最多 100 个角色）');
    const result={version:1,duration:value.duration,actors:[]}, ids=new Set();
    for(const input of value.actors) {
      if (!input || typeof input.id!=='string'||ids.has(input.id)||typeof input.resource!=='string'||!input.resource||input.resource.length>200||/[\\/]/.test(input.resource)) throw Error('角色编号或资源名无效');
      ids.add(input.id);
      const actor={id:input.id,label:String(input.label||input.resource).slice(0,200),resource:input.resource,base:{...defaults},keys:{},equipment:{},opacity:{},enabled:{},timelineView:['full','action','collapsed'].includes(input.timelineView)?input.timelineView:'full'};
      for(const property of properties) {
        if(property==='equipment') {
          const equipment=input.equipment||input.base?.equipment||{};
          if(!validValue(property,equipment))throw Error('角色装备无效');actor.equipment={...equipment};
        } else if(input.base && Object.hasOwn(input.base,property)) {
          if(!validValue(property,input.base[property])) throw Error('角色属性无效：'+property);
          actor.base[property]=property==='action'?actionName(input.base[property]):input.base[property];
        }
        const frames=input.keys?.[property]||[];
        if(!Array.isArray(frames)||frames.length>10000) throw Error('关键帧数量无效');
        const normalized=new Map();
        for(const frame of frames) {
          if(!frame||!Number.isFinite(frame.time)||frame.time<0||frame.time>value.duration||!validValue(property,frame.value)||!['linear','hold',undefined].includes(frame.interpolation)) throw Error('关键帧无效：'+property);
          const time=Math.round(frame.time*1000)/1000;
          normalized.set(time,{time,value:property==='equipment'?{...frame.value}:property==='action'?actionName(frame.value):frame.value,interpolation:frame.interpolation||'linear'});
        }
        if(frames.length)actor.keys[property]=[...normalized.values()].sort((a,b)=>a.time-b.time);
      }
      for(const [slot,alpha] of Object.entries(input.opacity||{})) if(Number.isFinite(alpha)&&alpha>=0&&alpha<=1) actor.opacity[slot]=alpha;
      for(const [slot,enabled] of Object.entries(input.enabled||{})) if(typeof enabled==='boolean') actor.enabled[slot]=enabled;
      result.actors.push(actor);
    }
    return result;
  }
  root.GTCharacterScene={defaults,properties,continuous,copy,frameAt,sample,putKey,animationTime,validate,validValue,touch,actionName,resolveAction};
})(globalThis);
