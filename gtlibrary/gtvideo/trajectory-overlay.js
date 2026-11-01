import * as THREE from '../vendor/three.module.js';
export class TrajectoryOverlay {
 constructor(scene){
  this.scene=scene;this.group=new THREE.Group();this.group.renderOrder=10000001;scene.runtime.videoBridge.scene.add(this.group);
  this.polygon=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xeebf83,dashSize:.15,gapSize:.1,transparent:true,opacity:.65,depthTest:false}));
  this.points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({size:8,sizeAttenuation:false,vertexColors:true,depthTest:false}));
  for(const child of [this.polygon,this.points]){child.renderOrder=10000001;child.frustumCulled=false;this.group.add(child);}
  this.canvas=scene.runtime.videoBridge.renderer.domElement;this.down=event=>this.pointerDown(event);this.canvas.addEventListener('pointerdown',this.down,{capture:true});
 }
 set(markers,polygon,{camera,track,selected}){
  this.markers=markers;this.cameraCoordinates=camera;this.track=track;const positions=[],colors=[];
  for(const marker of markers){positions.push(...marker.world);const color=new THREE.Color(marker.key===selected&&!marker.side?0xffe28e:marker.side||marker.role==='control'?0xf3b66b:marker.role==='node'?0x72d8a7:0x82d9ef);colors.push(color.r,color.g,color.b);}
  this.points.geometry.dispose();this.points.geometry=new THREE.BufferGeometry();this.points.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.points.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  this.polygon.geometry.dispose();this.polygon.geometry=new THREE.BufferGeometry().setFromPoints(polygon);this.polygon.computeLineDistances();
 }
 pointerDown(event){
  if(event.button!==0||!this.group.visible||!this.scene.editing||this.scene.manipulating)return;const bridge=this.scene.runtime.videoBridge,rect=this.canvas.getBoundingClientRect();let hit,distance=11;
  for(const marker of this.markers||[]){const point=new THREE.Vector3(...marker.world).project(bridge.camera);if(Math.abs(point.z)>1)continue;const d=Math.hypot(rect.left+(point.x+1)*rect.width/2-event.clientX,rect.top+(1-point.y)*rect.height/2-event.clientY);if(d<distance){distance=d;hit=marker;}}
  if(!hit)return;event.preventDefault();event.stopImmediatePropagation();this.scene.onTrajectoryPick?.(hit.key,this.track);const original=hit.world.slice(),startX=event.clientX,startY=event.clientY,pointer=event.pointerId,vertical=event.shiftKey,enabled=bridge.controls.enabled;let moved=false;
  bridge.controls.enabled=false;const ray=new THREE.Raycaster(),normal=vertical?bridge.camera.getWorldDirection(new THREE.Vector3()):new THREE.Vector3(0,1,0),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...original));
  const pointAt=e=>{ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),bridge.camera);return ray.ray.intersectPlane(plane,new THREE.Vector3());},initial=pointAt(event);
  const value=point=>{const result=original.map((v,i)=>v+point.getComponent(i)-initial.getComponent(i));if(vertical){result[0]=original[0];result[2]=original[2];}return [result[0],result[1],this.cameraCoordinates?result[2]:-result[2]];};
  const move=e=>{if(e.pointerId!==pointer||!initial)return;if(!moved&&Math.hypot(e.clientX-startX,e.clientY-startY)<3)return;const point=pointAt(e);if(!point)return;e.preventDefault();e.stopImmediatePropagation();if(!moved){moved=true;this.scene.onTrajectoryDrag?.(hit.key,this.track,null,'start',hit.side);}this.scene.onTrajectoryDrag?.(hit.key,this.track,value(point),'move',hit.side);};
  const finish=e=>{if(e.pointerId!==pointer)return;document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true);bridge.controls.enabled=enabled;if(this.cancel===cancel)this.cancel=null;if(moved){if(e.type==='pointercancel')this.scene.onTrajectoryDrag?.(hit.key,this.track,[original[0],original[1],this.cameraCoordinates?original[2]:-original[2]],'move',hit.side);this.scene.onTrajectoryDrag?.(hit.key,this.track,null,'end',hit.side);}};
  const cancel=()=>finish({pointerId:pointer,type:'pointercancel'});this.cancel=cancel;document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);
 }
 dispose(){this.cancel?.();this.canvas.removeEventListener('pointerdown',this.down,true);this.group.removeFromParent();for(const object of [this.points,this.polygon]){object.geometry.dispose();object.material.dispose();}}
}
