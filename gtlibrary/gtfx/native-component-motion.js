import * as THREE from '../vendor/three.module.js';
// RotateThis.Update 0x71343b8 reads three separate serialized float fields,
// multiplies deltaTime by TimeScale and calls Transform.Rotate(..., local).
export function applyNativeRotateThis(node,fields,time,step=1/60){
 if(fields.m_Enabled===0)return;
 const speed=new THREE.Vector3(fields.rotationSpeedX||0,fields.rotationSpeedY||0,fields.rotationSpeedZ||0).multiplyScalar(Math.PI/180*(fields.TimeScale??1));
 const count=Math.floor(Math.max(0,time)/step+1e-9),rest=Math.max(0,time-count*step),rotation=new THREE.Quaternion();
 if(count){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(speed.x*step,speed.y*step,speed.z*step,'YXZ'));
  const half=Math.acos(Math.max(-1,Math.min(1,q.w))),sin=Math.sin(half);
  if(Math.abs(sin)>1e-12){const angle=half*count,k=Math.sin(angle)/sin;rotation.set(q.x*k,q.y*k,q.z*k,Math.cos(angle));}
 }
 rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(speed.x*rest,speed.y*rest,speed.z*rest,'YXZ')));
 if(fields.local!==0&&fields.local!==false)node.quaternion.multiply(rotation);
 else{const parent=new THREE.Quaternion();node.parent?.updateWorldMatrix(true,false);node.parent?.getWorldQuaternion(parent);const local=parent.clone().invert().multiply(rotation).multiply(parent);node.quaternion.premultiply(local);}
}
