const protocol='gtvideo-live-v1',localOrigin='http://127.0.0.1:47631';
export function supportsLiveConnection(location=globalThis.location){return !globalThis.crossOriginIsolated&&typeof globalThis.postMessage==='function'&&typeof globalThis.open==='function'&&(location.protocol==='https:'||location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname));}
export function installAuthoringLive({button,getContext,review,onError=()=>{}}){
 let popup,nonce,connected=false,disposed=false,capturing=false,acknowledged,session,handshake;
 button.hidden=!supportsLiveConnection();
 const send=(type,extra={})=>popup?.postMessage({protocol,nonce,type,...extra},localOrigin);
 const reset=()=>{connected=false;session=null;acknowledged=undefined;button.textContent='连接 Agent';button.setAttribute('aria-pressed','false');};
 async function capture(){if(capturing||disposed||!connected)return;capturing=true;try{const value=await getContext(acknowledged);send('context',{value,version:value.version});}catch(e){send('context-error',{message:e.message});onError(e.message);}finally{capturing=false;}}
 const receive=async event=>{const data=event.data;if(disposed||event.origin!==localOrigin||event.source!==popup||data?.protocol!==protocol||data.nonce!==nonce)return;
  if(data.type==='ready'){clearTimeout(handshake);session=data.session;connected=true;button.textContent='Agent 已连接';button.setAttribute('aria-pressed','true');button.dataset.session=session;await capture();}
  else if(data.type==='context-ack')acknowledged=data.version;
  else if(data.type==='request-context')await capture();
  else if(data.type==='proposal'){try{review.presentLive(data.proposal,(status)=>send('decision',{proposalId:data.proposal.id,status}));}catch(e){onError(e.message);}}
  else if(data.type==='disconnected'){reset();delete button.dataset.session;}
  else if(data.type==='error'){acknowledged=undefined;onError(data.message);}
 };
 addEventListener('message',receive);
 button.onclick=()=>{if(connected){send('disconnect');reset();popup?.close();return;}nonce=crypto.randomUUID();acknowledged=undefined;popup=globalThis.open(localOrigin+'/__gtvideo/live/connect?origin='+encodeURIComponent(location.origin)+'&nonce='+encodeURIComponent(nonce),'gtvideo-agent-'+nonce,'popup,width=480,height=330');if(!popup){onError('请允许连接 Agent 的弹出窗口');return;}clearTimeout(handshake);handshake=setTimeout(()=>{if(!connected)onError('尚未连接：先运行 start-local.cmd，再在连接小窗允许连接');},12000);};
 const monitor=setInterval(()=>{if(connected&&popup?.closed){reset();delete button.dataset.session;}},2000);
 return {dispose(){disposed=true;clearTimeout(handshake);clearInterval(monitor);send('disconnect');popup?.close();removeEventListener('message',receive);reset();}};
}
