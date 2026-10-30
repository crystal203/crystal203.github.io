// ManualWeaponBoomerang's native circular projectile and runtime WeaponSpec
// SpriteName binding. All geometry/materials derive from the authored CustomSprite.
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const rotate=(v,d)=>{const r=d*Math.PI/180;return [v[0]*Math.cos(r)+v[2]*Math.sin(r),v[1],v[2]*Math.cos(r)-v[0]*Math.sin(r)];};
function equippedSprite(index,source,name){
 const effect=structuredClone(source);let count=0;
 for(const script of effect.scripts||[]){
  const atlas=script.customSpriteSource;if(!atlas)continue;
  let key=name;if(!atlas.frames[key]&&atlas.ignoreExtension&&key.includes('.'))key=key.slice(0,key.lastIndexOf('.'));
  const frame=atlas.frames[key];if(!frame)throw Error('Missing native equipped-weapon atlas frame '+name);
  const rect=frame.frame,extent=atlas.atlasSize,size=frame.sourceSize,trim=frame.spriteSourceSize||size,p2w=atlas.pixelToWorld,scale=atlas.localScale;
  const sprite='native-equipped-weapon:'+atlas.atlasKey+':'+key;
  index.sprites[sprite]={name,texture:atlas.material.texture,uv:[rect.x/extent.w,1-(rect.y+rect.h)/extent.h,rect.w/extent.w,rect.h/extent.h],size:[size.w,size.h],pivot:{x:.5,y:.5},pixelsToUnits:1/p2w,rotated:!!frame.rotated,atlasFrame:frame};
  effect.statics=(effect.statics||[]).filter(s=>s.node!==script.node);
  effect.statics.push({node:script.node,name:'NativeEquippedWeaponSprite',mesh:null,sprite,size:[trim.w*p2w*scale.x,trim.h*p2w*scale.y],material:structuredClone(atlas.material),sort:script.fields.SortingOrder||0,customSprite:{atlasFrameKey:key,ignoreExtension:atlas.ignoreExtension,pixelToWorld:p2w,ignoreOriginalSize:atlas.ignoreOriginalSize,localScale:scale}});
  script.fields.SpriteName=name;delete script.customSpriteSource;count++;
 }
 if(!count)throw Error('Missing source CustomSprite for native weapon arc');
 effect.preset='native_equipped_weapon:'+source.preset+':'+name;effect.id=effect.preset;return effect;
}
export function emitNativeWeaponArc({event,a,index,effects,options,initial,forward,addEffect}){
 const source=effects.get(a.ProjPreset);if(!source)throw Error('Missing native boomerang projectile pool '+a.ProjPreset);
 const weapon=equippedSprite(index,source,options.weapon);effects.set(weapon.preset,weapon);
 const side=Math.abs(forward[0])>=Math.abs(forward[2]),positive=side?forward[0]>0:forward[2]<0,angle=(positive?1:-1)*event.angle,center=add(initial,[0,options.centerHeight??.375,0]),motionPath=[],eulerPath=[];
 const yaw=Math.atan2(forward[2],forward[0])*180/Math.PI;
 for(let f=0;f<=Math.ceil(event.life*60);f++){
  const t=Math.min(event.life,f/60),u=t/event.life;
  motionPath.push({time:t,position:add(center,rotate(forward,-angle/2+angle*u),event.radius)});
  eulerPath.push({time:t,position:[0,-yaw-angle*u*event.spinMultiplier,0]});
 }
 const callback={animationField:event.animationField,nameField:event.nameField,index:0};
 const body=addEffect(weapon.preset,0,{anchor:'feet',directed:false,spineEvent:callback,until:event.life,link:{motionPath,eulerPath,eulerMask:[true,true,true],hideWeaponUntil:event.life,hideWeaponEnd:a.ActionDuration,sourceRelativeMotion:true}},motionPath[0].position);
 const trail=addEffect(a.TrailPreset,0,{anchor:'feet',directed:false,spineEvent:callback,until:event.life,mirrorXByFacing:['left','back'],link:{motionPath,sourceRelativeMotion:true}},motionPath[0].position);
 return {body,trail,source:'native ARM64 0x8b0e8d0',life:event.life,radius:event.radius,angle};
}
