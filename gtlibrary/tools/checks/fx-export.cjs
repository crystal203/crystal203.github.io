const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(process.env.GTFX_ROOT||path.resolve(__dirname,'../..'));
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/README.md`);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{FxRuntime}=await import('/gtfx/core.js');
  const canvas=document.createElement('canvas');canvas.style.width=canvas.style.height='64px';document.body.append(canvas);
  const rt=new FxRuntime(canvas);rt.grid.visible=false;rt.viewSize=8;rt.camera.position.set(0,0,20);rt.camera.lookAt(0,0,0);
  rt.index={textures:{},colorSpace:'gamma'};
  rt.textures.white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);rt.textures.white.needsUpdate=true;
  for(const [i,blend] of ['add','alpha','opaque'].entries()){
   const mat=rt.createMaterial({blend,tint:{r:.1,g:.4,b:.8,a:blend==='opaque'?1:.5},scale:{x:1,y:1},offset:{x:0,y:0},colorGain:1});
   const mesh=new THREE.Mesh(rt.quad,mat);mesh.scale.set(2,2,1);mesh.position.x=(i-1)*2.2;rt.scene.add(mesh);
  }
  // Use production shaders and capture, with a deterministic scene in place of animation.
  rt.sample=()=>{rt.renderer.render(rt.scene,rt.camera);};
  rt.renderer.setSize(64,64,false);rt.setBackground('transparent');rt.camera.left=-4;rt.camera.right=4;rt.camera.top=4;rt.camera.bottom=-4;rt.camera.updateProjectionMatrix();
  const gl=rt.renderer.getContext(),previewChecks=[];
  for(const space of ['gamma','linear']){
   for(const child of rt.scene.children)if(child.isMesh&&child!==rt.grid)child.material.uniforms.gammaColorSpace.value=space==='gamma';
   rt.sample();const preview=new Uint8Array(64*64*4);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,preview);
   const exported=rt.captureFrame(0,64,'#000000');let maxDifference=0;
   for(let y=8;y<56;y++)for(let x=8;x<56;x++)for(let c=0;c<3;c++)maxDifference=Math.max(maxDifference,Math.abs(preview[(y*64+x)*4+c]-exported[((63-y)*64+x)*4+c]));
   previewChecks.push({space,maxDifference});
  }
  for(const child of rt.scene.children)if(child.isMesh&&child!==rt.grid)child.material.uniforms.gammaColorSpace.value=true;
  const {FxCharacterPlayer}=await import('/gtfx/character-player.js'),actor=new FxCharacterPlayer(rt);
  const marker=new THREE.Mesh(rt.quad,actor.target.material);marker.scale.set(2,2,1);marker.position.y=2;rt.scene.add(marker);
  rt.sample();const markerPreview=new Uint8Array(64*64*4);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,markerPreview);
  const markerExport=rt.captureFrame(0,64,'#000000');let markerDifference=0;
  for(let y=8;y<56;y++)for(let x=8;x<56;x++)for(let c=0;c<3;c++)markerDifference=Math.max(markerDifference,Math.abs(markerPreview[(y*64+x)*4+c]-markerExport[((63-y)*64+x)*4+c]));
  previewChecks.push({space:'target-marker',maxDifference:markerDifference});marker.removeFromParent();
  rt.setBackground('color','#726354');rt.grid.visible=true;
  const original={background:rt.scene.background,color:rt.renderer.getClearColor(new THREE.Color()).clone(),alpha:rt.renderer.getClearAlpha(),position:rt.camera.position.clone(),quaternion:rt.camera.quaternion.clone(),projection:rt.camera.projectionMatrix.clone()};
  const comparisons=[],encodings=[];
  const toCanvas=(rgba,w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),w,h),0,0);return c;};
  const over=(rgba,w,h,bg)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.drawImage(toCanvas(rgba,w,h),0,0);return ctx.getImageData(0,0,w,h).data;};
  const diff=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
  const compare=async(size,bg)=>{
   const w=typeof size==='number'?size:size.width,h=typeof size==='number'?size:size.height;
   const transparent=rt.captureFrame(0,size),matte=rt.captureFrame(0,size,bg),expected=over(transparent,w,h,typeof bg==='number'?'#000000':bg);
   comparisons.push({size:[w,h],bg,maxDifference:diff(matte,expected),opaque:matte.every((v,i)=>i%4!==3||v===255),transparentStable:diff(transparent,rt.captureFrame(0,size))===0});
   if(bg==='#ffffff'&&typeof size==='number'){
    const worker=new Worker('/gtfx/gif-worker.js',{type:'module'});
    const request=m=>new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data);worker.onerror=reject;worker.postMessage(m);});
    try{
     await request({type:'start',width:w,height:h,transparent:false,threshold:16});await request({type:'frame',index:0,rgba:matte.buffer,delay:100});const gif=await request({type:'finish'});
     const bitmap=await createImageBitmap(new Blob([gif.bytes],{type:'image/gif'})),decoded=document.createElement('canvas');decoded.width=w;decoded.height=h;decoded.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
     encodings.push({format:'gif',maxDifference:diff(decoded.getContext('2d').getImageData(0,0,w,h).data,expected)});
    }finally{worker.terminate();}
    const {exportAnimation}=await import('/core/animation-export.js'),{unzipSync}=await import('/vendor/fflate.js');
    const png=await exportAnimation({format:'png',width:w,height:h,frames:1,fps:1,duration:1,transparent:false,background:bg,getFrame:()=>transparent});
    const zip=unzipSync(new Uint8Array(await png.blob.arrayBuffer())),bitmap=await createImageBitmap(new Blob([zip['frames/000001.png']],{type:'image/png'})),decoded=document.createElement('canvas');decoded.width=w;decoded.height=h;decoded.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    encodings.push({format:'png',maxDifference:diff(decoded.getContext('2d').getImageData(0,0,w,h).data,expected)});
   }
  };
  for(const bg of ['#ffffff','#000000','#3695b7',0])await compare(64,bg);
  await compare({width:80,height:48,pixelsPerUnit:10,center:[0,0]},'#ffffff');
  const restored=rt.scene.background===original.background&&rt.grid.visible&&rt.renderer.getClearAlpha()===original.alpha&&rt.renderer.getClearColor(new THREE.Color()).equals(original.color)&&rt.camera.position.equals(original.position)&&rt.camera.quaternion.equals(original.quaternion)&&rt.camera.projectionMatrix.equals(original.projection)&&rt.renderer.getRenderTarget()===null;
  rt.captureTarget.dispose();rt.renderer.dispose();return {previewChecks,comparisons,encodings,restored};
 });
 console.log(JSON.stringify(result,null,2));
 for(const preview of result.previewChecks)assert.ok(preview.maxDifference<=2,'preview/export color mismatch: '+JSON.stringify(preview));
 for(const comparison of result.comparisons){assert.ok(comparison.maxDifference<=2,JSON.stringify(comparison));assert.ok(comparison.opaque&&comparison.transparentStable,JSON.stringify(comparison));}
 for(const encoding of result.encodings)assert.ok(encoding.maxDifference<=(encoding.format==='gif'?8:0),JSON.stringify(encoding));
 assert.ok(result.restored,'capture must restore preview state');assert.deepEqual(errors,[]);
 console.log('FX matte export checks passed');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
