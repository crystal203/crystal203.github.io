import * as THREE from '../vendor/three.module.js';

function merge(a,b){const out={...a};for(const [key,value] of Object.entries(b||{}))out[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(out[key],value):value;return out;}
export function itemInfo(tile,map,data){
 const set=map.tilesets[tile.ts-1]?.name;let spec=data?.defaults[set]?.[tile.name]||{},index;
 for(const p of tile.properties||[]){if(p.component==='Tilemaps.TileProp'){spec=merge(spec,p.value.overrides);index=p.value.keyIndex;}}
 const behavior=spec.FieldObjectBehaviour||{},type=behavior.__class__||'';
 const kind=/StarPiece/.test(type)?'star':/PurpleCoin/.test(type)?'coin':/Treasure/.test(type)?'chest':/FloatingItem|InteractableItem|HoldableItem/.test(type)?'item':null;
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
  for(const tile of tiles){const info=itemInfo(tile,map,data);tile.item=info;if(info.kind==='star'){stars++;continue;}if(!['coin','item'].includes(info.kind)||!data?.atlas)continue;
   const item=info.rewards[0],sprite=info.kind==='coin'?data.coinSprites[map.mapName]||'purple_coin_event':data.items[String(item?.ItemSpecId)]?.sprite?.default;
   const atlas=info.kind==='coin'?'items':data.items[String(item?.ItemSpecId)]?.atlas||'items',sheet=data.atlases?.[atlas]||data.atlas;
   if(!sprite||!sheet.frames[sprite])continue;const key=info.kind+':'+atlas+':'+sprite;if(!groups.has(key))groups.set(key,{kind:info.kind,atlas,sprite,records:[]});groups.get(key).records.push(tile);
  }
  for(const {kind,atlas,sprite,records} of groups.values()){
   const sheet=data.atlases?.[atlas]||data.atlas,f=sheet.frames[sprite],rect=f.frame,size=sheet.meta.size,original=f.sourceSize||{w:rect.w,h:rect.h},trim=f.spriteSourceSize||{x:0,y:0,w:rect.w,h:rect.h};
   const factor=.75/Math.max(original.w,original.h),geometry=new THREE.PlaneGeometry(rect.w*factor,rect.h*factor);
   geometry.translate((trim.x+trim.w/2-original.w/2)*factor,(original.h/2-trim.y-trim.h/2)*factor,0);
   const packedW=f.rotated?rect.h:rect.w,packedH=f.rotated?rect.w:rect.h;
   const u=(rect.x+.1)/size.w,v=1-(rect.y+.1)/size.h,ur=(rect.x+packedW-.1)/size.w,vb=1-(rect.y+packedH-.1)/size.h;
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(f.rotated?[ur,v,ur,vb,u,v,u,vb]:[u,v,ur,v,u,vb,ur,vb],2));
   const material=new THREE.MeshBasicMaterial({map:this.textures.get('pickup-'+atlas),transparent:true,alphaTest:.01,depthWrite:false,side:THREE.DoubleSide});
   const mesh=new THREE.InstancedMesh(geometry,material,records.length);mesh.renderOrder=300001;mesh.frustumCulled=false;mesh.visible=this.visible;mesh.userData={tiles:records,sourceMesh:sprite,sourceMaterial:atlas,sourceShader:'原始物品图集',kind:'tile'};group.add(mesh);this.pickables.push(mesh);
   const refs=records.map((tile,index)=>{this.selection.attach(tile.id,mesh,index);return this.selection.records.get(tile.id).refs.at(-1);});this.batches.push({mesh,records,refs,kind});
  }this.sample();return stars+[...groups.values()].reduce((n,g)=>n+g.records.length,0);
 }
 sample(){for(const b of this.batches){for(let i=0;i<b.records.length;i++){const r=this.selection.records.get(b.records[i].id),local=b.refs[i].local;if(b.kind==='coin'){local.makeRotationX(-Math.PI/2);local.setPosition(0,.05,0);}else{local.makeRotationFromQuaternion(this.camera.quaternion);local.setPosition(0,.5,0);}b.mesh.setMatrixAt(i,r.visible?r.matrix.clone().multiply(local):new THREE.Matrix4().makeScale(0,0,0));}b.mesh.instanceMatrix.needsUpdate=true;}}
 setVisible(value){this.visible=value;for(const b of this.batches)b.mesh.visible=value;}
 clear(){for(const b of this.batches){b.mesh.removeFromParent();b.mesh.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();}this.batches=[];}
}
