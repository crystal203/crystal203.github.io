/** Native CostumeOverrideData patches named entries without replacing unrelated fields. */
function patchInfo(original,patch,key){
 if(Array.isArray(patch)||patch===null||typeof patch!=='object')return structuredClone(patch);
 if(!Object.keys(patch).length)return original;
 const valueField=key.endsWith('ProjectileInfo')?'Name':key.endsWith('AnimationInfo')?'Animation':key.endsWith('SfxInfo')?'SfxName':'Preset';
 const used=new Set(),rows=(Array.isArray(original)?original:[]).map(row=>{
  if(row.Name!=null){
   if(!(row.Name in patch))return row;used.add(row.Name);const value=patch[row.Name];
   return typeof value==='object'?{...row,...value}:{...row,[valueField]:value};
  }
  return Object.fromEntries(Object.entries(row).map(([name,value])=>{if(name in patch){used.add(name);return [name,patch[name]];}return [name,value];}));
 });
 for(const [name,value] of Object.entries(patch))if(!used.has(name))rows.push(valueField==='Name'?{Name:value}:valueField==='Preset'?{[name]:value}:typeof value==='object'?{Name:name,...value}:{Name:name,[valueField]:value});
 return rows;
}
export function patchCostumeRecord(original,patch){
 const out={...original};
 for(const [key,value] of Object.entries(patch)){
  if(key.endsWith('Info')&&value&&typeof value==='object'&&!Array.isArray(value))out[key]=patchInfo(original[key],value,key);
  else out[key]=structuredClone(value);
 }
 return out;
}
export function applyCostumeOverrides(native,appearance){
 const costume=native.costumes?.[appearance];if(!costume)return native;
 const result={...native},names={battleactions:'actions',battlestyles:'styles',options:'options',projectiles:'projectiles'};
 for(const [source,target] of Object.entries(names)){
  const patches=costume.overrides[source];if(!patches)continue;
  result[target]=Object.fromEntries(Object.entries(native[target]||{}).map(([key,row])=>{
   const patch=patches[source==='options'?String(row.Id):row.Name||key];return [key,patch?patchCostumeRecord(row,patch):row];
  }));
 }
 return result;
}

/** Mark visual preset/projectile replacements, not costume rarity, sounds or idle clips. */
export function hasCostumeEffects(native,appearance){
 const overrides=native?.costumes?.[appearance]?.overrides;
 if(!overrides)return false;
 const hasReference=value=>typeof value==='number'?value>0:typeof value==='string'?value.length>0:
  value&&typeof value==='object'?Object.values(value).some(hasReference):false;
 return Object.values(overrides).some(records=>Object.values(records).some(record=>
  Object.entries(record).some(([field,value])=>/Preset|Projectile|SummonableId/.test(field)&&hasReference(value))));
}
