import {installNativeProjection} from './native-camera.js';
import {MapSpeechBubble} from './speech-bubbles.js';
import {MapEventPlayer} from './event-player.js';
import * as THREE from '../vendor/three.module.js';
import {renderOrder} from './render-order.js';
import {vertexColors} from './vertex-data.js';
import {MapCharacters} from './characters.js';
import {MapDoors} from './doors.js';
import {MapItems,itemInfo} from './items.js';
import {MapManipulator} from './manipulator.js';
import {MapSelection} from './selection.js';
import {MapStates} from './states.js';
import {MapEffects} from './effects.js';
import {sampleAnimator} from '../core/custom-animator.js';
import {nativeMaterial} from './native-material.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
export {decodeMap,parseKong} from './decoder.js';
export function assetsForMap(pack,doc){
 const templates={},meshes={},materials={},textures={},clouds={},effects={},states={};
 for(const l of doc.layers)for(const t of l.tiles){const set=doc.tilesets[t.ts-1].name,k=(pack.setOrder.indexOf(set)+1)+':'+t.name,original=pack.templates[k];if(!original)throw new Error('地图资源未收录图块：'+t.name);
  const extra=pack.environment?.effects?.[set],effect=extra?.templates[t.name];
  const template=effect?{...original,parts:original.parts.map(p=>({...p,materials:effect.materialOverrides[p.node]||p.materials}))}:original;templates[k]=template;
  for(const p of template.parts){meshes[p.mesh]=pack.meshes[p.mesh];for(const m of p.materials)if(m&&(extra?.materials[m]||pack.materials[m]))materials[m]=extra?.materials[m]||pack.materials[m];}
  const info=itemInfo(t,doc,pack.itemMetadata),stateAssets=pack.environment?.states?.[set]?.templates[t.name]?pack.environment.states[set]:info.kind==='star'?pack.environment?.pickups:null,stateSpec=stateAssets?.templates[t.name]||(info.kind==='star'?stateAssets?.templates.star_piece:null);if(stateSpec){states[k]={spec:stateSpec,assets:{...stateAssets,sortingLayers:pack.sortingLayers}};Object.assign(textures,stateAssets.textures);for(const part of stateSpec.parts)for(const id of part.materials)if(stateAssets.materials[id])materials[id]=stateAssets.materials[id];for(const s of stateSpec.systems)for(const id of s.materialKeys||[s.materialKey])if(stateAssets.materials[id])materials[id]=stateAssets.materials[id];for(const s of stateSpec.sprites)for(const id of s.materials)if(stateAssets.materials[id])materials[id]=stateAssets.materials[id];}
  if(effect){effects[k]={spec:effect,assets:{...extra,vertexFormats:pack.vertexFormats,sortingLayers:pack.sortingLayers}};for(const id of new Set([...effect.systems.flatMap(s=>s.materialKeys||[s.materialKey]),...effect.sprites.flatMap(s=>s.materials)]))if(extra.materials[id])materials[id]=extra.materials[id];Object.assign(textures,extra.textures);}
  if(pack.environment?.clouds?.[k]&&!effect?.systems.length){clouds[k]=pack.environment.clouds[k];const m=clouds[k].material;materials[m]=pack.materials[m];}
 }
 for(const m of Object.values(materials))for(const env of Object.values(m.texenvs)){if(env.texture&&!textures[env.texture])textures[env.texture]=pack.textures[env.texture];}
 // Retain only textures referenced by this map's selected effect templates.
 const needed=new Set();for(const m of Object.values(materials))for(const e of Object.values(m.texenvs))if(e.texture)needed.add(e.texture);
 for(const {spec,assets} of [...Object.values(effects),...Object.values(states)]){for(const s of spec.systems)for(const id of s.modules.UVModule?.sprites||[])if(assets.sprites[id])needed.add(assets.sprites[id].texture);for(const s of spec.sprites||[])if(assets.sprites[s.sprite])needed.add(assets.sprites[s.sprite].texture);}
 if(pack.itemMetadata?.atlas){
  for(const layer of doc.layers)for(const tile of layer.tiles){const info=itemInfo(tile,doc,pack.itemMetadata);if(!['coin','item'].includes(info.kind))continue;const atlas=info.kind==='coin'?'items':pack.itemMetadata.items[String(info.rewards[0]?.ItemSpecId)]?.atlas;if(!atlas)continue;const key='pickup-'+atlas;textures[key]={url:atlas==='items'?'textures/pickup-items.png':'../../gtatlas/assets/'+atlas+'.png',filter:0,wrap:1};needed.add(key);}
 }
 return {...pack,templates,meshes,materials,textures:Object.fromEntries([...needed].filter(k=>textures[k]).map(k=>[k,textures[k]])),environment:{...pack.environment,clouds,effects,states}};
}

/** Reusable map runtime. No application UI or catalog is loaded by this module. */
export class MapRuntime {
 constructor(host,{onChange=()=>{},onPick=()=>{},onSelection=()=>{}}={}) {
 let renderer,camera,controls,scene,bundle,map,mapGroup,eventGroup,baseSpan=220,oblique=true,unityView=true,disposed=false,environmentVisible=true,brightness=1,assetsGeneration=0;
 const thisRuntime=this;this.frameListeners=new Set();let gameplayMode=false;const gameplayEffects=new Set();let gameplayEffectId=0;
 const textures=new Map(),geometryCache=new Map(),layerGroups=new Map(),allMaterials=[],pickables=[],cloudBatches=[],nativeAnimations=[];
 const particleTime={value:0};let mapStartTime=0,exporting=false,exportAbort=null;
 function animate(time){for(const fx of gameplayEffects){const elapsed=Math.max(0,fx.clock()-fx.start);if(elapsed>=fx.duration){fx.dispose();continue;}fx.record.gimmick.previewTime=elapsed;if(fx.follow)thisRuntime.setWorldPosition(fx.record,fx.follow());}events.sample(time);for(const fn of thisRuntime.frameListeners)fn(time);for(const item of nativeAnimations){const uniforms=item.material.uniforms;const scripts=Array.isArray(item.fields)?item.fields:[{type:'CustomAnimator',fields:item.fields}];
  for(const script of scripts){const f=script.fields,tint=uniforms[f.CustomShaderColorKey||'_TintColor']?.value||uniforms.tint?.value,st=uniforms._MainTex_ST?.value;
   if(script.type==='CustomAnimator')for(const c of sampleAnimator(f,time)){
    if(tint&&c.key>=6&&c.key<=9)tint[['x','y','z','w'][c.key-6]]=c.value;
    else if(tint&&c.key===17)tint.set(c.vector[0],c.vector[1],c.vector[2],tint.w);
    else if(st&&c.key>=11&&c.key<=14)st[['z','w','x','y'][c.key-11]]=c.value;
    else if(st&&c.key===18){st.z=c.vector[0];st.w=c.vector[1];}else if(st&&c.key===19){st.x=c.vector[0];st.y=c.vector[1];}
   }
   if(script.type.startsWith('FxUvanim')){const name=script.type.includes('Tex2')?'_MainTex2_ST':'_MainTex_ST',u=uniforms[name]?.value;if(u){const base=item.material.userData.uvBase??={};base[name]??=u.clone();u.z=base[name].z+(f.scrollSpeed_X||0)*time;u.w=base[name].w+(f.scrollSpeed_Y||0)*time;}}
  }
 }effects.sample(time);states.sample(time);doors.sample(time);items.sample();characters.sample(time);}
 const defaultWhite=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);defaultWhite.needsUpdate=true;
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x0f1116);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
 scene=new THREE.Scene();let manipulator;const selection=new MapSelection(scene,items=>{manipulator?.sync();onSelection(items);});camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,10000);camera.position.set(0,500,500);installNativeProjection(camera,()=>unityView&&oblique);
 const effects=new MapEffects(camera,textures,selection),states=new MapStates(camera,textures,selection,pickables,(key,colors)=>createMaterial(key,colors,false,new THREE.Matrix4().elements));
 const doors=new MapDoors(selection);
 const items=new MapItems(camera,textures,selection,pickables);
 const characters=new MapCharacters(camera,selection,pickables,()=>{changed();if(selection.values().some(r=>r.character))selection.refresh();});
 renderer.domElement.tabIndex=0;
 const events=new MapEventPlayer({selection,characters,states,doors,camera,controls:null,scene,canvas:renderer.domElement,onVisualChange:changed,onGroups:()=>{for(const group of layerGroups.values())if(!group.parent)mapGroup?.add(group);changed();}});
 this.events=events;const speechBubble=new MapSpeechBubble(host,events);
 const worldSpeech={listeners:new Set(),camera,characters,resolve:target=>events.resolve(target),time:0,plan:null,dialogueCommand:null,advanceDialogue:()=>thisRuntime.clearWorldSpeech()};
 const worldBubble=new MapSpeechBubble(host,worldSpeech);worldBubble.box.style.pointerEvents='none';
 this.showWorldSpeech=(target,text,{duration=2,typeSpeed=.03,clock=()=>particleTime.value-mapStartTime}={})=>{worldSpeech.clock=clock;worldSpeech.start=clock();worldSpeech.duration=Math.max(duration,String(text).replace(/<[^>]*>/g,'').length*typeSpeed+duration);worldSpeech.time=0;worldSpeech.plan={};worldSpeech.dialogueCommand={at:0,target,text,typeSpeed};};
 this.clearWorldSpeech=()=>{worldSpeech.plan=null;worldSpeech.dialogueCommand=null;worldBubble.sample();};
 function sampleSpeech(){speechBubble.sample();if(worldSpeech.plan){worldSpeech.time=Math.max(0,worldSpeech.clock()-worldSpeech.start);if(worldSpeech.time>=worldSpeech.duration)thisRuntime.clearWorldSpeech();}worldBubble.sample();}
 selection.captureExtra=r=>({gimmick:states.capture(r),door:r.door?{target:r.door.target}:null,character:characters.capture(r)});
 selection.restoreExtra=(r,s)=>{if(!s)return;states.restore(r,s.gimmick);if(s.door)doors.change(r,s.door.target===0?'closed':'open',true,false);characters.restore(r,s.character);};
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=true;controls.minZoom=.001;controls.maxZoom=60;controls.minPolarAngle=controls.maxPolarAngle=Math.PI/4;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
 events.controls=controls;
 manipulator=new MapManipulator(scene,camera,renderer.domElement,selection,controls,changed);
 const sentinel=(x,z)=>(x>=998.5&&x<=999.5)||(z>=998.5&&z<=999.5)||(x===99&&z===99);
 function resize(){const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;const span=(camera.top-camera.bottom)/camera.zoom;renderer.setSize(width,height,false);renderer.domElement.style.width=width+'px';renderer.domElement.style.height=height+'px';baseSpan=height/32;const aspect=width/height;camera.left=-baseSpan*aspect/2;camera.right=baseSpan*aspect/2;camera.top=baseSpan/2;camera.bottom=-camera.top;if(gameplayMode&&span>0)camera.zoom=baseSpan/span;camera.updateProjectionMatrix();if(events.plan){events.apply();events.snapCamera();}}
 function state(){return {selection:selection.getState(),position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,viewportWidth:host.clientWidth,viewportHeight:host.clientHeight,unityVerticalCompensation:camera.nativeViewportScale(),nativeWorldYScale:camera.nativeViewportScale(),viewWidth:(camera.right-camera.left)/camera.zoom,pixelsPerTileAt100:32,unityView,oblique,layers:[...layerGroups].map(([name,g])=>({name,visible:g.visible,count:g.userData.renderedTiles})),history:{undo:selection.history.length,redo:selection.future.length},hidden:[...selection.records.values()].filter(r=>!r.visible&&!r.character?.temporary).map(r=>({id:r.tile.id,name:r.tile.name,layer:r.tile.layer,position:[r.position.x,r.position.y*2,-r.position.z]})),characters:characters.diagnostics(),visibleTiles:[...selection.records.values()].filter(r=>r.visible&&(!r.character||characters.visible)&&layerGroups.get(r.tile.layer)?.visible&&(r.refs.length||environmentVisible&&r.effectRenderable)).length};}
 function changed(){onChange(state());}
 controls.addEventListener('change',changed);const observer=new ResizeObserver(resize);observer.observe(host);
 renderer.setAnimationLoop(time=>{if(disposed||exporting)return;particleTime.value=time*.001;animate(particleTime.value-mapStartTime);controls.update();sampleSpeech();if(!document.hidden)renderer.render(scene,camera);});
 function clear(){thisRuntime.clearWorldSpeech();for(const fx of gameplayEffects)fx.dispose();events.clear();characters.clear();doors.clear();items.clear();states.clear();effects.clear();selection.clear();if(mapGroup){scene.remove(mapGroup);mapGroup.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.cloud)o.geometry.dispose();});}if(eventGroup){scene.remove(eventGroup);eventGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}allMaterials.splice(0).forEach(m=>m.dispose());geometryCache.forEach(g=>g.dispose());geometryCache.clear();layerGroups.clear();pickables.length=cloudBatches.length=nativeAnimations.length=0;mapGroup=eventGroup=null;map=null;}
 this.clear=clear;
 this.loadAssets=async(data,loadImage)=>{exportAbort?.abort();const assetToken=++assetsGeneration;clear();textures.forEach(t=>t.dispose());textures.clear();bundle=data;await Promise.all(Object.entries(data.textures).map(async([key,info])=>{const image=await loadImage(info.url);if(disposed||assetToken!==assetsGeneration)return;const t=new THREE.Texture(image);t.needsUpdate=true;t.colorSpace=THREE.NoColorSpace;t.magFilter=info.filter===0?THREE.NearestFilter:THREE.LinearFilter;t.minFilter=info.filter===0?THREE.NearestMipmapNearestFilter:THREE.LinearMipmapLinearFilter;t.wrapS=t.wrapT=info.wrap===1?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.set(key,t);}));};
function createMaterial(key, vertexColors, billboard = false, partMatrix = null, animation = null) {
  const m = bundle.materials[key]; if (!m) return null;
  const profile = m.nativeShader;
  if(profile?.gles&&partMatrix&&!billboard){const mat=nativeMaterial(m,textures,partMatrix);allMaterials.push(mat);if(animation)nativeAnimations.push({material:mat,fields:animation});return mat;}
  if (!profile || !(m.texture || (profile.name === 'Unlit/Lava-Distort-Flow' && m.texenvs._LavaTex?.texture))) throw new Error('材质资源未恢复：' + m.name);
  const matcap = profile.name.startsWith('MatCap/Detail');
  const alphaMatcap = profile.name === 'MatCap/Detail Alpha';
  const tint = profile.name === 'Effect/Mobile_Additive_Color' || ['Legacy Shaders/Particles/Alpha Blended','Legacy/Particles/Additive Shear','Legacy Shaders/Particles/Additive'].includes(profile.name);
  const usesColor = matcap || profile.name === 'Unlit/Shadow' || profile.name === 'Custom/Unlit Emissive';
  const c = (usesColor ? m.colors._Color || profile.defaults._Color : tint ? m.colors._TintColor || profile.defaults._TintColor : null) || { r: 1, g: 1, b: 1, a: 1 };
  const additive = profile.srcBlend === 5 && profile.dstBlend === 1;
  const transparent = additive || profile.dstBlend !== 0;
  const queueBase = profile.queueTag.startsWith('Transparent') ? 3000 : profile.queueTag.startsWith('Overlay') ? 4000 : 2000;
  const queueDelta = Number(profile.queueTag.match(/[+-]\d+$/)?.[0] || 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { particleTime, mainMap: { value: textures.get(m.texture)||defaultWhite }, lavaMap:{value:textures.get(m.texenvs._LavaTex?.texture)||defaultWhite}, distortionMap:{value:textures.get(m.texenvs._Distort?.texture)||defaultWhite},
      lavaScale:{value:new THREE.Vector2(m.texenvs._LavaTex?.scale.x||1,m.texenvs._LavaTex?.scale.y||1)}, distortionTransform:{value:new THREE.Vector4(m.texenvs._Distort?.scale.x||1,m.texenvs._Distort?.scale.y||1,m.texenvs._Distort?.offset.x||0,m.texenvs._Distort?.offset.y||0)},
      lavaFlow:{value:new THREE.Vector2(m.floats._AnimationRateX||0,m.floats._AnimationRateY||0)},lavaStrength:{value:new THREE.Vector2(m.floats._DistortX||0,m.floats._DistortY||0)}, emissiveMap: {value: textures.get(m.texenvs._EmissiveTex?.texture)||textures.get(m.texture)}, matcapMap: { value: textures.get(m.texenvs._MatCap?.texture) || textures.get(m.texture) },
      tint: { value: new THREE.Vector4(c.r, c.g, c.b, c.a) }, brightness: { value: 1 },
      uvTransform: { value: new THREE.Vector4(m.scale.x, m.scale.y, m.offset.x, m.offset.y) },
      emissive: { value: new THREE.Vector4(...['r','g','b','a'].map(k => (m.colors._EmissiveColor || profile.defaults._EmissiveColor || { r:0,g:0,b:0,a:1 })[k])) } },
    defines: { ...(profile.name === 'Unlit/Lava-Distort-Flow'?{FLOW_LAVA:1}:{}),...(profile.name === 'Unlit/Texture'?{UNLIT_TEXTURE:1}:{}), ...(billboard ? { PARTICLE_BILLBOARD: 1 } : {}), ...(matcap ? { MATCAP: 1 } : {}), ...(alphaMatcap ? { ALPHA_MATCAP: 1 } : {}),
      ...(vertexColors && !matcap && !usesColor && !['Unlit/Texture','Unlit/Lava-Distort-Flow','Custom/Particles/Additive HDR'].includes(profile.name) ? { VERTEX_COLOR: 1 } : {}),
      ...(profile.name === 'Effect/Mobile_Additive_Color' ? { DOUBLE_TINT: 1 } : {}),
      ...(['Legacy Shaders/Particles/Alpha Blended','Legacy/Particles/Additive Shear','Legacy Shaders/Particles/Additive'].includes(profile.name) ? { LEGACY_ALPHA: 1 } : {}),
      ...(profile.name === 'Custom/Unlit Emissive' ? { UNLIT_EMISSIVE: 1 } : {}), ...(profile.name === 'Custom/Particles/Additive HDR' ? { HDR_PARTICLE: 1 } : {}) },
    vertexShader: `uniform float particleTime; uniform vec4 uvTransform;
      #ifdef FLOW_LAVA
      uniform vec2 lavaScale; uniform vec4 distortionTransform; uniform vec2 lavaFlow; varying vec2 vLavaUv; varying vec2 vDistortUv;
      #endif
      varying vec2 vUv; varying vec2 vMatcap; varying vec4 vColor;
      #ifdef VERTEX_COLOR
      attribute vec4 color;
      #endif
      #ifdef PARTICLE_BILLBOARD
      attribute vec4 particleColor;
      attribute vec3 particleShape;
      attribute float angularSpeed;
      #endif
      void main() {
        vec4 p = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
        vUv = uv * uvTransform.xy + uvTransform.zw;
        #ifdef FLOW_LAVA
        vec2 flowTime=particleTime*lavaFlow;
        vLavaUv=uv*lavaScale+sign(flowTime)*fract(abs(flowTime));vDistortUv=uv*distortionTransform.xy+distortionTransform.zw;
        #endif
        vMatcap = normalize(normalMatrix * n).xy * 0.5 + 0.5;
        vColor = vec4(1.0);
        #ifdef VERTEX_COLOR
        vColor = color;
        #endif
        #ifdef PARTICLE_BILLBOARD
        float angle = particleShape.z + angularSpeed * particleTime;
        vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * position.xy * particleShape.xy;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * (center + vec4(corner, 0.0, 0.0));
        vColor = particleColor;
        #endif
      }`,
    fragmentShader: `uniform sampler2D mainMap; uniform sampler2D matcapMap; uniform sampler2D emissiveMap;
      uniform vec4 tint; uniform vec4 emissive; uniform float brightness;
      #ifdef FLOW_LAVA
      uniform sampler2D lavaMap; uniform sampler2D distortionMap; uniform vec2 lavaStrength; varying vec2 vLavaUv; varying vec2 vDistortUv;
      #endif
      varying vec2 vUv; varying vec2 vMatcap; varying vec4 vColor;
      void main() {
        vec4 c = texture2D(mainMap, vUv) * tint * vColor;
        #ifdef MATCAP
        c *= texture2D(matcapMap, vMatcap); c.rgb *= 3.0;
        #ifndef ALPHA_MATCAP
        c.a *= 3.0;
        #endif
        #endif
        #ifdef DOUBLE_TINT
        c *= 2.0;
        #endif
        #ifdef LEGACY_ALPHA
        c *= 2.0; c.a = clamp(c.a, 0.0, 1.0);
        #endif
        #ifdef HDR_PARTICLE
        c = texture2D(mainMap, vUv) * emissive;
        #endif
        #ifdef UNLIT_EMISSIVE
        c = texture2D(mainMap,vUv)*tint; c.rgb += texture2D(emissiveMap,vUv).rgb*emissive.rgb;
        #endif
        #ifdef FLOW_LAVA
        c=texture2D(lavaMap,vLavaUv-texture2D(distortionMap,vDistortUv).a*lavaStrength);
        #endif
        #ifdef UNLIT_TEXTURE
        c=vec4(texture2D(mainMap,vUv).rgb,1.0);
        #endif
        c.rgb *= brightness;
        gl_FragColor = c;
      }`,
    transparent, depthWrite: profile.depthWrite, depthTest: profile.depthTest !== 8,
    side: profile.cull === 0 ? THREE.DoubleSide : profile.cull === 1 ? THREE.BackSide : THREE.FrontSide,
    blending: additive ? THREE.AdditiveBlending : transparent ? THREE.NormalBlending : THREE.NoBlending,
    toneMapped: false
  });
  mat.userData = { source: m.name, shader: profile.name, queue: m.queue >= 0 ? m.queue : queueBase + queueDelta };
  allMaterials.push(mat);if(animation)nativeAnimations.push({material:mat,fields:animation}); return mat;
}
function partGeometry(templateKey, partIndex, subIndex) {
  const key = `${templateKey}/${partIndex}/${subIndex}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const part = bundle.templates[templateKey].parts[partIndex], raw = bundle.meshes[part.mesh];
  const positions = new Float32Array(raw.positions), g = new THREE.BufferGeometry();
  const transform = new THREE.Matrix4().set(...part.matrix), p = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    p.fromArray(positions, i).applyMatrix4(transform); p.z *= -1; p.toArray(positions, i);
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const count=positions.length/3,colors=vertexColors(raw.colors,bundle.vertexFormats?.[part.mesh]?.color);
  g.setAttribute('nativePosition',new THREE.Float32BufferAttribute(raw.positions.flatMap((v,i)=>i%3===2?[v,1]:[v]),4));
  g.setAttribute('nativeNormal',new THREE.Float32BufferAttribute(raw.normals||new Array(count*3).fill(0),3));
  g.setAttribute('nativeUv',new THREE.Float32BufferAttribute(raw.uv||new Array(count*2).fill(0),2));
  g.setAttribute('nativeUv2',new THREE.Float32BufferAttribute(raw.uv2||new Array(count*2).fill(0),2));
  g.setAttribute('nativeColor',new THREE.Float32BufferAttribute(colors||new Array(count*4).fill(1),4));
  if (raw.normals) {
    const normals = new Float32Array(raw.normals), nm = new THREE.Matrix3().getNormalMatrix(transform);
    for (let i = 0; i < normals.length; i += 3) { p.fromArray(normals, i).applyMatrix3(nm).normalize(); p.z *= -1; p.toArray(normals, i); }
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }
  if (raw.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(raw.uv, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, colors.length / (positions.length / 3)));
  const indices = raw.submeshes[subIndex].slice();
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  g.setIndex(indices); if (!raw.normals) g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  geometryCache.set(key, g); return g;
}
function buildClouds(key, tiles, group, layerIndex) {
  const spec = bundle.environment?.clouds[key]; if (!spec) return false;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const count = tiles.length * spec.count, colors = [], shapes = [], speeds = [];
  const mesh = new THREE.InstancedMesh(geometry, createMaterial(spec.material, false, true), count);
  mesh.renderOrder = mesh.material.userData.queue * 20 + layerIndex + spec.sortingLayer * .1;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0), rotation = new THREE.Quaternion();
  let seed = 2166136261;
  for (const c of key) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const sample = range => THREE.MathUtils.lerp(...range, random());
  let i = 0;
  for (const tile of tiles) {
    rotation.setFromAxisAngle(axis, -tile.rotation * Math.PI / 2);
    for (let n = 0; n < spec.count; n++) {
      // Unity box emitter, infinite lifetime, zero initial velocity. Keep the
      // source density and sizes; seed stability makes browser review repeatable.
      position.set(...['x','y','z'].map(k => spec.shapePosition[k] + spec.position[k] + (random() - .5) * spec.shapeScale[k]));
      position.z *= -1; position.applyQuaternion(rotation);
      position.add(new THREE.Vector3(tile.x, tile.y * .5, -tile.z));
      mesh.setMatrixAt(i++, matrix.makeTranslation(position.x, position.y, position.z));
      const size = sample(spec.size); shapes.push(size, size, sample(spec.angle)); speeds.push(sample(spec.angularSpeed));
      const mix = random(); colors.push(...['r','g','b','a'].map(k => THREE.MathUtils.lerp(spec.minColor[k], spec.maxColor[k], mix)));
    }
  }
  geometry.setAttribute('particleColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 4));
  geometry.setAttribute('particleShape', new THREE.InstancedBufferAttribute(new Float32Array(shapes), 3));
  geometry.setAttribute('angularSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));
  // Billboard extent changes with the camera; the quad's local bounding sphere
  // does not describe that extent. Avoid incorrectly culling the cloud batch.
  mesh.frustumCulled = false; mesh.userData.cloud = true;
  mesh.userData.tiles=tiles.flatMap(t=>Array(spec.count).fill(t));mesh.userData.sourceMaterial=mesh.material.userData.source;mesh.userData.sourceShader=mesh.material.userData.shader;mesh.visible = environmentVisible; group.add(mesh); cloudBatches.push(mesh);
  return true;
}

 this.build=async(doc,{loadCharacters=true}={})=>{const buildGeneration=assetsGeneration;clear();mapStartTime=particleTime.value;map=doc;events.mapName=doc.mapName;mapGroup=new THREE.Group();scene.add(mapGroup);
  let renderedTiles = 0, sentinelTiles = 0, emptyTiles = 0, instanceCount = 0;
  const sourceBounds = new THREE.Box3();
  for (const [layerIndex, layer] of map.layers.entries()) {
    if (layer.type !== 0) continue;
    const group = new THREE.Group(); group.name = layer.name; group.userData.renderedTiles = 0; group.userData.cloudTiles = 0; layerGroups.set(layer.name, group); mapGroup.add(group);
    const byTemplate = new Map();let tileIndex=0;
    for (const tile of layer.tiles) {
      if (sentinel(tile.x, tile.z)) { sentinelTiles++; continue; }
      const key = `${bundle.setOrder.indexOf(doc.tilesets[tile.ts - 1].name)+1}:${tile.name}`;
      if (!bundle.templates[key] || bundle.templates[key].name !== tile.name) throw new Error('资源模板与地图索引不一致：' + key);
      if (!byTemplate.has(key)) byTemplate.set(key, []);
      const live={...tile,layer:layer.name,id:layerIndex+':'+tileIndex++};live.item=itemInfo(live,doc,bundle.itemMetadata);byTemplate.get(key).push(live);selection.add(live);
      sourceBounds.expandByPoint(new THREE.Vector3(tile.x, 0, -tile.z));
    }
    for (const [key, tiles] of byTemplate) {
      const state=bundle.environment?.states?.[key];if(state)states.register(state.spec,state.assets,tiles,group,layerIndex);
      const nativeEffect=bundle.environment?.effects?.[key];let didRender = buildClouds(key, tiles, group, layerIndex);if(nativeEffect){const particles=effects.build(nativeEffect.spec,nativeEffect.assets,tiles,group,layerIndex);didRender=!!particles||didRender;}
      tiles.forEach(t=>selection.records.get(t.id).effectRenderable=!!didRender);
      if (didRender) group.userData.cloudTiles += tiles.length;
      const marked=items.build(tiles,group,doc,bundle.itemMetadata);didRender=!!marked||didRender;
      const parts = bundle.templates[key].parts;
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi], raw = bundle.meshes[part.mesh];
        for (let si = 0; si < raw.submeshes.length; si++) {
          const matKey = part.materials[Math.min(si, part.materials.length - 1)];
          const animation=nativeEffect?.spec.staticScripts[part.node]||bundle.environment?.animators?.[bundle.setOrder[Number(key.split(':')[0])-1]]?.[bundle.templates[key].name]?.[part.node];
          const mat = createMaterial(matKey, !!raw.colors, false, part.matrix, animation); if (!mat || !raw.submeshes[si].length) continue;
          const mesh = new THREE.InstancedMesh(partGeometry(key, pi, si), mat, tiles.length);
          const sorting=animation?.find?.(s=>s.type==='SortingLayer')?.fields;
          mesh.renderOrder=renderOrder(mat.userData.queue,layerIndex,sorting?.layerName,sorting?.order,bundle.sortingLayers);
          const transform = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
          tiles.forEach((tile, i) => {
            q.setFromAxisAngle(axis, -tile.rotation * Math.PI / 2);
            // Viewer uses one tile as one world unit. Matches the existing map
            // preview's 0.1 global scale, divided out uniformly for readability.
            transform.compose(new THREE.Vector3(tile.x, tile.y * .5, -tile.z), q, new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(i, transform);selection.attach(tile.id,mesh,i);
          });
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
          mesh.userData = { tiles, sourceMesh: raw.name, sourceMaterial: mat.userData.source, sourceShader: mat.userData.shader, kind: 'tile' };
          group.add(mesh); pickables.push(mesh); instanceCount += tiles.length; didRender = true;
        }
      }
      if (didRender) { renderedTiles += tiles.length; group.userData.renderedTiles += tiles.length; }
      else emptyTiles += tiles.length;
    }

    if(disposed)throw new Error('Preview disposed');
  }
  const characterResult=await characters.build(doc,layerGroups,bundle.itemMetadata,bundle.sortingLayers,{load:loadCharacters});
  if(disposed||map!==doc||buildGeneration!==assetsGeneration)throw new DOMException('地图已切换','AbortError');for(const group of layerGroups.values())if(!group.parent)mapGroup.add(group);
  for(const entry of characters.entries){sourceBounds.expandByPoint(entry.record.position);if(entry.loaded)entry.group.userData.renderedTiles++;}
  for(const r of selection.records.values()){const index=r.tile.properties?.find(p=>p.component==='Tilemaps.TileProp')?.value.keyIndex;r.tile.eventHandle=doc.handles?.[1]?.[index];doors.register(r);}doors.sample(0);
  pickables.push(...effects.batches.map(b=>b.mesh));states.initialize();effects.sample(0);mapGroup.userData.bounds=sourceBounds;
  eventGroup=new THREE.Group();eventGroup.visible=false;eventGroup.renderOrder=1000000;scene.add(eventGroup);
  for(const l of doc.layers.filter(l=>l.type===1)){const events=l.events.filter(e=>!sentinel(e.position[0],e.position[2]));const geom=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(events.flatMap(e=>[e.position[0],e.position[1]+1.5,-e.position[2]]),3));const mat=new THREE.PointsMaterial({color:0x93aee6,size:6,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true});const points=new THREE.Points(geom,mat);points.renderOrder=1000000;points.userData.eventLayer=l.name;eventGroup.add(points);}
  for(const m of allMaterials)m.uniforms.brightness.value=brightness;
  effects.setVisible(environmentVisible);effects.setBrightness(brightness);this.fit();changed();return {characters:characterResult,nativeParticleSystems:effects.simulations.reduce((n,s)=>n+s.effect.systems.length,0),nativeParticleInstances:effects.batches.reduce((n,b)=>n+(b.staticSprite?0:b.mesh.count),0),renderedTiles,emptyTiles,sentinelTiles,instanceCount,cloudEmitters:[...layerGroups.values()].reduce((n,g)=>n+g.userData.cloudTiles,0),cloudParticles:cloudBatches.reduce((n,b)=>n+b.count,0),nativeAnimatedMaterials:nativeAnimations.length,layers:doc.layers.length,tiles:doc.tileCount};
 };
 this.fit=()=>{if(!mapGroup)return;const bounds=mapGroup.userData.bounds,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const aspect=host.clientWidth/Math.max(host.clientHeight,1);const fitSpan=Math.max(4,size.z*(oblique&&!unityView?.78:1),size.x/aspect)*1.35;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,oblique?500:700,oblique?500:.01));camera.zoom=THREE.MathUtils.clamp(host.clientHeight/32/fitSpan,.001,60);resize();controls.update();changed();};
 this.setView=(value)=>{oblique=value==='oblique';unityView=oblique;controls.minPolarAngle=unityView?Math.PI/4:.02;controls.maxPolarAngle=unityView?Math.PI/4:Math.PI*.49;const center=controls.target;camera.position.copy(center).add(new THREE.Vector3(0,oblique?500:700,oblique?500:.01));resize();controls.update();changed();};
 this.setUnity=(enabled)=>{unityView=enabled;if(enabled)oblique=true;controls.minPolarAngle=enabled?Math.PI/4:.02;controls.maxPolarAngle=enabled?Math.PI/4:Math.PI*.49;if(enabled)camera.position.copy(controls.target).add(new THREE.Vector3(0,500,500));resize();controls.update();changed();};
 function gimmickControls(r){const c=states.controls(r),door=doors.controls(r);return c||door?{groups:[...(c?.groups||[]),...(door?[door]:[])],nodes:c?.nodes||[]}:null;}
 this.getGimmickControls=()=>{const records=selection.values();if(!records.length||records.some(r=>r.tile.name!==records[0].tile.name||r.tile.ts!==records[0].tile.ts))return null;const all=records.map(gimmickControls);if(all.some(c=>!c))return null;const first=all[0];return {count:records.length,groups:first.groups.filter(g=>all.every(c=>c.groups.some(x=>x.id===g.id&&JSON.stringify(x.options)===JSON.stringify(g.options)))).map(g=>({...g,value:all.every(c=>c.groups.find(x=>x.id===g.id)?.value===g.value)?g.value:'__mixed'})),nodes:first.nodes.filter(n=>all.every(c=>c.nodes.some(x=>x.id===n.id))).map(n=>({...n,checked:all.every(c=>c.nodes.find(x=>x.id===n.id)?.checked===n.checked)?n.checked:null}))};};
 this.setGimmickState=(id,value,still=false)=>{if(!this.getGimmickControls()||value==='__mixed')return;selection.transaction(()=>{for(const r of selection.values())if(id==='door:height')doors.change(r,value,still,false);else states.change(r,id,value,still,false);animate(particleTime.value-mapStartTime);selection.refresh();});changed();};
 this.getCharacterControls=()=>selection.values().length===1?characters.controls(selection.values()[0]):null;
 this.setCharacterState=settings=>{if(selection.values().length!==1||!selection.values()[0].character)return;selection.transaction(()=>characters.change(selection.values()[0],settings));selection.refresh();changed();};
 this.getCharacters=()=>characters.entries.map(e=>({...e.tile.character,name:e.tile.name,tileId:e.tile.id,layer:e.tile.layer,position:[e.record.position.x,e.record.position.y*2,-e.record.position.z]}));
 this.loadCharacters=async()=>{if(!mapGroup||!characters.deferred)return characters.diagnostics();const doc=map,token=assetsGeneration;const result=await characters.loadDeferred();if(disposed||doc!==map||token!==assetsGeneration)throw new DOMException('地图已切换','AbortError');for(const group of layerGroups.values())if(!group.parent)mapGroup.add(group);for(const entry of characters.entries){mapGroup.userData.bounds.expandByPoint(entry.record.position);if(entry.loaded)entry.group.userData.renderedTiles++;}changed();return result;};
 this.setCharacterShadows=value=>{characters.setShadows(value);changed();};this.setCharacters=value=>{characters.setVisible(value);changed();};this.setCharactersPlaying=value=>characters.setPlaying(value);
 this.focusSelection=()=>{const values=selection.values();if(!values.length)return;const center=values.reduce((p,r)=>p.add(r.position),new THREE.Vector3()).multiplyScalar(1/values.length),offset=camera.position.clone().sub(controls.target);controls.target.copy(center);camera.position.copy(center).add(offset);camera.zoom=Math.max(camera.zoom,2);camera.updateProjectionMatrix();controls.update();changed();};
 this.setEnvironment=value=>{environmentVisible=value;cloudBatches.forEach(b=>b.visible=value);effects.setVisible(value);states.setVisible(value);changed();};
 this.setEvents=value=>{if(eventGroup)eventGroup.visible=value;};
 this.setLayer=(name,value)=>{const g=layerGroups.get(name);if(g)g.visible=value;changed();};
 this.setBrightness=value=>{brightness=value;characters.setBrightness(value);effects.setBrightness(value);states.setBrightness(value);allMaterials.forEach(m=>m.uniforms.brightness.value=value);};
 this.zoom=factor=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.001,60);camera.updateProjectionMatrix();changed();};
 this.actualSize=()=>{camera.zoom=1;camera.updateProjectionMatrix();changed();};
 this.selectTiles=(ids)=>{selection.ids.clear();for(const id of ids)if(selection.records.has(id))selection.ids.add(id);selection.refresh();};
 this.getTileRecords=()=>[...selection.records.values()].map(r=>({...r.tile,...{visible:r.visible,partCount:r.refs.length}}));
 this.setCollectibles=value=>{items.setVisible(value);states.setPickupsVisible(value);changed();};
 this.setTransformMode=mode=>manipulator.setMode(mode);this.setTransformSnap=value=>manipulator.setSnap(value);this.setSelectionOutline=value=>{selection.overlay.visible=!!value;};
 this.getSelection=()=>selection.getState();this.editSelection=changes=>{selection.transaction(()=>selection.apply(changes));changed();};this.resetEdits=(all=false)=>{const records=all?[...selection.records.values()]:selection.values();selection.transaction(()=>{states.reset(records);characters.reset(records);selection.reset(all);doors.reset(records);},records);changed();};
 this.undo=()=>{if(exporting||manipulator.control.dragging)return false;if(events.plan)events.stop();if(events.walking)events.walk(false);const result=selection.undo();animate(particleTime.value-mapStartTime);changed();return result;};this.redo=()=>{if(exporting||manipulator.control.dragging)return false;if(events.plan)events.stop();if(events.walking)events.walk(false);const result=selection.redo();animate(particleTime.value-mapStartTime);changed();return result;};
 this.restoreHidden=ids=>{const records=ids.map(id=>selection.records.get(id)).filter(r=>r&&!r.visible);selection.transaction(()=>{const touched=new Set();for(const r of records){r.visible=true;selection.update(r,touched);}for(const mesh of touched)mesh.computeBoundingSphere();selection.refresh();},records);changed();};this.clearSelection=()=>selection.select(null);
 // Gameplay clients share actors, original object states and camera projection with the editor.
 this.setGameplayMode=value=>{gameplayMode=!!value;controls.enabled=!gameplayMode;controls.enableDamping=!gameplayMode;manipulator.setMode('select');selection.overlay.visible=!gameplayMode;};
 this.createActor=async spec=>{const r=await characters.prepareActor(spec);r.character.temporary=false;r.tile.character.preview=false;if(spec.position)r.position.set(spec.position[0],spec.position[1],-spec.position[2]);r.visible=spec.visible!==false;selection.matrix(r);for(const group of layerGroups.values())if(!group.parent)mapGroup.add(group);await characters.warm(r,['front','back','left','right']);characters.sample(characters.time,true);return r;};
 this.getWorldRecords=()=>[...selection.records.values()];
 this.setActorState=(r,settings)=>{const changes={};for(const [key,value] of Object.entries(settings))if(r.character.settings[key]!==value)changes[key]=value;if(Object.keys(changes).length)return characters.change(r,changes);};
 this.restartActorAnimation=r=>{if(r.character?.loaded)characters.pose(r.character);};
 this.setWorldPosition=(r,p)=>{r.position.set(p[0],p[1],-p[2]);selection.update(r);};
 this.setWorldRotation=(r,degrees)=>{r.rotation=degrees;selection.update(r);};
 this.setWorldVisible=(r,value)=>{r.visible=!!value;selection.update(r);};
 this.spawnWorldEffect=(name,p,{duration=Infinity,follow,rotation=0,clock=()=>particleTime.value-mapStartTime,state}={})=>{
  const data=bundle.environment?.gameplayEffects?.[name];if(!data)return null;
  const tile={id:'gameplay-fx:'+ ++gameplayEffectId,name,layer:'gameplay-effects',x:p[0],y:p[1]*2,z:p[2],rotation:rotation/90},record=selection.add(tile),group=new THREE.Group();mapGroup.add(group);states.register(data.spec,data.assets,[tile],group,0);record.gimmick.previewTime=0;states.activate(record.gimmick);record.gimmick.effectStart=0;for(const c of record.gimmick.controllers)c.start=0;
  if(state)this.playWorldGimmick(record,state);for(const c of record.gimmick.controllers)c.start=0;
  const fx={record,follow,duration,clock,start:clock(),dispose:()=>{if(!gameplayEffects.delete(fx))return;states.remove(record);selection.records.delete(tile.id);group.removeFromParent();}};gameplayEffects.add(fx);return fx;
 };
 const timelineMedia=new Map(),timelineSounds=new Set();let mediaTime=null;
 events.clearMedia=()=>{for(const m of timelineMedia.values())m.dispose();timelineMedia.clear();timelineSounds.clear();mediaTime=null;};
 events.sampleMedia=(commands,t)=>{
  const active=new Set(),anchor=(target,offset=[0,0,0],at=t)=>{const record=events.resolve(target),p=events.actorCommands.has(record)?events.evaluateActor(record,events.actorCommands.get(record),at).position:[record.position.x,record.position.y,-record.position.z];return p.map((v,i)=>v+offset[i]);};
  for(const c of commands){if(c.op==='sound'){if(events.playing&&!timelineSounds.has(c)&&c.at<=t&&(c.at===0||mediaTime!==null&&t>=mediaTime&&c.at>mediaTime)){timelineSounds.add(c);events.onSound?.(c.name);}continue;}if(!['item','effect'].includes(c.op)||t<c.at||t>=c.at+c.duration)continue;active.add(c);let m=timelineMedia.get(c);
   if(!m){if(c.op==='item')m=items.spawn(c.item,bundle.itemMetadata,mapGroup);else{m=thisRuntime.spawnWorldEffect(c.name,c.target?anchor(c.target,c.offset):c.position,{duration:Infinity,clock:()=>events.time});if(!m)throw Error('缺少原生剧情特效：'+c.name);m.start=c.at;}timelineMedia.set(c,m);}
   if(c.op==='item'){const a=anchor(c.target,c.offset,c.at),b=anchor(c.toTarget,c.toOffset||c.offset,c.at),u=(t-c.at)/c.duration;m.setPosition(a.map((v,i)=>v+(b[i]-v)*u));}else{m.record.gimmick.previewTime=t-c.at;thisRuntime.setWorldPosition(m.record,c.target?anchor(c.target,c.offset):c.position);}
  }for(const [c,m] of timelineMedia)if(!active.has(c)){m.dispose();timelineMedia.delete(c);}mediaTime=t;
 };
 this.playWorldGimmick=(r,name,{still=false}={})=>{const e=r?.gimmick;if(!e)return false;let applied=false;for(const [i,c] of e.spec.controllers.entries()){const index=c.states.findIndex(s=>s.name.toLowerCase()===name.toLowerCase());if(index>=0){if(e.controllers[i].index!==index||e.controllers[i].still!==still)states.change(r,'controller:'+i,String(index),still,false);applied=true;}}return applied;};
 this.setWorldGimmick=(r,{open,lit,still=false}={})=>{if(r.door&&open!==undefined){const target=open?r.door.fields.OpenHeight:0;if(r.door.target!==target)doors.change(r,open?'open':'closed',still,false);return true;}if(lit!==undefined)return this.playWorldGimmick(r,lit?'on':'off',{still});if(open!==undefined)return this.playWorldGimmick(r,open?'open':'close',{still});return false;};
 this.focusWorld=(p,span=10)=>{const offset=new THREE.Vector3(0,500,500);controls.target.set(p[0],p[1],-p[2]);camera.position.copy(controls.target).add(offset);camera.zoom=THREE.MathUtils.clamp((camera.top-camera.bottom)/span,.001,60);camera.updateProjectionMatrix();camera.lookAt(controls.target);camera.updateMatrixWorld();};
 this.projectWorld=p=>{const v=new THREE.Vector3(p[0],p[1],-p[2]).project(camera);return {x:(v.x+1)*host.clientWidth/2,y:(1-v.y)*host.clientHeight/2,visible:v.z>=-1&&v.z<=1};};
 this.getState=state;
 this.export=async(options={})=>{
  if(!mapGroup||!map)throw new Error('请先加载地图');if(exporting)throw new Error('正在导出地图');
  exporting=true;controls.enabled=false;exportAbort=new AbortController();const abort=()=>exportAbort?.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  const sourceMap=map,sourceGroup=mapGroup,previousTime=particleTime.value-mapStartTime,time=options.time??previousTime;
  try{animate(time);camera.updateMatrixWorld();const {exportMap}=await import('./export.js');return await exportMap({renderer,camera:camera.clone(),group:mapGroup,map,bundle,textures,selectedIds:new Set(selection.ids),effectMeshes:new Set([...items.batches.map(b=>b.mesh),...effects.batches.filter(b=>!b.staticSprite).map(b=>b.mesh),...states.batches.filter(b=>!b.staticSprite).map(b=>b.mesh),...cloudBatches]),reflectedMeshes:new Set([...effects.batches,...states.batches].map(b=>b.mesh)),state:state(),time},{...options,time,signal:exportAbort.signal});}
  finally{options.signal?.removeEventListener('abort',abort);exportAbort=null;exporting=false;controls.enabled=true;if(!disposed&&map===sourceMap&&mapGroup===sourceGroup){particleTime.value=performance.now()*.001;mapStartTime=particleTime.value-previousTime;animate(previousTime);}}
 };
 this.render=(animationTime=particleTime.value-mapStartTime)=>{animate(animationTime);controls.update();sampleSpeech();renderer.render(scene,camera);};
 this.getDiagnostics=()=>({characters:characters.diagnostics(),scriptedDoors:doors.entries.length,gimmicks:states.diagnostics(),animatedMaterials:nativeAnimations.map(a=>({name:a.material.userData.source,tint:(a.material.uniforms._TintColor?.value||a.material.uniforms.tint?.value)?.toArray()})),drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,failedPrograms:renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length});
 const marquee=document.createElement('div');marquee.className='map-marquee';marquee.style.cssText='position:absolute;pointer-events:none;border:1px solid #8ad5ff;background:#8ad5ff22;z-index:3;display:none';host.append(marquee);let boxStart=null,oldOrbit=true;
 const boxDown=e=>{if(gameplayMode||exporting||!map||e.button!==0||!e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();oldOrbit=controls.enabled;controls.enabled=false;boxStart={x:e.clientX,y:e.clientY,add:e.ctrlKey||e.metaKey};renderer.domElement.setPointerCapture(e.pointerId);};
 const boxMove=e=>{if(!boxStart)return;const rect=host.getBoundingClientRect();Object.assign(marquee.style,{display:'block',left:Math.min(e.clientX,boxStart.x)-rect.left+'px',top:Math.min(e.clientY,boxStart.y)-rect.top+'px',width:Math.abs(e.clientX-boxStart.x)+'px',height:Math.abs(e.clientY-boxStart.y)+'px'});};
 const boxEnd=e=>{if(!boxStart)return;e.preventDefault();e.stopImmediatePropagation();const start=boxStart;boxStart=null;marquee.style.display='none';controls.enabled=oldOrbit;renderer.domElement.releasePointerCapture(e.pointerId);if(e.type==='pointercancel')return;const rect=renderer.domElement.getBoundingClientRect(),left=Math.min(start.x,e.clientX),right=Math.max(start.x,e.clientX),top=Math.min(start.y,e.clientY),bottom=Math.max(start.y,e.clientY);camera.updateMatrixWorld();if(!start.add)selection.ids.clear();for(const r of selection.records.values()){if(!r.visible||!layerGroups.get(r.tile.layer)?.visible||!r.refs.some(ref=>!ref.suppressed&&ref.enabled!==false&&ref.mesh.visible))continue;const box=selection.bounds(r),points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).project(camera);points.push({x:(v.x+1)*rect.width/2+rect.left,y:(1-v.y)*rect.height/2+rect.top,z:v.z});}if(points.every(p=>p.z < -1||p.z>1))continue;if(Math.max(...points.map(p=>p.x))>=left&&Math.min(...points.map(p=>p.x))<=right&&Math.max(...points.map(p=>p.y))>=top&&Math.min(...points.map(p=>p.y))<=bottom)selection.ids.add(r.tile.id);}selection.refresh();changed();};
 renderer.domElement.addEventListener('pointerdown',boxDown,true);renderer.domElement.addEventListener('pointermove',boxMove,true);renderer.domElement.addEventListener('pointerup',boxEnd,true);renderer.domElement.addEventListener('pointercancel',boxEnd,true);
 let start=[0,0];const down=e=>{renderer.domElement.focus({preventScroll:true});start=[e.clientX,e.clientY];if(!manipulator.control.dragging)manipulator.consumed=false;};const context=e=>e.preventDefault();
 let lastPick=null;
 const up=e=>{if(gameplayMode||exporting||!map||e.button!==0||manipulator.consumed||manipulator.control.axis||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;
  if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&events.advanceDialogue())return;
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  if(events.pick(ray))return;
  const shown=m=>{for(let o=m;o;o=o.parent)if(!o.visible)return false;return true;},hits=[],seen=new Set();
  for(const hit of ray.intersectObjects(pickables.filter(shown),false)){const tile=hit.object.userData.tiles?.[hit.instanceId];if(!tile||seen.has(tile.id)||!selection.records.get(tile.id)?.visible)continue;seen.add(tile.id);hits.push(hit);}
  const key=hits.map(h=>h.object.userData.tiles[h.instanceId].id).join('|'),repeat=lastPick&&lastPick.key===key&&Math.hypot(e.clientX-lastPick.x,e.clientY-lastPick.y)<6;
  const index=repeat?(lastPick.index+1)%Math.max(1,hits.length):0;lastPick={key,index,x:e.clientX,y:e.clientY};
  const hit=hits[index],tile=hit?.object.userData.tiles[hit.instanceId];
  if(hit){const record=selection.records.get(tile.id);record.tile={...record.tile,mesh:hit.object.userData.sourceMesh,material:hit.object.userData.sourceMaterial,shader:hit.object.userData.sourceShader};}
  selection.select(tile?.id,e.ctrlKey||e.metaKey);onPick(selection.values().length===1?selection.values()[0].tile:null);
 };
 renderer.domElement.addEventListener('contextmenu',context);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
 const keyDown=e=>events.key(e,true),keyUp=e=>events.key(e,false),blur=()=>{events.keys.clear();if(events.walking&&events.walkRecord?.character)characters.change(events.walkRecord,{animation:'idle'});};renderer.domElement.addEventListener('keydown',keyDown);renderer.domElement.addEventListener('keyup',keyUp);renderer.domElement.addEventListener('blur',blur);
 this.dispose=()=>{if(disposed)return;renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('keyup',keyUp);renderer.domElement.removeEventListener('blur',blur);disposed=true;this.frameListeners.clear();exportAbort?.abort();++assetsGeneration;observer.disconnect();speechBubble.dispose();worldBubble.dispose();renderer.setAnimationLoop(null);renderer.domElement.removeEventListener('pointerdown',boxDown,true);renderer.domElement.removeEventListener('pointermove',boxMove,true);renderer.domElement.removeEventListener('pointerup',boxEnd,true);renderer.domElement.removeEventListener('pointercancel',boxEnd,true);marquee.remove();manipulator.dispose();controls.dispose();clear();textures.forEach(t=>t.dispose());textures.clear();renderer.domElement.removeEventListener('contextmenu',context);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);selection.dispose();defaultWhite.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};resize();
 }
}
