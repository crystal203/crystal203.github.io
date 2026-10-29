import {sampleGraphPath} from './graph-action.js';
import {createHomingTrajectory} from './native-projectile.js';
const projectileTrajectories=new WeakMap();
// Shared coordinates and source resource identities for actor/FX playback.
export const directions={front:[0,0,-1],back:[0,0,1],left:[-1,0,0],right:[1,0,0]};
// Appearance codes are the source Spine resources; display names come from
// the Chinese source registry when present, otherwise from these codes.
export const profiles={
 hana:{appearances:['hana','hana_beachball','hana_fruit_harvester','hana_gray_raincoat','hana_magic_girl','hana_nurse','hana_santa','hana_winter_girl'],defaultSkin:'hana_5',weapon:'cwp_hana',weaponType:'staff',weaponSlots:[1],nativeStyle:'staff_hana',preferredEffect:'fx_hana_basic_1st'},
 peimei:{appearances:['china_hero_girl_5','china_hero_boy_5'],defaultSkin:'default',weapon:'cwp_china',weaponType:'gauntlet',weaponSlots:[1,2],nativeStyle:'gauntlet_china_hero_ascent',nativeVariantByAppearance:{china_hero_boy_5:'attack',china_hero_girl_5:'attack_alt'},preferredEffect:'fx_peimei_basic_punch_red'},
 milkywaygirl:{appearances:['milkyway_girl','milkyway_girl_librarian'],defaultSkin:'milkyway_girl_5',weapon:'cwp_milkywaygirl',weaponType:'basket',weaponSlots:[2],nativeStyle:'basket_milkyway_girl',preferredEffect:'fx_m_milkyway_girl_1st_cast'}
};
export function actionClip(link,time,direction){
 let selected={name:'idle',start:0,speed:1,loop:true};
 if(time<link.end)for(const c of link.clips)if(time>=c.start)selected=c;
 if(selected.name==='twohand_attack'&&(direction==='front'||direction==='left'))selected={...selected,name:'twohand_attack2'};
 return selected;
}
export function clipTime(clip,time,duration){
 const elapsed=Math.max(0,time-clip.start),speed=clip.targetDuration?duration/clip.targetDuration:clip.speed;
 return speed*(clip.rateChange==null?elapsed:Math.min(elapsed,clip.rateChange)*clip.initialRate+Math.max(0,elapsed-clip.rateChange));
}
export function castDirection(link,direction){
 const d=directions[direction],a=(link.angle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [d[0]*c+d[2]*s,0,d[2]*c-d[0]*s];
}
export function hookDistance(link,time,{targetDistance=Infinity,boundsSize=[.55,.75,.55]}={}){
 const start=Math.max(boundsSize[0],boundsSize[2])/2+(link.hookStart??.5);
 const life=link.hookLife??.3,max=link.hookMax??(link.hookSpeed??20)*life;
 const progress=Math.min(1,Math.max(0,(time-(link.hookShootTiming||0))/Math.max(life,1e-9)));
 return Math.min(targetDistance,start+(max-start)*progress**4);
}
export function anchorVelocity(link,time,direction,options){
 const step=1/4096,a=anchorPosition(link,Math.max(link.delay||0,time-step),direction,options),b=anchorPosition(link,time+step,direction,options);
 const dt=time+step-Math.max(link.delay||0,time-step);return b.map((v,i)=>(v-a[i])/dt);
}
export function anchorPosition(link,time,direction,options){
 if(link.graphPosition){const p=link.graphPosition.slice();if(link.graphFollow){const owner=sampleGraphPath(link.graphPath,time);for(let i=0;i<3;i++)p[i]+=owner[i]-link.graphOwnerAtBirth[i];}return p;}
 const {centerHeight,targetDistance,boundsSize}=options;
 if(link.anchor==='symbol')return [.8,centerHeight+.5,.8];
 const d=castDirection(link,direction),height=link.anchor==='feet'||link.anchor==='ground'||link.targetGround?0: centerHeight;
 const orbit=link.orbitOffset||[0,0,0];
 let distance=link.offset||0;
 if(link.anchor==='target')distance=targetDistance;
 if(link.anchor==='projectile'){
  const elapsed=link.projectileElapsed??Math.max(0,time-link.delay),speed=link.projectileSpeed||0,accel=link.projectileAccel||0;
  distance=Math.max(0,distance+speed*elapsed+accel*elapsed*elapsed/2);
  if(!link.projectileUnclamped)distance=Math.min(targetDistance,distance);
  if(link.homingAngularSpeed>0){
   const startDirection=castDirection({angle:link.projectileOriginAngle??link.angle??0},direction);
   const start=startDirection.map(v=>v*(link.projectileOriginDistance??link.offset??0));start[1]=height;
   const base=directions[direction],target=[base[0]*targetDistance,options.targetHeight??height,base[2]*targetDistance];
   const key=JSON.stringify([direction,start,target,speed,accel,link.homingAngularSpeed,options.projectileStep]);
   let cached=projectileTrajectories.get(link);
   if(!cached||cached.key!==key||cached.frames!==options.projectileFrameSteps||cached.targetAt!==options.targetPositionAt){
    cached={key,frames:options.projectileFrameSteps,targetAt:options.targetPositionAt,
     sample:createHomingTrajectory({position:start,direction:d,speed,accel,angularSpeed:link.homingAngularSpeed,target,
      targetAt:options.targetPositionAt,step:options.projectileStep||1/60,frameSteps:options.projectileFrameSteps})};
    projectileTrajectories.set(link,cached);
   }
   return cached.sample(elapsed).map((v,i)=>v+orbit[i]);
  }
 }
 if(link.anchor==='meteor'){
  const side=link.meteorSide||1,height=link.meteorHeight||4.5;
  const duration=Math.sqrt(height*height*2+side*side)/(link.projectileSpeed||70);
  const t=Math.min(1,Math.max(0,(time-link.delay)/duration));
  return [d[0]*targetDistance+orbit[0]+(direction==='right'?-side:side)*(1-t),height*(1-t),d[2]*targetDistance+orbit[2]+height*(1-t)];
 }
 if(link.anchor==='hook')distance=hookDistance(link,time,{targetDistance,boundsSize});
 return [d[0]*distance+orbit[0],height+(link.anchor==='ground'?.03:0)+orbit[1],d[2]*distance+orbit[2]];
}

// EffectPool.GetDefaultRotation / GetSlashRotation: rotate FROM the preset
// Direction, then apply the native direction mask around the local Z axis.
export function effectRotation(reference,direction,type='Default'){
 if(!direction)return {yaw:0,roll:0};
 const yaw=Math.atan2(direction[0],direction[2])-Math.atan2(reference[0],reference[2]);
 const bit=direction[0]>0?2:direction[0]<0?8:direction[2]>0?1:4;
 const mask={Slash:3,KatanaSlash:9,KatanaSlashReverse:6}[type]||0;
 return {yaw,roll:mask&bit?Math.PI:0};
}
