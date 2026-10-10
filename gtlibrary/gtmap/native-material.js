import * as THREE from '../vendor/three.module.js';

// The source programs are extracted from the game's GLES3 shader blobs.
// Keep material expressions intact; adapt only Unity's matrix/attribute bindings.
export function nativeMaterial(source, textures, partMatrix) {
 const profile=source.nativeShader, original=profile.gles;
 const reflection=new THREE.Matrix4().makeScale(1,1,-1);
 const uniforms={gtPart:{value:new THREE.Matrix4().set(...partMatrix)},brightness:{value:1},gtBrightness:{value:1}};
 const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;
 const black=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);black.needsUpdate=true;
 const emptyCube=new THREE.CubeTexture(Array(6).fill(black));emptyCube.needsUpdate=true;
 const declarations=[...original.matchAll(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)(?:\[(\d+)\])?\s*;/g)];
 const globals=[];
 for(const [,type,name,size] of declarations){
  if(name.includes('ObjectToWorld')||name.includes('WorldToObject'))continue;
  if(uniforms[name])continue;
  let value;
  const color=source.colors[name]||profile.defaults[name],slot=source.texenvs[name];
  if(type==='samplerCube')value=emptyCube;
  else if(type==='sampler2D')value=textures.get(slot?.texture)||(profile.textureDefaults?.[name]==='black'?black:white);
  else if(name.endsWith('_ST')){const env=source.texenvs[name.slice(0,-3)];value=new THREE.Vector4(env?.scale.x??1,env?.scale.y??1,env?.offset.x??0,env?.offset.y??0);}
  else if(type==='mat4'||name.startsWith('hlslcc_mtx4x4'))value=new THREE.Matrix4();
  else if(size)value=type==='uint'?new Uint32Array(Number(size)):new Float32Array(Number(size)*(Number(type.slice(-1))||1));
  else if(type==='vec4')value=new THREE.Vector4(...['r','g','b','a'].map(k=>Number(color?.[k]??0)));
  else if(type==='vec3')value=new THREE.Vector3(...['r','g','b'].map(k=>Number(color?.[k]??0)));
  else if(type==='vec2')value=new THREE.Vector2(Number(color?.r??0),Number(color?.g??0));
  else value=Number(source.floats[name]??0);
  if(!color&&!slot&&!name.endsWith('_ST')&&!(name in source.floats))globals.push(name);
  uniforms[name]={value};
 }
 // A neutral directional preview light is used where map files provide no scene light controller.
 // Indexed dynamic lights remain disabled; use an explicit empty index rather than undefined texels.
 if(uniforms._LightColor0)uniforms._LightColor0.value.set(1,1,1,1);
 if(uniforms._WorldSpaceLightPos0)uniforms._WorldSpaceLightPos0.value.set(0,1,0,0);
 if(uniforms._LightIndexTexture)uniforms._LightIndexTexture.value=black;
 function program(stage){
  let s=original.slice(0,original.lastIndexOf('#endif')+6).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/^#version[^\n]*$/gm,'').replace(/#define UNITY_SUPPORTS_UNIFORM_LOCATION 1/g,'#define UNITY_SUPPORTS_UNIFORM_LOCATION 0');
  s=s.replace(/uniform\s+vec4\s+(hlslcc_mtx4x4\w+)\[4\];/g,(_,n)=>(n.includes('ObjectToWorld')||n.includes('WorldToObject')?'mat4 ':'uniform mat4 ')+n+';');
  if(stage==='VERTEX'){
   const attrs={in_POSITION0:'nativePosition',in_NORMAL0:'nativeNormal',in_TEXCOORD0:'nativeUv',in_TEXCOORD1:'nativeUv2',in_COLOR0:'nativeColor'};
   for(const [from,to] of Object.entries(attrs))s=s.replaceAll(from,to);
   const header='uniform mat4 modelMatrix; in mat4 instanceMatrix; uniform mat4 gtPart;\n';
   const bindings='mat4 gtReflection=mat4(1,0,0,0,0,1,0,0,0,0,-1,0,0,0,0,1); mat4 gtModel=gtReflection*modelMatrix*instanceMatrix*gtReflection*gtPart;\n'+
    (s.includes('hlslcc_mtx4x4unity_ObjectToWorld')?'hlslcc_mtx4x4unity_ObjectToWorld=gtModel;\n':'')+
    (s.includes('hlslcc_mtx4x4unity_WorldToObject')?'hlslcc_mtx4x4unity_WorldToObject=inverse(gtModel);\n':'');
   s=s.replace(/void main\(\)\s*\{/,m=>m+'\n'+bindings);s=header+s;
  } else {
   // Empty light grid has no local light entries, independently of the viewport size.
   s=s.replace(/texelFetch\(_LightIndexTexture,[^\n;]*\)/g,'vec4(0.0)');
   // Match the legacy runtime's user brightness control without changing the native expression.
   const output=s.slice(s.indexOf('#ifdef FRAGMENT')).match(/out\s+(?:(?:highp|mediump|lowp)\s+)?vec4\s+(\w+)\s*;/)?.[1];
   const idx=s.lastIndexOf('return;');if(idx>=0&&output)s=s.slice(0,idx)+output+'.rgb *= gtBrightness;\n'+s.slice(idx);
   s='uniform highp float gtBrightness;\n'+s;
  }
  return '#define '+stage+'\n'+s+'\n';
 }
 const factors=[THREE.ZeroFactor,THREE.OneFactor,THREE.DstColorFactor,THREE.SrcColorFactor,THREE.OneMinusDstColorFactor,THREE.SrcAlphaFactor,THREE.OneMinusSrcColorFactor,THREE.DstAlphaFactor,THREE.OneMinusDstAlphaFactor,THREE.SrcAlphaSaturateFactor,THREE.OneMinusSrcAlphaFactor];
 const transparent=profile.srcBlend!==1||profile.dstBlend!==0;
 const mat=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,uniforms,vertexShader:program('VERTEX'),fragmentShader:program('FRAGMENT'),transparent,depthWrite:profile.depthWrite,depthTest:profile.depthTest!==8,side:profile.cull===0?THREE.DoubleSide:profile.cull===1?THREE.BackSide:THREE.FrontSide,blending:transparent?THREE.CustomBlending:THREE.NoBlending,blendSrc:factors[profile.srcBlend],blendDst:factors[profile.dstBlend],toneMapped:false});
 const span=new THREE.Vector2();
 mat.onBeforeRender=(renderer,scene,camera)=>{
  const t=performance.now()*.001;uniforms.gtBrightness.value=uniforms.brightness.value;
  for(const name of globals){const u=uniforms[name];
   if(name==='hlslcc_mtx4x4unity_MatrixV')u.value.copy(camera.matrixWorldInverse).multiply(reflection);
   else if(name==='hlslcc_mtx4x4unity_MatrixVP')u.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(reflection);
   else if(name==='hlslcc_mtx4x4unity_CameraToWorld')u.value.copy(reflection).multiply(camera.matrixWorld);
   else if(name==='_WorldSpaceCameraPos')u.value.set(camera.position.x,camera.position.y,-camera.position.z);
   else if(name==='_Time')u.value.set(t/20,t,t*2,t*3);
   else if(name==='_SinTime')u.value.set(Math.sin(t/8),Math.sin(t/4),Math.sin(t/2),Math.sin(t));
   else if(name==='_CosTime')u.value.set(Math.cos(t/8),Math.cos(t/4),Math.cos(t/2),Math.cos(t));
   else if(name==='_ProjectionParams')u.value.set(1,camera.near,camera.far,1/camera.far);
   else if(name==='_ScreenParams'){renderer.getDrawingBufferSize(span);u.value.set(span.x,span.y,1+1/span.x,1+1/span.y);}
  }
 };
 const queue=profile.queueTag||'Geometry';mat.userData={source:source.name,shader:profile.name,nativeProgram:true,globals,queue:source.queue>=0?source.queue:(queue.startsWith('Transparent')?3000:queue.startsWith('Overlay')?4000:2000)+Number(queue.match(/[+-]\d+$/)?.[0]||0)};
 mat.addEventListener('dispose',()=>{white.dispose();black.dispose();emptyCube.dispose();});return mat;
}
