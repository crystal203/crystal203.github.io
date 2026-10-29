const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(process.env.GTFX_ROOT||path.resolve(__dirname,'../..')),root=path.dirname(repo);
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.bytes':'application/octet-stream','.atlas':'text/plain'};
const server=http.createServer((req,res)=>{const key=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'),file=path.resolve(root,'.'+key);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1500,height:1100},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/${path.basename(repo)}/#view=fx&character=hana`);await page.waitForSelector('iframe',{state:'attached'});const frame=await(await page.$('iframe')).contentFrame();
 await frame.waitForFunction(()=>!document.querySelector('#play').disabled);
 await frame.evaluate(async()=>{const {FxRuntime}=await import('../../gtfx/core.js'),sample=FxRuntime.prototype.sample;FxRuntime.prototype.sample=function(t){if(this.renderer.domElement)window.rt=this;return sample.call(this,t);};});
 await frame.locator('#module').selectOption('cwp-1');await frame.waitForFunction(()=>!document.querySelector('#play').disabled);
 await frame.locator('#seek').evaluate(e=>{e.value=.35;e.dispatchEvent(new Event('input'));});
 await frame.locator('#region-select').click();let canvas=await frame.locator('#canvas').boundingBox();
 await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.7);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.3,canvas.y+canvas.height*.25,{steps:6});await page.mouse.up();
 assert.equal(await frame.locator('#export-region').isVisible(),true);assert.equal(await frame.locator('#region-select').getAttribute('aria-pressed'),'false');
 const fields=async()=>Object.fromEntries(await Promise.all(['x','y','w','h'].map(async k=>[k,Number(await frame.locator('#region-'+k).inputValue())])));
 const drawn=await fields();assert.ok(drawn.w>100&&drawn.h>50,JSON.stringify(drawn));
 let handle=await frame.locator('#export-region .se').boundingBox();await page.mouse.move(handle.x+5,handle.y+5);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y+25,{steps:3});await page.mouse.up();const resized=await fields();assert.ok(resized.w>drawn.w&&resized.h>drawn.h,JSON.stringify({drawn,resized}));
 let edge=await frame.locator('#export-region .top').boundingBox();await page.mouse.move(edge.x+edge.width/3,edge.y+4);await page.mouse.down();await page.mouse.move(edge.x+edge.width/3+15,edge.y+14,{steps:3});await page.mouse.up();const moved=await fields();assert.ok(moved.x>resized.x&&moved.y>resized.y,JSON.stringify({resized,moved}));
 await frame.locator('#region-select').click();await frame.locator('#canvas').press('Escape');assert.equal(await frame.locator('#region-select').getAttribute('aria-pressed'),'false');
 for(const [k,v] of Object.entries({x:180,y:70,w:240,h:120})){await frame.locator('#region-'+k).fill(String(v));await frame.locator('#region-'+k).dispatchEvent('change');}
 assert.deepEqual(await fields(),{x:180,y:70,w:240,h:120});
 const center=await frame.evaluate(()=>rt.viewCenter.toArray());canvas=await frame.locator('#canvas').boundingBox();await page.mouse.move(canvas.x+220,canvas.y+100);await page.mouse.down();await page.mouse.move(canvas.x+235,canvas.y+108,{steps:3});await page.mouse.up();assert.notDeepEqual(await frame.evaluate(()=>rt.viewCenter.toArray()),center);assert.deepEqual(await fields(),{x:180,y:70,w:240,h:120});
 await frame.evaluate(center=>{rt.viewCenter.fromArray(center);rt.setView(false);rt.sample(.35);},center);
 const crops=await frame.evaluate(()=>{
  const width=rt.renderer.domElement.clientWidth,height=rt.renderer.domElement.clientHeight,viewport={width,height},region={x:180,y:70,width:240,height:120},results=[];
  for(const top of [false,true]){
   rt.setView(top);rt.sample(.35);const before=rt.camera.projectionMatrix.clone(),screen=rt.screenCamera.projectionMatrix.clone();
   const full=rt.captureFrame(.35,{width,height,viewport,region:{x:0,y:0,width,height}},'#000000'),part=rt.captureFrame(.35,{width:240,height:120,viewport,region},'#000000');
   let max=0,bad=0;for(let y=0;y<120;y++)for(let x=0;x<240;x++)for(let c=0;c<4;c++){const d=Math.abs(full[((y+70)*width+x+180)*4+c]-part[(y*240+x)*4+c]);max=Math.max(max,d);if(d>3)bad++;}
   results.push({top,maxDifference:max,badChannels:bad,restored:rt.camera.projectionMatrix.equals(before)&&rt.screenCamera.projectionMatrix.equals(screen)});
  }
  rt.setView(false);rt.sample(.35);return results;
 });
 for(const crop of crops){assert.ok(crop.badChannels<240*120*.02,JSON.stringify(crop));assert.ok(crop.restored,JSON.stringify(crop));}
 console.log('Preview crop alignment: '+JSON.stringify(crops));
 await frame.locator('details.options').evaluate(e=>e.open=true);await frame.locator('#start').fill('0.35');await frame.locator('#end').fill('0.39');await frame.locator('#size').selectOption('512');
 for(const [k,v] of Object.entries({x:180,y:70,w:240,h:120})){await frame.locator('#region-'+k).fill(String(v));await frame.locator('#region-'+k).dispatchEvent('change');}
 const exports=[];
 for(const format of ['gif','png','mp4','mov']){
  await frame.locator('#media-format').selectOption(format);
  const downloadPromise=page.waitForEvent('download');await frame.locator('#export').click();const download=await downloadPromise;
  await frame.waitForFunction(()=>!document.querySelector('#export').disabled&&document.querySelector('#export-status').textContent.includes('导出完成'));
  const dimensions=await frame.evaluate(async format=>{
   const blob=await(await fetch(document.querySelector('#download-gif').href)).blob();
   if(format==='png'){const {unzipSync}=await import('../../vendor/fflate.js'),zip=unzipSync(new Uint8Array(await blob.arrayBuffer())),metadata=JSON.parse(new TextDecoder().decode(zip['sequence.json']));return {width:metadata.width,height:metadata.height};}
   if(format==='gif'){const image=await createImageBitmap(blob),size={width:image.width,height:image.height};image.close();return size;}
   return new Promise((resolve,reject)=>{const video=document.createElement('video'),url=URL.createObjectURL(blob);video.onloadedmetadata=()=>{resolve({width:video.videoWidth,height:video.videoHeight});URL.revokeObjectURL(url);};video.onerror=()=>{reject(Error('Video decode failed'));URL.revokeObjectURL(url);};video.src=url;});
  },format);
  assert.deepEqual(dimensions,{width:512,height:256});exports.push({format,...dimensions});if(process.env.GTFX_SCREENSHOT_DIR)await download.saveAs(path.join(process.env.GTFX_SCREENSHOT_DIR,'hana-region.'+(format==='png'?'zip':format)));
 }
 await frame.locator('#size').selectOption('native');await frame.locator('#native-scale').fill('2');await frame.locator('#native-scale').dispatchEvent('input');
 assert.match(await frame.locator('#native-dimensions').textContent(),/\d+ × \d+ px/);
 const native=await frame.evaluate(async()=>{const {regionCapturePlan}=await import('../../gtfx/export-region.js'),c=rt.renderer.domElement,region={x:180/c.clientWidth,y:70/c.clientHeight,w:240/c.clientWidth,h:120/c.clientHeight};const screen=regionCapturePlan({renderer:rt.renderer,screenEffect:true,modulePlayer:{active:false},validateCaptureSize:rt.validateCaptureSize.bind(rt)},region,'native',1);if(screen.dimensions.width!==240||screen.dimensions.height!==120)throw Error('Screen FX native crop must keep preview pixel density');return regionCapturePlan(rt,region,'native',2).dimensions;});
 await frame.locator('#media-format').selectOption('gif');const waiting=page.waitForEvent('download');await frame.locator('#export').click();await waiting;await frame.waitForFunction(()=>!document.querySelector('#export').disabled);
 assert.ok((await frame.locator('#export-status').textContent()).includes(native.width+' × '+native.height));
 const nativeGif=await frame.evaluate(async()=>{const image=await createImageBitmap(await(await fetch(document.querySelector('#download-gif').href)).blob()),size={width:image.width,height:image.height};image.close();return size;});assert.deepEqual(nativeGif,{width:native.width,height:native.height});
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('.workspace').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'fx-export-region.png')});
 await frame.locator('#region-clear').click();await frame.locator('#size').selectOption('512');assert.equal(await frame.locator('#export-region').isVisible(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,drawn,resized,moved,crops,exports,native},null,2));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
