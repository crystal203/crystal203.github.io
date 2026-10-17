import {loadCore} from '../core/api.js';
import {decodeMap} from './decoder.js';
/** Load a native map for any client, using the same resources as GTMap. */
export async function loadMapRuntime(host,name,{signal,onProgress=()=>{},nativePrefabs=[]}={}){
 const base=new URL('../resources/map/',import.meta.url),url=p=>new URL(p,base);
 const json=async p=>{const r=await GTResources.fetch(url(p),{signal});if(!r.ok)throw Error('资源读取失败：'+p+' ('+r.status+')');return p.endsWith('.gz')?new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json():r.json();};
 let runtime;
 try{
 onProgress('正在读取关卡地图…');
 const [core,catalog,animators,effectManifest,stateManifest,vertexFormats,sorting,itemMetadata]=await Promise.all([loadCore('map'),GTMapCatalog.load(),json('native-animations.json'),json('native-effects.json'),json('native-states.json'),json('vertex-formats.json'),json('sorting-layers.json'),json('item-metadata.json.gz')]);
 const item=catalog.maps.find(m=>m.id===name);if(!item)throw Error('地图未收录：'+name);
 const response=await GTResources.fetch(url(item.file),{signal});if(!response.ok)throw Error('地图读取失败：'+response.status);
 const doc=await decodeMap(await response.arrayBuffer(),name);if(doc.sha256!==item.sha256)throw Error('地图校验失败');
 const [pack,pickups]=await Promise.all([json(item.pack),json(stateManifest.sets.__pickup_star_piece)]),effects={},states={};
 await Promise.all(doc.tilesets.flatMap(set=>[[effectManifest,effects],[stateManifest,states]].map(async([manifest,target])=>{if(manifest.sets[set.name])target[set.name]=await json(manifest.sets[set.name]);})));
 const gameplayEffects={};
 if(!Array.isArray(nativePrefabs)||nativePrefabs.length>64||nativePrefabs.some(key=>typeof key!=='string'||!Object.hasOwn(stateManifest.sets,key)))throw Error('原生 prefab 清单无效');
 await Promise.all([...new Set(nativePrefabs)].map(async key=>{const assets=await json(stateManifest.sets[key]);for(const [name,spec] of Object.entries(assets.templates)){if(gameplayEffects[name])throw Error('原生 prefab 名称冲突：'+name);gameplayEffects[name]={spec,assets:{...assets,sortingLayers:sorting.layers}};}}));
 signal?.throwIfAborted();onProgress('正在加载原生贴图与模型…');runtime=new core.MapRuntime(host);
 const assets=core.assetsForMap({...pack,itemMetadata,vertexFormats,sortingLayers:sorting.layers,environment:{...pack.environment,pickups,animators,effects,states,gameplayEffects}},doc);
 for(const {assets:extra} of Object.values(gameplayEffects)){Object.assign(assets.textures,extra.textures);Object.assign(assets.materials,extra.materials);}
 await runtime.loadAssets(assets,p=>GTResources.image(url(p),{signal}));
 signal?.throwIfAborted();await runtime.build(doc,{loadCharacters:false});runtime.setGameplayMode(true);runtime.setEvents(false);runtime.setSelectionOutline(false);runtime.events.mapName=name;return {runtime,doc};
 }catch(e){runtime?.dispose();throw e;}
}
