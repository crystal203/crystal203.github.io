/* Bulk assets are omitted from Pages, but retained in Git.
 * Push asset changes FIRST, then pin BOTH bases to that public commit.
 * Keep cdnPrefixes in sync with the root _config.yml exclusions.
 * Localhost still reads local files for offline development. */
globalThis.GTDeliveryConfig = {
  cdnBase: 'https://cdn.jsdelivr.net/gh/crystal203/crystal203.github.io@223f8556e4597fd317ac731194e3cd612d18be85/gtlibrary/',
  rawBase: 'https://raw.githubusercontent.com/crystal203/crystal203.github.io/223f8556e4597fd317ac731194e3cd612d18be85/gtlibrary/',
  cdnPrefixes: ["gtatlas/assets/","gtasset/assets/","gtfx/assets/","gtaudio/assets/","gtmap/assets/packs/","gtmap/assets/textures/","resources/spine-expansion/","resources/illust-jp/"],
  cdnLocalPaths: [],
  cdnTimeoutMs: 8000
};
