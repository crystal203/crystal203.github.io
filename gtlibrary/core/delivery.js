/* Resolve aliases before delivery. Omitted Pages assets use CDN -> GitHub raw. */
(function(global) {
  const root = new URL('../', document.currentScript.src);
  const config = global.GTDeliveryConfig || {};
  const prefixes = config.cdnPrefixes || ['gtatlas/assets/', 'gtasset/assets/', 'gtfx/assets/', 'resources/previews/'];
  const bases = [config.cdnBase, config.rawBase].filter(Boolean).map(value => {
    const base = new URL(value);
    if (base.protocol !== 'https:' || !base.pathname.endsWith('/')) throw new Error('Invalid asset delivery base');
    return base;
  });
  function canonicalURL(value) {
    const url = new URL(value, document.baseURI);
    for (const base of bases) {
      if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
        const local = new URL(url.pathname.slice(base.pathname.length), root);
        local.search = url.search; local.hash = url.hash; return local;
      }
    }
    return url;
  }
  function urls(value) {
    const local = canonicalURL(value);
    if (!bases.length || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return [local.href];
    if (local.origin !== root.origin || !local.pathname.startsWith(root.pathname)) return [local.href];
    const path = local.pathname.slice(root.pathname.length);
    if ((config.cdnLocalPaths || []).includes(path) || !prefixes.some(prefix => path.startsWith(prefix))) return [local.href];
    const remote = bases.map(base => {const url = new URL(path, base); url.search = local.search; url.hash = local.hash; return url.href;});
    // Legacy/custom configurations without rawBase retain their local fallback.
    if (!config.rawBase) remote.push(local.href);
    return [...new Set(remote)];
  }
  async function read(value, options = {}) {
    const canonical = canonicalURL(value);
    if (global.GT_CACHE_VERSION && canonical.origin === root.origin && canonical.pathname.startsWith(root.pathname)) canonical.searchParams.set('gtv', global.GT_CACHE_VERSION);
    if (options.method && options.method.toUpperCase() !== 'GET') return fetch(canonical.href, options);
    const candidates = urls(canonical);
    if (candidates.length === 1) return fetch(candidates[0], options);
    for (let index = 0; index < candidates.length; index++) {
      if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
      const last = index === candidates.length - 1;
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal.reason);
      options.signal?.addEventListener('abort', abort, {once: true});
      const timer = last ? null : setTimeout(() => controller.abort(), config.cdnTimeoutMs || 8000);
      try {
        const response = await fetch(candidates[index], {...options, mode: 'cors', credentials: 'omit', signal: controller.signal});
        if (!response.ok) throw new Error('Asset HTTP ' + response.status);
        // Body transfer is covered by the CDN timeout as well as response headers.
        const body = await response.blob();
        return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
      } catch (error) {
        if (options.signal?.aborted || last) throw error;
      } finally {
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      }
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
  global.GTDelivery = {fetch: read, image, urls, url: value => urls(value)[0]};
})(globalThis);
