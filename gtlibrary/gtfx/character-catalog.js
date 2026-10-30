/** Character identity is generated from Hero.OriginId and costume.TargetCharacterIds. */
export function groupCharacters(catalog,families){
 const entries=new Map(catalog.characters.map(c=>[c.id,c]));
 return families.characters.map(f=>({...entries.get(f.id),...f,members:f.members.map(id=>entries.get(id)).filter(Boolean)}));
}
export function resolveCharacter(characters,id){return characters.find(c=>c.id===id||c.key===id||c.members.some(m=>m.id===id||m.key===id)||c.aliases.includes(id));}
/** Namespace resources before combining manifests: older exports can reuse local keys. */
export function mergeCharacterIndexes(character,indexes){
 const merged={...indexes[0],character:character.id,effects:[],textures:{},sprites:{},meshes:{}},effects=new Map();
 indexes.forEach((index,i)=>{
  const member=character.members[i],keys=new Map();
  for(const kind of ['textures','sprites','meshes'])for(const key of Object.keys(index[kind]||{}))keys.set(key,member.id+':'+key);
  const remap=v=>typeof v==='string'?(keys.get(v)||v):Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])):v;
  for(const kind of ['textures','sprites','meshes'])for(const [key,value] of Object.entries(index[kind]||{}))merged[kind][keys.get(key)]=remap(value);
  for(const effect of index.effects){
   const existing=effects.get(effect.preset);
   if(existing){existing.resourceCharacters.push(member.id);continue;}
   const entry={...remap(effect),resourceCharacters:[member.id]};effects.set(effect.preset,entry);merged.effects.push(entry);
  }
 });
 return merged;
}

/** Hero forms come from native hero records, independently of portrait availability. */
export function appearanceKind(character,appearance){
 const key=(appearance||'').replace(/_\d+$/,'');
 return character?.appearanceKinds?.[key]||character?.portraits?.find(p=>p.appearance===key&&['base','myth','ascent'].includes(p.kind))?.kind||'';
}

/** An opt-in UI family retains its independently imported native source packs. */
export function mergeNativeCharacterPacks(character,packs){
 const available=packs.map((pack,i)=>({id:character.members[i]?.id,pack})).filter(x=>x.pack?.profile);
 const primary=available.find(x=>x.id===character.id)||available[0];if(!primary)return null;
 if(character.nativeAggregation!=='appearance-source'||available.length<2)return primary.pack;
 const combined={...primary.pack,nativeMembers:available};
 const maps=['actions','styles','projectiles','options','graphs','costumes','heroOptionIds','awakeningByHero','heroClasses','heroElements','weapons','presetDirections','summonables','summonStyles','summonAis','buffs'];
 for(const key of maps)combined[key]=Object.assign({},...available.map(x=>x.pack[key]||{}));
 const forms=[],seenForms=new Set(),appearances=[],seenAppearances=new Set(),appearanceMembers={},defaultSkinByAppearance={};
 for(const {id,pack}of available){
  for(const form of pack.profile.forms||[])if(!seenForms.has(form.hero)){seenForms.add(form.hero);forms.push({...form});}
  for(const appearance of pack.profile.appearances||[]){
   if(!seenAppearances.has(appearance)){seenAppearances.add(appearance);appearances.push(appearance);appearanceMembers[appearance]=id;defaultSkinByAppearance[appearance]=pack.profile.defaultSkin;}
  }
 }
 combined.profile={...primary.pack.profile,appearances,forms,appearanceMembers,defaultSkinByAppearance};
 for(const key of ['appearanceSources','compatibleWeapons','weaponByAppearance'])combined.profile[key]=Object.assign({},...available.map(x=>x.pack.profile[key]||{}));
 return combined;
}

/** Resolve behavior from the chosen appearance's native source, never by gender names. */
export function nativeForAppearance(native,appearance,heroAppearance=appearance){
 if(!native.nativeMembers)return native;
 const member=native.profile?.appearanceMembers?.[appearance]||native.profile?.appearanceMembers?.[heroAppearance];
 return native.nativeMembers.find(x=>x.id===member)?.pack||native.nativeMembers[0].pack;
}
