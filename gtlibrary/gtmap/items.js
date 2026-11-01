import * as THREE from '../vendor/three.module.js';
import {consumePose} from '../gtonline/item-motion.js';

const itemVertex=`attribute float itemAlpha;varying vec2 vUv;varying float vAlpha;void main(){vUv=uv;vAlpha=itemAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`;
const itemFragment=`uniform sampler2D image;uniform vec4 tint;varying vec2 vUv;varying float vAlpha;void main(){vec4 pixel=texture2D(image,vUv);float alpha=pixel.a*tint.a*vAlpha;if(alpha<0.01)discard;gl_FragColor=vec4(pixel.rgb*tint.rgb*tint.a*vAlpha,alpha);}`;
function itemMaterial(texture){return new THREE.ShaderMaterial({uniforms:{image:{value:texture},tint:{value:new THREE.Vector4(1,1,1,1)}},vertexShader:itemVertex,fragmentShader:itemFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,toneMapped:false});}

function merge(a,b){const out={...a};for(const [key,value] of Object.entries(b||{}))out[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(out[key],value):value;return out;}
export function itemInfo(tile,map,data){
 const set=map.tilesets[tile.ts-1]?.name;let spec=data?.defaults[set]?.[tile.name]||{},index;
 for(const p of tile.properties||[]){if(p.component==='Tilemaps.TileProp'){spec=merge(spec,p.value.overrides);index=p.value.keyIndex;}}
 const behavior=spec.FieldObjectBehaviour||{},type=behavior.__class__||'';
 const kind=/StarPiece/.test(type)?'star':/PurpleCoin/.test(type)?'coin':/SubstageMap/.test(type)?'map':/Treasure/.test(type)?'chest':/FloatingItem|InteractableItem|HoldableItem/.test(type)?'item':null;
 const category={star:'StarPiece',coin:'PurpleCoin',chest:'Box',item:'Item'}[kind],meta=data?.maps[map.mapName]||{};
 const handle=meta.HandleNames?.[category]?.[index]||tile.name;
 let rewards=kind==='chest'?meta.Boxes?.[handle]:kind==='item'?meta.Items?.[handle]:null;
 if(rewards&&!Array.isArray(rewards))rewards=[rewards];
 if(behavior.ItemSpecId)rewards=[behavior];
 const resolve=r=>({...r,name:data?.items[String(r.ItemSpecId)]?.name||data?.items[String(r.ItemSpecId)]?.key||'未提供物品 ID'});
 return {kind,handle,hidden:!!(behavior.IsHidden||tile.properties?.some(p=>p.value.deactivateOnStart)),rewards:rewards?.map(resolve)||[],hiddenStar:behavior.HiddenStarPiece,spec};
}

/** Game item atlas quads; the star-piece prefab is rendered by MapStates. */
export class MapItems {
 constructor(camera,textures,selection,pickables){Object.assign(this,{camera,textures,selection,pickables});this.batches=[];this.visible=true;}
 build(tiles,group,map,data){
  const groups=new Map();let stars=0;
  for(const tile of tiles){const info=tile.editAdded?tile.item:itemInfo(tile,map,data);tile.item=info;if(info.kind==='star'){stars++;continue;}if(!['coin','item','map'].includes(info.kind)||!data?.atlas)continue;
   const item=info.rewards[0],sprite=info.sprite||(info.kind==='map'?'substage_map':info.kind==='coin'?data.coinSprites[tile.sourceMapName||map.mapName]||'purple_coin_event':data.items[String(item?.ItemSpecId)]?.sprite?.default);
   const atlas=info.atlas||(['coin','map'].includes(info.kind)?'items':data.items[String(item?.ItemSpecId)]?.atlas||'items'),sheet=data.atlases?.[atlas]||data.atlas;
   if(!sprite||!sheet.frames[sprite])continue;const key=(tile.pickupTextureKeys?.['pickup-'+atlas]||'')+':'+info.kind+':'+atlas+':'+sprite;if(!groups.has(key))groups.set(key,{kind:info.kind,atlas,sprite,records:[]});groups.get(key).records.push(tile);
  }
  for(const {kind,atlas,sprite,records} of groups.values()){
   const sheet=data.atlases?.[atlas]||data.atlas,f=sheet.frames[sprite],rect=f.frame,size=sheet.meta.size,original=f.sourceSize||{w:rect.w,h:rect.h},trim=f.spriteSourceSize||{x:0,y:0,w:rect.w,h:rect.h};
   const factor=.02,geometry=new THREE.PlaneGeometry(rect.w*factor,rect.h*factor);
   geometry.translate((trim.x+trim.w/2-original.w/2)*factor,(original.h/2-trim.y-trim.h/2)*factor,0);
   const packedW=f.rotated?rect.h:rect.w,packedH=f.rotated?rect.w:rect.h;
   const u=(rect.x+.1)/size.w,v=1-(rect.y+.1)/size.h,ur=(rect.x+packedW-.1)/size.w,vb=1-(rect.y+packedH-.1)/size.h;
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(f.rotated?[ur,v,ur,vb,u,v,u,vb]:[u,v,ur,v,u,vb,ur,vb],2));
   geometry.setAttribute('itemAlpha',new THREE.InstancedBufferAttribute(new Float32Array(records.length).fill(1),1));const material=itemMaterial(this.textures.get(records[0].pickupTextureKeys?.['pickup-'+atlas]||'pickup-'+atlas));
   const mesh=new THREE.InstancedMesh(geometry,material,records.length);mesh.renderOrder=300001;mesh.frustumCulled=false;mesh.visible=this.visible;mesh.userData={tiles:records,sourceMesh:sprite,sourceMaterial:atlas,sourceShader:'原始物品图集',kind:'tile'};group.add(mesh);this.pickables.push(mesh);
   const shadowMaterial=material.clone();shadowMaterial.uniforms.image.value=material.uniforms.image.value;shadowMaterial.uniforms.tint.value.set(0,0,0,.29019609093666077);const shadow=new THREE.InstancedMesh(geometry.clone(),shadowMaterial,records.length);shadow.renderOrder=299999;shadow.frustumCulled=false;shadow.visible=this.visible;group.add(shadow);
   for(const tile of records){const r=this.selection.records.get(tile.id);r.itemSettings??={floating:tile.item.floating!==false,shadow:tile.item.shadow!==false,alpha:tile.item.alpha??1};}
   const shadows=records.map((tile,index)=>{this.selection.attach(tile.id,shadow,index);return this.selection.records.get(tile.id).refs.at(-1);});const refs=records.map((tile,index)=>{this.selection.attach(tile.id,mesh,index);return this.selection.records.get(tile.id).refs.at(-1);});const batch={mesh,shadow,records,refs,shadows,kind};this.batches.push(batch);for(const [index,tile] of records.entries())this.selection.records.get(tile.id).itemBatch={batch,index};
  }this.sample();return stars+[...groups.values()].reduce((n,g)=>n+g.records.length,0);
 }
 /** The StageItem uses the same item silhouette for its ground shadow, at native tint and pixel scale. */
 sample(time=this.time||0,only=null){this.time=time;const hidden=new THREE.Matrix4().makeScale(0,0,0);const batches=only?new Set([...only].map(record=>record.itemBatch?.batch).filter(Boolean)):this.batches;for(const b of batches){let touched=false;const indices=only?[...only].flatMap(record=>record.itemBatch?.batch===b?[record.itemBatch.index]:[]):b.records.keys();for(const i of indices){const r=this.selection.records.get(b.records[i].id),local=b.refs[i].local,shadow=b.shadows[i].local,fly=this.flights?.get(r),phase=time;if(only&&!only.has(r))continue;touched=true;
   local.makeRotationFromQuaternion(this.camera.quaternion);local.setPosition(0,b.kind==='map'?.35:.5+(r.itemSettings?.floating!==false?Math.sin(phase*3)*.1:0),0);shadow.makeRotationX(-Math.PI/2);shadow.setPosition(0,.012,0);
   let matrix=r.matrix.clone().multiply(local),shown=r.visible&&!r.deleted;
   if(fly){const target=fly.follow().slice();target[1]+=.6;const pose=consumePose(fly.from,target,time-fly.at),q=pose.position;shown=!pose.done;matrix.makeRotationFromQuaternion(this.camera.quaternion);matrix.multiply(new THREE.Matrix4().makeRotationY(pose.angle));matrix.scale(new THREE.Vector3(pose.scale,pose.scale,pose.scale));matrix.setPosition(q[0],q[1],-q[2]);if(pose.done)this.flights.delete(r);}
   b.refs[i].enabled=shown;b.shadows[i].enabled=shown&&!fly&&r.itemSettings?.shadow!==false;b.mesh.geometry.attributes.itemAlpha.setX(i,r.itemSettings?.alpha??1);b.shadow.geometry.attributes.itemAlpha.setX(i,r.itemSettings?.alpha??1);b.mesh.setMatrixAt(i,shown?matrix:hidden);b.shadow.setMatrixAt(i,b.shadows[i].enabled?r.matrix.clone().multiply(shadow):hidden);
  }if(!touched)continue;b.mesh.geometry.attributes.itemAlpha.needsUpdate=true;b.shadow.geometry.attributes.itemAlpha.needsUpdate=true;b.mesh.instanceMatrix.needsUpdate=true;b.shadow.instanceMatrix.needsUpdate=true;}}
 collect(record,follow){if(!this.batches.some(b=>b.records.some(t=>t.id===record.tile.id))){if(!record.gimmick){record.visible=false;this.selection.update(record);return;}record.gimmick.consume={at:this.time||0,from:[record.position.x,record.position.y,-record.position.z],follow};record.gimmick.previewTime=0;return;}this.flights??=new Map();this.flights.set(record,{at:this.time||0,from:[record.position.x,record.position.y+.5,-record.position.z],follow});record.visible=false;this.selection.update(record);}
 spawn(id,data,group){
  const info=data?.items[String(id)],atlas=info?.atlas||'items',sheet=data?.atlases?.[atlas]||data?.atlas,sprite=info?.sprite?.default,f=sheet?.frames[sprite],texture=this.textures.get(records[0].pickupTextureKeys?.['pickup-'+atlas]||'pickup-'+atlas);if(!f||!texture)throw Error('缺少原生物品图集：'+id);
  const rect=f.frame,size=sheet.meta.size,original=f.sourceSize||rect,trim=f.spriteSourceSize||{x:0,y:0,w:rect.w,h:rect.h},factor=.02,geometry=new THREE.PlaneGeometry(rect.w*factor,rect.h*factor);geometry.translate((trim.x+trim.w/2-original.w/2)*factor,(original.h/2-trim.y-trim.h/2)*factor,0);
  const pw=f.rotated?rect.h:rect.w,ph=f.rotated?rect.w:rect.h,u=(rect.x+.1)/size.w,v=1-(rect.y+.1)/size.h,ur=(rect.x+pw-.1)/size.w,vb=1-(rect.y+ph-.1)/size.h;geometry.setAttribute('uv',new THREE.Float32BufferAttribute(f.rotated?[ur,v,ur,vb,u,v,u,vb]:[u,v,ur,v,u,vb,ur,vb],2));
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,depthWrite:false,side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=300001;group.add(mesh);return {setPosition:p=>{mesh.position.set(p[0],p[1],-p[2]);mesh.quaternion.copy(this.camera.quaternion);},setPose:pose=>{mesh.position.set(pose.position[0],pose.position[1],-pose.position[2]);mesh.quaternion.copy(this.camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.angle));mesh.scale.setScalar(pose.scale);},dispose:()=>{mesh.removeFromParent();geometry.dispose();material.dispose();}};
 }
 setVisible(value){this.visible=value;for(const b of this.batches){b.mesh.visible=value;b.shadow.visible=value;}}
 clear(){this.flights?.clear();for(const b of this.batches){b.shadow.removeFromParent();b.shadow.dispose();b.shadow.geometry.dispose();b.shadow.material.dispose();b.mesh.removeFromParent();b.mesh.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();}this.batches=[];}
}
