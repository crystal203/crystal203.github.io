/** Stage modules are lazy. Neither GTMap nor the gameplay engine knows their IDs. */
const modules={inn:()=>import('./inn.js'),forestEntrance:()=>import('./forest-entrance.js')};
const catalogURL=new URL('../assets/catalog.json',import.meta.url);
const read=async url=>{const r=await GTResources.fetch(url);if(!r.ok)throw Error('关卡读取失败：'+r.status);return r.json();};
export async function loadStageCatalog(){const catalog=await read(catalogURL);return catalog.stages;}
export async function loadStage(entry){
 if(!modules[entry.module])throw Error('未注册的关卡模块：'+entry.module);
 const [stage,module,colliders]=await Promise.all([read(new URL(entry.file,catalogURL)),modules[entry.module](),read(new URL('native-gimmick-colliders.json',catalogURL))]);
 if(stage.id!==entry.id||stage.map!==entry.map)throw Error('关卡目录与数据不一致：'+entry.id);
 stage.nativePrefabs=entry.nativePrefabs||[];
 for(const o of stage.objects){if(o.nativeBounds)continue;const b=colliders.templates[o.name];if(!b)continue;const a=o.rotation*Math.PI/2,c=Math.cos(a),s=Math.sin(a),x=b.center[0]*c+b.center[1]*s,z=b.center[1]*c-b.center[0]*s,ex=(Math.abs(c)*b.size[0]+Math.abs(s)*b.size[1])/2,ez=(Math.abs(s)*b.size[0]+Math.abs(c)*b.size[1])/2;o.nativeBounds=[x-ex,b.minY,z-ez,x+ex,b.maxY,z+ez];}
 const counts=kind=>stage.objects.filter(o=>o.kind===kind).length;
 stage.totals??={coins:counts('coin'),stars:counts('star'),chests:stage.objects.filter(o=>['Oak.TreasureBehaviour','Oak.FloatingItemBehaviour'].includes(o.spec?.FieldObjectBehaviour?.__class__)).length};
 return {stage,Game:module.Game,preview:entry.preview===true};
}
