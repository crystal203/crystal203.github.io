// Keep a numeric gesture on its original input; coalesce async updates, commit once.
export function attachNumberScrub(input,{change,start,end,error=()=>{},step=.1,delay=180}){
 input.classList.add('scrubbable');input.title='长按并左右拖动 · Shift 精调 · Alt 加速';
 input.addEventListener('pointerdown',event=>{
  if(event.button!==0||input.disabled||input.readOnly)return;
  const original=Number(input.value);if(!Number.isFinite(original))return;
  const x=event.clientX,pointer=event.pointerId;let held=false,active=false,finished=false,latest,pump=Promise.resolve(),running=false,last=original,timer;
  const flush=()=>{if(running)return pump;running=true;pump=(async()=>{try{while(latest!==undefined){const value=latest;latest=undefined;await change(value);}}catch(e){error(e);}finally{running=false;}})();return pump;};
  const move=e=>{if(e.pointerId!==pointer||!held||finished||Math.abs(e.clientX-x)<2&&!active)return;e.preventDefault();e.stopPropagation();
   if(!active){active=true;input.dataset.scrubbing='1';input.classList.add('scrubbing');document.body.classList.add('number-dragging');input.setPointerCapture(pointer);start?.();}
   const quantum=Number(step)||.1,factor=e.shiftKey?.1:e.altKey?10:1,min=input.min===''?-Infinity:Number(input.min),max=input.max===''?Infinity:Number(input.max);
   const next=Math.max(min,Math.min(max,Number((original+Math.round(e.clientX-x)*quantum*factor).toFixed(6))));if(next===last)return;last=next;input.value=String(next);latest=next;flush();
  };
  const finish=async e=>{if(e.pointerId!==pointer||finished)return;finished=true;clearTimeout(timer);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true);
   if(!active)return;e.preventDefault();e.stopPropagation();if(e.type==='pointercancel'){input.value=String(original);latest=original;}await flush();while(running||latest!==undefined){await pump;if(latest!==undefined)await flush();}
   if(input.hasPointerCapture(pointer))input.releasePointerCapture(pointer);input.classList.remove('scrubbing');document.body.classList.remove('number-dragging');await end?.();setTimeout(()=>delete input.dataset.scrubbing,0);
  };
  timer=setTimeout(()=>held=true,delay);document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',finish,{capture:true,passive:false});document.addEventListener('pointercancel',finish,{capture:true,passive:false});
 });
}
