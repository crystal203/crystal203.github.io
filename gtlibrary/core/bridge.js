/* One active surface, same-origin messages, explicit lifecycle disposal. */
(function(global){
  const embedded=global.parent!==global;
  function send(type,data){if(embedded)parent.postMessage({channel:'gt-library',type,...data},location.origin);}
  function selection(value){send('selection',{selection:value});}
  function navigate(view,value,params={}){
    if(embedded)send('navigate',{view,selection:value,params});
    else {const p=new URLSearchParams({view,...value,...params});location.href='../../index.html#'+p;}
  }
  let disposed=false;
  function dispose(){if(disposed)return;disposed=true;global.dispatchEvent(new Event('gt-dispose'));for(const c of document.querySelectorAll('canvas')){try{const gl=c.getContext('webgl2')||c.getContext('webgl');gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}}}
  global.GTBridge={selection,navigate,dispose};
})(globalThis);
