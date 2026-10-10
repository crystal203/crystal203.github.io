import * as THREE from '../vendor/three.module.js';
import {TransformControls} from '../vendor/TransformControls.js';

/** Transform the selection from a drag-start snapshot, without accumulating error. */
export class MapManipulator {
 constructor(scene,camera,canvas,selection,orbit,onChange){
  this.selection=selection;this.orbit=orbit;this.mode='select';this.consumed=false;
  this.pivot=new THREE.Object3D();scene.add(this.pivot);
  const control=this.control=new TransformControls(camera,canvas);control.setSize(.8);scene.add(control.getHelper());
  control.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;});
  control.addEventListener('mouseDown',()=>{this.consumed=true;this.pivot.updateMatrixWorld();this.inverse=this.pivot.matrixWorld.clone().invert();this.snapshot=selection.values().map(r=>({r,matrix:selection.matrixFor(r),rotation:r.rotation}));});
  control.addEventListener('objectChange',()=>{
   if(!control.dragging||!this.snapshot)return;this.pivot.scale.max(new THREE.Vector3(.01,.01,.01));this.pivot.updateMatrixWorld();
   const delta=this.pivot.matrixWorld.clone().multiply(this.inverse),touched=new Set();
   for(const {r,matrix,rotation} of this.snapshot){r.quaternion??=new THREE.Quaternion();delta.clone().multiply(matrix).decompose(r.position,r.quaternion,r.scale);const angle=new THREE.Euler().setFromQuaternion(this.pivot.quaternion,'YXZ').y;r.rotation=rotation-angle*180/Math.PI;selection.update(r,touched);}
   for(const mesh of touched)mesh.computeBoundingSphere();selection.refresh();onChange();
  });
  control.addEventListener('mouseUp',()=>{this.snapshot=null;this.sync();});
 }
 sync(){if(this.control.dragging)return;const records=this.selection.values();if(this.mode==='select'||!records.length){this.control.detach();return;}this.pivot.position.copy(records.reduce((v,r)=>v.add(r.position),new THREE.Vector3()).multiplyScalar(1/records.length));this.pivot.quaternion.identity();this.pivot.scale.set(1,1,1);this.pivot.updateMatrixWorld();this.control.attach(this.pivot);}
 setMode(mode){if(!['select','translate','rotate','scale'].includes(mode))return;this.mode=mode;if(mode!=='select')this.control.setMode(mode);this.sync();}
 setSnap(enabled){this.control.setTranslationSnap(enabled?.5:null);this.control.setRotationSnap(enabled?Math.PI/12:null);this.control.setScaleSnap(enabled?.1:null);}
 dispose(){this.control.dispose();this.control.getHelper().removeFromParent();this.pivot.removeFromParent();}
}
