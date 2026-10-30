import * as THREE from '../vendor/three.module.js';
// Use the inverse native projection, including oblique viewport compensation.
export function pickGround(camera,rect,clientX,clientY){
 if(!rect.width||!rect.height)return null;
 camera.updateMatrixWorld(true);
 const x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
 const near=new THREE.Vector3(x,y,-1).unproject(camera),far=new THREE.Vector3(x,y,1).unproject(camera),dy=far.y-near.y;
 if(Math.abs(dy)<1e-9)return null;
 const t=-near.y/dy;if(t<0)return null;
 const p=near.lerp(far,t);return [p.x,0,-p.z];
}
