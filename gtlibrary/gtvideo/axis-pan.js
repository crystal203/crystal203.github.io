import * as THREE from '../vendor/three.module.js';
// Shift + middle chooses one world coordinate axis once per gesture. Ordinary
// middle-button panning remains handled by OrbitControls.
export function attachAxisPan(canvas,camera,controls){
 let gesture;
 const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const down=event=>{if(event.button!==1||!event.shiftKey||!controls.enabled)return;stop(event);const rect=canvas.getBoundingClientRect();gesture={id:event.pointerId,x:event.clientX,y:event.clientY,target:controls.target.clone(),position:camera.position.clone(),height:rect.height,enabled:controls.enabled};controls.enabled=false;canvas.setPointerCapture(event.pointerId);controls.dispatchEvent({type:'start'});};
 const move=event=>{if(!gesture||event.pointerId!==gesture.id)return;stop(event);const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(gesture.axis===undefined){if(Math.hypot(dx,dy)<4)return;gesture.horizontal=Math.abs(dx)>=Math.abs(dy);const direction=new THREE.Vector3().setFromMatrixColumn(camera.matrix,gesture.horizontal?0:1),values=direction.toArray();gesture.axis=values.reduce((best,value,index)=>Math.abs(value)>Math.abs(values[best])+1e-6?index:best,gesture.horizontal?0:1);gesture.component=values[gesture.axis];}
  const scale=(camera.top-camera.bottom)/camera.zoom/Math.max(1,gesture.height),amount=(gesture.horizontal?-dx:dy)*scale/(gesture.component||1),delta=new THREE.Vector3();delta.setComponent(gesture.axis,amount);camera.position.copy(gesture.position).add(delta);controls.target.copy(gesture.target).add(delta);camera.updateMatrixWorld();controls.dispatchEvent({type:'change'});
 };
 const end=event=>{if(!gesture||event.pointerId!==gesture.id)return;stop(event);controls.enabled=gesture.enabled;gesture=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);controls.dispatchEvent({type:'end'});};
 canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
 return ()=>{if(gesture)controls.enabled=gesture.enabled;for(const [type,handler] of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end]])canvas.removeEventListener(type,handler,true);};
}
