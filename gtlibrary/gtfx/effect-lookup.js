// ObjectPoolSpec can give several presets the same prefab AssetName.
// Resolve the exact pool preset before considering that prefab-name alias.
export function effectLookup(effects){
 const available=effects.filter(effect=>!effect.unavailable);
 const lookup=new Map(available.filter(effect=>effect.assetName).map(effect=>[effect.assetName,effect]));
 for(const effect of available)lookup.set(effect.preset,effect);
 return lookup;
}
