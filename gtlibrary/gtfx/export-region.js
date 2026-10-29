import {outputSize} from './gif-sizing.js';

// Snapshot the preview viewport and its selected rectangle for both cameras.
export function regionCapturePlan(runtime,region,size='512',scale=1){
  const canvas=runtime.renderer.domElement,width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)throw new Error('预览画布尚未就绪');
  const crop={x:region.x*width,y:region.y*height,width:region.w*width,height:region.h*height};
  const native=size==='native',screenOnly=runtime.screenEffect&&!runtime.modulePlayer?.active;
  const factor=native?(screenOnly?1:runtime.nativePixelsPerUnit()*runtime.viewSize/runtime.zoom/height):Number(size)/Math.max(crop.width,crop.height);
  const source={width:Math.max(1,Math.round(crop.width*factor)),height:Math.max(1,Math.round(crop.height*factor))};
  runtime.validateCaptureSize(source.width,source.height);
  return {captureSize:{...source,viewport:{width,height},region:crop},dimensions:outputSize(source,native?scale:1)};
}

export class ExportRegion {
  constructor({canvas,box,select,clear,fields,settings,isLocked,onChange,onSelect}){
    Object.assign(this,{canvas,box,select,clear,fields,settings,isLocked,onChange,onSelect});
    this.region=null;this.drawing=false;this.drag=null;
    select.onclick=()=>{if(isLocked())return;this.drawing=!this.drawing;this.drag=null;if(this.drawing)onSelect();this.render();};
    clear.onclick=()=>{if(isLocked())return;this.region=null;this.drawing=false;this.drag=null;this.render();onChange();};
    for(const field of Object.values(fields))field.onchange=()=>{
      if(isLocked())return;const w=canvas.clientWidth,h=canvas.clientHeight;
      this.set({x:Number(fields.x.value)/w,y:Number(fields.y.value)/h,w:Number(fields.w.value)/w,h:Number(fields.h.value)/h});
    };
    canvas.addEventListener('pointerdown',event=>{
      if(!this.drawing||isLocked()||event.button!==0)return;
      event.preventDefault();event.stopImmediatePropagation();
      this.drag={mode:'draw',at:this.point(event),previous:this.region&&{...this.region}};canvas.setPointerCapture(event.pointerId);
    },true);
    box.addEventListener('pointerdown',event=>{
      const mode=event.target.dataset.mode;if(!mode||isLocked()||this.drawing||event.button!==0)return;
      event.preventDefault();event.stopPropagation();this.drag={mode,dir:event.target.dataset.dir||'',at:this.point(event),start:{...this.region}};
      event.target.setPointerCapture(event.pointerId);
    });
    const move=event=>{
      const d=this.drag;if(!d||isLocked())return;event.preventDefault();event.stopImmediatePropagation();
      const p=this.point(event),dx=p.x-d.at.x,dy=p.y-d.at.y;
      if(d.mode==='draw'){this.set({x:Math.min(p.x,d.at.x),y:Math.min(p.y,d.at.y),w:Math.abs(dx),h:Math.abs(dy)});return;}
      const s=d.start;if(d.mode==='move'){this.set({...s,x:s.x+dx,y:s.y+dy});return;}
      const minW=8/canvas.clientWidth,minH=8/canvas.clientHeight;let left=s.x,top=s.y,right=s.x+s.w,bottom=s.y+s.h;
      if(d.dir.includes('w'))left=Math.max(0,Math.min(right-minW,s.x+dx));
      if(d.dir.includes('e'))right=Math.min(1,Math.max(left+minW,s.x+s.w+dx));
      if(d.dir.includes('n'))top=Math.max(0,Math.min(bottom-minH,s.y+dy));
      if(d.dir.includes('s'))bottom=Math.min(1,Math.max(top+minH,s.y+s.h+dy));
      this.set({x:left,y:top,w:right-left,h:bottom-top});
    };
    const end=event=>{
      if(!this.drag)return;event.stopImmediatePropagation();
      if(this.drag.mode==='draw'){
        const p=this.point(event),a=this.drag.at;
        if(Math.abs(p.x-a.x)*canvas.clientWidth<4||Math.abs(p.y-a.y)*canvas.clientHeight<4)this.region=this.drag.previous;
        this.drawing=false;
      }
      this.drag=null;this.render();onChange();
    };
    for(const node of [canvas,box]){node.addEventListener('pointermove',move,true);node.addEventListener('pointerup',end,true);node.addEventListener('pointercancel',()=>{if(!this.drag)return;if(this.drag.mode==='draw')this.region=this.drag.previous;this.drag=null;this.drawing=false;this.render();onChange();},true);}
    canvas.addEventListener('keydown',event=>{if(event.key==='Escape'&&!isLocked()){if(this.drag?.mode==='draw')this.region=this.drag.previous;this.drag=null;this.drawing=false;this.render();onChange();}});
    this.render();
  }
  point(event){const r=this.canvas.getBoundingClientRect();return {x:Math.min(1,Math.max(0,(event.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(event.clientY-r.top)/r.height))};}
  set(region){
    const finite=(v,fallback)=>Number.isFinite(v)?v:fallback,w=Math.min(1,Math.max(1/this.canvas.clientWidth,finite(region.w,1))),h=Math.min(1,Math.max(1/this.canvas.clientHeight,finite(region.h,1)));
    this.region={x:Math.max(0,Math.min(1-w,finite(region.x,0))),y:Math.max(0,Math.min(1-h,finite(region.y,0))),w,h};this.render();this.onChange();
  }
  render(){
    const r=this.region,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    this.box.hidden=!r;this.clear.hidden=!r&&!this.drawing;this.settings.hidden=!r;
    this.select.textContent=this.drawing?'拖动框选 · 点击取消':r?'重新框选':'框选导出范围';this.select.setAttribute('aria-pressed',String(this.drawing));
    this.canvas.classList.toggle('selecting-region',this.drawing);this.box.classList.toggle('drawing',this.drawing);
    if(!r)return;
    Object.assign(this.box.style,{left:(this.canvas.offsetLeft+r.x*w)+'px',top:(this.canvas.offsetTop+r.y*h)+'px',width:r.w*w+'px',height:r.h*h+'px'});
    for(const key of ['x','y','w','h']){this.fields[key].value=Math.round(r[key]*(key==='x'||key==='w'?w:h));this.fields[key].max=key==='x'||key==='w'?w:h;}
  }
}
