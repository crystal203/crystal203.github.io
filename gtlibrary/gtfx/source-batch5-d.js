import {scriptActionModules} from './script-actions.js';
// The source owns animation names and action clocks. No hero-name dispatch.
export function batch5DActionModules(index,options,native,plans,style){
 if(!plans.some(p=>p.behavior==='source-batch5-d'))return [];
 const actions={...native.actions},projectiles={...native.projectiles},expanded=[];
 const fx=(preset,at=0,extra={})=>({op:'effect',preset,at,anchor:'feet',nativePoolLifetime:true,nativePoolTransform:'direct',...extra});
 const shot=(extra={})=>({op:'projectile',at:0,index:0,offset:.5,directional:true,nativePoolTransform:'directional',...extra});
 for(const p of plans){if(p.behavior!=='source-batch5-d')continue;const a={...actions[p.action]},op=p.batch5Operation,clips=[],events=[],moves=[],nativeRecoils=[];
  if(op==='pet-claw'){
   a.AnimationInfo=[{Name:'attack',Animation:a.AnimationName,Scale:1.3333333730697632}];
   clips.push({key:'attack',at:0,track:'Base'});events.push(fx(a.ClawPreset,0,{anchor:'feet',follow:true,fourWay:true,nativePoolTransform:'directional',spineEvent:{animationKey:'attack',nameField:'SpineEventName'}}));
   moves.push({op:'dash',at:0,duration:a.DashDuration,speed:a.DashDistanceCap/a.DashDuration,stopOffset:a.SafetyDistance});
  }else if(op==='weak-basket'){
   a.AnimationInfo=[{Name:'attack',Animation:options.profile?.weaponType==='basket'?'basket_attack':'rifle_shoot'}];a.ProjectileInfo=[{Name:a.ProjectileName||'weak_basket_shot'}];clips.push({key:'attack',at:0,track:'Base'});events.push(shot());nativeRecoils.push({at:0,distance:.2,height:.1,duration:.3,angle:8});
  }else if(op==='weak-heal'){
   a.AnimationInfo=[{Name:'heal',Animation:'bow_attack',Scale:.33000001311302185/.4000000059604645,Loop:true}];a.ProjectileInfo=[{Name:a.Projectile}];clips.push({key:'heal',at:0,track:'Upper'});events.push(shot({homing:true}));nativeRecoils.push({at:0,distance:.2,height:.275,duration:.2,angle:8});
  }else if(op==='weak-magic'){
   const name='native:'+a.Name;projectiles[name]={Name:name,PresetName:a.BatPreset,Speed:8,Lifetime:.75,HitBoxWidth:.3,PenetrateType:'None',HitPreset:'FX_hit_projectile',ShootEffectPreset:'FX_shoot_01',Directional:a.RotateBat};a.ProjectileInfo=[{Name:name}];a.AnimationInfo=[{Name:'cast',Animation:'staff_cast',Loop:true}];clips.push({key:'cast',at:0,track:'Upper'});events.push(shot({height:-.375}),fx('MagicCircle_AppearIdle',0,{follow:true,triggerDisposeAt:p.end,link:{rootScaleX:.5,rootScaleY:.5,rootScaleZ:.5}}),fx('MagicCircle_Cancel',p.end,{link:{rootScaleX:.5,rootScaleY:.5,rootScaleZ:.5}}));nativeRecoils.push({at:0,distance:.07,height:0,duration:.1,angle:0});
  }else if(op==='teatan-missile'){
   const name='native:'+a.Name;projectiles[name]={Name:name,PresetName:a.MissilePreset,Speed:10,Lifetime:.8999999761581421,HitBoxWidth:.8999999761581421,PenetrateType:'None',Exploding:true,ExplosionPreset:a.ExplosionPreset,ExtraPoolInfo:[{PresetName:a.ContrailPreset}],ShootEffectPreset:a.ShootPreset};a.ProjectileInfo=[{Name:name}];a.AnimationInfo=[{Name:'shoot',Animation:'rifle_shoot'}];clips.push({key:'shoot',at:0,end:.33000001311302185,track:'Base'});events.push(shot({height:-.375,muzzle:false}),fx(a.ShootPreset,0,{offset:.5,height:.125,scale:.699999988079071,directed:true,nativePoolTransform:'directional'}));nativeRecoils.push({at:0,distance:.2,height:.1,duration:.3,angle:8});
  }
  actions[p.action]=a;expanded.push({...p,behavior:'timeline',meleeTimeline:true,sourceProjectilePools:true,clips,events,moves,nativeRecoils,spine:[]});
 }
 const modules=scriptActionModules(index,options,{...native,actions,projectiles},expanded,style);
 for(const m of modules)m.sourceTrace={...m.sourceTrace,operation:'normal-source-basic',source:'registered same-version ARM64 class action',callback:m.actor.clips?.some(c=>['attack2','attack3'].includes(c.name))?'authored Spine sfx at native animation speed':undefined};
 return modules;
}


