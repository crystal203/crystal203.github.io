/* Existing assets are pinned to a verified public Git commit on jsDelivr.
 * New local previews stay on Pages until published. Never use @main/@latest.
 * When assets change, update this commit after pushing them, or set cdnBase: ''.
 * A custom CDN can mirror the same directory and include resources/previews/. */
globalThis.GTDeliveryConfig = {
  cdnBase: 'https://cdn.jsdelivr.net/gh/crystal203/crystal203.github.io@23234bbfe68b6185123875f2078d4ee8a167de7f/gtlibrary/',
  cdnPrefixes: ['gtatlas/assets/', 'gtasset/assets/', 'gtfx/assets/'],
  cdnTimeoutMs: 4000
};
