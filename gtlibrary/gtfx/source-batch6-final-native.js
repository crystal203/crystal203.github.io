import {scriptActionModules} from './script-actions.js';
import {sourceHero} from './weapon-hero-variants.js';
import {aimDirection,targetPositions} from './targeting.js';
import {UnityRand} from './native-random.js';
import {sampleGraphPath} from './graph-action.js';
function bindPoolSprite(index,preset,name){
 const source=index.effects.find(e=>e.preset===preset),key=preset+':sprite:'+name;if(index.effects.some(e=>e.preset===key))return key;
 if(!source)throw Error('Missing native weapon pool '+preset);const effect=structuredClone(source);effect.preset=key;effect.id+=':'+name;
 for(const script of effect.scripts||[]){const atlas=script.customSpriteSource;if(!atlas)continue;let lookup=name;if(!atlas.frames[lookup]&&atlas.ignoreExtension)lookup=name.replace(/\.[^.]+$/,'');const frame=atlas.frames[lookup];if(!frame)throw Error('Missing source weapon sprite '+name);
  const rect=frame.frame,extent=atlas.atlasSize,size=frame.sourceSize,trim=frame.spriteSourceSize||size,p2w=atlas.pixelToWorld,scale=atlas.localScale,spriteKey='native-pool-sprite:'+atlas.atlasKey+':'+lookup;
  index.sprites[spriteKey]={name,texture:atlas.material.texture,uv:[rect.x/extent.w,1-(rect.y+rect.h)/extent.h,rect.w/extent.w,rect.h/extent.h],size:[size.w,size.h],pivot:{x:.5,y:.5},pixelsToUnits:1/p2w,rotated:!!frame.rotated,atlasFrame:frame};
  effect.statics=(effect.statics||[]).filter(x=>x.node!==script.node);effect.statics.push({node:script.node,name:'NativeWeaponSprite',sprite:spriteKey,size:[trim.w*p2w*scale.x,trim.h*p2w*scale.y],material:structuredClone(atlas.material),sort:script.fields.SortingOrder||0,customSprite:{atlasFrameKey:lookup,pixelToWorld:p2w,localScale:scale}});script.fields.SpriteName=name;
 }
 index.effects.push(effect);return key;
}
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k),len=v=>Math.hypot(...v),unit=v=>{const n=len(v);return n?v.map(x=>x/n):[1,0,0];};
export function finalNativeActionModules(index,options,native,plans,style){
 const selected=plans.filter(p=>p.behavior==='source-final-native');if(!selected.length)return [];
 const hero=sourceHero(native,options.heroAppearance||options.appearance||options.profile.defaultSkin),ids=new Set([...(native.heroOptionIds?.[hero]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]),byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o])),initial=options.actorPosition||[0,0,0],forward=aimDirection(options,options.direction,initial),target=targetPositions(options,options.direction)[0],out=[];
 const pool=(preset,at,extra={})=>({op:'effect',preset,at,anchor:'feet',nativePoolLifetime:true,nativePoolTransform:extra.directed?'directional':'direct',directed:false,...extra});
 const active=id=>ids.has(id)?byId.get(id):null,fx=(key,at=0,extra={})=>({op:'effect',key,at,anchor:'center',directed:false,nativePoolLifetime:true,nativePoolTransform:'direct',...extra});
 for(const p of selected){let a={...native.actions[p.action]},clips=[],events=[],moves=[],spine=[],extra={};const op=p.operation;
 if(op==='china-punch'){
  const special=active(a.OptionId),scale=1+(special?.ScaleFactorAdd||0),end=1.2,rng=new UnityRand(options.seed??12345);if(options.randomState)rng.setState(options.randomState);
  if(special)a.PresetInfo=[...a.PresetInfo,...(special.PresetInfo||[])];
  const origin=native.sourceIdentity?.originId,alt=a.IsAscent&&(origin===53||hero.startsWith('china_hero_girl')),key=alt?'attack_alt':'attack';
  for(let t=0;t<end-1e-6;t+=.6)events.push(fx(key,t,{offset:.35,directed:true,nativePoolTransform:'directional',follow:true,followSpine:true,triggerDisposeAt:Math.min(t+.6,end),link:{rootScaleX:scale,rootScaleZ:forward[0]>=0?scale:-scale}}));
  clips.push({key:'attack',at:0});let last=0;const enhanced=[];
  for(let t=a.ActionDuration*.5;t<end;t+=a.ActionDuration)if(t-last>=a.EnhanceInterval&&rng.nextFloat()<=a.EnhanceProbability){last=t;enhanced.push(t);clips.push({key:'enhance',at:t},{key:'attack_refresh',at:t+.2});events.push(fx('enhance',t,{offset:1,directed:true,nativePoolTransform:'directional'}));}
  for(let at=0;at<end;at+=a.DashDuration){moves.push({op:'dash',at,duration:a.DashDuration,speed:a.DashSpeed,stopOffset:.15});if(at===0&&Math.min(a.DashSpeed,(len(add(target,initial,-1))-.7)*2/a.DashDuration)>5){events.push(fx('dash',at,{anchor:'feet'}));spine.push({at,height:.275,duration:.3});}}
  extra={end,sourceTrace:{operation:op,enhanced,refreshPeriod:.6,staminaConsumer:false,previewDuration:end}};
 }else if(op==='china-support'){
  const ascent=active(a.AscentOptionId),pei=hero.startsWith('china_hero_boy'),suffix=pei?'pei':'mei';if(ascent){a.PresetInfo=[...a.PresetInfo,...ascent.PresetInfo];events.push(fx('ready_ascent_'+suffix,0,{anchor:'feet',follow:true,followSpine:true}));}
  events.push(fx(ascent?'cast_ascent_'+suffix:'cast',a.HitTiming[0],{anchor:'target'}),fx(ascent?'explosion_ascent_'+suffix:'explosion',a.HitTiming[1],{anchor:'target'}));
  clips.push({key:'cast',at:a.JumpDuration});moves.push({op:'lerp',at:0,duration:a.JumpDuration,to:'target',offset:-.75},{op:'lerp',at:a.JumpDuration+a.JumpInterval,duration:a.BackJumpDuration,to:'origin'});spine.push({at:0,height:a.JumpHeight,duration:a.JumpDuration},{at:a.JumpDuration+a.JumpInterval,height:a.BackJumpHeight,duration:a.BackJumpDuration});
 }else if(op==='china-role'){
  const opt=active(a.OptionId);if(!opt)continue;const suffix=hero.startsWith('china_hero_boy')?'pei':'mei';a.PresetInfo=opt.PresetInfo;
  events.push(fx('cast_'+suffix,a.AoeTiming,{anchor:'feet'}),fx('shield_'+suffix,a.AoeTiming,{anchor:'feet',triggerDisposeAt:opt.LifeTime}),fx('buff_'+suffix,a.AoeTiming,{anchor:'feet',follow:true,followSpine:true,triggerDisposeAt:opt.LifeTime}));extra.independentFieldEnd=opt.LifeTime;
 }else if(op==='china-cwp'){
  const at=a.ActionDuration,end=at+a.AttackDuration,start=add(add(initial,[0,.375,0]),forward,a.EnergyBallDistance),motion=[{time:at,position:start},{time:end,position:add(start,forward,a.EnergyBallSpeed*a.AttackDuration)}];
  clips.push({key:'attack_ready',at:0,end:at},{key:'attack',at});events.push(fx('cast',0,{anchor:'feet',follow:true,triggerDisposeAt:end}),fx('energytrail',0,{anchor:'feet',directed:true,nativePoolTransform:'directional'}),fx('energyball_combine',at,{offset:a.EnergyBallDistance}),fx('energyball_result',at,{directed:true,nativePoolTransform:'directional',triggerDisposeAt:end,link:{graphPosition:start,motionPath:motion}}),fx('cast_end',end,{optional:true,anchor:'feet',follow:true}));extra={end,sourceTrace:{operation:op,shotAt:at,flightDuration:a.AttackDuration,speed:a.EnergyBallSpeed,distance:a.EnergyBallSpeed*a.AttackDuration}};
 }
 if(op==='teatan-support'){
  const rng=new UnityRand(options.seed??12345),jump=a.JumpDuration,land=jump+a.HoveringDuration,total=land+a.LandingDuration,height=t=>t<jump?a.JumpHeight*(1-(1-t/jump)**2):t<land?a.JumpHeight:t<total?a.JumpHeight*(1-((t-land)/a.LandingDuration)**2):0;
  extra.animationArrays=true;extra.end=a.Duration;extra.independentFieldEnd=total;events.push(...a.EffectPresetNames.map((preset,i)=>pool(preset,a.EffectCreateTimings[i],{anchor:'target'})));
  const spinePath=Array.from({length:Math.ceil(total*60)+1},(_,i)=>{const t=Math.min(total,i/60);return {time:t,position:[0,height(t),0]};});extra.sourceSpinePath=spinePath;
  for(let at=jump+.1;at<land;at+=.1){const u=rng.nextFloat()*Math.PI*2,r=Math.sqrt(rng.nextFloat())*a.MissileSpreadRadius,end=add(target,[Math.cos(u)*r,.375,Math.sin(u)*r]),start=add(initial,[0,.375+height(at),0]),dist=len(add(end,start,-1)),flight=(-15+Math.sqrt(225+10*dist))/5,dir=unit(add(end,start,-1)),motion=[];
   for(let i=0;i<=Math.ceil(flight*60);i++){const t=Math.min(flight,i/60);motion.push({time:at+t,position:add(start,dir,15*t+2.5*t*t)});}const hit=at+flight;
   events.push(pool(a.MissilePreset,at,{directed:true,until:hit,link:{graphPosition:start,graphDirection:dir,motionPath:motion}}),pool(a.MissileTrailPreset,at,{directed:true,triggerDisposeAt:hit,link:{graphPosition:start,graphDirection:dir,motionPath:motion}}),pool(a.ExplosionPreset,hit,{link:{graphPosition:end}}));
  }
 }else if(op==='teatan-cwp'){
  const view=Math.abs(forward[0])>=Math.abs(forward[2])?'side':forward[2]>0?'back':'front',start=1,stop=start+a.ActionDuration,end=stop+1,upper=[2,6,9,13,17,21,24,28,32,36,39,43,47,51].map(x=>x/30),lower=[.05,.3,.55,.8,1.05,1.3,1.55,1.8],bones=['fx1','fx4','fx2','fx3'],launch=['missileUR','missileDR','missileUL','missileDL'];
  for(const layer of ['F','B']){const entityId='native-cannon-'+layer;events.push(fx('setup',0,{anchor:'feet',follow:true,triggerDisposeAt:end,link:{entityId,skeletonView:view,skeletonFlip:forward[0]<0,skeletonIdle:'idle'+layer+'_'+view,skeletonClips:[{name:'spread_out'+layer+'_'+view,start:0,end:start,speed:1,track:'Upper'},{name:'fire'+layer+'_'+view,start, end:stop,speed:1,loop:true,track:'Upper'},{name:'spread_in'+layer+'_'+view,start:stop,end,speed:1,track:'Upper'}]}}));}
  clips.push({key:'setup',at:0},{key:'setup',at:0,track:'Emotion'});
  const entity=bone=>({entityId:'native-cannon-'+(bone==='missileUL'||bone==='missileDL'?'B':'F'),bone});
  events.push(fx('cast',0,{anchor:'feet',follow:true}),fx('ground',start,{anchor:'feet',offset:a.GroundEffectOffset,directed:true,nativePoolTransform:'directional',triggerDisposeAt:stop}));
  for(const [i,t] of upper.entries())events.push(fx('upperFire',start+t,{directed:true,nativePoolTransform:'directional',link:{entityBoneFollower:entity(bones[i%4])}}));
  const step=(a.AttackAreaSize[0]-1-a.GroundEffectOffset)/4,half=a.AttackAreaSize[2]/2,x=[a.GroundEffectOffset+3.5*step,a.GroundEffectOffset+.5*step,a.GroundEffectOffset+2.5*step,a.GroundEffectOffset+1.5*step],z=[-half*.5,half*.5],impactPoints=[[x[0],z[0]],[x[1],z[1]],[x[2],z[0]],[x[3],z[1]],[x[0],z[0]],[x[1],z[1]],[x[0],z[1]],[x[1],z[0]],[x[3],z[0]],[x[1],z[0]],[x[0],z[1]],[x[2],z[1]]],impactTimes=[.15,.15,.4,.65,.65,.9,1.15,1.15,1.4,1.65,1.65,1.9];for(const [i,t]of impactTimes.entries()){const [x,z]=impactPoints[i],pos=add(add(initial,forward,x),[forward[2],0,-forward[0]],z);if(view==='side')pos[2]+=.5;events.push(fx('impact',start+t,{anchor:'feet',uniformScale:i%3===2?1:.85,link:{graphPosition:pos}}));}
  const distances=[8,2,5,7,4,6,6,4];for(const [i,t]of lower.entries()){const at=start+t,dist=distances[i],hit=at+dist/a.MissileSpeed,bone=launch[i%4],follower={...entity(bone),freezeAt:at},deltaPath=[{time:at,position:[0,0,0]},{time:hit,position:forward.map(v=>v*dist)}];events.push(fx('lowerFire',at,{directed:true,nativePoolTransform:'directional',link:{entityBoneFollower:entity(bone)}}),fx('missile',at,{directed:true,nativePoolTransform:'directional',until:hit,link:{entityBoneFollower:{...follower,deltaPath}}}),fx('contrail',at,{directed:true,nativePoolTransform:'directional',triggerDisposeAt:hit,link:{entityBoneFollower:{...follower,deltaPath}}}),fx('explosion',hit,{link:{entityBoneFollower:{...follower,deltaPath}}}));}
  extra={end,sourceTrace:{operation:op,spreadDuration:1,fireDuration:a.ActionDuration,suppressDuration:1,upperTimings:upper,missileTimings:lower,missileDistances:distances}};
 }else if(op==='weapon-throw'||op==='weapon-rain'){
  const rng=new UnityRand(options.seed??12345),weaponRow=p.throwWeapons.find(w=>w.sprite===options.weapon),rarity=weaponRow?.rarity??4,candidates=p.throwWeapons.filter(w=>w.rarity===rarity),pick=()=>candidates[Math.floor(rng.nextFloat()*candidates.length)].sprite;
  const projectile=(name,at,from,to,speed,life)=>{const dir=unit(add(to,from,-1)),distance=Math.min(len(add(to,from,-1)),speed*life),hit=at+distance/speed,motion=[{time:at,position:from},{time:hit,position:add(from,dir,distance)}],preset=bindPoolSprite(index,'Manual_KnightCaptain_Weapon',name);events.push(pool(preset,at,{directed:true,until:hit,link:{graphPosition:from,graphDirection:dir,motionPath:motion}}),pool('Manual_KnightCaptain_Weapon_Fire',at,{directed:true,link:{graphPosition:from,graphDirection:dir}}));return hit;};
  if(op==='weapon-throw'){
   clips.push({animation:'staff_cast',at:0,track:'Base'});const center=add(initial,[0,.375,0]),offsets=[[0,1,0],[-.5,.5,0],[.5,.5,0]],to=add(target,[0,.375,0]);for(const off of offsets){const start=add(center,off),name=pick();events.push(pool('Manual_KnightCaptain_Weapon_Cast',0,{link:{graphPosition:start}}),pool('Manual_KnightCaptain_Weapon_Ready',0,{until:.2,link:{graphPosition:start}}));if(off===offsets[0])projectile(name,.2,start,to,15,.5);}extra.end=.2;
  }else{
   extra.animationArrays=true;const circles=a.NumCircle??10,radius=a.CircleCreateRadius??2.4,spread=a.CircleCreateSpreadRadius??.1,angle=(a.CircleCreateAngle??180)*Math.PI/180,base=Math.atan2(-forward[2],-forward[0]),positions=[];
   for(let i=0;i<circles;i++){const theta=base+angle*(i/(circles-1)-.5),u=rng.nextFloat()*Math.PI*2,r=Math.sqrt(rng.nextFloat())*spread,pos=add(add(target,[0,.375,0]),[Math.cos(theta)*radius+Math.cos(u)*r,0,Math.sin(theta)*radius+Math.sin(u)*r]);positions.push(pos);events.push(pool('Manual_KnightCaptain_Weapon_Cast',0,{link:{graphPosition:pos}}),pool('Manual_KnightCaptain_Weapon_Ready',0,{until:1,link:{graphPosition:pos}}));}
   for(let i=0;i<(a.ShotNums??20);i++){const at=i*(a.ShotInterval??.05),from=positions[(i+1)%circles],name=pick();projectile(name,at,from,add(target,[0,.375,0]),a.MissileSpeed??20,a.MissileLifeTime??.135);}extra.sourceTrace={operation:op,circleCount:circles,shotCount:a.ShotNums??20,rarity};
  }
 }else if(op==='spear-impact'){
  const at=a.SpineEventFrame/30,hit=at+a.ThrowDuration,distance=len(add(target,initial,-1)),dest=distance<=a.Range?target:add(initial,forward,a.Range);clips.push({key:'cast',fallbackKey:'castbackup',at:0});events.push(fx('spear',at),fx('impact',hit,{anchor:'targetGround',maxDistance:a.Range}));extra.independentFieldEnd=hit+.4;extra.sourceTrace={operation:op,shootAt:at,impactAt:hit};
 }

 const trace=extra.sourceTrace;delete extra.sourceTrace;
 const m=scriptActionModules(index,options,{...native,actions:{...native.actions,[p.action]:a}},[{...p,behavior:'timeline',nativePoolEventPosition:true,meleeTimeline:true,disableCombo:true,clips,events,moves,spine,...extra}],style)[0];if(m){if(op==='china-punch')for(const track of m.tracks)if(track.effect.systems?.some(system=>system.renderer.mode===1))track.link.nativeStretchVelocity=true;if(extra.sourceSpinePath)m.actor.spinePath=extra.sourceSpinePath;m.sourceTrace=trace||{operation:op};out.push(m);}
 }
 return out;
}
