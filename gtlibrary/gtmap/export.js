import * as THREE from '../vendor/three.module.js';
import {checkCancelled,yieldTask,zipFiles,utf8,canvasPng} from '../core/export-utils.js';
function retainProgram(ctx,material){const key=material.vertexShader+'\0'+material.fragmentShader+'\0'+JSON.stringify(material.defines);if(ctx.programKeepalive.has(key))material.dispose();else ctx.programKeepalive.set(key,material);}
function copyMaterial(source){const uniforms=Object.fromEntries(Object.entries(source.uniforms).map(([k,u])=>{const v=u.value;return [k,{value:v?.isTexture?v:v?.clone?v.clone():ArrayBuffer.isView(v)?v.slice():Array.isArray(v)?v.slice():v}];}));return new source.constructor({uniforms,vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,defines:{...source.defines},glslVersion:source.glslVersion,vertexColors:source.vertexColors,toneMapped:source.toneMapped,side:source.side,transparent:source.transparent,blending:source.blending,blendSrc:source.blendSrc,blendDst:source.blendDst,depthTest:source.depthTest,depthWrite:source.depthWrite});}

// Bake the actual preview shader into a unique triangle atlas. Keep original
// shader inputs; only its final clip position is replaced by atlas coordinates.
// This also captures MatCap, two-texture masks, UV animation and vertex tint.
async function bake(ctx,mesh,index,{quality,signal,time}){
 const original=mesh.geometry,triangles=(original.index?.count||original.attributes.position.count)/3;
 const columns=Math.ceil(Math.sqrt(triangles)),cell=Math.max(4,Math.min(quality,Math.floor(2048/columns))),size=columns*cell;
 const g=original.index?original.toNonIndexed():original.clone(),count=g.attributes.position.count;
 ctx.bakeGeometries.add(g);
 const uv=new Float32Array(count*2),pad=Math.min(2,cell*.2);
 for(let t=0;t<triangles;t++){const x=t%columns*cell,y=Math.floor(t/columns)*cell;uv.set([(x+pad)/size,(y+pad)/size,(x+cell-pad)/size,(y+pad)/size,(x+pad)/size,(y+cell-pad)/size],t*6);}
 g.setAttribute('gtBakeUv',new THREE.BufferAttribute(uv,2));
 // Particle attributes are one value per instance, not per triangle vertex.
 for(const [key,a] of Object.entries(original.attributes))if(a.isInstancedBufferAttribute){const values=new Float32Array(a.itemSize);for(let k=0;k<a.itemSize;k++)values[k]=a.array[index*a.itemSize+k];g.setAttribute(key,new THREE.InstancedBufferAttribute(values,a.itemSize));}
 const material=copyMaterial(mesh.material);material.userData={...mesh.material.userData};
 material.vertexShader=(material.isRawShaderMaterial?'in':'attribute')+' vec2 gtBakeUv;\n'+material.vertexShader.replace(/void main\s*\(\s*\)/g,'void gtBakeOriginalMain()')+'\nvoid main(){gtBakeOriginalMain();gl_Position=vec4(gtBakeUv*2.0-1.0,0.0,1.0);}\n';
 // Bake straight fragment colour instead of blending it over a background.
 material.side=THREE.DoubleSide;material.depthTest=material.depthWrite=false;material.blending=THREE.NoBlending;material.transparent=false;
 const updateUniforms=mat=>(renderer,scene,camera)=>{mesh.material.onBeforeRender?.(renderer,scene,camera);for(const [k,u] of Object.entries(mesh.material.uniforms))if(mat.uniforms[k])mat.uniforms[k].value=u.value;if(mat.uniforms.particleTime)mat.uniforms.particleTime.value=time;for(const [key,values] of [['_Time',[time/20,time,time*2,time*3]],['_SinTime',[Math.sin(time/8),Math.sin(time/4),Math.sin(time/2),Math.sin(time)]],['_CosTime',[Math.cos(time/8),Math.cos(time/4),Math.cos(time/2),Math.cos(time)]]])mat.uniforms[key]?.value.set(...values);};
 material.onBeforeRender=updateUniforms(material);
 const single=new THREE.InstancedMesh(g,material,1),matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);single.setMatrixAt(0,matrix);single.matrixAutoUpdate=false;single.matrix.copy(mesh.matrixWorld);single.frustumCulled=false;
 const scene=new THREE.Scene();scene.add(single);const renderer=ctx.renderer,target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:false});
 const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha();
 let rgba,shaderPositions=null;
 try{checkCancelled(signal);renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,ctx.camera);rgba=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,rgba);if(renderer.info.programs.some(p=>p.diagnostics?.runnable===false))throw new Error('原始材质烘焙失败：'+mesh.userData.sourceMaterial);
  // A second pass evaluates actual shader-deformed vertices (shear, billboard,
  // displacement). Each point writes one local-space XYZ into a float pixel.
  if(renderer.extensions.has('EXT_color_buffer_float')){
   const edge=Math.ceil(Math.sqrt(count)),pg=g.clone(),coord=new Float32Array(count*2),matrices=new Float32Array(count*16);
   for(let i=0;i<count;i++){coord.set([(i%edge+.5)/edge,(Math.floor(i/edge)+.5)/edge],i*2);matrices.set(matrix.elements,i*16);}
   pg.setAttribute('gtExportCoord',new THREE.BufferAttribute(coord,2));pg.setAttribute('instanceMatrix',new THREE.BufferAttribute(matrices,16));
   for(const [key,a] of Object.entries(pg.attributes))if(a.isInstancedBufferAttribute){const data=new Float32Array(count*a.itemSize);for(let i=0;i<count;i++)data.set(a.array.subarray(0,a.itemSize),i*a.itemSize);pg.setAttribute(key,new THREE.BufferAttribute(data,a.itemSize));}
   const pm=copyMaterial(material);pm.uniforms.gtExportInvVP={value:new THREE.Matrix4().multiplyMatrices(ctx.camera.projectionMatrix,ctx.camera.matrixWorldInverse).invert()};pm.uniforms.gtExportInvModel={value:new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,matrix).invert()};
   const raw=pm.isRawShaderMaterial;if(!raw)pm.defines={...pm.defines,USE_INSTANCING:''};
   pm.vertexShader='uniform mat4 gtExportInvVP;uniform mat4 gtExportInvModel;'+(raw?'in':'attribute')+' vec2 gtExportCoord;'+(raw?'out highp':'varying')+' vec4 gtExportPosition;\n'+mesh.material.vertexShader.replace(/void main\s*\(\s*\)/g,'void gtExportOriginalMain()')+'\nvoid main(){gtExportOriginalMain();vec4 p=gtExportInvModel*gtExportInvVP*gl_Position;gtExportPosition=vec4(p.xyz/p.w,1.0);gl_Position=vec4(gtExportCoord*2.0-1.0,0.0,1.0);gl_PointSize=1.0;}';
   pm.fragmentShader=raw?'precision highp float;in highp vec4 gtExportPosition;out highp vec4 gtExportOutput;void main(){gtExportOutput=gtExportPosition;}':'varying vec4 gtExportPosition;void main(){gl_FragColor=gtExportPosition;}';pm.onBeforeRender=updateUniforms(pm);
   const points=new THREE.Points(pg,pm);points.matrixAutoUpdate=false;points.matrix.copy(mesh.matrixWorld);points.frustumCulled=false;const ps=new THREE.Scene();ps.add(points);const pt=new THREE.WebGLRenderTarget(edge,edge,{type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
   try{renderer.setRenderTarget(pt);renderer.clear();renderer.render(ps,ctx.camera);shaderPositions=new Float32Array(edge*edge*4);renderer.readRenderTargetPixels(pt,0,0,edge,edge,shaderPositions);if(shaderPositions.subarray(0,count*4).some(v=>!Number.isFinite(v)))throw new Error('着色器顶点烘焙产生无效坐标');}
   finally{pt.dispose();pg.dispose();retainProgram(ctx,pm);}
  }
 }
 finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);target.dispose();single.dispose();retainProgram(ctx,material);}
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const pixels=new Uint8ClampedArray(rgba.length);
 // ONE + ONE emitters can have zero source alpha while still contributing RGB.
 // Encode that contribution into an RGBA texture usable by unlit glTF and by
 // the Blender additive setup (texture RGB multiplied by texture alpha).
 if(mesh.material.blendDst===THREE.OneFactor&&mesh.material.blendSrc===THREE.OneFactor)for(let i=0;i<rgba.length;i+=4){const a=Math.max(rgba[i],rgba[i+1],rgba[i+2]);rgba[i+3]=a;if(a)for(let k=0;k<3;k++)rgba[i+k]=Math.round(rgba[i+k]*255/a);}
 // Extrude each triangle's edge into its own cell's gutter. Without this,
 // bilinear filtering samples the cleared pixels and draws black seams.
 for(let t=0;t<triangles;t++){
  const ox=t%columns*cell,oy=Math.floor(t/columns)*cell,lo=Math.ceil(pad),hi=cell-lo-1,limit=cell-2;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
   if(x+.5>=pad&&y+.5>=pad&&x+y+1<=cell)continue;
   let sx=Math.max(lo,Math.min(hi,x)),sy=Math.max(lo,Math.min(hi,y));
   if(sx+sy>limit){const excess=sx+sy-limit;sx=Math.max(lo,Math.min(hi,Math.floor(sx-excess/2)));sy=Math.max(lo,Math.min(hi,limit-sx));}
   const a=((oy+sy)*size+ox+sx)*4,b=((oy+y)*size+ox+x)*4;
   for(let k=0;k<4;k++)rgba[b+k]=rgba[a+k];
  }
 }
 for(let y=0;y<size;y++)pixels.set(rgba.subarray(y*size*4,(y+1)*size*4),(size-1-y)*size*4);
 const png=new Uint8Array(await (await canvasPngFromPixels(canvas,pixels)).arrayBuffer());canvas.width=canvas.height=1;
 // Native effect geometry uses unreflected local vertices; the shader reflects Z.
 if(shaderPositions){const p=g.attributes.position;for(let i=0;i<count;i++){if(shaderPositions[i*4+3]===0)throw new Error('无法读取着色器顶点');p.setXYZ(i,...shaderPositions.subarray(i*4,i*4+3));}}
 if(ctx.reflectedMeshes.has(mesh)){const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<count;i++){if(!shaderPositions)p.setZ(i,-p.getZ(i));if(n)n.setZ(i,-n.getZ(i));}for(const a of Object.values(g.attributes))if(!a.isInstancedBufferAttribute)for(let i=0;i<count;i+=3){for(let k=0;k<a.itemSize;k++){const start=(i+1)*a.itemSize+k,end=(i+2)*a.itemSize+k;[a.array[start],a.array[end]]=[a.array[end],a.array[start]];}}}
 // Swap atlas corners in lockstep with reflected triangle winding.
 g.setAttribute('uv',g.attributes.gtBakeUv);if(!g.attributes.normal)g.computeVertexNormals();
 return {geometry:g,png,size,vertexBaked:!!shaderPositions};
}
async function canvasPngFromPixels(canvas,pixels){canvas.getContext('2d').putImageData(new ImageData(pixels,canvas.width,canvas.height),0,0);return canvasPng(canvas);}
const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'map';
const identity=()=>new THREE.Matrix4();
function visible(o){for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;}

/** Export only loaded preview data; no catalog, filesystem or backend needed. */
export async function exportMap(ctx,{format='glb',selectionOnly=false,effects=true,quality=32,signal,onProgress=()=>{},time=ctx.time}={}){
 checkCancelled(signal);
 if(!['glb','obj','blender'].includes(format))throw new Error('未知模型导出格式');
 if(!Number.isFinite(time)||time<0||!Number.isInteger(quality)||quality<8||quality>128)throw new Error('无效的模型导出参数');
 ctx.programKeepalive=new Map();ctx.bakeGeometries=new Set();const selected=ctx.selectedIds;if(selectionOnly&&!selected.size)throw new Error('请先选择要导出的图块');
 ctx.group.updateMatrixWorld(true);const objects=[];
 ctx.group.traverse(o=>{if(o.isInstancedMesh&&visible(o)&&(!ctx.effectMeshes.has(o)||effects))objects.push(o);});
 const variants=new Map(),instances=[],matrix=new THREE.Matrix4();let skipped=0,work=0;
 const warnings=[];let total=objects.reduce((n,o)=>n+o.count,0),bakedBytes=0;
 try{
  for(const object of objects){
   if(!object.material.isShaderMaterial){warnings.push('未烘焙材质：'+object.material.userData.source);skipped+=object.count;continue;}
   for(let i=0;i<object.count;i++){
    if((++work)%128===0){checkCancelled(signal);onProgress(Math.min(.85,work/Math.max(total,1)*.85),'正在烘焙材质与整理网格');await yieldTask();}
    const tile=object.userData.tiles?.[i];if(!tile||(selectionOnly&&!selected.has(tile.id)))continue;
    object.getMatrixAt(i,matrix);if(Math.abs(matrix.determinant())<1e-12)continue;
    const rotation=matrix.clone();rotation.setPosition(0,0,0);
    // Camera-dependent shading can differ with placement orientation. Translation
    // is excluded so thousands of copies share the same baked mesh/texture.
    const parameters=Object.entries(object.geometry.attributes).filter(([,a])=>a.isInstancedBufferAttribute).map(([key,a])=>[key,Array.from(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize))]);
    const key=JSON.stringify([object.geometry.uuid,object.material.uuid,rotation.elements.map(v=>Math.round(v*10000)/10000),parameters]);
    if(!variants.has(key)){
     checkCancelled(signal);const result=await bake(ctx,object,i,{quality,signal,time});
     bakedBytes+=result.png.length;if(bakedBytes>512*1024*1024)throw new Error('烘焙贴图超过 512 MiB，请关闭特效快照、降低精度或只导出选中部分');
     const additive=object.material.blendDst===THREE.OneFactor;
     variants.set(key,{...result,id:variants.size,name:safe(object.userData.sourceMaterial)+'_'+variants.size,transparent:object.material.transparent,additive,doubleSided:object.material.side===THREE.DoubleSide,shader:object.userData.sourceShader,order:object.renderOrder});
     if(variants.size%4===0){onProgress(Math.min(.85,work/Math.max(total,1)*.85),`已烘焙 ${variants.size} 种材质`);await yieldTask();}
    }
    const variant=variants.get(key),transform=matrix.clone().premultiply(object.matrixWorld);
    instances.push({variant:variant.id,matrix:transform.toArray(),tile:{id:tile.id,name:tile.name,layer:tile.layer},effect:ctx.effectMeshes.has(object)});
   }
  }
  checkCancelled(signal);if(!instances.length)throw new Error('当前范围没有可导出的可见网格');
  const list=[...variants.values()],metadata={format:'GTMapExport',version:1,map:ctx.map.mapName||ctx.map.id||ctx.map.name,time,view:ctx.state,units:'one tile = one metre; Y up (GLB), Z up (OBJ)',scope:selectionOnly?'selection':'visible',effects:effects?'static snapshot':'excluded',instances:instances.length,meshes:list.length,vertexBakedMeshes:list.filter(v=>v.vertexBaked).length,skipped,warnings:[...new Set(warnings)],limitations:['Unity 脚本、物理、事件、骨骼人物与粒子时间线未导出','材质按当前视角与快照时间烘焙；改变视角后 MatCap 不再随视角变化','加法混合在 GLB/OBJ 中近似为透明贴图，Blender 套件可恢复加法表面','灯光与遮挡沿用预览已有效果；不额外生成游戏未提供的动态光照']};
  const name=safe(ctx.map.mapName||ctx.map.id||ctx.map.name),files={};
  onProgress(.87,'正在打包模型');await yieldTask();checkCancelled(signal);
  const blob=format==='obj'?await obj(list,instances,files,name,signal,onProgress):glb(list,instances,ctx,name,metadata,signal);
  if(format==='glb'){onProgress(1,'导出完成');return {blob,name:name+'.glb',metadata};}
  if(format==='blender'){files[name+'.glb']=new Uint8Array(await blob.arrayBuffer());files['blender_setup.py']=utf8(blenderScript(name));files['README.txt']=utf8('首选直接导入 '+name+'.glb。\n更接近网页的效果：解压整个目录，在 Blender 的 Scripting 工作区打开并运行 blender_setup.py。脚本会导入 GLB，恢复加法材质、设定相机与色彩管理；请在空场景运行以免重复导入。\nsource-textures/ 保留当前地图加载的源贴图，名称对应 source-materials.json 的材质纹理键。\n这是静态快照，Unity 游戏脚本和粒子时间线不会在 Blender 运行。详见 export.json。');
   let copied=0;const sourceTextures={};for(const [key,texture] of ctx.textures){checkCancelled(signal);const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);const path='source-textures/'+String(copied).padStart(4,'0')+'_'+safe(key)+'.png';files[path]=new Uint8Array(await (await canvasPng(canvas)).arrayBuffer());sourceTextures[key]={...ctx.bundle.textures[key],file:path};canvas.width=canvas.height=1;if(++copied%4===0){onProgress(.95,'正在打包源贴图 '+copied+'/'+ctx.textures.size);await yieldTask();}}
   files['source-textures.json']=utf8(JSON.stringify(sourceTextures,null,2));
   files['source-geometry.json']=utf8(JSON.stringify({coordinates:'Original Unity mesh coordinates; template matrices row-major. GLB is the converted preview.',templates:ctx.bundle.templates,meshes:ctx.bundle.meshes,vertexFormats:ctx.bundle.vertexFormats},null,2));
   files['source-map.json']=utf8(JSON.stringify(ctx.map,(k,v)=>typeof v==='bigint'?v.toString():k==='raw'&&ArrayBuffer.isView(v)?Array.from(v):v,null,2));
  }
  files['export.json']=utf8(JSON.stringify(metadata,null,2));
  files['source-materials.json']=utf8(JSON.stringify(ctx.bundle.materials,null,2));
  files['source-effects.json']=utf8(JSON.stringify(Object.fromEntries(Object.entries(ctx.bundle.environment.effects||{}).map(([k,v])=>[k,v.spec])),null,2));
  if(Object.values(files).reduce((n,v)=>n+v.byteLength,0)>1024*1024*1024)throw new Error('导出套件超过 1 GiB，请缩小范围或改用 GLB');
  const packed=await zipFiles(files,signal);onProgress(1,'导出完成');return {blob:packed,name:name+'_'+format+'.zip',metadata};
 }finally{for(const g of ctx.bakeGeometries)g.dispose();for(const m of ctx.programKeepalive.values())m.dispose();}
}

function glb(variants,instances,ctx,name,metadata,signal){
 const doc={asset:{version:'2.0',generator:'GTLibrary native shader bake'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{nodes:[0]}],nodes:[{name,children:[],extras:metadata}],meshes:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}],accessors:[],bufferViews:[],buffers:[{byteLength:0}],cameras:[]};
 const chunks=[];let length=0;
 function buffer(bytes,target){const data=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);const offset=length;chunks.push(data);length+=data.length;const pad=(4-length%4)%4;if(pad){chunks.push(new Uint8Array(pad));length+=pad;}doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,...(target?{target}:{})});return doc.bufferViews.length-1;}
 function attribute(a,type,minmax=false){const array=a.array instanceof Float32Array?a.array:new Float32Array(a.array);const accessor={bufferView:buffer(array,34962),componentType:5126,count:a.count,type};if(minmax){accessor.min=Array(a.itemSize).fill(Infinity);accessor.max=Array(a.itemSize).fill(-Infinity);for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++){const v=array[i*a.itemSize+k];accessor.min[k]=Math.min(accessor.min[k],v);accessor.max[k]=Math.max(accessor.max[k],v);}}doc.accessors.push(accessor);return doc.accessors.length-1;}
 for(const v of variants){checkCancelled(signal);const g=v.geometry;doc.images.push({name:v.name,mimeType:'image/png',bufferView:buffer(v.png)});doc.textures.push({sampler:0,source:v.id});
  doc.materials.push({name:v.name,extensions:{KHR_materials_unlit:{}},pbrMetallicRoughness:{baseColorTexture:{index:v.id},metallicFactor:0,roughnessFactor:1},doubleSided:v.doubleSided,alphaMode:v.transparent?'BLEND':'OPAQUE',extras:{gtAdditive:v.additive,gtShader:v.shader,gtRenderOrder:v.order}});
  // Atlas UV is bottom-up, whereas glTF UV uses the top-left image origin.
  const uv=g.attributes.uv.clone();for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  doc.meshes.push({name:v.name,primitives:[{attributes:{POSITION:attribute(g.attributes.position,'VEC3',true),NORMAL:attribute(g.attributes.normal,'VEC3'),TEXCOORD_0:attribute(uv,'VEC2')},material:v.id,mode:4}]});
 }
 const layers=new Map(),tiles=new Map();
 for(const part of instances){checkCancelled(signal);let layer=layers.get(part.tile.layer);if(layer===undefined){layer=doc.nodes.length;layers.set(part.tile.layer,layer);doc.nodes.push({name:part.tile.layer,children:[]});doc.nodes[0].children.push(layer);}const key=part.tile.id;let tile=tiles.get(key);if(tile===undefined){tile=doc.nodes.length;tiles.set(key,tile);doc.nodes.push({name:part.tile.name+' ['+key+']',children:[],extras:{gtTileId:key,gtLayer:part.tile.layer}});doc.nodes[layer].children.push(tile);}doc.nodes[tile].children.push(doc.nodes.length);doc.nodes.push({name:variants[part.variant].name,mesh:part.variant,matrix:part.matrix,extras:{gtEffectSnapshot:part.effect}});}
 const c=ctx.camera;doc.cameras.push({name:'GTMap preview',type:'orthographic',orthographic:{xmag:(c.right-c.left)/c.zoom/2,ymag:(c.top-c.bottom)/c.zoom/2,znear:c.near,zfar:c.far}});c.updateMatrixWorld();doc.nodes[0].children.push(doc.nodes.length);doc.nodes.push({name:'GTMap preview camera',camera:0,matrix:c.matrixWorld.toArray()});
 doc.buffers[0].byteLength=length;const json=utf8(JSON.stringify(doc)),jsonSize=Math.ceil(json.length/4)*4,header=new ArrayBuffer(20);const hv=new DataView(header);hv.setUint32(0,0x46546c67,true);hv.setUint32(4,2,true);hv.setUint32(8,12+8+jsonSize+8+length,true);hv.setUint32(12,jsonSize,true);hv.setUint32(16,0x4e4f534a,true);const j=new Uint8Array(jsonSize);j.fill(32);j.set(json);const bh=new ArrayBuffer(8);new DataView(bh).setUint32(0,length,true);new DataView(bh).setUint32(4,0x004e4942,true);return new Blob([header,j,bh,...chunks],{type:'model/gltf-binary'});
}

async function obj(variants,instances,files,name,signal,onProgress){
 const mtl=[];for(const v of variants){files['textures/'+v.name+'.png']=v.png;mtl.push('newmtl '+v.name+'\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nKe 0 0 0\nd 1\nillum 1\nmap_Kd textures/'+v.name+'.png'+(v.transparent?'\nmap_d -imfchan m textures/'+v.name+'.png':''));}
 files[name+'.mtl']=utf8(mtl.join('\n\n'));const parts=['# GTMap, one tile = one metre, Z up\nmtllib '+name+'.mtl\n'];let base=1;
 const axis=new THREE.Matrix4().makeRotationX(Math.PI/2),p=new THREE.Vector3(),normal=new THREE.Vector3();let textBytes=0;
 for(let i=0;i<instances.length;i++){if(i%128===0){checkCancelled(signal);onProgress(.87+.08*i/instances.length,'正在写入 OBJ');await yieldTask();}const part=instances[i],v=variants[part.variant],g=v.geometry,m=axis.clone().multiply(new THREE.Matrix4().fromArray(part.matrix)),nm=new THREE.Matrix3().getNormalMatrix(m),a=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv,lines=['o '+safe(part.tile.name)+'_'+safe(part.tile.id)+'_'+i,'g '+safe(part.tile.layer),'usemtl '+v.name];
  for(let j=0;j<a.count;j++){p.fromBufferAttribute(a,j).applyMatrix4(m);lines.push('v '+p.toArray().join(' '));}for(let j=0;j<u.count;j++)lines.push('vt '+u.getX(j)+' '+u.getY(j));for(let j=0;j<n.count;j++){normal.fromBufferAttribute(n,j).applyMatrix3(nm).normalize();lines.push('vn '+normal.toArray().join(' '));}
  const mirror=m.determinant()<0;for(let j=0;j<a.count;j+=3){const indexes=[base+j,base+j+(mirror?2:1),base+j+(mirror?1:2)];lines.push('f '+indexes.map(k=>k+'/'+k+'/'+k).join(' '));}base+=a.count;const text=lines.join('\n')+'\n';textBytes+=text.length;if(textBytes>512*1024*1024)throw new Error('OBJ 文本超过 512 MiB，请改用共享网格的 GLB 或导出选中范围');parts.push(text);
 }
 files[name+'.obj']=new Uint8Array(await new Blob(parts).arrayBuffer());files['README.txt']=utf8('解压整个目录，导入 '+name+'.obj，保留同目录 MTL 和 textures 文件夹。OBJ 已转为 Z 向上、1 格 = 1 米。\nOBJ 不包含相机和粒子动画，透明、加法和无光照材质的跨软件支持有限。建议优先选择 GLB 或 Blender 套件。');return null;
}

function blenderScript(name){return `# GTLibrary static snapshot setup. Blender 4.x/5.x, no external packages.
import bpy, os, math
folder = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else ''
for text in bpy.data.texts:
    if text.name == 'blender_setup.py' and text.filepath:
        folder = os.path.dirname(bpy.path.abspath(text.filepath))
        break
if not folder:
    raise RuntimeError('Open blender_setup.py from the extracted export folder first')
before = {o.as_pointer() for o in bpy.data.objects}
bpy.ops.import_scene.gltf(filepath=os.path.join(folder, '${name}.glb'))
imported = [o for o in bpy.data.objects if o.as_pointer() not in before]
scene = bpy.context.scene
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.world = scene.world or bpy.data.worlds.new('GTMap world')
scene.world.color = (0, 0, 0)
materials = {m for o in imported if o.type == 'MESH' for m in o.data.materials if m}
for mat in materials:
    if not mat.get('gtAdditive', False) or not mat.use_nodes:
        continue
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    texture = next((n for n in nodes if n.type == 'TEX_IMAGE'), None)
    if not texture:
        continue
    image = texture.image
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image
    emission = nodes.new('ShaderNodeEmission')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    add = nodes.new('ShaderNodeAddShader')
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(texture.outputs['Color'], emission.inputs['Color'])
    links.new(texture.outputs['Alpha'], emission.inputs['Strength'])
    links.new(transparent.outputs[0], add.inputs[0])
    links.new(emission.outputs[0], add.inputs[1])
    links.new(add.outputs[0], output.inputs['Surface'])
    if hasattr(mat, 'surface_render_method'): mat.surface_render_method = 'DITHERED'
    elif hasattr(mat, 'blend_method'): mat.blend_method = 'BLEND'
cameras = [o for o in imported if o.type == 'CAMERA']
if cameras:
    scene.camera = cameras[0]
    import json
    with open(os.path.join(folder, 'export.json'), encoding='utf-8') as f: meta = json.load(f)
    width = max(1, meta['view']['viewportWidth'])
    viewwidth = meta['view']['viewWidth']
    # Match the exported orthographic projection including Unity's vertical compensation.
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(meta['view']['viewportHeight'])
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1
    scene.render.pixel_aspect_y = meta['view']['unityVerticalCompensation']
    scene.camera.data.ortho_scale = max(viewwidth, viewwidth * meta['view']['viewportHeight'] / width * meta['view']['unityVerticalCompensation'])
print('GTMap imported: baked static materials, layers, tile hierarchy, current edits, effect snapshot and camera.')
`;}
