/* All asset requests retain a same-origin canonical URL for aliases and fallback. */
(function(global) {
  const root = new URL('../', document.currentScript.src);
  const config = global.GTDeliveryConfig || {};
  const prefixes = config.cdnPrefixes || ['gtatlas/assets/', 'gtasset/assets/', 'gtfx/assets/', 'resources/previews/'];
  let cdnFailed = false;
  function cdnURL(value) {
    const local = new URL(value, document.baseURI);
    if (!config.cdnBase || cdnFailed || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return local.href;
    if (local.origin !== root.origin || !local.pathname.startsWith(root.pathname)) return local.href;
    const path = local.pathname.slice(root.pathname.length);
    if (!prefixes.some(prefix => path.startsWith(prefix))) return local.href;
    let base;
    try{base = new URL(config.cdnBase);}catch{return local.href;}
    if (base.protocol !== 'https:' || !base.pathname.endsWith('/')) return local.href;
    const result = new URL(path, base); result.search = local.search;
    return result.href;
  }
  async function read(value, options = {}) {
    const canonical = new URL(value, document.baseURI);
    if(global.GT_CACHE_VERSION&&canonical.origin===root.origin&&canonical.pathname.startsWith(root.pathname))canonical.searchParams.set('gtv',global.GT_CACHE_VERSION);
    const local = canonical.href, remote = cdnURL(local);
    if (local === remote || (options.method && options.method !== 'GET')) return fetch(local, options);
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(), config.cdnTimeoutMs || 4000);
    try {
      const response = await fetch(remote, {...options, mode: 'cors', credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw new Error('CDN HTTP ' + response.status);
      // Include body transfer in the timeout, not just response headers.
      const body = await response.blob();
      return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
    } catch (error) {
      if (options.signal?.aborted) throw error;
      cdnFailed = true;
      return fetch(local, options);
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
    }
  }
  async function image(value, options) {
    const response = await read(value, options);
    if (!response.ok) throw new Error('图片读取失败：HTTP ' + response.status);
    const objectURL = URL.createObjectURL(await response.blob());
    try {
      const img = new Image(); img.decoding = 'async';
      await new Promise((resolve, reject) => {img.onload = resolve; img.onerror = () => reject(new Error('图片解码失败')); img.src = objectURL;});
      if (img.decode) await img.decode();
      return img;
    } finally { URL.revokeObjectURL(objectURL); }
  }
  global.GTDelivery = {fetch: read, image};
})(globalThis);
