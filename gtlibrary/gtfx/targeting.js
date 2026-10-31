// Native ground coordinates: X/Z; Y is height, never screen vertical.
export const facingVectors={front:[0,0,-1],back:[0,0,1],left:[-1,0,0],right:[1,0,0]};
export function targetPosition(options={},direction='right'){
 const p=options.targetPosition;
 return Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)?[p[0],0,p[2]]:facingVectors[direction].map(v=>v*(options.targetDistance??6));
}
// Resolve relative defaults once at playback start; animated facing is not scene placement.
export function snapshotPlaybackTargets(options={},direction='right'){
 const initial=facingVectors[options.direction]?options.direction:direction;
 const points=targetPositions(options,initial);
 return {...options,targetPosition:points[0],secondaryTargets:points.slice(1)};
}
export function aimDirection(options={},direction='right',origin=[0,0,0]){
 const p=targetPosition(options,direction),x=p[0]-origin[0],z=p[2]-origin[2],n=Math.hypot(x,z);
 return n>1e-9?[x/n,0,z/n]:facingVectors[direction].slice();
}
export function targetPositions(options={},direction='right'){
 const points=[targetPosition(options,direction)];
 for(const p of options.secondaryTargets||[])if(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&!points.some(q=>Math.hypot(q[0]-p[0],q[2]-p[2])<1e-6))points.push([p[0],0,p[2]]);
 return points;
}
// Target-attached events opt in through native selection fields, never actor names.
export function selectActionTargets(action,options={},direction='right'){
 const points=targetPositions(options,direction);
 if(!(action.LimitTarget>1)||action.SearchType!=='Closest')return points.slice(0,1);
 const forward=aimDirection(options,direction),radius=action.Radius??action.Range??Infinity;
 const halfAngle=(action.Angle??360)*Math.PI/360;
 return points.filter(p=>{const d=Math.hypot(p[0],p[2]);return d<=radius&&(!d||halfAngle>=Math.PI||(p[0]*forward[0]+p[2]*forward[2])/d>=Math.cos(halfAngle)-1e-9);})
  .sort((a,b)=>Math.hypot(a[0],a[2])-Math.hypot(b[0],b[2])).slice(0,action.LimitTarget);
}

// Four-way skeleton selection is independent of the continuous aiming vector.
export function resolveFacing(mode,target,origin=[0,0,0]){
 if(mode!=='auto')return facingVectors[mode]?mode:'right';
 const x=target[0]-origin[0],z=target[2]-origin[2];
 if(Math.abs(x)>=Math.abs(z))return x<0?'left':'right';
 return z<0?'front':'back';
}
