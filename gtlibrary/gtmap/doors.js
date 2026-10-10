import * as THREE from '../vendor/three.module.js';

/** Oak.DoorBehaviour moves its door pivot by the serialized OpenHeight. */
export class MapDoors {
 constructor(selection){this.selection=selection;this.entries=[];this.time=0;}
 register(record){const f=record.tile.item?.spec.FieldObjectBehaviour;if(!/\.DoorBehaviour$/.test(f?.__class__||''))return;
  const refs=record.refs.filter(ref=>/door|gate|block/i.test(ref.mesh.userData.sourceMesh||'')&&!/shadow|frame|floor/i.test(ref.mesh.userData.sourceMesh||''));
  const moving=refs.length?refs:record.refs;if(!moving.length)return;
  const box=new THREE.Box3();for(const ref of moving){const g=ref.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();box.union(g.boundingBox.clone().applyMatrix4(ref.local));}
  // Unspecified heights are a viewer preview based on the actual door geometry.
  const height=Number.isFinite(f.OpenHeight)?f.OpenHeight:-Math.max(.1,box.max.y-box.min.y+.05),fields={...f,OpenHeight:height};
  const entry={record,fields,estimated:!Number.isFinite(f.OpenHeight),allParts:!refs.length,bases:new Map(moving.map(ref=>[ref,ref.local.clone()])),value:f.OpenOnStart?height:0,target:f.OpenOnStart?height:0,start:this.time};record.door=entry;this.entries.push(entry);
 }
 controls(record){const e=record?.door;if(!e)return null;return {id:'door:height',name:e.estimated?'门 · 升降预览':'门 · 升降开关',value:e.target===0?'closed':'open',options:[{value:'closed',label:'关闭'},{value:'open',label:'打开'}]};}
 change(record,value,still){const e=record?.door;if(!e)return;e.from=e.value;e.target=value==='open'?e.fields.OpenHeight:0;e.start=this.time;e.duration=still?0:Math.max(.001,value==='open'?(e.fields.OpenDuration??.5):(e.fields.CloseDuration??.5));this.sample(this.time);this.selection.refresh();}
 sample(time){this.time=time;for(const e of this.entries){const u=e.duration?Math.min(1,(time-e.start)/e.duration):1;e.value=THREE.MathUtils.lerp(e.from??e.target,e.target,u);for(const ref of e.record.refs){if(ref.suppressed||(!e.allParts&&!/door|gate|block/i.test(ref.mesh.userData.sourceMesh||''))||/shadow|frame|floor/i.test(ref.mesh.userData.sourceMesh||''))continue;const base=ref.stateful?ref.local.clone():e.bases.get(ref)||ref.local.clone();ref.local.copy(new THREE.Matrix4().makeTranslation(0,e.value,0).multiply(base));ref.mesh.setMatrixAt(ref.index,e.record.visible?e.record.matrix.clone().multiply(ref.local):new THREE.Matrix4().makeScale(0,0,0));ref.mesh.instanceMatrix.needsUpdate=true;ref.mesh.boundingSphere=null;}}}
 reset(records){for(const record of records)if(record.door)this.change(record,record.door.fields.OpenOnStart?'open':'closed',true);}
 clear(){this.entries=[];}
}
