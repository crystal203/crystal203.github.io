// Preserve per-pass culling, color inputs and draw order. A double-sided
// one-pass shader changes translucent front/back ordering on overlapping meshes.
export function expandNativeMaterialPasses(source,geometry){
 if(!source.some(m=>m.nativePasses?.length))return {defs:source,geometry};
 const defs=[],indices=[];
 for(const [sourceMaterialIndex,mat] of source.entries()){
  const passes=mat.nativePasses?.length?mat.nativePasses:[{}];indices.push([]);
  for(const pass of passes){indices.at(-1).push(defs.length);defs.push({...mat,...pass,nativePasses:undefined,sourceMaterialIndex});}
 }
 const result=geometry.clone(),groups=geometry.groups.length?geometry.groups:[{start:0,count:geometry.index?.count||geometry.attributes.position.count,materialIndex:0}];
 result.clearGroups();
 for(const group of groups)for(const index of indices[Math.min(group.materialIndex,indices.length-1)])result.addGroup(group.start,group.count,index);
 return {defs,geometry:result,owned:true};
}
