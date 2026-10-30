// StageShadowSetter.set_Position 0x74ce71c in the inspected native image.
// The preview floor is level; source tile height queries remain scene inputs.
import * as THREE from '../vendor/three.module.js';
const vector=new THREE.Vector3(),inverse=new THREE.Matrix4();
function setPositionInGroup(simulation,node,position){
 simulation.nodeRoot.updateMatrixWorld(true);
 vector.fromArray(position);
 if(node.parent)vector.applyMatrix4(inverse.copy(node.parent.matrixWorld).invert());
 node.position.copy(vector);
 simulation.nodeRoot.updateMatrixWorld(true);
}
export function sampleNativeStageShadow(simulation,time,position=simulation.effect.emitterPosition?.(time),groundHeight=0){
 if(!position)return 0;let count=0;
 for(const script of simulation.effect.scripts||[]){
  if(script.type!=='StageShadowSetter'||script.fields?.m_Enabled===0||!script.bodyNode)continue;
  const root=simulation.nodes.get(script.node),body=simulation.nodes.get(script.bodyNode);
  if(!root||!body)throw Error('Native StageShadowSetter references are missing');
  const ground=groundHeight+(script.fields.ApplyGroundOffset ? .03 : 0),offset=Math.min(ground,position[1])-position[1];
  // Preserve world position while root scale changes from prelaunch .6 to 1.
  // Parent inverse also cancels native root rotation and authored child scales.
  setPositionInGroup(simulation,root,[0,offset,0]);
  setPositionInGroup(simulation,body,[0,0,0]);count++;
 }
 return count;
}
