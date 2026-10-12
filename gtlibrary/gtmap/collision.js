/** Ground-plane collision shared by gameplay clients. Coordinates are native X/Z. */
export class MapCollision {
 constructor({floors=[],walls=[],radius=.22,cellOrigin=0}={}){this.radius=radius;this.cellOrigin=cellOrigin;this.floors=new Map();this.walls=new Map();this.dynamic=[];this.stairs=new Map();this.ledges=walls.filter(r=>r[4]===3&&r[5]%2===0);for(const f of floors){const key=f[0]+','+f[1];if(!this.floors.has(key))this.floors.set(key,[]);this.floors.get(key).push(f[2]||0);if(f[3]===2)this.stairs.set(key,{height:f[2]||0,direction:f[4]});}for(const r of walls)this.addWall(r);}
 addWall(rect){for(let x=Math.floor(rect[0]);x<=Math.floor(rect[2]);x++)for(let z=Math.floor(rect[1]);z<=Math.floor(rect[3]);z++){const key=x+','+z;if(!this.walls.has(key))this.walls.set(key,[]);this.walls.get(key).push(rect);}}
 height(x,z,y=0){const gx=Math.floor(x-this.cellOrigin),gz=Math.floor(z-this.cellOrigin),key=gx+','+gz,stair=this.stairs.get(key);if(stair){const fx=x-this.cellOrigin-gx,fz=z-this.cellOrigin-gz,rise=({0:1-fz,2:1-fx,4:fz,6:fx})[stair.direction];return stair.height+(rise??0);}const levels=this.floors.get(key);if(!levels)return null;return levels.reduce((a,b)=>Math.abs(b-y)<Math.abs(a-y)?b:a);}
 onStair(p){return this.stairs.has(Math.floor(p[0]-this.cellOrigin)+','+Math.floor(p[2]-this.cellOrigin));}
 canStand(x,z,y=0,radius=this.radius){if(!Number.isFinite(x+z+y))return false;for(const [dx,dz] of [[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]]){const h=this.height(x+dx,z+dz,y);if(h===null||Math.abs(h-y)>.51)return false;}const checked=new Set();for(let a=Math.floor(x-radius);a<=Math.floor(x+radius);a++)for(let b=Math.floor(z-radius);b<=Math.floor(z+radius);b++)for(const r of this.walls.get(a+','+b)||[]){if(checked.has(r))continue;checked.add(r);if(this.intersects(x,z,radius,r))return false;}for(const o of this.dynamic)if(o.enabled()&&this.blocks(o,x,z,radius))return false;return true;}
 /** Sweep a native box without replacing its corners with a circular body. */
 canPlaceBox(rect,y=0){const inset=1e-5,[x0,z0,x1,z1]=rect;for(let x=x0+inset;x<x1;x=Math.min(x1-inset,x+.25)){for(let z=z0+inset;z<z1;z=Math.min(z1-inset,z+.25)){const h=this.height(x,z,y);if(h===null||Math.abs(h-y)>.01)return false;if(z===z1-inset)break;}if(x===x1-inset)break;}
  const overlaps=r=>x0<r[2]-inset&&x1>r[0]+inset&&z0<r[3]-inset&&z1>r[1]+inset,seen=new Set();for(let x=Math.floor(x0);x<=x1;x++)for(let z=Math.floor(z0);z<=z1;z++)for(const r of this.walls.get(x+','+z)||[]){if(seen.has(r))continue;seen.add(r);if(overlaps(r))return false;}for(const o of this.dynamic)if(o.enabled()&&(o.rect?overlaps(o.rect()):this.intersects(...o.circle(),rect)))return false;return true;
 }
 intersects(x,z,r,rct){const dx=x-Math.max(rct[0],Math.min(rct[2],x)),dz=z-Math.max(rct[1],Math.min(rct[3],z));return dx*dx+dz*dz<r*r-1e-8;}
 blocks(o,x,z,r){if(o.circle){const c=o.circle();return Math.hypot(x-c[0],z-c[1])<r+c[2]-1e-7;}return this.intersects(x,z,r,o.rect());}
 fraction(p,dx,dz){if(this.canStand(p[0]+dx,p[2]+dz,p[1]))return 1;let lo=0,hi=1;for(let i=0;i<12;i++){const m=(lo+hi)/2;if(this.canStand(p[0]+dx*m,p[2]+dz*m,p[1]))lo=m;else hi=m;}return lo;}
 move(position,dx,dz){const p=position.slice(),steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));dx/=steps;dz/=steps;
  for(let i=0;i<steps;i++){
   const u=this.fraction(p,dx,dz);p[0]+=dx*u;p[2]+=dz*u;
   if(u<1){let rx=dx*(1-u),rz=dz*(1-u);const cx=p[0]+rx,cz=p[2]+rz,normals=[],seen=new Set();
    const normal=(x,z)=>{const len=Math.hypot(x,z);if(len>1e-8)normals.push([x/len,z/len]);};
    for(let x=Math.floor(cx-this.radius);x<=Math.floor(cx+this.radius);x++)for(let z=Math.floor(cz-this.radius);z<=Math.floor(cz+this.radius);z++)for(const r of this.walls.get(x+','+z)||[]){if(seen.has(r)||!this.intersects(cx,cz,this.radius,r))continue;seen.add(r);normal(p[0]-Math.max(r[0],Math.min(r[2],p[0])),p[2]-Math.max(r[1],Math.min(r[3],p[2])));}
    for(const o of this.dynamic)if(o.enabled()&&this.blocks(o,cx,cz,this.radius)){if(o.circle){const c=o.circle();normal(p[0]-c[0],p[2]-c[1]);}else{const r=o.rect();normal(p[0]-Math.max(r[0],Math.min(r[2],p[0])),p[2]-Math.max(r[1],Math.min(r[3],p[2])));}}
    for(const n of normals){const dot=rx*n[0]+rz*n[1];if(dot<0){rx-=n[0]*dot;rz-=n[1]*dot;}}
    if(normals.length){const slide=this.fraction(p,rx,rz);p[0]+=rx*slide;p[2]+=rz*slide;}
    else{const ux=this.fraction(p,rx,0),uz=this.fraction(p,0,rz);if(Math.abs(rx*ux)>Math.abs(rz*uz)){p[0]+=rx*ux;p[2]+=rz*this.fraction(p,0,rz);}else{p[2]+=rz*uz;p[0]+=rx*this.fraction(p,rx,0);}}
   }
   const y=this.height(p[0],p[2],p[1]);if(y!==null)p[1]=y;
  }return p;
 }
 /** Only native low ledges (wall type 3) permit a downward jump. Fence type 11 does not. */
 drop(position,dx,dz){const edge=this.ledges.find(r=>{const n=[Math.sin(r[5]*Math.PI/4),Math.cos(r[5]*Math.PI/4)];return n[0]*dx+n[1]*dz>.9&&this.intersects(position[0]+dx*.6,position[2]+dz*.6,this.radius,r);});if(!edge)return null;
  for(let d=.8;d<=2.6;d+=.1){const x=position[0]+dx*d,z=position[2]+dz*d,y=this.height(x,z,position[1]-1);if(y===null||position[1]-y<.75||position[1]-y>1.01||!this.canStand(x,z,y))continue;let blocked=false;for(let t=0;t<=1;t+=.05){const px=position[0]+dx*d*t,pz=position[2]+dz*d*t;for(const o of this.dynamic)if(o.enabled()&&this.blocks(o,px,pz,this.radius))blocked=true;const seen=new Set();for(let a=Math.floor(px-this.radius);a<=Math.floor(px+this.radius);a++)for(let b=Math.floor(pz-this.radius);b<=Math.floor(pz+this.radius);b++)for(const r of this.walls.get(a+','+b)||[]){if(r===edge||seen.has(r))continue;seen.add(r);if(this.intersects(px,pz,this.radius,r))blocked=true;}}if(!blocked)return[x,y,z];}return null;
 }
 /** Find a traversable route between original screenplay waypoints without moving their endpoints. */
 route(from,to){const step=.25,key=(x,z)=>x+','+z,start=[Math.round(from[0]/step),Math.round(from[2]/step)],goal=[Math.round(to[0]/step),Math.round(to[2]/step)],end=key(...goal),open=[],seen=new Map(),closed=new Set();
  const clear=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.max(1,Math.ceil(d/.08));for(let i=1;i<=n;i++){const u=i/n;if(!this.canStand(a[0]+(b[0]-a[0])*u,a[2]+(b[2]-a[2])*u,a[1]))return false;}return true;};
  if(clear(from,to))return [to.slice()];if(!this.canStand(to[0],to[2],to[1]))return null;
  const push=n=>{open.push(n);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].f<=n.f)break;open[i]=open[p];i=p;}open[i]=n;},pop=()=>{const top=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[c].f>=last.f)break;open[i]=open[c];i=c;}open[i]=last;}return top;};
  const h=(x,z)=>Math.hypot(x-goal[0],z-goal[1]),first={x:start[0],z:start[1],g:0,f:h(...start),point:from.slice()};seen.set(key(...start),first);push(first);
  while(open.length&&closed.size<50000){const n=pop(),id=key(n.x,n.z);if(closed.has(id))continue;closed.add(id);if(id===end){const route=[to.slice()];for(let p=n.parent;p?.parent;p=p.parent)route.unshift(p.point);const result=[];let a=from,i=0;while(i<route.length){let j=i;while(j+1<route.length&&clear(a,route[j+1]))j++;result.push(route[j]);a=route[j];i=j+1;}return result;}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,z=n.z+dz,k=key(x,z),point=[x*step,from[1],z*step];if(closed.has(k)||!this.canStand(point[0],point[2],point[1])||!clear(n.point,point))continue;const g=n.g+Math.hypot(dx,dz);if(g>=(seen.get(k)?.g??Infinity))continue;const row={x,z,g,f:g+h(x,z),point,parent:n};seen.set(k,row);push(row);}
  }return null;
 }
 nearest(position,maxRadius=8){if(this.canStand(position[0],position[2],position[1]))return position.slice();let best=null,dist=Infinity;for(let x=Math.floor(position[0]-maxRadius);x<=position[0]+maxRadius;x++)for(let z=Math.floor(position[2]-maxRadius);z<=position[2]+maxRadius;z++){const y=this.height(x+.5+this.cellOrigin,z+.5+this.cellOrigin,position[1]);if(y===null||!this.canStand(x+.5+this.cellOrigin,z+.5+this.cellOrigin,y))continue;const d=(x+.5+this.cellOrigin-position[0])**2+(z+.5+this.cellOrigin-position[2])**2;if(d<dist){dist=d;best=[x+.5+this.cellOrigin,y,z+.5+this.cellOrigin];}}return best;}
}
