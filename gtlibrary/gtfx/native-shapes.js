import {shapeKernels,shapeConstants} from './native-shape-kernels.js';
import {compileKernel,NativeKernelVM} from './native-kernel-vm.js';
import {nativeMeshBatch} from './native-mesh.js';
const kernels=Object.fromEntries(Object.entries(shapeKernels).map(([name,k])=>[name,compileKernel(k)]));
const names={18:'rectangle',5:'box',0:'sphere',2:'hemisphere',4:'cone',8:'coneVolume',10:'circle',12:'line',17:'donut'};
const f32=Math.fround;
export function nativeShapeSupported(shape){
  if(!shape)return true;
  if(shape.type===6)return !!shape.mesh&&[0,1].includes(shape.placementMode)&&!(shape.m_MeshSpawn?.mode||0)&&!Number(shape.m_Texture?.m_PathID||0);
  const mode=[5,18].includes(shape.type)?0:shape.type===12?shape.radius?.mode:shape.arc?.mode;
  return !!names[shape.type]&&((mode||0)===0||mode===3||mode===1&&[8,17].includes(shape.type)||mode===2&&shape.type===12)&&
    !Number(shape.m_Texture?.m_PathID||shape.m_Texture?.fileID||0);
}
export function nativeShapeSamples(shape,rng,count,{normalize=true,phase=0,previousPhase=phase,interpolationStep=0,interpolationStart=0,meshes={}}={}){
  if(!shape)return Array.from({length:count},()=>({position:[0,0,0],direction:[0,0,1]}));
  if(!nativeShapeSupported(shape))return null;
  if(shape.type===6){
    const mesh=meshes[shape.mesh];if(!mesh)return null;
    const vm=rng.shapeVM??=new NativeKernelVM(shapeConstants),v=vm.view,result=[];
    for(let first=0;first<count;first+=4){
      const batch=nativeMeshBatch(shape,mesh,rng);if(!batch)return null;
      for(let i=0;i<4;i++){
        for(const [j,key] of ['x','y','z','w'].entries())v.setUint32(0x1230+j*16+i*4,rng.lanes[i][key],true);
        for(let j=0;j<3;j++){v.setFloat32(0x4000+j*16+i*4,batch[i].position[j],true);v.setFloat32(0x4100+j*16+i*4,batch[i].direction[j],true);}
      }
      vm.g.fill(0);vm.g[5]=0x4000;vm.g[6]=0x4100;vm.g[7]=0x1230;
      for(const [i,k] of ['randomDirectionAmount','sphericalDirectionAmount','randomPositionAmount'].entries())vm.v[i].setFloat32(0,shape[k]||0,true);
      if(normalize)vm.run(kernels.shapeDirection,null,0xe3b428);
      for(let i=0;i<4;i++){
        for(const [j,key] of ['x','y','z','w'].entries())rng.lanes[i][key]=v.getUint32(0x1230+j*16+i*4,true);
        result.push({...batch[i],position:[0,1,2].map(j=>v.getFloat32(0x4000+j*16+i*4,true)),direction:[0,1,2].map(j=>v.getFloat32(0x4100+j*16+i*4,true))});
      }
    }
    return result.slice(0,count);
  }
  const mode=[5,18].includes(shape.type)?0:shape.type===12?shape.radius?.mode:shape.arc?.mode;
  const name=names[shape.type]+(mode===3?'Spread':mode===1?'Loop':mode===2?'PingPong':'');
  const vm=rng.shapeVM??=new NativeKernelVM(shapeConstants),v=vm.view,base=0x1000,data=0x2000;
  for(const [offset,value] of [[0x10,shape.radius?.value??1],[0x18,shape.radius?.spread??0],
    [0x48,shape.angle??25],[0x4c,shape.length??5],[0x50,shape.radiusThickness??1],[0x54,shape.donutRadius??.2],
    [0x68,shape.arc?.value??360],[0x70,shape.arc?.spread??0],
    [0x138,shape.randomDirectionAmount??0],[0x13c,shape.sphericalDirectionAmount??0],[0x140,shape.randomPositionAmount??0]])v.setFloat32(base+offset,value,true);
  for(let i=0;i<4;i++)for(const [j,key] of ['x','y','z','w'].entries())v.setUint32(base+0x230+j*16+i*4,rng.lanes[i][key],true);
  v.setBigUint64(data+0x10,BigInt(count),true);
  v.setFloat64(base+0x280,phase,true);v.setFloat64(base+0x288,previousPhase,true);
  v.setFloat32(0x3000,interpolationStep,true);v.setFloat32(0x3004,interpolationStart,true);
  vm.g.fill(0);vm.g[0]=base;vm.g[1]=data;vm.g[3]=0x3000;vm.g[31]=0x1f000;
  v.setBigUint64(vm.g[31],BigInt(count),true);
  if(shape.type===5){vm.g[22]=base;vm.g[26]=count;vm.g[19]=0;vm.g[21]=data;}
  const output=[];
  vm.run(kernels[name],(address,cpu)=>{
    if(address===0x12835e0){cpu.put({v:0,count:1,width:8,lane:0,scalar:true},[cpu.v[0].getFloat64(0,true)%cpu.v[1].getFloat64(0,true)],true);return true;}
    if(address===0x1283e80||address===0x1283eb0){
      const x=cpu.v[0].getFloat32(0,true);
      cpu.put({v:0,count:1,width:4,lane:0,scalar:true},[address===0x1283e80?Math.log2(x):2**x],true);return true;
    }
    // Texture postprocessing is a no-op for the texture-free supported rectangle.
    if(shape.type===18&&address===0xe2ec9c)return true;
    if(address!==0xe3b1d4)return false;
    const pos=cpu.g[5],dir=cpu.g[6];
    if(normalize)cpu.run(kernels.shapeDirection,null,0xe3b428);
    for(let lane=0;lane<4;lane++)output.push({position:[0,1,2].map(i=>v.getFloat32(pos+i*16+lane*4,true)),
                                          direction:[0,1,2].map(i=>v.getFloat32(dir+i*16+lane*4,true))});
    return true;
  },shape.type===5?0xe2f490:undefined);
  for(let i=0;i<4;i++)for(const [j,key] of ['x','y','z','w'].entries())rng.lanes[i][key]=v.getUint32(base+0x230+j*16+i*4,true);
  return output.slice(0,count);
}
