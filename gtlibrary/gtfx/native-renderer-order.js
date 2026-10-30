// Unity TagManager orders layers by array position; IDs are opaque identities.
// Preserve the signed 16-bit sortingOrder within each source sorting layer.
export function nativeRendererOrder(index,renderer={},legacy=renderer.sort||0){
 const layers=index.nativeSortingLayers?.layers;if(!layers)return legacy;
 const base=layers.findIndex(layer=>layer.uniqueID===0),id=renderer.layer??0,rank=layers.findIndex(layer=>(layer.uniqueID>>>0)===(id>>>0));
 if(base<0||rank<0)throw Error('Unresolved native SortingLayerID '+id);
 return (rank-base)*65536+(renderer.sort||0);
}

