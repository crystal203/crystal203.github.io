/* Runtime-only caching: no multi-gigabyte precache or application-wide scope. */
importScripts('./core/cache-version.js', './core/delivery-config.js');
const root = new URL('./', self.location.href);
const prefix = 'gtlibrary:' + root.pathname + ':';
const cacheName = prefix + self.GT_CACHE_VERSION;
const MAX_BYTES = 128 * 1024 * 1024, MAX_ENTRIES = 256, MAX_FILE_BYTES = 20 * 1024 * 1024;
let writes = Promise.resolve();
let inventory;
function cacheable(request) {
  if (request.method !== 'GET' || request.headers.has('range') || request.headers.has('authorization')) return false;
  const url = new URL(request.url);
  let path;
  if (url.origin === root.origin && url.pathname.startsWith(root.pathname)) path = url.pathname.slice(root.pathname.length);
  else if (self.GTDeliveryConfig.cdnBase && url.href.startsWith(self.GTDeliveryConfig.cdnBase)) path = url.href.slice(self.GTDeliveryConfig.cdnBase.length).split('?')[0];
  else return false;
  return /^(?:vendor\/|gtatlas\/assets\/|gtasset\/assets\/|gtfx\/assets\/|gtmap\/assets\/|resources\/(?:previews|illust-jp|spine-recovered)\/)/.test(path) || ['resources/registry.js','resources/search-index.json','resources/atlas-catalog.json'].includes(path);
}
async function save(cache, request, response) {
  if (!response.ok || response.type === 'opaque') return;
  const blob = await response.blob();
  if (blob.size > MAX_FILE_BYTES) return;
  const headers = new Headers(response.headers); headers.set('x-gt-cache-size', String(blob.size));
  if(!inventory){
    inventory = new Map();
    for(const key of await cache.keys()){
      const item=await cache.match(key);inventory.set(key.url,Number(item.headers.get('x-gt-cache-size'))||0);
    }
  }
  inventory.delete(request.url);
  let total=blob.size+[...inventory.values()].reduce((a,b)=>a+b,0);
  for (const [url,size] of inventory) {
    if (total <= MAX_BYTES && inventory.size < MAX_ENTRIES) break;
    await cache.delete(url); inventory.delete(url); total -= size;
  }
  try { await cache.put(request, new Response(blob, {status: response.status, statusText: response.statusText, headers}));inventory.set(request.url,blob.size); }
  catch { /* Quota/private-mode failures must never break a preview. */ }
}
async function read(request, event) {
  let cache;
  try {
    cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch { return fetch(request); }
  // A new content version must not import an old HTTP-cache entry.
  const response = await fetch(new Request(request, {cache: 'reload'}));
  const copy = response.clone();
  writes = writes.catch(() => {}).then(() => save(cache, request, copy));
  event.waitUntil(writes.catch(() => {}));
  return response;
}
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
  await self.clients.claim();
})()));
// A new worker waits for old tabs to close, so running previews retain their version.
self.addEventListener('fetch', event => {if (cacheable(event.request)) event.respondWith(read(event.request, event));});
