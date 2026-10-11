import {renderOrder} from './render-order.js';
import * as THREE from '../vendor/three.module.js';

let manifestPromise;
export function shadowManifest(){return manifestPromise??=GTResources.fetch(new URL('assets/character-shadows.json.gz',import.meta.url)).then(r=>{if(!r.ok)throw Error('人物阴影索引 HTTP '+r.status);return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();}).catch(e=>{manifestPromise=null;throw e;});}
const hidden=new THREE.Matrix4().makeScale(0,0,0);
/** Native battle/shadow.png, with per-prefab transform, scale and tint. */
export class CharacterShadows {
 constructor(){this.batches=[];this.visible=true;this.generation=0;}
 async build(entries,manifest,signal){this.clear();this.error=null;if(!manifest)return;const token=this.generation,groups=new Map();
  for(const e of entries){const spec=(e.settings.resource===e.initial.resource?manifest.prefabs[e.sourcePrefab]:null)||manifest.resources[e.settings.resource];if(!spec)continue;e.shadowSpec=spec;const list=groups.get(e.group)||[];list.push(e);groups.set(e.group,list);}
  if(!groups.size)return;
  try{const image=await GTResources.image(new URL(manifest.texture,import.meta.url),{signal});if(token!==this.generation)return;this.texture=new THREE.Texture(image);this.texture.flipY=false;this.texture.colorSpace=THREE.NoColorSpace;this.texture.magFilter=this.texture.minFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
   const frame=manifest.frame.frame,size=manifest.size;
   for(const [group,actors] of groups){const geometry=new THREE.PlaneGeometry(1,1);for(let i=0;i<geometry.attributes.uv.count;i++){const uv=geometry.attributes.uv;uv.setXY(i,(frame.x+uv.getX(i)*frame.w)/size.w,(frame.y+(1-uv.getY(i))*frame.h)/size.h);}geometry.setAttribute('shadowTint',new THREE.InstancedBufferAttribute(new Float32Array(actors.length*4),4));
    const material=new THREE.ShaderMaterial({uniforms:{image:{value:this.texture}},vertexShader:'attribute vec4 shadowTint;varying vec2 vUv;varying vec4 vTint;void main(){vUv=uv;vTint=shadowTint;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D image;varying vec2 vUv;varying vec4 vTint;void main(){vec4 c=texture2D(image,vUv)*vTint;if(c.a<0.002)discard;gl_FragColor=c;}',transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});material.userData={source:'battle/shadow.png',shader:'CustomSprite · 原始脚底阴影',queue:2999};
    const mesh=new THREE.InstancedMesh(geometry,material,actors.length);mesh.frustumCulled=false;mesh.renderOrder=renderOrder(2999,actors[0].layer,0,0,this.sortingLayers);mesh.userData={kind:'character-shadow',tiles:actors.map(e=>e.tile),sourceMaterial:'battle_shear',sourceShader:'CustomSprite · 原始脚底阴影'};group.add(mesh);
    const batch={mesh,actors};this.batches.push(batch);
    for(const [i,e] of actors.entries()){const spec=e.shadowSpec;let local=new THREE.Matrix4();for(const tr of spec.transforms)local.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...tr.position),new THREE.Quaternion(...tr.rotation),new THREE.Vector3(...tr.scale)));local.premultiply(new THREE.Matrix4().makeScale(1,1,-1));local.multiply(new THREE.Matrix4().makeScale(frame.w*spec.pixelToWorld*spec.localScale[0],frame.h*spec.pixelToWorld*spec.localScale[1],1));e.shadow={batch,index:i,local,active:spec.transforms.every(t=>t.active),tint:spec.tint};mesh.setMatrixAt(i,hidden);}
   }
  }catch(e){if(e.name!=='AbortError')this.error=e.message;}
 }
 sample(entries,charactersVisible){for(const e of entries){const s=e.shadow;if(!s)continue;const preview=e.preview||{},alpha=(preview.alpha??e.settings.alpha??1)*(preview.shadowAlpha??e.settings.shadowAlpha??1),shown=this.visible&&charactersVisible&&e.loaded&&e.record.visible&&e.group.visible&&e.settings.shadow!==false&&s.active&&alpha>0;
   const mesh=s.batch.mesh,scale=e.settings.shadowScale??1,matrix=shown?e.record.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0,.012,0)).multiply(s.local).multiply(new THREE.Matrix4().makeScale(scale,scale,1)):hidden;mesh.setMatrixAt(s.index,matrix);const tint=mesh.geometry.attributes.shadowTint;tint.setXYZW(s.index,s.tint[0],s.tint[1],s.tint[2],s.tint[3]*alpha);tint.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;
  }}
 clear(){++this.generation;for(const b of this.batches){for(const e of b.actors)e.shadow=null;b.mesh.removeFromParent();b.mesh.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();}this.batches=[];this.texture?.dispose();this.texture=null;}
}
