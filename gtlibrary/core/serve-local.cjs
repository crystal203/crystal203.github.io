/* Loopback static server using Node built-ins, with an optional workbench agent. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');

const root=fs.realpathSync(path.resolve(__dirname,'..'));
const args=process.argv.slice(2),portArg=args.find(arg=>/^\d+$/.test(arg));
const firstPort=portArg?Number(portArg):8765;
if(args.some(arg=>arg!=='--no-open'&&arg!=='--no-agent'&&arg!==portArg)||firstPort<1024||firstPort>65515){
 console.error('Usage: start-local.cmd [port: 1024-65515] [--no-open] [--no-agent]');process.exit(1);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.mov':'video/quicktime','.glb':'model/gltf-binary','.gltf':'model/gltf+json'};
let bridge,stopping=false,agentStatus={state:'starting'};
const inside=file=>file===root||file.startsWith(root+path.sep);
function reply(res,status,text){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);}
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');reply(res,405,'Method not allowed');return;}
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__gtlibrary/local-status'){const body=JSON.stringify({format:'GTLibraryLocalServer',root,port,agent:agentStatus});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);return;}
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{reply(res,400,'Invalid URL');return;}
  if(pathname.includes('\0')||pathname.includes('\\')||pathname.includes(':')){reply(res,400,'Invalid path');return;}
  let file=path.resolve(root,'.'+pathname);
  if(!inside(file)||pathname.split('/').some(part=>part.startsWith('.'))){reply(res,403,'Forbidden');return;}
  file=await fs.promises.realpath(file);
  if(!inside(file)){reply(res,403,'Forbidden');return;}
  let stat=await fs.promises.stat(file);
  if(stat.isDirectory()){
   if(!pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search});res.end();return;}
   file=await fs.promises.realpath(path.join(file,'index.html'));
   if(!inside(file)){reply(res,403,'Forbidden');return;}
   stat=await fs.promises.stat(file);
  }
  if(!stat.isFile()){reply(res,404,'Not found');return;}
  const headers={'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
   if(!range[1])start=Math.max(0,stat.size-Number(range[2]));
   else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
   if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);
  if(req.method==='HEAD'||!stat.size){res.end();return;}
  const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(error){if(!res.headersSent)reply(res,error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,'Unable to read file');else res.destroy();}
});
let port=firstPort;
server.on('error',error=>{
 if(error.code==='EADDRINUSE'&&port<firstPort+20){server.listen(++port,'127.0.0.1');return;}
 console.error('Local server failed:',error.message);process.exitCode=1;
});
function openBrowser(url){
 if(args.includes('--no-open'))return;
 const opener=process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 opener.on('error',()=>console.log('无法自动打开浏览器，请复制上方地址。'));
 opener.on('exit',code=>{if(code)console.log('无法自动打开浏览器，请复制上方地址。');});
}
async function startAgent(){
 if(args.includes('--no-agent')){agentStatus={state:'disabled'};return;}
 if(Number(process.versions.node.split('.')[0])<22){agentStatus={state:'unavailable'};console.warn('Agent 连接需要 Node.js 22+，网站仍可正常使用。');return;}
 const candidates=process.env.GT_VIDEO_TOOLS?[path.resolve(process.env.GT_VIDEO_TOOLS,'start-local.mjs')]:[path.resolve(root,'../gtlibrary-workbench/tools/gtvideo/start-local.mjs')];
 const entry=candidates.find(file=>fs.existsSync(file));
 if(!entry){agentStatus={state:'unavailable'};console.warn('未找到 GTVideo Agent 工具。可设置 GT_VIDEO_TOOLS 指向工作台 tools/gtvideo；网站仍可使用。');return;}
 try{const {startLocalBridge}=await import(pathToFileURL(entry).href);bridge=await startLocalBridge({library:root});if(stopping){await bridge.close();return;}agentStatus={state:'ready',url:bridge.url,owned:bridge.owned};console.log(`GTVideo Agent：${bridge.url}（${bridge.owned?'已启动':'复用现有服务'}）`);console.log('在 GTVideo 页面点击「连接 Agent」，在小窗允许连接。');}
 catch(error){agentStatus={state:'unavailable',message:error.message};console.warn('Agent 连接启动失败：'+error.message+' 网站仍可使用。');}
}
server.once('listening',async()=>{
 const url=`http://127.0.0.1:${port}/#view=fx&character=hana`;
 console.log(`\nGTLibrary 已启动：${url}\n资源目录：${root}`);
 await startAgent();if(stopping)return;
 console.log('关闭此窗口或按 Ctrl+C 停止本次启动的服务。\n');openBrowser(url);
});
async function stop(){if(stopping)return;stopping=true;server.close();server.closeAllConnections();await bridge?.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
// Reuse this exact library when launched twice, preserving its browser origin
// and local projects. An unrelated service keeps the existing port fallback.
function localStatus(candidate){return new Promise(resolve=>{const request=http.get({hostname:'127.0.0.1',port:candidate,path:'/__gtlibrary/local-status',timeout:500},response=>{let text='';response.on('data',chunk=>{text+=chunk;if(text.length>8192)request.destroy();});response.on('end',()=>{try{resolve(JSON.parse(text));}catch{resolve(null);}});});request.on('timeout',()=>{request.destroy();resolve(null);});request.on('error',()=>resolve(null));});}
(async()=>{for(let candidate=firstPort;candidate<firstPort+21;candidate++){const existing=await localStatus(candidate);if(existing?.format==='GTLibraryLocalServer'&&typeof existing.root==='string'&&path.resolve(existing.root).toLowerCase()===root.toLowerCase()){const url=`http://127.0.0.1:${candidate}/#view=fx&character=hana`;console.log('GTLibrary 已在运行，复用：'+url);openBrowser(url);return;}}if(!stopping)server.listen(port,'127.0.0.1');})().catch(error=>{console.error(error.message);process.exitCode=1;});
