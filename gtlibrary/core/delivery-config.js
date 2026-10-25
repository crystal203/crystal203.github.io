/* Existing assets are pinned to a verified public Git commit on jsDelivr.
 * New local previews stay on Pages until published. Never use @main/@latest.
 * When assets change, update this commit after pushing them, or set cdnBase: ''.
 * A custom CDN can mirror the same directory and include resources/previews/. */
globalThis.GTDeliveryConfig = {
  cdnBase: 'https://cdn.jsdelivr.net/gh/crystal203/crystal203.github.io@23234bbfe68b6185123875f2078d4ee8a167de7f/gtlibrary/',
  cdnPrefixes: ['gtatlas/assets/', 'gtasset/assets/', 'gtfx/assets/'],
  // These files were added/updated after the pinned resource snapshot.
  cdnLocalPaths: ["gtasset/assets/illust/assets.js", "gtasset/assets/illust/names.zh.json", "gtasset/assets/illust/xiaogongzhu.atlas", "gtasset/assets/illust/xiaogongzhu.bytes", "gtasset/assets/illust/xiaogongzhu.png"],
  cdnTimeoutMs: 4000
};
