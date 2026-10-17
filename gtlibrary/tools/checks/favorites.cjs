const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'core/favorites.js'),'utf8');
const stored=new Map();
function instance(blocked=false){
 const context=vm.createContext({localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return stored.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');stored.set(key,value);}},
 document:{readyState:'loading',addEventListener(){},querySelectorAll(){return [];}},addEventListener(){},dispatchEvent(){},CustomEvent:class{}});
 vm.runInContext(source,context);return context.GTFavorites;
}
let favorites=instance();favorites.set('test','c',true);favorites.set('test','b',true);
assert.deepEqual(Array.from(favorites.order(['a','b','c','d'],id=>['test',id])),['b','c','a','d']);
favorites=instance();assert.equal(favorites.has('test','c'),true);favorites.set('test','c',false);assert.equal(instance().has('test','c'),false);
assert.deepEqual(Array.from(favorites.order(['a','c'],id=>['test',id])),['a','c']);
favorites.set('other','a',true);assert.equal(favorites.has('test','a'),false);
const transient=instance(true);transient.set('blocked','a',true);assert.equal(transient.has('blocked','a'),true);
assert.deepEqual(Array.from(transient.entityKey({fx:{character:'hana',effect:'dash'}})),['fx/effect','dash']);
console.log('PASS persistent favorites, removal, namespace isolation, stable partition and unavailable storage');
if(process.argv.includes('--unit'))process.exit(0);
const {chromium}=require('playwright');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.bytes':'application/octet-stream','.gz':'application/gzip'};
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/gtlibrary\//,'');
 const file=path.resolve(root,relative||'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{errors.push(dialog.message());dialog.dismiss();});
  const base=`http://127.0.0.1:${server.address().port}/gtlibrary/`;
  async function open(route){await page.goto(base+'#'+route);await page.waitForSelector('iframe');await page.locator('#library-search').press('Escape');const frame=await(await page.$('iframe')).contentFrame();await frame.waitForLoadState('domcontentloaded');return frame;}
  let frame=await open('view=spine&folder=character&name=hana');
  await frame.waitForFunction(()=>document.querySelector('#trackAction')?.options.length>1,{},{timeout:60000});
  await frame.locator('#assetSearchBox').fill('knight');await frame.waitForTimeout(150);
  let rows=frame.locator('#assetList .gt-favorite-row');const chosen=rows.nth(2),name=await chosen.locator('.asset-item').getAttribute('data-name');
  const initial=(await page.url());await chosen.locator('.gt-favorite').click();assert.equal(await chosen.locator('.gt-favorite').getAttribute('aria-pressed'),'true');assert.equal(page.url(),initial);
  assert.notEqual(await rows.first().locator('.asset-item').getAttribute('data-name'),name,'bookmarking does not move the row under the pointer');
  await frame.locator('#assetSearchBox').dispatchEvent('input');await frame.waitForTimeout(150);
  assert.equal(await rows.first().locator('.asset-item').getAttribute('data-name'),name);
  await frame.locator('#assetSearchBox').fill('hana');await frame.waitForTimeout(150);assert.equal(await frame.locator(`#assetList [data-name="${name}"]`).count(),0);
  await page.reload();await page.waitForSelector('iframe');frame=await(await page.$('iframe')).contentFrame();await frame.waitForFunction(()=>document.querySelector('#trackAction')?.options.length>1);
  await frame.locator('#assetSearchBox').fill('knight');await frame.waitForTimeout(150);rows=frame.locator('#assetList .gt-favorite-row');assert.equal(await rows.first().locator('.asset-item').getAttribute('data-name'),name);
  await rows.first().locator('.gt-favorite').click();await frame.locator('#assetSearchBox').dispatchEvent('input');await frame.waitForTimeout(150);assert.notEqual(await rows.first().locator('.asset-item').getAttribute('data-name'),name);
  console.log('PASS resource stars, no accidental selection, matching-only promotion, persistence and unfavoriting');

  const actions=await frame.locator('#trackAction option').evaluateAll(options=>options.map(o=>({value:o.value,text:o.text})).filter(o=>o.value));
  const action=actions.at(-1);await frame.locator('#trackAction').selectOption(action.value);
  const star=frame.locator('#trackAction + .gt-favorite');await star.click();assert.equal(await star.getAttribute('aria-pressed'),'true');
  const actionBox=await frame.locator('#trackAction').boundingBox(),starBox=await star.boundingBox();assert.ok(Math.abs(actionBox.y+actionBox.height/2-starBox.y-starBox.height/2)<2);
  await frame.locator('#trackAction').dispatchEvent('pointerdown');
  assert.equal(await frame.locator('#trackAction').inputValue(),action.value);
  assert.equal(await frame.locator('#trackAction option').nth(1).getAttribute('value'),action.value);
  assert.equal(await frame.locator('#trackAction option').nth(1).textContent(),action.text);
  assert.ok((await frame.locator('#trackAction option').nth(1).getAttribute('label')).startsWith('★ '));
  await star.click();await frame.locator('#trackAction').dispatchEvent('pointerdown');
  assert.deepEqual(await frame.locator('#trackAction option').evaluateAll(options=>options.filter(o=>o.value).map(o=>o.value)),actions.map(a=>a.value));
  console.log('PASS select favorites retain values/text and restore the original order on removal');

  await frame.locator('#itemSearch').fill('cwp_knight');await frame.waitForSelector('#itemList .asset-item',{timeout:60000});
  const itemRow=frame.locator('#itemList .gt-favorite-row').nth(2),item=await itemRow.locator('.asset-item').getAttribute('data-name');await itemRow.locator('.gt-favorite').click();
  await frame.locator('#itemSearch').dispatchEvent('input');assert.equal(await frame.locator('#itemList .asset-item').first().getAttribute('data-name'),item);
  await frame.locator('#characterMode').selectOption('scene');await frame.waitForSelector('#sceneActors button');
  assert.equal(await frame.locator('#sceneProp-action + .gt-favorite').count(),1);
  await frame.evaluate(()=>GTFavorites.set('spine/action/character','idle_front',true));
  await frame.locator('#sceneProp-action').selectOption('idle');const sceneStar=frame.locator('#sceneProp-action + .gt-favorite');
  assert.equal(await sceneStar.getAttribute('aria-pressed'),'true');await sceneStar.click();
  assert.equal(await frame.evaluate(()=>GTFavorites.has('spine/action/character','idle_front')||GTFavorites.has('spine/action/character','idle')),false);
  await sceneStar.click();await frame.locator('#sceneProp-action').dispatchEvent('pointerdown');
  assert.equal(await frame.locator('#sceneProp-action option').nth(1).getAttribute('value'),'idle');
  assert.equal(await frame.evaluate(()=>GTFavorites.has('spine/action/character','idle')),true);
  console.log('PASS grouped action favorites recognize and remove legacy direction-specific favorites');
  await frame.locator('#sceneTime').fill('1');await frame.locator('#sceneTime').dispatchEvent('change');await frame.locator('#sceneProp-x').fill('25');await frame.locator('#sceneProp-x').dispatchEvent('change');assert.ok(await frame.locator('.scene-key').count()>0);
  console.log('PASS equipment favorites and dynamic scene controls preserve keyframe editing');

  frame=await open('view=atlas&sheet=items&query=cwp_knight');await frame.waitForSelector('.region-item',{timeout:60000});
  assert.equal(await frame.locator('.region-item .gt-favorite').first().getAttribute('data-favorite-id'),item);
  await frame.locator('#spritesheetSelect').selectOption('0'); // Numeric option values still address the original catalog.
  const sheetId=await frame.locator('#spritesheetSelect').evaluate(select=>select.selectedOptions[0].dataset.favoriteId);
  await frame.locator('#spritesheetSelect + .gt-favorite').click();await frame.locator('#spritesheetSelect').dispatchEvent('pointerdown');assert.equal(await frame.locator('#spritesheetSelect').inputValue(),'0');
  assert.equal(await frame.locator('#spritesheetSelect option').nth(1).getAttribute('data-favorite-id'),sheetId);
  console.log('PASS atlas-region cross-module identity and stable catalog indices');

  frame=await open('view=audio');await frame.waitForSelector('#list .clip',{timeout:60000});
  const audioStar=frame.locator('#list .gt-favorite').nth(3),clip=await audioStar.getAttribute('data-favorite-id');await audioStar.click();await frame.locator('#query').dispatchEvent('input');await frame.waitForTimeout(180);
  assert.equal(await frame.locator('#list .gt-favorite').first().getAttribute('data-favorite-id'),clip);
  console.log('PASS favorites sort before audio pagination');

  frame=await open('view=wiki&hero=hana');await frame.waitForSelector('#hero-list .hero-card',{timeout:60000});
  const heroRow=frame.locator('#hero-list .gt-favorite-row').nth(2),hero=await heroRow.locator('.hero-card').getAttribute('data-hero');await heroRow.locator('.gt-favorite').click();await frame.locator('#hero-search').dispatchEvent('input');await frame.waitForTimeout(200);
  assert.equal(await frame.locator('#hero-list .hero-card').first().getAttribute('data-hero'),hero);
  console.log('PASS hero catalog stars');

  await page.locator('#library-search').fill('hana');await page.waitForSelector('#results .gt-favorite-row');
  const globalRow=page.locator('#results .gt-favorite-row').nth(2),globalKey=await globalRow.locator('.gt-favorite').evaluate(button=>[button.dataset.favoriteScope,button.dataset.favoriteId]);await globalRow.locator('.gt-favorite').click();
  await page.locator('#search-form button').click();assert.deepEqual(await page.locator('#results .gt-favorite').first().evaluate(button=>[button.dataset.favoriteScope,button.dataset.favoriteId]),globalKey);
  console.log('PASS global result favorites outrank ordinary relevance while keeping filters');

  frame=await open('view=fx&character=hana');await frame.waitForFunction(()=>!document.querySelector('#effect').disabled,{},{timeout:60000});
  const effect=await frame.locator('#effect option:not([disabled])').last().getAttribute('value');await frame.locator('#effect').selectOption(effect);await frame.locator('#effect + .gt-favorite').click();await frame.locator('#effect').dispatchEvent('pointerdown');assert.equal(await frame.locator('#effect').inputValue(),effect);
  assert.equal(await frame.locator('#effect option').first().getAttribute('value'),effect);
  console.log('PASS effect favorites preserve source effect IDs');

  frame=await open('view=map&map=short_story_clevatess_test&category=all');await frame.waitForSelector('#maps [data-map]',{timeout:60000});
  const mapRow=frame.locator('#maps .gt-favorite-row').filter({has:frame.locator('[data-map]')}).nth(3),map=await mapRow.locator('[data-map]').getAttribute('data-map');
  await mapRow.locator('.gt-favorite').click();await frame.locator('#search').dispatchEvent('input');assert.equal(await frame.locator('#maps [data-map]').first().getAttribute('data-map'),map);
  await frame.locator('#category').selectOption('categories');await frame.waitForSelector('#maps [data-category]');
  const categoryRow=frame.locator('#maps .gt-favorite-row').filter({has:frame.locator('[data-category]')}).nth(2),category=await categoryRow.locator('[data-category]').getAttribute('data-category');
  await categoryRow.locator('.gt-favorite').click();await frame.locator('#search').dispatchEvent('input');assert.equal(await frame.locator('#maps [data-category]').first().getAttribute('data-category'),category);
  assert.equal(Math.round((await frame.locator('#maps .gt-favorite').first().boundingBox()).width),30);
  const categoryControl=await frame.locator('#category').boundingBox(),categoryStar=await frame.locator('#category + .gt-favorite').boundingBox();
  assert.ok(Math.abs(categoryControl.y+categoryControl.height/2-categoryStar.y-categoryStar.height/2)<2);
  await page.locator('#library-search').press('Escape');
  if(process.env.FAVORITES_SCREENSHOT)await page.screenshot({path:process.env.FAVORITES_SCREENSHOT});
  console.log('PASS map and category favorites, preserving directory navigation');

  frame=await open('view=online');await frame.waitForSelector('#stages .stage-card',{timeout:60000});
  assert.equal(await frame.locator('#stages .gt-favorite-row:visible').count(),1);
  assert.equal(await frame.locator('#stages .stage-card[aria-pressed=true]').getAttribute('data-stage'),'1-1');
  await frame.locator('#stages .gt-favorite-row:visible .gt-favorite').click();
  assert.equal(await frame.locator('#stages .stage-card[aria-pressed=true]').getAttribute('data-stage'),'1-1');
  console.log('PASS online stage selection and hidden stages remain unchanged');

  const other=await context.newPage();await other.goto(base+'#view=audio');await other.waitForSelector('iframe');
  await page.evaluate(()=>GTFavorites.set('audio/clip','cross-tab-check',true));await other.waitForFunction(()=>GTFavorites.has('audio/clip','cross-tab-check'));
  await other.close();assert.deepEqual(errors,[]);
  console.log('PASS cross-page synchronization; no browser errors');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
