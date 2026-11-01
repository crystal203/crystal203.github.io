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
  // Serializable workspace data outlives child surfaces; GPU resources still dispose.
  let owner=global;
  try{if(embedded&&parent.location.origin===location.origin)owner=parent;}catch{}
  const workspace=owner.__gtWorkspace||(owner.__gtWorkspace={values:new Map(),clipboard:null});
  global.GTBridge={selection,navigate,dispose,
    workspace:{get:key=>workspace.values.get(key),set:(key,value)=>workspace.values.set(key,value)},
    clipboard:{read:()=>{try{const saved=JSON.parse(localStorage.getItem('gtlibrary.clipboard.v1')||'null');if(saved&&(!workspace.clipboardTime||saved.time>workspace.clipboardTime)){workspace.clipboard=saved.value;workspace.clipboardTime=saved.time;}}catch{}return workspace.clipboard;},write:value=>{workspace.clipboard=value;workspace.clipboardTime=Date.now();try{localStorage.setItem('gtlibrary.clipboard.v1',JSON.stringify({time:workspace.clipboardTime,value}));}catch{}global.dispatchEvent(new Event('gt-clipboard'));}}
  };
})(globalThis);
