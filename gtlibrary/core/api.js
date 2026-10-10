/** Load one decoding/rendering capability without loading any viewer or game assets. */
export async function loadCore(kind) {
  if(kind==='atlas'){await import('../gtatlas/core.js');return globalThis.GTAtlasCore;}
  if(kind==='spine'){await import('../gtasset/core.js');return globalThis.GTSpineCore;}
  if(kind==='map')return await import('../gtmap/core.js');
  if(kind==='fx')return await import('../gtfx/core.js');
  throw new RangeError('Unknown resource capability: '+kind);
}
