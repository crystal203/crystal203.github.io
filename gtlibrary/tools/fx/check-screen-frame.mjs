import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--playwright'))throw Error('Pass --playwright /absolute/path/to/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(arg('--playwright')).href);
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:args.includes('--browser-exe')?arg('--browser-exe'):'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:2100,height:900},deviceScaleFactor:1});await page.route('http://127.0.0.1:8765/__twins_screen_shape__',r=>r.fulfill({contentType:'text/html',body:'<canvas id="fx" style="width:1200px;height:600px"></canvas>'}));await page.goto('http://127.0.0.1:8765/__twins_screen_shape__');const result=await page.evaluate(async()=>{
 const [{FxRuntime},T]=await Promise.all([import('/gtfx/core.js'),import('/vendor/three.module.js')]);const index=await(await fetch('/gtfx/assets/characters/twinsandroid.json')).json(),effect=index.effects.find(e=>e.preset==='fx_cwp_twins_android_myth_screen'),canvas=document.querySelector('canvas'),rt=new FxRuntime(canvas);await rt.load(index,p=>new URL(p,location.origin+'/gtfx/assets/characters/').href,{effect});rt.build(effect,12345);
 const cases=[];
 for(const [width,height,top]of [[1200,600,false],[2000,528,false],[2000,528,true]]){canvas.style.width=width+'px';canvas.style.height=height+'px';rt.resize();rt.setView(top);rt.sample(.444);rt.group.updateMatrixWorld(true);
 const rings=rt.particles.filter(p=>p.mesh.visible&&/under_ring_1|top_ring_1/.test(p.s.name)).map(p=>{const g=p.mesh.geometry.getAttribute('position'),b=new T.Box2().makeEmpty();p.mesh.updateMatrixWorld(true);for(let i=0;i<g.count;i++){const v=new T.Vector3().fromBufferAttribute(g,i).applyMatrix4(p.mesh.matrixWorld).project(rt.screenCamera);b.expandByPoint(new T.Vector2(v.x*width/2,v.y*height/2));}const size=b.getSize(new T.Vector2());return {system:p.s.name,pixels:size.toArray(),heightWidth:size.y/size.x,nodeScale:p.node.scale.toArray(),parentScale:p.node.parent.scale.toArray()};});cases.push({width,height,top,rings});}
 rt.dispose();return {cases,imagePixelsRead:0,screenshots:0};});for(const item of result.cases[0].rings){for(const scenario of result.cases.slice(1)){const corresponding=scenario.rings.find(p=>p.system===item.system);assert(corresponding,'Missing real ring mesh');assert(Math.abs(corresponding.heightWidth-item.heightWidth)<1e-6,'Screen frame stretched source mesh: '+item.system);}}
assert(result.cases.every(c=>c.rings.length>0),'No visible source mesh was measured');
if(args.includes('--output'))writeFileSync(arg('--output'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,passed:true}));}finally{await browser.close();}
