/* Requires Playwright. Emulate the trimmed Pages package and a failing CDN.
 * No production requests: GitHub raw responses use the pinned local assets. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),origin='https://pages-preview.test';
const exclusions=fs.readFileSync(path.join(repo,'_config.yml'),'utf8').split(/\r?\n/).filter(s=>s.startsWith('  - ')).map(s=>s.slice(4));
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.flac':'audio/flac','.wav':'audio/wav','.ogg':'audio/ogg','.png':'image/png','.webp':'image/webp'};
const catalog=JSON.parse(fs.readFileSync(path.join(repo,'gtlibrary/gtaudio/data/catalog.json')));
const hero=JSON.parse(fs.readFileSync(path.join(repo,'gtlibrary/gtwiki/data/437.json')));
const clips=['zhCN','enUS','jaJP'].map(lang=>{
 const id=hero.voiceLines.flatMap(g=>g.lines).flatMap(l=>l.audio?.[lang]||[])[0];
 const clip=catalog.clips.find(c=>c.id===id);assert.ok(clip,lang+' Hana clip');return clip;
});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});let page=await context.newPage();
  const missing=[],errors=[],rawRequests=[],cdnRequests=[];let rawOffline=false;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());let relative;
   if(url.pathname==='/voice-fixture.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="voices"></div><script src="/gtlibrary/core/delivery-config.js"></script><script src="/gtlibrary/core/delivery.js"></script><script src="/gtlibrary/core/resources.js"></script><script type="module">import {VoiceLines} from "/gtlibrary/gtwiki/voices.js";new VoiceLines(document.getElementById("voices")).setHero(await (await fetch("/gtlibrary/gtwiki/data/437.json")).json());</script>'});
   if(url.hostname==='cdn.jsdelivr.net'){cdnRequests.push(url.href);return route.fulfill({status:503,body:'CDN unavailable',headers:{'access-control-allow-origin':'*'}});}
   if(url.hostname==='raw.githubusercontent.com'){if(rawOffline)return route.fulfill({status:503,body:'Raw unavailable',headers:{'access-control-allow-origin':'*'}});relative=decodeURIComponent(url.pathname.split('/').slice(4).join('/'));rawRequests.push(relative);}
   else if(url.origin===origin){relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(!relative||relative.endsWith('/'))relative+='index.html';if(exclusions.some(e=>relative===e||relative.startsWith(e+'/'))){missing.push(relative);return route.fulfill({status:404,body:'Excluded from Pages'});}}
   else return route.abort();
   const file=path.resolve(repo,relative);
   if(!file.startsWith(repo+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not found'});
   return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file),headers:{'access-control-allow-origin':'*'}});
  });
  for(const clip of clips){
   await page.goto(origin+'/gtlibrary/#view=audio&clip='+encodeURIComponent(clip.id));
   await page.waitForFunction(()=>document.querySelector('iframe')?.src.includes('/apps/audio/'));
   const frame=await(await page.$('iframe')).contentFrame();
   await frame.locator('#play').waitFor();await frame.waitForFunction(()=>!document.querySelector('#play').disabled);
   await frame.locator('#play').click();
   await frame.waitForFunction(()=>{const a=document.querySelector('#player');return a.currentTime>0&&!a.error;},null,{timeout:20000});
   const state=await frame.locator('#player').evaluate(a=>({src:a.currentSrc,sources:a.querySelectorAll('source').length}));
   assert.ok(state.src.startsWith('https://raw.githubusercontent.com/'));assert.equal(state.sources,2);
   await frame.locator('#play').click();
   console.log('PASS native audio CDN failure -> raw playback: '+clip.language);
   if(clip.language==='cn'){
    const saved=page.waitForEvent('download');await frame.locator('#download').click();const download=await saved;
    assert.equal(download.suggestedFilename(),clip.name+'.'+clip.file.split('.').pop());
    assert.deepEqual(fs.readFileSync(await download.path()),fs.readFileSync(path.join(repo,'gtlibrary/gtaudio',clip.file)));
    console.log('PASS cross-origin audio download falls back to raw and saves original bytes');
   }
  }
  // Wiki uses the same streaming helper and must still pause/resume/switch safely.
  await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/voice-fixture.html');
  const wiki=page;
  await wiki.locator('.voice-play:not(:disabled)').first().click({timeout:30000});
  await wiki.waitForFunction(()=>{const a=document.querySelector('.voice-player audio');return a?.currentTime>0&&!a.error;},null,{timeout:20000});
  await wiki.locator('.voice-play[aria-pressed="true"]').click();
  assert.equal(await wiki.locator('.voice-player audio').evaluate(a=>a.paused),true);
  await wiki.locator('.voice-play:not(:disabled)').first().click();
  await wiki.waitForFunction(()=>!document.querySelector('.voice-player audio').paused);
  await wiki.locator('[aria-label="语音语言"]').selectOption('jaJP');
  assert.equal(await wiki.locator('.voice-player audio source').count(),0);
  assert.equal(missing.length,0,'Requests to omitted Pages files: '+missing.join(', '));
  assert.equal(errors.length,0,errors.join('\n'));
  const imageSize=await page.evaluate(async()=>{const image=await GTResources.image('/gtlibrary/gtasset/assets/character/hana.png');return [image.width,image.height];});
  assert.ok(imageSize[0]>0&&imageSize[1]>0);assert.ok(rawRequests.some(p=>p.startsWith('gtlibrary/gtasset/assets/')));
  assert.ok(cdnRequests.length>0&&rawRequests.length>0);
  rawOffline=true;
  await wiki.locator('.voice-play:not(:disabled)').first().click();
  await wiki.waitForFunction(()=>document.querySelector('.voice-play')?.disabled===false&&document.querySelector('.voice-play')?.textContent.includes('播放')&&!document.querySelector('.voice-player audio source'));
  rawOffline=false;
  await wiki.locator('.voice-play:not(:disabled)').first().click();
  await wiki.waitForFunction(()=>document.querySelector('.voice-player audio')?.currentTime>0);
  console.log('PASS all audio sources failing releases the play button; next click retries successfully');
  console.log('PASS trimmed Pages, wiki playback/pause/resume/language switch, remote artwork, zero excluded local requests or page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
