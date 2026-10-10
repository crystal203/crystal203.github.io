import * as THREE from '../vendor/three.module.js';
import {renderOrder} from './render-order.js';
import {vertexColors} from './vertex-data.js';
import {MapSelection} from './selection.js';
import {MapEffects} from './effects.js';
import {sampleAnimator} from '../core/custom-animator.js';
import {nativeMaterial} from './native-material.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
export {decodeMap,parseKong} from './decoder.js';
export function assetsForMap(pack,doc){
 const templates={},meshes={},materials={},textures={},clouds={},effects={};
 for(const l of doc.layers)for(const t of l.tiles){const set=doc.tilesets[t.ts-1].name,k=(pack.setOrder.indexOf(set)+1)+':'+t.name,original=pack.templates[k];if(!original)throw new Error('地图资源未收录图块：'+t.name);
  const extra=pack.environment?.effects?.[set],effect=extra?.templates[t.name];
  const template=effect?{...original,parts:original.parts.map(p=>({...p,materials:effect.materialOverrides[p.node]||p.materials}))}:original;templates[k]=template;
  for(const p of template.parts){meshes[p.mesh]=pack.meshes[p.mesh];for(const m of p.materials)if(m&&(extra?.materials[m]||pack.materials[m]))materials[m]=extra?.materials[m]||pack.materials[m];}
  if(effect){effects[k]={spec:effect,assets:{...extra,vertexFormats:pack.vertexFormats,sortingLayers:pack.sortingLayers}};for(const id of new Set([...effect.systems.flatMap(s=>s.materialKeys||[s.materialKey]),...effect.sprites.flatMap(s=>s.materials)]))if(extra.materials[id])materials[id]=extra.materials[id];Object.assign(textures,extra.textures);}
  if(pack.environment?.clouds?.[k]&&!effect?.systems.length){clouds[k]=pack.environment.clouds[k];const m=clouds[k].material;materials[m]=pack.materials[m];}
 }
 for(const m of Object.values(materials))for(const env of Object.values(m.texenvs)){if(env.texture&&!textures[env.texture])textures[env.texture]=pack.textures[env.texture];}
 // Retain only textures referenced by this map's selected effect templates.
 const needed=new Set();for(const m of Object.values(materials))for(const e of Object.values(m.texenvs))if(e.texture)needed.add(e.texture);
 for(const {spec,assets} of Object.values(effects)){for(const s of spec.systems)for(const id of s.modules.UVModule?.sprites||[])if(assets.sprites[id])needed.add(assets.sprites[id].texture);for(const s of spec.sprites||[])if(assets.sprites[s.sprite])needed.add(assets.sprites[s.sprite].texture);}
 return {...pack,templates,meshes,materials,textures:Object.fromEntries([...needed].filter(k=>textures[k]).map(k=>[k,textures[k]])),environment:{...pack.environment,clouds,effects}};
}

/** Reusable map runtime. No application UI or catalog is loaded by this module. */
export class MapRuntime {
 constructor(host,{onChange=()=>{},onPick=()=>{},onSelection=()=>{}}={}) {
 let renderer,camera,controls,scene,bundle,map,mapGroup,eventGroup,baseSpan=220,oblique=true,unityView=true,disposed=false,environmentVisible=true,brightness=1,assetsGeneration=0;
 const textures=new Map(),geometryCache=new Map(),layerGroups=new Map(),allMaterials=[],pickables=[],cloudBatches=[],nativeAnimations=[];
 const particleTime={value:0};let mapStartTime=0;
 function animate(time){for(const item of nativeAnimations){const uniforms=item.material.uniforms;const scripts=Array.isArray(item.fields)?item.fields:[{type:'CustomAnimator',fields:item.fields}];
  for(const script of scripts){const f=script.fields,tint=uniforms[f.CustomShaderColorKey||'_TintColor']?.value||uniforms.tint?.value,st=uniforms._MainTex_ST?.value;
   if(script.type==='CustomAnimator')for(const c of sampleAnimator(f,time)){
    if(tint&&c.key>=6&&c.key<=9)tint[['x','y','z','w'][c.key-6]]=c.value;
    else if(tint&&c.key===17)tint.set(c.vector[0],c.vector[1],c.vector[2],tint.w);
    else if(st&&c.key>=11&&c.key<=14)st[['z','w','x','y'][c.key-11]]=c.value;
    else if(st&&c.key===18){st.z=c.vector[0];st.w=c.vector[1];}else if(st&&c.key===19){st.x=c.vector[0];st.y=c.vector[1];}
   }
   if(script.type.startsWith('FxUvanim')){const name=script.type.includes('Tex2')?'_MainTex2_ST':'_MainTex_ST',u=uniforms[name]?.value;if(u){const base=item.material.userData.uvBase??={};base[name]??=u.clone();u.z=base[name].z+(f.scrollSpeed_X||0)*time;u.w=base[name].w+(f.scrollSpeed_Y||0)*time;}}
  }
 }effects.sample(time);}
 const defaultWhite=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);defaultWhite.needsUpdate=true;
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x0f1116);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
 scene=new THREE.Scene();const selection=new MapSelection(scene,onSelection);camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,10000);camera.position.set(0,500,500);
 const effects=new MapEffects(camera,textures,selection);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=true;controls.minZoom=.001;controls.maxZoom=60;controls.minPolarAngle=controls.maxPolarAngle=Math.PI/4;controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};
 const sentinel=(x,z)=>(x>=998.5&&x<=999.5)||(z>=998.5&&z<=999.5)||(x===99&&z===99);
 function resize(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);baseSpan=height/32;const aspect=width/height;camera.left=-baseSpan*aspect/2;camera.right=baseSpan*aspect/2;camera.top=baseSpan/2*(unityView&&oblique?Math.SQRT1_2:1);camera.bottom=-camera.top;camera.updateProjectionMatrix();}
 function state(){return {selection:selection.getState(),position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,viewportWidth:host.clientWidth,viewWidth:(camera.right-camera.left)/camera.zoom,pixelsPerTileAt100:32,unityView,oblique,layers:[...layerGroups].map(([name,g])=>({name,visible:g.visible,count:g.userData.renderedTiles})),visibleTiles:[...selection.records.values()].filter(r=>r.visible&&layerGroups.get(r.tile.layer)?.visible&&(r.refs.length||environmentVisible&&r.effectRenderable)).length};}
 function changed(){onChange(state());}
 controls.addEventListener('change',changed);const observer=new ResizeObserver(resize);observer.observe(host);
 renderer.setAnimationLoop(time=>{if(disposed)return;particleTime.value=time*.001;animate(particleTime.value-mapStartTime);controls.update();if(!document.hidden)renderer.render(scene,camera);});
 function clear(){effects.clear();selection.clear();if(mapGroup){scene.remove(mapGroup);mapGroup.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.userData.cloud)o.geometry.dispose();});}if(eventGroup){scene.remove(eventGroup);eventGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}allMaterials.splice(0).forEach(m=>m.dispose());geometryCache.forEach(g=>g.dispose());geometryCache.clear();layerGroups.clear();pickables.length=cloudBatches.length=nativeAnimations.length=0;mapGroup=eventGroup=null;map=null;}
 this.clear=clear;
 this.loadAssets=async(data,loadImage)=>{const assetToken=++assetsGeneration;clear();textures.forEach(t=>t.dispose());textures.clear();bundle=data;await Promise.all(Object.entries(data.textures).map(async([key,info])=>{const image=await loadImage(info.url);if(disposed||assetToken!==assetsGeneration)return;const t=new THREE.Texture(image);t.needsUpdate=true;t.colorSpace=THREE.NoColorSpace;t.magFilter=info.filter===0?THREE.NearestFilter:THREE.LinearFilter;t.minFilter=info.filter===0?THREE.NearestMipmapNearestFilter:THREE.LinearMipmapLinearFilter;t.wrapS=t.wrapT=info.wrap===1?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.set(key,t);}));};
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
  mesh.visible = environmentVisible; group.add(mesh); cloudBatches.push(mesh);
  return true;
}

 this.build=async(doc)=>{clear();mapStartTime=particleTime.value;map=doc;mapGroup=new THREE.Group();scene.add(mapGroup);
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
      const live={...tile,layer:layer.name,id:layerIndex+':'+tileIndex++};byTemplate.get(key).push(live);selection.add(live);
      sourceBounds.expandByPoint(new THREE.Vector3(tile.x, 0, -tile.z));
    }
    for (const [key, tiles] of byTemplate) {
      const nativeEffect=bundle.environment?.effects?.[key];let didRender = buildClouds(key, tiles, group, layerIndex);if(nativeEffect){const particles=effects.build(nativeEffect.spec,nativeEffect.assets,tiles,group,layerIndex);didRender=!!particles||didRender;}
      tiles.forEach(t=>selection.records.get(t.id).effectRenderable=!!didRender);
      if (didRender) group.userData.cloudTiles += tiles.length;
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
  pickables.push(...effects.batches.map(b=>b.mesh));effects.sample(0);mapGroup.userData.bounds=sourceBounds;
  eventGroup=new THREE.Group();eventGroup.visible=false;eventGroup.renderOrder=1000000;scene.add(eventGroup);
  for(const l of doc.layers.filter(l=>l.type===1)){const events=l.events.filter(e=>!sentinel(e.position[0],e.position[2]));const geom=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(events.flatMap(e=>[e.position[0],e.position[1]+1.5,-e.position[2]]),3));const mat=new THREE.PointsMaterial({color:0x93aee6,size:6,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true});const points=new THREE.Points(geom,mat);points.renderOrder=1000000;points.userData.eventLayer=l.name;eventGroup.add(points);}
  for(const m of allMaterials)m.uniforms.brightness.value=brightness;
  effects.setVisible(environmentVisible);effects.setBrightness(brightness);this.fit();changed();return {nativeParticleSystems:effects.simulations.reduce((n,s)=>n+s.effect.systems.length,0),nativeParticleInstances:effects.batches.reduce((n,b)=>n+(b.staticSprite?0:b.mesh.count),0),renderedTiles,emptyTiles,sentinelTiles,instanceCount,cloudEmitters:[...layerGroups.values()].reduce((n,g)=>n+g.userData.cloudTiles,0),cloudParticles:cloudBatches.reduce((n,b)=>n+b.count,0),nativeAnimatedMaterials:nativeAnimations.length,layers:doc.layers.length,tiles:doc.tileCount};
 };
 this.fit=()=>{if(!mapGroup)return;const bounds=mapGroup.userData.bounds,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const aspect=host.clientWidth/Math.max(host.clientHeight,1);const fitSpan=Math.max(4,size.z*(oblique&&!unityView?.78:1),size.x/aspect)*1.35;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,oblique?500:700,oblique?500:.01));camera.zoom=THREE.MathUtils.clamp(host.clientHeight/32/fitSpan,.001,60);resize();controls.update();changed();};
 this.setView=(value)=>{oblique=value==='oblique';unityView=oblique;controls.minPolarAngle=unityView?Math.PI/4:.02;controls.maxPolarAngle=unityView?Math.PI/4:Math.PI*.49;const center=controls.target;camera.position.copy(center).add(new THREE.Vector3(0,oblique?500:700,oblique?500:.01));resize();controls.update();changed();};
 this.setUnity=(enabled)=>{unityView=enabled;if(enabled)oblique=true;controls.minPolarAngle=enabled?Math.PI/4:.02;controls.maxPolarAngle=enabled?Math.PI/4:Math.PI*.49;if(enabled)camera.position.copy(controls.target).add(new THREE.Vector3(0,500,500));resize();controls.update();changed();};
 this.setEnvironment=value=>{environmentVisible=value;cloudBatches.forEach(b=>b.visible=value);effects.setVisible(value);changed();};
 this.setEvents=value=>{if(eventGroup)eventGroup.visible=value;};
 this.setLayer=(name,value)=>{const g=layerGroups.get(name);if(g)g.visible=value;changed();};
 this.setBrightness=value=>{brightness=value;effects.setBrightness(value);allMaterials.forEach(m=>m.uniforms.brightness.value=value);};
 this.zoom=factor=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.001,60);camera.updateProjectionMatrix();changed();};
 this.actualSize=()=>{camera.zoom=1;camera.updateProjectionMatrix();changed();};
 this.selectTiles=(ids)=>{selection.ids.clear();for(const id of ids)if(selection.records.has(id))selection.ids.add(id);selection.refresh();};
 this.getTileRecords=()=>[...selection.records.values()].map(r=>({...r.tile,...{visible:r.visible,partCount:r.refs.length}}));
 this.getSelection=()=>selection.getState();this.editSelection=changes=>{selection.apply(changes);changed();};this.resetEdits=(all=false)=>{selection.reset(all);changed();};this.clearSelection=()=>selection.select(null);
 this.getState=state;
 this.render=(animationTime=particleTime.value-mapStartTime)=>{animate(animationTime);controls.update();renderer.render(scene,camera);};
 this.getDiagnostics=()=>({animatedMaterials:nativeAnimations.map(a=>({name:a.material.userData.source,tint:(a.material.uniforms._TintColor?.value||a.material.uniforms.tint?.value)?.toArray()})),drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,failedPrograms:renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length});
 let start=[0,0];const down=e=>start=[e.clientX,e.clientY];const context=e=>e.preventDefault();
 const up=e=>{if(!map||e.button!==0||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(pickables.filter(m=>m.visible&&m.parent.visible),false).find(h=>selection.records.get(h.object.userData.tiles[h.instanceId]?.id)?.visible);const tile=hit?hit.object.userData.tiles[hit.instanceId]:null;selection.select(tile?.id,e.ctrlKey||e.metaKey);if(hit){const record=selection.records.get(tile.id);record.tile={...record.tile,mesh:hit.object.userData.sourceMesh,material:hit.object.userData.sourceMaterial,shader:hit.object.userData.sourceShader};}onPick(selection.values().length===1?selection.values()[0].tile:null);};
 renderer.domElement.addEventListener('contextmenu',context);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
 this.dispose=()=>{if(disposed)return;disposed=true;++assetsGeneration;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();clear();textures.forEach(t=>t.dispose());textures.clear();renderer.domElement.removeEventListener('contextmenu',context);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);selection.dispose();defaultWhite.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};resize();
 }
}
