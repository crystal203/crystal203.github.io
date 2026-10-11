import * as THREE from '../vendor/three.module.js';

const factors={0:THREE.ZeroFactor,1:THREE.OneFactor,768:THREE.SrcColorFactor,769:THREE.OneMinusSrcColorFactor,770:THREE.SrcAlphaFactor,771:THREE.OneMinusSrcAlphaFactor,772:THREE.DstAlphaFactor,773:THREE.OneMinusDstAlphaFactor,774:THREE.DstColorFactor,775:THREE.OneMinusDstColorFactor};
// Preserve screen position while moving below-ground vertices toward the
// camera ray onto the character's ground plane. Walls still use normal depth.
const vertexShader=`attribute vec4 light;attribute vec4 dark;uniform float groundDepth;uniform float groundY;varying vec2 vUv;varying vec4 vLight;varying vec4 vDark;void main(){vUv=uv;vLight=light;vDark=dark;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);if(groundDepth>0.5&&world.y<groundY){vec3 ray=isOrthographic?vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]):cameraPosition-world.xyz;if(ray.y>0.001)world.xyz+=ray*((groundY-world.y)/ray.y);}gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragmentShader=`uniform sampler2D image;uniform float brightness;varying vec2 vUv;varying vec4 vLight;varying vec4 vDark;void main(){vec4 c=texture2D(image,vUv);float a=c.a*vLight.a;if(a<0.01)discard;gl_FragColor=vec4((((c.a-1.0)*vDark.a+1.0-c.rgb)*vDark.rgb+c.rgb*vLight.rgb)*brightness,a);}`;

/** Spine retains clipping/tint/draw order. Adjacent compatible slots share a draw. */
export class SpineThreeRenderer {
 constructor(spine,group,tile,selection,pickables){Object.assign(this,{spine,group,tile,selection,pickables});this.renderer=new spine.webgl.SkeletonRenderer(null,true);this.meshes=[];this.brightness=1;}
 static texture(spine,image){const proxy=new spine.FakeTexture(image),texture=new THREE.Texture(image);texture.flipY=false;texture.colorSpace=THREE.NoColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;proxy.three=texture;proxy.dispose=()=>texture.dispose();return proxy;}
 draw(skeleton,local,order,overlay=null){
  const groups=[];let blend=[770,771];const batch={setBlendMode:(a,b)=>{blend=[a,b];},draw:(texture,vertices,indices)=>{let g=groups.at(-1);if(!g||g.texture!==texture||g.blend[0]!==blend[0]||g.blend[1]!==blend[1]){g={texture,blend:[...blend],vertices:[],indices:[]};groups.push(g);}const offset=g.vertices.length/12;for(const v of vertices)g.vertices.push(v);for(const i of indices)g.indices.push(offset+i);}};
  this.renderer.draw(batch,skeleton);if(overlay)this.renderer.draw(batch,overlay);
  for(const [i,g] of groups.entries()){
   let mesh=this.meshes[i];if(!mesh){const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{image:{value:g.texture.three},brightness:{value:this.brightness},groundDepth:{value:0},groundY:{value:0}},transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,blending:THREE.CustomBlending});material.userData={source:this.tile.character.resource,shader:'Spine 3.8 · 动态骨骼',queue:3000};mesh=new THREE.InstancedMesh(new THREE.BufferGeometry(),material,1);mesh.onBeforeRender=()=>{mesh.material.uniforms.groundDepth.value=this.groundDepth?1:0;mesh.material.uniforms.groundY.value=this.groundY||0;};mesh.frustumCulled=false;mesh.userData={tiles:[this.tile],sourceMesh:this.tile.character.resource,sourceMaterial:this.tile.character.resource,sourceShader:'Spine 3.8 · 动态骨骼',kind:'character'};this.group.add(mesh);this.meshes.push(mesh);this.pickables.push(mesh);this.selection.attach(this.tile.id,mesh,0);mesh.userData.ref=this.selection.records.get(this.tile.id).refs.at(-1);}
   const count=g.vertices.length/12,geometry=mesh.geometry;
   if(geometry.getAttribute('position')?.count!==count||geometry.index?.count!==g.indices.length){geometry.dispose();mesh.geometry=new THREE.BufferGeometry();for(const [key,size] of [['position',3],['uv',2],['light',4],['dark',4]])mesh.geometry.setAttribute(key,new THREE.BufferAttribute(new Float32Array(count*size),size));mesh.geometry.setIndex(g.indices);}
   const attrs=mesh.geometry.attributes;
   for(let v=0;v<count;v++){const o=v*12;attrs.position.setXYZ(v,g.vertices[o],g.vertices[o+1],0);attrs.uv.setXY(v,g.vertices[o+6],g.vertices[o+7]);attrs.light.setXYZW(v,...g.vertices.slice(o+2,o+6));attrs.dark.setXYZW(v,...g.vertices.slice(o+8,o+12));}
   for(const a of Object.values(attrs))a.needsUpdate=true;mesh.geometry.index.array.set(g.indices);mesh.geometry.index.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();mesh.boundingSphere=null;
   mesh.userData.ref.enabled=true;mesh.userData.ref.local.copy(local);mesh.visible=true;mesh.renderOrder=order+i*.0000001;mesh.material.uniforms.image.value=g.texture.three;mesh.material.uniforms.brightness.value=this.brightness;mesh.material.blendSrc=factors[g.blend[0]];mesh.material.blendDst=factors[g.blend[1]];
  }
  for(let i=groups.length;i<this.meshes.length;i++){this.meshes[i].visible=false;this.meshes[i].userData.ref.enabled=false;}
 }
 place(record,local,visible,order){for(const [i,mesh] of this.meshes.entries()){mesh.visible=visible&&mesh.userData.ref.enabled;mesh.userData.ref.local.copy(local);mesh.setMatrixAt(0,record.visible?record.matrix.clone().multiply(local):new THREE.Matrix4().makeScale(0,0,0));mesh.instanceMatrix.needsUpdate=true;mesh.renderOrder=order+i*.0000001;mesh.boundingSphere=null;}}
 clear(){for(const mesh of this.meshes){mesh.removeFromParent();const i=this.pickables.indexOf(mesh);if(i>=0)this.pickables.splice(i,1);const record=this.selection.records.get(this.tile.id);if(record)record.refs=record.refs.filter(ref=>ref.mesh!==mesh);mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}this.meshes=[];}
}
