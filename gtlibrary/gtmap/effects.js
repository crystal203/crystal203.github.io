import {renderOrder} from './render-order.js';
import {vertexColors} from './vertex-data.js';
import * as THREE from '../vendor/three.module.js';
import {createParticleSimulation} from '../gtfx/core.js';
import {nativeMaterial} from './native-material.js';

const identity=new THREE.Matrix4().identity().elements;
// nativeMaterial expects row-major serialized matrices.
const reflection=new THREE.Matrix4().makeScale(1,1,-1);
function geometry(raw,format){
 const g=new THREE.BufferGeometry(),count=raw.positions.length/3;
 g.setAttribute('position',new THREE.Float32BufferAttribute(raw.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(raw.normals||Array(count*3).fill(0),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(raw.uv||Array(count*2).fill(0),2));
 g.setAttribute('nativePosition',new THREE.Float32BufferAttribute(raw.positions.flatMap((v,i)=>i%3===2?[v,1]:[v]),4));g.setAttribute('nativeNormal',g.attributes.normal);g.setAttribute('nativeUv',g.attributes.uv);g.setAttribute('nativeUv2',new THREE.Float32BufferAttribute(raw.uv2||Array(count*2).fill(0),2));g.setAttribute('nativeColor',new THREE.Float32BufferAttribute(vertexColors(raw.colors,format)||Array(count*4).fill(1),4));g.setAttribute('gtVertexUv',g.attributes.nativeUv);g.setAttribute('gtVertexColor',g.attributes.nativeColor);g.setIndex(raw.submeshes.flat());g.computeBoundingBox();return g;
}
const quad={positions:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],uv:[0,0,1,0,1,1,0,1],normals:[0,0,-1,0,0,-1,0,0,-1,0,0,-1],submeshes:[[0,1,2,0,2,3]]};

/** One shared deterministic simulator per prefab, GPU instances per map placement. */
export class MapEffects {
 constructor(camera,textures,selection){this.camera=camera;this.textures=textures;this.selection=selection;this.batches=[];this.simulations=[];this.visible=true;this.brightness=1;}
 build(spec,assets,tiles,group,layerIndex){
  if(!spec?.systems.length&&!spec?.sprites.length)return 0;
  const materials=assets.materials,sprites=assets.sprites||{};
  const nativeToFx=m=>{const p=m.nativeShader;return {name:m.name,blend:p.dstBlend===1?'add':'alpha',texture:m.texture,tint:m.colors._TintColor||p.defaults._TintColor||{r:1,g:1,b:1,a:1},scale:m.scale,offset:m.offset,colorGain:1};};
  const systems=spec.systems.filter(s=>s.renderer.mode!==5&&materials[s.materialKey]?.nativeShader.gles).map(s=>({...s,material:nativeToFx(materials[s.materialKey]),materials:[nativeToFx(materials[s.materialKey])]}));
  const effect={...spec,systems,statics:[],direction:[0,0,1],scale:[1,1,1],duration:10};
  const fxMeshes=Object.fromEntries(Object.entries(assets.meshes||{}).map(([key,raw])=>[key,geometry(raw,raw.colorFormat??assets.vertexFormats?.[key]?.color)]));
  const sim=createParticleSimulation(effect,{textures:Object.fromEntries(this.textures),geometries:fxMeshes,index:{sprites,textures:assets.textures},camera:this.camera});this.simulations.push(sim);
  const groups=new Map();for(const p of sim.particles){if(!groups.has(p.si))groups.set(p.si,[]);groups.get(p.si).push(p);}
  let count=0;
  for(const [si,particles] of groups){
   const s=systems[si],source=materials[s.materialKey],raw=s.renderer.mesh?assets.meshes[s.renderer.mesh]:quad;
   if(!raw)continue;
   // Separate sprite textures are unpacked from the original atlas, including packing rotation.
   const frames=s.modules.UVModule?.sprites||[],frameTextures=[...new Set(frames.map(id=>sprites[id]?.texture).filter(Boolean))];
   for(const texture of frameTextures.length?frameTextures:[null]){const first=texture?{texture}:null;
   const materialSource=first?{...source,texenvs:{...source.texenvs,_MainTex:{texture:first.texture,scale:{x:1,y:1},offset:{x:0,y:0}}}}:source;
   const mat=nativeMaterial(materialSource,this.textures,identity,{particles:true});
   // The simulator already samples material tint (including CustomAnimator) per particle.
   if(mat.uniforms._TintColor)mat.uniforms._TintColor.value.set(1,1,1,1);
   const geom=geometry(raw,raw.colorFormat??assets.vertexFormats?.[s.renderer.mesh]?.color),n=particles.length*tiles.length,rgba=new THREE.InstancedBufferAttribute(new Float32Array(n*4),4),uv=new THREE.InstancedBufferAttribute(new Float32Array(n*4),4);
   geom.setAttribute('gtParticleColor',rgba);geom.setAttribute('gtParticleUv',uv);
   const mesh=new THREE.InstancedMesh(geom,mat,n);mesh.frustumCulled=false;mesh.renderOrder=renderOrder(mat.userData.queue,layerIndex,s.renderer.layer,s.renderer.sort,assets.sortingLayers);mesh.visible=this.visible;group.add(mesh);
   mesh.userData={tiles:tiles.flatMap(t=>particles.map(()=>t)),sourceMesh:raw.name||'Particle quad',sourceMaterial:source.name,sourceShader:source.nativeShader.name,kind:'tile'};
   this.batches.push({mesh,particles,tiles,rgba,uv,sim,s,frames,sprites,source,texture:first?.texture});
   tiles.forEach(tile=>this.selection.addBounds(tile.id,()=>{
    const box=new THREE.Box3(),record=this.selection.records.get(tile.id),base=this.selection.matrixFor(record);
    for(const p of particles){if(!p.mesh.visible||(texture&&p.mesh.material.uniforms.map.value!==this.textures.get(texture)))continue;
     const u=p.mesh.material.uniforms,pivot=u.particlePivot.value,size=u.spriteSize.value;
     const local=reflection.clone().multiply(p.mesh.matrix).multiply(new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z)).multiply(new THREE.Matrix4().makeScale(size.x,size.y,1)).multiply(reflection).premultiply(base);
     box.union(geom.boundingBox.clone().applyMatrix4(local));
    }return box;
   }));count+=n;}
  }
  // Source SpriteRenderer nodes are static but participate in tile selection/transform.
  sim.nodeRoot.updateMatrixWorld(true);
  for(const sp of spec.sprites||[]){
   const node=sim.nodes.get(sp.node);let active=true;for(let n=node;n;n=n.parent)if(!n.visible)active=false;if(!active)continue;
   const sprite=sprites[sp.sprite],source=materials[sp.materials[0]];if(!sprite||!source?.nativeShader.gles)continue;
   const size=new THREE.Vector3(sprite.size[0]/sprite.pixelsToUnits*(sp.flipX?-1:1),sprite.size[1]/sprite.pixelsToUnits*(sp.flipY?-1:1),1);
   const local=new THREE.Matrix4().compose(new THREE.Vector3((.5-sprite.pivot.x)*size.x,(.5-sprite.pivot.y)*size.y,0),new THREE.Quaternion(),size).premultiply(node.matrixWorld);
   const reflected=reflection.clone().multiply(local).multiply(reflection),raw={...quad,colors:Array(4).fill(['r','g','b','a'].map(k=>sp.color[k])).flat()};
   const geom=geometry(raw),mat=nativeMaterial({...source,texenvs:{...source.texenvs,_MainTex:{texture:sprite.texture,scale:{x:1,y:1},offset:{x:0,y:0}}}},this.textures,identity);
   const mesh=new THREE.InstancedMesh(geom,mat,tiles.length);mesh.frustumCulled=false;mesh.renderOrder=renderOrder(mat.userData.queue,layerIndex,sp.layer,sp.sort,assets.sortingLayers);group.add(mesh);
   tiles.forEach((tile,i)=>{const r=this.selection.records.get(tile.id);mesh.setMatrixAt(i,r.matrix.clone().multiply(reflected));this.selection.attach(tile.id,mesh,i,reflected);});
   mesh.userData={tiles,sourceMesh:'Sprite '+sprite.name,sourceMaterial:source.name,sourceShader:source.nativeShader.name,kind:'tile'};
   this.batches.push({mesh,staticSprite:true,geom});count+=tiles.length;
  }
  return count;
 }
 sample(time){
  for(const sim of this.simulations)sim.sample(time);
  const matrix=new THREE.Matrix4(),hidden=new THREE.Matrix4().makeScale(0,0,0);
  for(const b of this.batches){if(b.staticSprite)continue;let i=0;const first=b.particles.find(p=>p.mesh.visible)||b.particles[0],u=first?.mesh.material.uniforms;
   if(!b.texture&&u?.map.value&&b.mesh.material.uniforms._MainTex)b.mesh.material.uniforms._MainTex.value=u.map.value;
   const st=b.mesh.material.uniforms._MainTex_ST?.value;if(st&&u?.uvScale)st.set(u.uvScale.value.x,u.uvScale.value.y,u.uvOffset.value.x,u.uvOffset.value.y);
   for(const script of b.sim.scriptByNode.get(b.s.node)||[])if(script.type==='FxUvanim_frac_Tex2'){const target=b.mesh.material.uniforms._MainTex2_ST?.value,slot=b.source.texenvs._MainTex2;if(target&&slot)target.set(slot.scale.x,slot.scale.y,slot.offset.x+(script.fields.scrollSpeed_X||0)*time,slot.offset.y+(script.fields.scrollSpeed_Y||0)*time);}
   for(const tile of b.tiles){const r=this.selection.records.get(tile.id);for(const p of b.particles){
    if(p.mesh.visible&&r.visible&&(!b.texture||p.mesh.material.uniforms.map.value===this.textures.get(b.texture))){const uniforms=p.mesh.material.uniforms,c=uniforms.particleColor.value;const base=uniforms.tint.value;b.rgba.setXYZW(i,c.x*base.x,c.y*base.y,c.z*base.z,c.w*base.w);const rect=uniforms.uvRect.value;const sz=uniforms.spriteSize.value,pivot=uniforms.particlePivot.value;
     // Apply sprite aspect and pivot before the particle's own matrix.
     matrix.copy(reflection).multiply(p.mesh.matrix).multiply(new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z)).multiply(new THREE.Matrix4().makeScale(sz.x,sz.y,1)).multiply(reflection).premultiply(r.matrix);b.mesh.setMatrixAt(i,matrix);
     b.uv.setXYZW(i,rect.x,rect.y,rect.z,rect.w);
    }else b.mesh.setMatrixAt(i,hidden);i++;
   }}b.mesh.instanceMatrix.needsUpdate=true;b.mesh.boundingSphere=null;b.rgba.needsUpdate=true;b.uv.needsUpdate=true;
  }
 }
 setVisible(value){this.visible=value;for(const b of this.batches)if(!b.staticSprite)b.mesh.visible=value;}
 setBrightness(value){this.brightness=value;for(const b of this.batches)b.mesh.material.uniforms.brightness.value=value;}
 clear(){for(const b of this.batches){b.mesh.removeFromParent();b.mesh.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();}for(const sim of this.simulations){sim.clear();sim.quad.dispose();Object.values(sim.geometries).forEach(g=>g.dispose());}this.batches=[];this.simulations=[];}
}
