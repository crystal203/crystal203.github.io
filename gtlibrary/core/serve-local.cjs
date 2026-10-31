/* Local static server: Node built-ins only; never binds to the LAN. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

const root=fs.realpathSync(path.resolve(__dirname,'..'));
const args=process.argv.slice(2),portArg=args.find(arg=>/^\d+$/.test(arg));
const firstPort=portArg?Number(portArg):8765;
if(args.some(arg=>arg!=='--no-open'&&arg!==portArg)||firstPort<1024||firstPort>65515){
 console.error('Usage: start-local.cmd [port: 1024-65515] [--no-open]');process.exit(1);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.mov':'video/quicktime','.glb':'model/gltf-binary','.gltf':'model/gltf+json'};
const inside=file=>file===root||file.startsWith(root+path.sep);
function reply(res,status,text){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);}
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');reply(res,405,'Method not allowed');return;}
 try{
  const url=new URL(req.url,'http://127.0.0.1');
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
server.once('listening',()=>{
 const url=`http://127.0.0.1:${port}/#view=fx&character=hana`;
 console.log(`\nGTLibrary 已启动：${url}\n资源目录：${root}\n关闭此窗口或按 Ctrl+C 停止服务。\n`);
 if(args.includes('--no-open'))return;
 const opener=process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 opener.on('error',()=>console.log('无法自动打开浏览器，请复制上方地址。'));
 opener.on('exit',code=>{if(code)console.log('无法自动打开浏览器，请复制上方地址。');});
});
server.listen(port,'127.0.0.1');
process.on('SIGINT',()=>{server.close();server.closeAllConnections();});
process.on('SIGTERM',()=>{server.close();server.closeAllConnections();});
