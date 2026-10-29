const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'gtlibrary/resources/registry.js'),'utf8').replace(/^window.GTLibraryRegistry = /,'').replace(/;\s*$/,''));
assert.equal(registry.aliases.peimei,'china_hero_both');assert.equal(registry.aliases.china,'china_female');
assert.equal(registry.entities.china_hero_both.fx.character,'peimei');assert.equal(registry.entities.china_female.fx,undefined);
const search=JSON.parse(fs.readFileSync(path.join(root,'gtlibrary/resources/search-index.json')));
assert.equal(search.entities.filter(e=>e.id.startsWith('fx:peimei:')).length,20);
assert.equal(search.entities.filter(e=>e.id.startsWith('fx:china:')).length,0);
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.bytes':'application/octet-stream','.atlas':'text/plain'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),key=decodeURIComponent(url.pathname).replace(/^\//,'').replace(/\/$/,'/index.html'),file=path.resolve(root,key);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1400,height:980}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async character=>{
  await page.goto(`http://127.0.0.1:${server.address().port}/gtlibrary/#view=fx&character=${character}`);
  await page.waitForSelector('iframe',{state:'attached'});const frame=await(await page.$('iframe')).contentFrame();
  try{await frame.waitForFunction(()=>!document.querySelector('#play').disabled,{},{timeout:15000});}
  catch(e){console.error('init state',await frame.locator('body').innerText().then(x=>x.slice(-1500)),errors);throw e;}
  await frame.evaluate(async()=>{const {FxRuntime}=await import('../../gtfx/core.js'),sample=FxRuntime.prototype.sample;FxRuntime.prototype.sample=function(t){if(this.renderer.domElement)window.rt=this;return sample.call(this,t);};});
  return frame;
 };
 const seek=async(frame,time)=>frame.locator('#seek').evaluate((e,time)=>{e.value=time;e.dispatchEvent(new Event('input'));},time);
 const choose=async(frame,id)=>{await frame.locator('#module').selectOption(id);try{await frame.waitForFunction(id=>!document.querySelector('#play').disabled&&document.querySelector('#module').value===id,id,{timeout:20000});}catch(e){console.error('choose failed',id,await frame.locator('body').innerText().then(x=>x.slice(-700)));throw e;}};
 let frame=await open('milkywaygirl');await seek(frame,.2);
 assert.equal(await frame.locator('#play-mode').inputValue(),'module');
 assert.equal(await frame.locator('#current-character').textContent(),'群星书记长蕾娜');
 assert.deepEqual(await frame.locator('#appearance option').evaluateAll(es=>es.map(e=>e.value)),['milkyway_girl','milkyway_girl_librarian']);
 const basic=await frame.evaluate(()=>({module:rt.modulePlayer.module.id,weapon:rt.characterPlayer.slot.getAttachment()?.name,tracks:rt.modulePlayer.entries.map(e=>e.track.effect.preset),active:rt.characterPlayer.active}));
 assert.equal(basic.module,'basic-1');assert.equal(basic.weapon,'cwp_milkywaygirl');assert.equal(basic.active,true);
 const weaponBone=await frame.evaluate(()=>{const slot=rt.characterPlayer.slot,b=slot.bone;return {name:slot.data.name,area:Math.abs(b.a*b.d-b.b*b.c),quad:rt.characterPlayer.renderer.meshes.some(m=>m.visible&&m.geometry.getAttribute('position')?.count===4)};});
 assert.equal(weaponBone.name,'[base]weapon2_side');assert.ok(weaponBone.area>.9);assert.equal(weaponBone.quad,true);
 const actorFraction=()=>frame.evaluate(()=>{const t=rt.currentTime;rt.sample(0);const b=rt.characterPlayer.bounds(),ratio=(b.max.y-b.min.y)/rt.viewSize;rt.sample(t);return ratio;});
 assert.ok(Math.abs(await actorFraction()-.17)<.02);
 assert.equal(basic.tracks.filter(n=>n.endsWith('1st_proj')).length,3);assert.equal(basic.tracks.filter(n=>n.endsWith('1st_contrail')).length,3);
 const balls=await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.effect.preset.endsWith('1st_proj')&&e.sim.group.visible).map(e=>e.sim.group.position.toArray()));
 assert.equal(balls.length,3);assert.equal(new Set(balls.map(p=>p.join(','))).size,3);
 const projectilePosition=async t=>{await seek(frame,t);return frame.evaluate(()=>{const e=rt.modulePlayer.entries.find(e=>e.track.effect.preset.endsWith('1st_proj')&&e.track.link.angle===0);const p=e.sim.particles.find(p=>p.mesh.visible);return p&&[e.sim.group.position.x+p.mesh.matrix.elements[12],e.sim.group.position.z+p.mesh.matrix.elements[14]];});};
 const pos1=await projectilePosition(.18),pos2=await projectilePosition(.24);assert.ok(pos1&&pos2&&Math.hypot(pos2[0]-pos1[0],pos2[1]-pos1[1])>1,`projectile failed to fly: ${pos1} -> ${pos2}`);
 const capture=await frame.evaluate(async()=>{const pixels=rt.captureFrame(.2,256),plan=await rt.measureNative([0,.14,.2,.34]);return {visible:pixels.some((v,i)=>i%4===3&&v>0),width:plan.width,height:plan.height};});
 assert.ok(capture.visible&&capture.width>0&&capture.height>0,JSON.stringify(capture));
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'galaxy-group.png')});
 await choose(frame,'basic-3');await seek(frame,.4);assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.effect.preset.endsWith('3rd_proj')).length),4);
 await choose(frame,'basic-combo');await seek(frame,1.5);const combo=await frame.evaluate(()=>({clips:rt.modulePlayer.module.actor.clips.map(c=>c.name),active:rt.modulePlayer.entries.filter(e=>e.sim.group.visible).length}));assert.equal(combo.clips.length,4);assert.ok(combo.active>0);
 for(const id of ['support','role-lv0','role-lv1','role-lv2','role-lv3','weapon-option','cwp']){await choose(frame,id);await seek(frame,id==='cwp'?.62:.4);const valid=await frame.evaluate(()=>rt.characterPlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY)));assert.ok(valid,id);}
 await choose(frame,'role-lv1');await seek(frame,.4);
 assert.ok(Math.abs(await actorFraction()-.17)<.02);
 assert.deepEqual(await frame.evaluate(()=>rt.modulePlayer.entries.map(e=>e.track.effect.preset).filter(p=>p.includes('role_symbol'))),['fx_m_milkyway_girl_role_symbol_end']);
 assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.find(e=>e.track.effect.preset.includes('role_explosion')).track.link.anchor),'center');
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'galaxy-role.png')});
 await choose(frame,'cwp');await seek(frame,.62);
 assert.ok(Math.abs(await actorFraction()-.17)<.02);
 assert.equal(await frame.evaluate(()=>rt.modulePlayer.module.id),'cwp');
 assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.link.screen).every(e=>e.sim.group.parent===rt.screenScene)),true);
 assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.some(e=>e.track.link.screen&&e.sim.group.visible&&e.sim.particles.some(p=>p.mesh.visible))),true);
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'galaxy-screen.png')});
 if(process.env.GTFX_SCREENSHOT_DIR){await seek(frame,1.1);await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'galaxy-screen-late.png')});}
 const cwp=await frame.evaluate(()=>({meteors:rt.modulePlayer.entries.filter(e=>e.track.link.anchor==='meteor').length,explosions:rt.modulePlayer.entries.filter(e=>e.track.effect.preset.endsWith('_explosion')).length}));assert.equal(cwp.meteors,18);assert.equal(cwp.explosions,9);
 const impactOrientation=await frame.evaluate(()=>{
  const e=rt.modulePlayer.entries.find(e=>e.track.effect.preset==='fx_cwp_milkyway_girl_explosion');
  const rock=e.sim.particles.find(p=>p.s.name==='[Atlas_ab]_stone');
  return {directed:e.track.link.directed,root:e.sim.nodeRoot.quaternion.toArray(),rockVelocity:rock.velocity.clone().applyQuaternion(rock.worldRot).toArray()};
 });
 assert.equal(impactOrientation.directed,false);
 assert.ok(impactOrientation.root.slice(0,3).every(v=>Math.abs(v)<1e-6));
 assert.ok(impactOrientation.rockVelocity[1]>0);
 const orbit=await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.effect.preset.endsWith('_explosion')).slice(0,3).map(e=>e.track.link.orbitOffset));
 assert.equal(new Set(orbit.map(v=>v.join(','))).size,3);assert.ok(orbit.every(v=>Math.abs(Math.hypot(v[0],v[2])-.8)<1e-6));
 const ringAngles=await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.effect.preset==='fx_cwp_milkyway_girl_explosion').slice(0,3).map(e=>e.sim.particles.find(p=>p.s.name==='mesh_cyl_ring').startRotation.y));
 assert.equal(new Set(ringAngles.map(v=>v.toFixed(6))).size,3);
 assert.equal(await frame.locator('#weapon').inputValue(),'cwp_milkywaygirl');
 await frame.locator('#weapon').selectOption('basic_basket');await frame.waitForFunction(()=>rt.characterPlayer.weapon==='basic_basket'&&!document.querySelector('#play').disabled);
 assert.equal(await frame.locator('#module option[value="cwp"]').count(),0);
 await frame.locator('#weapon').selectOption('cwp_milkywaygirl');await frame.waitForFunction(()=>rt.characterPlayer.weapon==='cwp_milkywaygirl'&&!document.querySelector('#play').disabled);
 assert.equal(await frame.locator('#module option[value="cwp"]').count(),1);
 await frame.locator('#play-mode').selectOption('effect');await frame.waitForFunction(()=>!document.querySelector('#play').disabled&&!rt.characterPlayer.active&&!rt.modulePlayer.active);
 const screenIndex=await frame.evaluate(()=>rt.index.effects.findIndex(e=>e.preset==='fx_cwp_milkyway_girl_screen'));
 assert.ok(screenIndex>=0);await frame.locator('#effect').selectOption(String(screenIndex));
 await frame.waitForFunction(()=>!document.querySelector('#play').disabled&&rt.screenEffect&&rt.group.parent===rt.screenScene);
 assert.equal(await frame.evaluate(()=>rt.captureFrame(.5,256).some((v,i)=>i%4===3&&v>0)),true);
 await frame.locator('#effect').selectOption('10');await frame.waitForFunction(()=>!document.querySelector('#play').disabled&&!rt.screenEffect);assert.equal(await frame.evaluate(()=>rt.characterPlayer.group.visible),false);
 frame=await open('peimei');await seek(frame,.1);
 assert.equal(await frame.locator('#current-character').textContent(),'仙山拳名家佩儿＆梅儿');
 assert.deepEqual(await frame.locator('#appearance option').evaluateAll(es=>es.map(e=>e.value)),['china_hero_girl_5','china_hero_boy_5']);
 assert.equal(await frame.locator('#weapon').inputValue(),'cwp_china');
 assert.deepEqual(await frame.locator('#module option').evaluateAll(es=>es.map(e=>e.value)),['basic-1','basic-loop','support','support-ascent','role-ascent','cwp']);
 assert.deepEqual(await frame.evaluate(()=>rt.characterPlayer.weaponSlots.map(s=>s.getAttachment()?.name)),['cwp_china','cwp_china']);
 assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries[0].track.effect.preset),'fx_m_chinaheroascent_punch_mei');
 const rightPunch=await frame.evaluate(()=>({root:rt.modulePlayer.entries[0].sim.nodeRoot.quaternion.toArray(),offset:rt.modulePlayer.entries[0].sim.group.position.x}));
 assert.ok(rightPunch.root.slice(0,3).every(v=>Math.abs(v)<1e-6));assert.ok(Math.abs(rightPunch.offset-.35)<.001);
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'peimei-right.png')});
 await frame.locator('#direction').selectOption('left');await frame.waitForFunction(()=>rt.characterPlayer.direction==='left'&&!document.querySelector('#play').disabled);
 await seek(frame,.1);
 const leftPunch=await frame.evaluate(()=>({root:rt.modulePlayer.entries[0].sim.nodeRoot.quaternion.toArray(),scale:rt.modulePlayer.entries[0].sim.nodeRoot.scale.z}));
 assert.ok(Math.abs(leftPunch.root[1])>.99);assert.ok(leftPunch.scale<0);
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'peimei-left.png')});
 await choose(frame,'support-ascent');assert.deepEqual(await frame.evaluate(()=>rt.modulePlayer.entries.map(e=>e.track.effect.preset)),['fx_m_chinaheroascent_support_ready_mei','fx_m_chinaheroascent_support_cast_mei','fx_m_chinaheroascent_support_explosion_mei']);
 await choose(frame,'role-ascent');assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.length),3);
 await frame.locator('#appearance').selectOption('china_hero_boy_5');await frame.waitForFunction(()=>rt.characterPlayer.appearance==='china_hero_boy_5'&&!document.querySelector('#play').disabled);
 assert.equal(await frame.evaluate(()=>rt.characterPlayer.slot.getAttachment()?.name),'cwp_china');
 await choose(frame,'basic-1');assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries[0].track.effect.preset),'fx_m_chinaheroascent_punch_pei');
 frame=await open('hana');await choose(frame,'basic-3');await seek(frame,.3);
 const hook=await frame.evaluate(()=>({links:rt.modulePlayer.entries.flatMap(e=>e.sim.statics).filter(p=>p.s.chainIndex!=null&&p.mesh.visible).length,weapon:rt.characterPlayer.slot.getAttachment()?.name}));assert.ok(hook.links>5);
 await frame.locator('#show-target').uncheck();assert.equal(await frame.evaluate(()=>rt.characterPlayer.target.visible),false);
 for(const id of ['cwp-1','cwp-2','cwp-3']){await choose(frame,id);await seek(frame,.35);assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>/_cwp_hana_(1st|2nd|last_explosion)$/.test(e.track.effect.assetName)).length),1,id);}
 for(const id of ['cwp-1','cwp-2','cwp-3']){await choose(frame,id);await seek(frame,.35);assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.link.screen).length),1,id);assert.equal(await frame.evaluate(()=>rt.modulePlayer.entries.filter(e=>e.track.link.screen).every(e=>e.sim.group.parent===rt.screenScene)),true);}
 await choose(frame,'cwp-1');await seek(frame,.35);
 if(process.env.GTFX_SCREENSHOT_DIR)await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'hana-screen.png')});
 if(process.env.GTFX_SCREENSHOT_DIR){
  await seek(frame,.65);await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'hana-screen-late.png')});
  await frame.locator('#stage').evaluate(e=>{e.style.width='512px';e.style.height='512px';});
  await frame.evaluate(()=>{rt.resize();rt.sample(.65);});
  await frame.locator('#stage').screenshot({path:path.join(process.env.GTFX_SCREENSHOT_DIR,'hana-screen-square.png')});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,galaxy:{basic,combo,cwp,capture},peimei:'girl/boy',hana:hook,standalone:true},null,2));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
