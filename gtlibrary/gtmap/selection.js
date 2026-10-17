import * as THREE from '../vendor/three.module.js';

/** Edits live instance matrices only. Source map data is never mutated. */
export class MapSelection {
 constructor(scene,onChange=()=>{}){this.records=new Map();this.ids=new Set();this.onChange=onChange;this.history=[];this.future=[];this.captureExtra=()=>null;this.restoreExtra=()=>{};this.overlay=new THREE.Group();scene.add(this.overlay);this.material=new THREE.LineBasicMaterial({color:0x8ad5ff,depthTest:false,depthWrite:false,transparent:true});}
 snapshot(records){return records.map(r=>({id:r.tile.id,position:r.position.toArray(),visualOffset:r.visualOffset?.toArray()||null,rotation:r.rotation,scale:r.scale.toArray(),quaternion:r.quaternion?.toArray()||null,visible:r.visible,extra:this.captureExtra(r)}));}
 begin(records=this.values()){if(this.pending)return;this.pending={before:this.snapshot(records),selection:[...this.ids]};}
 commit(){const entry=this.pending;this.pending=null;if(!entry)return;entry.after=this.snapshot(entry.before.map(s=>this.records.get(s.id)).filter(Boolean));entry.afterSelection=[...this.ids];if(JSON.stringify(entry.before)===JSON.stringify(entry.after))return;this.history.push(entry);if(this.history.length>100)this.history.shift();this.future=[];}
 transaction(fn,records=this.values()){this.begin(records);try{const result=fn();this.commit();return result;}catch(error){const entry=this.pending;this.pending=null;if(entry)this.restore(entry.before,entry.selection);throw error;}}
 restore(snapshots,ids){const touched=new Set();for(const s of snapshots){const r=this.records.get(s.id);if(!r)continue;r.position.fromArray(s.position);r.visualOffset=s.visualOffset?new THREE.Vector3().fromArray(s.visualOffset):null;r.rotation=s.rotation;r.scale.fromArray(s.scale);r.quaternion=s.quaternion?new THREE.Quaternion().fromArray(s.quaternion):null;r.visible=s.visible;this.restoreExtra(r,s.extra);this.update(r,touched);}for(const mesh of touched)mesh.computeBoundingSphere();this.ids=new Set(ids.filter(id=>this.records.has(id)));this.refresh();}
 undo(){if(this.pending)return false;const entry=this.history.pop();if(!entry)return false;this.future.push(entry);this.restore(entry.before,entry.selection);return true;}
 redo(){if(this.pending)return false;const entry=this.future.pop();if(!entry)return false;this.history.push(entry);this.restore(entry.after,entry.afterSelection);return true;}
 add(tile){const r={tile,refs:[],boundsReaders:[],position:new THREE.Vector3(tile.x,tile.y*.5,-tile.z),rotation:tile.rotation*90,scale:new THREE.Vector3(1,1,1),visible:true};this.records.set(tile.id,r);this.matrix(r);return r;}
 matrix(r){r.matrix=new THREE.Matrix4().compose(r.visualOffset?r.position.clone().add(r.visualOffset):r.position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-r.rotation*Math.PI/180),r.visible?r.scale:new THREE.Vector3());return r.matrix;}
 attach(id,mesh,index,local=new THREE.Matrix4()){this.records.get(id).refs.push({mesh,index,local});}
 addBounds(id,reader){this.records.get(id).boundsReaders.push(reader);}
 select(id,additive=false){if(!additive)this.ids.clear();if(id&&this.records.has(id)){if(additive&&this.ids.has(id))this.ids.delete(id);else this.ids.add(id);}this.refresh();}
 values(){return [...this.ids].map(id=>this.records.get(id));}
 getState(){return this.values().map(r=>({...r.tile,position:[r.position.x,r.position.y*2,-r.position.z],rotation:r.rotation,scale:r.scale.toArray(),visible:r.visible}));}
 apply({move=[0,0,0],rotate=[0,0,0],scale=[1,1,1],visible}={}){
  if(![...move,...rotate,...scale].every(Number.isFinite)||scale.some(v=>v<=0))throw new Error('请输入有限的数值，缩放必须大于零');
  const records=this.values();if(!records.length)return;
  const pivot=records.reduce((p,r)=>p.add(r.position),new THREE.Vector3()).multiplyScalar(1/records.length);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotate[0]*Math.PI/180,-rotate[1]*Math.PI/180,-rotate[2]*Math.PI/180,'YXZ'));
  // Full quaternion edits preserve arbitrary rotations, while the source-facing Y value remains inspectable.
  const factor=new THREE.Vector3(...scale),delta=new THREE.Vector3(move[0],move[1]*.5,-move[2]);
  const touched=new Set();for(const r of records){r.position.sub(pivot).multiply(factor).applyQuaternion(q).add(pivot).add(delta);r.scale.multiply(factor);r.rotation+=rotate[1];r.quaternion=(r.quaternion||new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-(r.rotation-rotate[1])*Math.PI/180)).premultiply(q);if(visible!==undefined)r.visible=!!visible;this.update(r,touched);}
  for(const mesh of touched)mesh.computeBoundingSphere();this.refresh();
 }
 update(r,touched=new Set()){this.matrix(r);if(r.quaternion)r.matrix.compose(r.visualOffset?r.position.clone().add(r.visualOffset):r.position,r.quaternion,r.visible?r.scale:new THREE.Vector3());for(const ref of r.refs){ref.mesh.setMatrixAt(ref.index,ref.suppressed||ref.enabled===false?new THREE.Matrix4().makeScale(0,0,0):r.matrix.clone().multiply(ref.local));ref.mesh.instanceMatrix.needsUpdate=true;touched.add(ref.mesh);}}
 reset(all=false){const touched=new Set();for(const r of all?this.records.values():this.values()){r.position.set(r.tile.x,r.tile.y*.5,-r.tile.z);r.rotation=r.tile.rotation*90;r.scale.set(1,1,1);r.visible=true;r.quaternion=null;r.visualOffset=null;this.update(r,touched);}for(const mesh of touched)mesh.computeBoundingSphere();this.refresh();}
 bounds(r){
   const box=new THREE.Box3(),matrix=this.matrixFor(r);
   for(const ref of r.refs){if(ref.suppressed||ref.enabled===false)continue;const g=ref.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();box.union(g.boundingBox.clone().applyMatrix4(matrix.clone().multiply(ref.local)));}
   for(const read of r.boundsReaders)box.union(read());
   if(box.isEmpty())box.setFromCenterAndSize(r.position,new THREE.Vector3(1,1,1));if(box.getSize(new THREE.Vector3()).length()<.01)box.expandByScalar(.5);else box.expandByScalar(.06);return box;
 }
 refresh(){for(const o of [...this.overlay.children]){o.geometry.dispose();this.overlay.remove(o);}for(const r of this.values()){
   const box=this.bounds(r);
   const outline=new THREE.Box3Helper(box,0x8ad5ff);outline.material.dispose();outline.material=this.material;outline.renderOrder=2000000;outline.frustumCulled=false;this.overlay.add(outline);
  }this.onChange(this.getState());}
 matrixFor(r){return new THREE.Matrix4().compose(r.visualOffset?r.position.clone().add(r.visualOffset):r.position,r.quaternion||new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-r.rotation*Math.PI/180),r.scale);}
 clear(){for(const o of [...this.overlay.children]){o.geometry.dispose();this.overlay.remove(o);}this.ids.clear();this.records.clear();this.history=[];this.future=[];this.pending=null;this.onChange([]);}
 dispose(){this.clear();this.overlay.removeFromParent();this.material.dispose();}
}
