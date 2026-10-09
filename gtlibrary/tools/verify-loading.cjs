/* Local integration checks. Requires Playwright; never contacts production/CDN. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const counts = new Map();
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.bytes':'application/octet-stream'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), relative = decodeURIComponent(url.pathname).replace(/^\/gtlibrary\//, '');
  counts.set(url.pathname, (counts.get(url.pathname) || 0) + 1);
  if(url.pathname === '/favicon.ico'){res.writeHead(204);res.end();return;}
  const file = path.resolve(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {res.writeHead(404);res.end();return;}
  const send = () => {res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain');res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);};
  if(relative === 'resources/registry.js')setTimeout(send, 1500);else send();
});
async function verifyCDN() {
  const source = fs.readFileSync(path.join(root,'core/delivery.js'),'utf8');
  function runtime(fetch, config={}) {
    const context = {URL, Response, AbortController, setTimeout, clearTimeout, Image:class {},
      location:{hostname:'crystal203.github.io'},document:{currentScript:{src:'https://crystal203.github.io/gtlibrary/core/delivery.js'},baseURI:'https://crystal203.github.io/gtlibrary/apps/atlas/index.html'},
      GTDeliveryConfig:{cdnBase:'https://assets.example.test/releases/v1/',cdnTimeoutMs:20,...config},fetch};
    vm.createContext(context);vm.runInContext(source,context);return context.GTDelivery;
  }
  const asset = 'https://crystal203.github.io/gtlibrary/gtatlas/assets/characters.json';
  let calls=[];
  let delivery=runtime(async url=>{calls.push(url);return new Response('{}');});
  assert.equal(await (await delivery.fetch(asset)).text(),'{}');
  assert.equal(calls[0],'https://assets.example.test/releases/v1/gtatlas/assets/characters.json');
  calls=[];delivery=runtime(async url=>{calls.push(url);return new Response('{}',{status:url.startsWith('https://assets.')?503:200});});
  assert.equal((await delivery.fetch(asset)).status,200);await delivery.fetch(asset);
  assert.deepEqual(calls, ['https://assets.example.test/releases/v1/gtatlas/assets/characters.json',asset,asset]);
  calls=[];delivery=runtime(async url=>{calls.push(url);return new Response('{}');},{cdnPrefixes:['gtatlas/assets/','gtasset/assets/','gtfx/assets/']});
  const preview='https://crystal203.github.io/gtlibrary/resources/previews/fx.json';
  await delivery.fetch(preview);assert.deepEqual(calls,[preview]);
  calls=[];delivery=runtime(async(url,options)=>{calls.push(url);if(url.startsWith('https://assets.'))return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));return new Response('{}');});
  assert.equal((await delivery.fetch(asset)).status,200);assert.equal(calls.length,2);
  calls=[];const controller=new AbortController();delivery=runtime(async(url,options)=>{calls.push(url);controller.abort();throw new DOMException('aborted','AbortError');});
  await assert.rejects(delivery.fetch(asset,{signal:controller.signal}),{name:'AbortError'});assert.equal(calls.length,1);
  for(const folder of ['character','illust']) {
    const text=fs.readFileSync(path.join(root,'gtasset/assets',folder,'assets.js'),'utf8');
    const match=text.match(/(?:window\.)?spineAssets\s*=\s*([\s\S]*?);?\s*$/);
    assert.ok(Array.isArray(JSON.parse(match[1].replace(/;\s*$/,''))));
  }
  console.log('PASS CDN success, HTTP fallback, circuit breaker, timeout, cancellation, manifests');
}
(async()=>{
  let browser;
  try {
    await verifyCDN();
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}/gtlibrary/`;
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
    async function getFrame(view,query=''){
      await page.waitForFunction(([view,query])=>{const src=document.querySelector('iframe')?.src||'';return src.includes('/apps/'+view+'/')&&src.includes(query);},[view,query]);
      const frame=await(await page.$('iframe')).contentFrame();await frame.waitForLoadState('domcontentloaded');return frame;
    }
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('iframe', {timeout:1000});
    assert.equal(await page.evaluate(()=>!!globalThis.GTLibraryRegistry),false);
    await page.waitForFunction(()=>!!globalThis.GTLibraryRegistry);
    assert.equal(counts.get('/gtlibrary/resources/registry.js'),1);
    assert.equal([...counts.keys()].some(url=>/\/vendor\/|\/gtatlas\/assets\/.*\.png/.test(url)),false);
    console.log('PASS workspace starts before delayed index; one shared index; no heavy assets on home');
    await page.locator('nav [data-view="spine"]').click();
    let frame=await getFrame('spine');
    await frame.waitForSelector('#assetList .asset-item',{timeout:30000});
    await frame.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/previews/portraits.webp')&&entry.responseEnd>0));
    assert.equal([...counts.keys()].some(url=>/gtatlas\/assets\/(characters|portraits)\.png/.test(url)),false);
    console.log('PASS Spine list and small preview atlas');
    await page.goto(base+'#view=spine&resource=hana&name=hana&folder=character');
    frame=await getFrame('spine','name=hana');
    await frame.waitForFunction(()=>document.querySelector('#trackAction')?.options.length>0,{},{timeout:30000});
    console.log('PASS Hana Spine animation');
    await page.goto(base+'#view=atlas&sheet=characters&query=hana');
    frame=await getFrame('atlas','sheet=characters');
    await frame.waitForSelector('.region-item',{timeout:30000});
    const expectedSize=await frame.evaluate(()=>{const r=filteredRegions[0];return [r.w,r.h];});
    const download=page.waitForEvent('download');await frame.locator('.region-item .download-btn').first().click();const pngDownload=await download;
    assert.ok(pngDownload.suggestedFilename().endsWith('.png'));
    const png=fs.readFileSync(await pngDownload.path());assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],expectedSize);
    console.log('PASS full-resolution atlas, linked cards and PNG export');
    const beforeFX=counts.get('/gtlibrary/gtatlas/assets/portraits.png')||0;
    await page.goto(base+'#view=fx&character=hana');
    frame=await getFrame('fx','character=hana');
    await frame.waitForFunction(()=>!document.querySelector('#play').disabled,{},{timeout:30000});
    await frame.waitForFunction(()=>document.querySelector('.avatar')?.getContext('2d').getImageData(0,0,40,40).data.some((v,i)=>i%4===3&&v>0));
    assert.equal(counts.get('/gtlibrary/gtatlas/assets/portraits.png')||0,beforeFX);
    await frame.locator('#play').click();
    if(process.env.GT_QA_SCREENSHOT)await page.screenshot({path:process.env.GT_QA_SCREENSHOT});
    await frame.locator('#end').evaluate(input=>input.value='0.2');
    await frame.locator('#export').click();
    await frame.waitForSelector('#download-gif:not([hidden])',{timeout:30000});
    const gifDownload=page.waitForEvent('download');await frame.locator('#download-gif').click();
    const gif=fs.readFileSync(await(await gifDownload).path());assert.equal(gif.subarray(0,3).toString(),'GIF');
    console.log('PASS Hana FX preview and lightweight avatars');
    // Manually register for local testing; production automatically registers on HTTPS.
    await page.evaluate(async()=>{await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const testURL=base+'resources/previews/fx.json';
    await page.evaluate(url=>fetch(url).then(response=>response.json()),testURL);
    await page.waitForFunction(async url=>{for(const name of await caches.keys())if(await(await caches.open(name)).match(url))return true;return false;},testURL);
    const before=counts.get('/gtlibrary/resources/previews/fx.json');
    await page.evaluate(url=>fetch(url).then(response=>response.json()),testURL);
    assert.equal(counts.get('/gtlibrary/resources/previews/fx.json'),before);
    await page.context().setOffline(true);
    assert.ok(await page.evaluate(url=>fetch(url).then(response=>response.ok),testURL));
    await page.context().setOffline(false);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS shared persistent cache, zero repeat network requests, cached asset offline; zero page errors');
  } finally {if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
