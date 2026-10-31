import * as THREE from '../vendor/three.module.js';
// TileAnimation.Awake/OnEnable/UpdateRepeat, registered ARM64 0x7134430/
// 0x71345d8/0x7134650. It rewrites Mesh.uv, before material texture transforms.
export function sampleNativeTileAnimation(runtime,time){
 for(const script of runtime.effect.scripts||[]){if(script.type!=='TileAnimation'||script.fields?.m_Enabled===0||!runtime.effect.nativeTileAnimation&&script.nativeTileAnimation?.version!==1)continue;
  const f=script.fields,nx=f.tileX,ny=f.tileY,count=f.maxTileCount,fps=f.frame;
  if(!(nx>0&&ny>0&&count>0&&count<=nx*ny&&fps>0))throw Error('Invalid native TileAnimation dimensions');
  // First scheduled call redraws tile zero; Awake already selects the top-left.
  const tick=Math.max(0,Math.floor(time*fps+1e-7)-1),frame=f.loop?tick%count:Math.min(tick,count-1),x=(frame%nx)/nx,y=(ny-1-Math.floor(frame/nx))/ny;
  for(const item of runtime.statics){if(item.s.node!==script.node)continue;
   if(!item.nativeTileUV){item.mesh.geometry=item.mesh.geometry.clone();const uv=item.mesh.geometry.getAttribute('uv');item.nativeTileUV=Array.from(uv.array);uv.setUsage(THREE.DynamicDrawUsage);}
   const uv=item.mesh.geometry.getAttribute('uv'),base=item.nativeTileUV;
   for(let i=0;i<uv.count;i++)uv.setXY(i,base[2*i]/nx+x,base[2*i+1]/ny+y);uv.needsUpdate=true;
   item.nativeTileFrame=frame;
  }
 }
}
