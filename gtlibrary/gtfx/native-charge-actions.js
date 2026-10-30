// Persistent charge recipes compiled from source, independent of actor identity.
const list=v=>Array.isArray(v)?v:v==null?[]:[v];
const fields=rows=>Object.fromEntries(list(rows).flatMap(r=>r.Name&&r.Preset?[[r.Name,r.Preset]]:Object.entries(r)));
export function expandNativeChargePlans(plans,options,native){
 const hero=options.heroAppearance||options.appearance,ids=new Set([...(native.heroOptionIds?.[hero]||native.heroOptionIds?.[options.profile.defaultSkin]||[]),...(options.exclusiveWeapon?native.weapons?.[options.weapon]?.optionIds||[]:[])]);
 const byId=new Map(Object.values(native.options||{}).map(o=>[o.Id,o]));
 return plans.flatMap(plan=>{
  if(plan.behavior!=='native-charge')return [plan];
  const original=native.actions[plan.action],rule=plan.nativeCharge,weapon=list(original.OptionId).filter(id=>ids.has(id)).map(id=>byId.get(id)).find(Boolean);
  // apply_option replaces the shooter arrays; the non-Cwp myth option appends
  // its own ProjectileInfo or CwpProjectileInfo. IsCwpOption only consumes buff.
  let projectileRows=list(weapon?.ProjectileInfo||original.ProjectileInfo).slice(),presets=fields(original.PresetInfo),roleOption;
  for(const id of list(original.MythOptionId)){
   const option=ids.has(id)&&byId.get(id);if(!option||option.IsCwpOption)continue;
   roleOption=option;presets={...presets,...fields(option.PresetInfo)};
   projectileRows.push(...list(weapon?option.CwpProjectileInfo:option.ProjectileInfo));
  }
  const a={...original,ProjectileInfo:projectileRows},thresholds=list(a[rule.levelTimesField]),maximum=a[rule.maximumField],variants=[];
  const releases=thresholds.map((time,i)=>({time,level:i+1,full:false}));
  if(maximum>thresholds.at(-1))releases.push({time:maximum,level:thresholds.length,full:true});
  for(const enhanced of roleOption?[false,true]:[false])for(const reverse of [false,true])for(const {time,level,full}of releases){
   const suffix=enhanced?'_myth':'',loop=rule.loopKeys[Number(reverse)],slash=rule.slashKeys[Number(reverse)],events=[];
   for(const [i,at]of thresholds.entries()){
    if(at>time)break;
    if(i>0)events.push({op:'effect',key:'charge'+suffix,at,anchor:'center',follow:true,followSpine:true,directed:false,nativePoolTransform:'directional'});
    const until=Math.min(time,thresholds[i+1]??time);
    if(until>at)events.push({op:'effect',key:'lv'+(i+1)+suffix,at,until,anchor:'center',follow:true,followSpine:true,directed:false,nativePoolTransform:'directional'});
   }
   events.push({op:'effect',key:slash+suffix,at:time,anchor:'center',offset:rule.slashOffset,fourWay:true,follow:true,followSpine:true,nativePoolTransform:'directional'});
   const projectileIndex=level-1+(enhanced?rule.enhancedProjectileOffset:0);
   // ShootDirectionAtPosition 0x6c99004 (+0x124): adds ShootHelper.shootOffset
   // to the Lua's explicit center+direction origin, before SingleShoot.
   events.push({op:'projectile',at:time,index:projectileIndex,offset:rule.projectileOriginOffset+(projectileRows[projectileIndex]?.Offset||0),directional:true,muzzle:false,nativePoolTransform:'directional'});
   const variantId='basic-charge-'+(enhanced?'enhanced-':'')+(reverse?'reverse-':'')+(full?'full':'lv'+level);
   variants.push({...plan,behavior:'timeline',variantId,disableCombo:true,label:(enhanced?'强化':'')+(reverse?'反斩':'正斩')+' · '+(full?'满蓄力':level+'级蓄力'),
    resolvedParameters:{action:a,presets},end:time+a[rule.attackDurationField],meleeTimeline:true,
    clips:[{key:loop,at:0,end:time,track:'Upper'},{key:slash,at:time,end:time+a[rule.attackDurationField],track:'Upper'}],
    moves:[{op:'dash',at:time+rule.dashAt,duration:rule.dashDuration,speed:rule.dashSpeedPerLevel*level,stopOffset:rule.stopOffset}],events,
    chargeState:{level,chargeDuration:time,reverse,enhanced,projectileIndex:projectileIndex+1,maximum,weaponOption:weapon?.Id,roleBuff:roleOption?.RoleBuffName},
    ...(enhanced?{nativeCondition:{buff:roleOption.RoleBuffName,minimumScore:0,consumeAt:time}}:{})});
  }
  return variants;
 });
}
