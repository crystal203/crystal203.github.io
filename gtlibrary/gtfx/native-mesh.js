// Mesh emission reconstructed from GetPositionMesh in the Android player.
// Vertex: e44ee4, edge: e45374; cached triangle areas are built before scaling.
const f=Math.fround,cache=new WeakMap();
const clamp=x=>Math.max(0,Math.min(1,x));
export function nativeMeshTable(mesh,shape){
 let byMaterial=cache.get(mesh);if(!byMaterial)cache.set(mesh,byMaterial=new Map());
 const material=shape.m_UseMeshMaterialIndex?shape.m_MeshMaterialIndex:-1;
 if(byMaterial.has(material))return byMaterial.get(material);
 const triangles=[],pos=mesh.position,indices=mesh.indices||[];
 let total=0;
 for(let i=0;i<indices.length;i+=3){
  if(material>=0&&!mesh.groups?.some(g=>g.material===material&&i>=g.start&&i<g.start+g.count))continue;
  const ids=indices.slice(i,i+3),a=ids.map(id=>pos.slice(id*3,id*3+3));
  const u=a[1].map((n,j)=>f(n-a[0][j])),v=a[2].map((n,j)=>f(n-a[0][j]));
  const cross=[f(f(u[1]*v[2])-f(u[2]*v[1])),f(f(u[2]*v[0])-f(u[0]*v[2])),f(f(u[0]*v[1])-f(u[1]*v[0]))];
  const area=f(f(Math.sqrt(f(f(f(cross[1]*cross[1])+f(cross[0]*cross[0]))+f(cross[2]*cross[2]))))*.5);
  triangles.push({ids,area});total=f(total+area);
 }
 const accelerators=[],count=Math.min(50,triangles.length),step=f(total/count);let cumulative=0,triangle=0;
 for(let i=0;i<count;i++){
  const boundary=f(i*step);
  while(triangle<triangles.length&&f(cumulative+triangles[triangle].area)<=boundary){cumulative=f(cumulative+triangles[triangle++].area);}
  accelerators.push({cumulative,triangle});
 }
 const table={triangles,total,accelerators};byMaterial.set(material,table);return table;
}
function edgePick(table,r){
 const count=table.accelerators.length,scaled=f(r*count),nearest=f(f(scaled+8388608)-8388608);
 let {cumulative,triangle}=table.accelerators[Math.min(count-1,nearest)],target=f(r*table.total),t=0;
 if(cumulative>target){
  while(--triangle>=0){const area=table.triangles[triangle].area;cumulative=f(cumulative-area);if(cumulative<target){t=f(1+f(f(target-f(area+cumulative))/area));break;}}
 }else{
  while(triangle<table.triangles.length){const area=table.triangles[triangle].area;cumulative=f(cumulative+area);if(cumulative>=target){t=f(f(target-f(cumulative-area))/area);break;}triangle++;}
 }
 return {triangle:Math.max(0,Math.min(table.triangles.length-1,triangle)),t};
}
export function nativeMeshBatch(shape,mesh,rng){
 const table=nativeMeshTable(mesh,shape);if(!table.triangles.length)return null;
 let picks;
 if(shape.placementMode===0){const triangles=rng.nextUint4(),vertices=rng.nextUint4();picks=triangles.map((n,i)=>({triangle:n%table.triangles.length,vertex:vertices[i]%3}));}
 else if(shape.placementMode===1){picks=rng.nextFloat4().map(r=>edgePick(table,r));}
 else return null;
 return picks.map(p=>{
  const ids=table.triangles[p.triangle].ids;
  let weights;
  if(p.vertex!=null)weights=ids.map((_,i)=>Number(i===p.vertex));
  else {const t=f(p.t*3),a=clamp(t),b=clamp(f(t-1)),c=clamp(f(t-2));weights=[f(c+clamp(f(1-t))),f(a-b),f(b-c)];}
  const sample=(array,stride,fallback)=>Array.from({length:stride},(_,k)=>array?.length?f(f(f(weights[0]*array[ids[0]*stride+k])+f(weights[1]*array[ids[1]*stride+k]))+f(weights[2]*array[ids[2]*stride+k])):fallback[k]);
  const direction=sample(mesh.normal,3,[0,0,1]),position=sample(mesh.position,3,[0,0,0]).map((n,i)=>f(n+f(direction[i]*(shape.m_MeshNormalOffset||0))));
  return {position,direction,...(shape.m_UseMeshColors&&mesh.color?.length?{color:sample(mesh.color,4,[1,1,1,1])}:{}),selection:p};
 });
}
