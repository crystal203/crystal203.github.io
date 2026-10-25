/* No network: exercise production URL routing, raw fallback and cancellation. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'core/delivery.js'),'utf8');
function runtime(fetch,hostname='crystal203.github.io'){
 const ctx={URL,Response,AbortController,DOMException,setTimeout,clearTimeout,fetch,location:{hostname},document:{currentScript:{src:`https://${hostname}/gtlibrary/core/delivery.js`},baseURI:`https://${hostname}/gtlibrary/apps/audio/index.html`}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'core/delivery-config.js'),'utf8'),ctx);ctx.GTDeliveryConfig.cdnTimeoutMs=10;vm.runInContext(source,ctx);return ctx;
}
(async()=>{
 const local='https://crystal203.github.io/gtlibrary/gtaudio/assets/ab/sample.flac';let calls=[];
 let ctx=runtime(async url=>{calls.push(url);return new Response('audio',{status:url.includes('cdn.jsdelivr')?503:200});});
 const urls=Array.from(ctx.GTDelivery.urls(local));assert.equal(urls.length,2);assert.ok(urls[0].startsWith(ctx.GTDeliveryConfig.cdnBase));assert.ok(urls[1].startsWith(ctx.GTDeliveryConfig.rawBase));
 assert.equal(await(await ctx.GTDelivery.fetch(local)).text(),'audio');assert.deepEqual(calls,urls);
 calls=[];await ctx.GTDelivery.fetch(urls[0]);assert.deepEqual(calls,urls,'Already resolved CDN URLs must still fall back to raw');
 calls=[];await ctx.GTDelivery.fetch(local);assert.deepEqual(calls,urls,'Failure for one resource must not disable the entire CDN');
 assert.deepEqual(Array.from(ctx.GTDelivery.urls('../data/catalog.json')),['https://crystal203.github.io/gtlibrary/apps/data/catalog.json']);
 assert.equal(ctx.GTDelivery.url('https://example.org/other.png'),'https://example.org/other.png');
 for(const prefix of ctx.GTDeliveryConfig.cdnPrefixes)assert.ok(ctx.GTDelivery.url('https://crystal203.github.io/gtlibrary/'+prefix+'sample.png').startsWith(ctx.GTDeliveryConfig.cdnBase));
 const localCtx=runtime(()=>{},'localhost');assert.deepEqual(Array.from(localCtx.GTDelivery.urls('https://localhost/gtlibrary/gtaudio/assets/ab/sample.flac')),['https://localhost/gtlibrary/gtaudio/assets/ab/sample.flac']);
 calls=[];ctx=runtime(async(url,options)=>{calls.push(url);if(url.includes('cdn.jsdelivr'))return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError'))));return new Response('raw');});
 assert.equal(await(await ctx.GTDelivery.fetch(local)).text(),'raw');assert.equal(calls.length,2);
 calls=[];const controller=new AbortController();ctx=runtime(async(url)=>{calls.push(url);controller.abort();throw new DOMException('Aborted','AbortError');});
 await assert.rejects(ctx.GTDelivery.fetch(local,{signal:controller.signal}),{name:'AbortError'});assert.equal(calls.length,1);
 calls=[];await assert.rejects(ctx.GTDelivery.fetch(local,{signal:controller.signal}));assert.equal(calls.length,0);
 ctx=runtime(async()=>new Response('missing',{status:404}));await assert.rejects(ctx.GTDelivery.fetch(local),/Asset HTTP 404/);
 console.log('PASS CDN/raw routing, all excluded folders, direct media URLs, offline localhost, timeout, cancellation and HTTP errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
