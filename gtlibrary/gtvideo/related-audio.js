import {loadNativeCharacterPack} from '../gtfx/native-character-packs.js';
import {fxCatalog} from './special-effects.js';
import {resolveCharacter,mergeNativeCharacterPacks,nativeForAppearance} from '../gtfx/character-catalog.js';
import {applyCostumeOverrides} from '../gtfx/costume-overrides.js';

const packs=new Map(),labels={basic:'普攻',skill:'技能',chain:'连锁'};
async function nativePack(character){
 if(!packs.has(character.id)){const promise=Promise.all(character.members.map(member=>loadNativeCharacterPack(member.id))).then(imported=>mergeNativeCharacterPacks(character,imported));packs.set(character.id,promise);promise.catch(()=>{if(packs.get(character.id)===promise)packs.delete(character.id);});if(packs.size>32)packs.delete(packs.keys().next().value);}return packs.get(character.id);
}
function soundNames(value,result=new Set()){
 if(typeof value==='string'){if(value)result.add(value);}else if(Array.isArray(value))for(const row of value)soundNames(row,result);else if(value&&typeof value==='object'){if(Object.hasOwn(value,'SfxName'))soundNames(value.SfxName,result);else for(const [key,item] of Object.entries(value))if(!['Name','TypePriority','Delay','Loop','Volume','Pitch'].includes(key))soundNames(item,result);}return result;
}
const category=value=>/^(basic|normal)/i.test(value||'')?'basic':/^(support|chain)/i.test(value||'')?'chain':/^(role|cwp|skill|myth|trigger|special)/i.test(value||'')?'skill':null;
export function characterAudioGroups(native,catalog,{appearance='',skin=''}={}){
 const source=nativeForAppearance(native,appearance,skin),profile=source.profile||native.profile||{},hero=[skin,appearance,profile.defaultSkin].find(value=>source.heroClasses?.[value])||profile.defaultSkin,effective=applyCostumeOverrides(source,appearance),categories=new Map(),groups=new Map(Object.keys(labels).map(key=>[key,new Map()]));
 for(const style of Object.values(effective.styles||{}))for(const name of [...style.BattleActions||[],...style.ClassBattleActions||[],...style.ManualBattleActions||[]])categories.set(name,'basic');
 for(const weapon of Object.values(effective.weapons||{}))if(weapon.action)categories.set(weapon.action,'skill');
 for(const plan of effective.plans||[]){const group=category(plan.category)||category(plan.id);if(group&&plan.action)categories.set(plan.action,group);}
 for(const [name,action] of Object.entries(effective.actions||{})){
  const group=/^(BasicSupport:|GraphSupport:|Support)/i.test(name)?'chain':/^(Role|GraphRole:|Cwp|GraphMyth:|GraphTrigger:|Myth)/i.test(name)?'skill':categories.get(name)||(/^Manual/i.test(name)?'basic':'skill'),sounds=soundNames(action.SfxInfo);
  if(effective.heroClasses?.[hero]?.endsWith('_myth'))soundNames(action.MythSfxInfo,sounds);
  for(const sound of sounds){const clip=catalog.byId.get(sound)||catalog.byId.get(catalog.defaults?.[sound])||catalog.byName.get(sound)?.[0];if(clip&&!groups.get(group).has(sound))groups.get(group).set(sound,clip);}
 }
 return [...groups].map(([key,clips])=>({key,label:labels[key],clips:[...clips.values()].sort((a,b)=>a.name.localeCompare(b.name))})).filter(group=>group.clips.length);
}
const voiceIndexes=new WeakMap();
const voiceKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function characterVoiceClips(catalog,character,native,{resource='',appearance=resource,skin=''}={}){
 let index=voiceIndexes.get(catalog);if(!index){index=new Map();for(const clip of catalog.clips){if(clip.kind!=='voice')continue;const folder=String(clip.group||clip.id).match(/(?:^|\/)voices_[^/]+\/([^/]+)/)?.[1];if(!folder)continue;const key=voiceKey(folder.replace(/^\d{8}_/,''));if(!index.has(key))index.set(key,[]);index.get(key).push(clip);}voiceIndexes.set(catalog,index);}
 const source=native?nativeForAppearance(native,appearance,skin):null,profile=source?.profile||{},keys=new Set([resource,appearance,source?.sourceResource,...profile.appearances||[],profile.defaultSkin?.replace(/_\d+$/,'')||'',...(!source?[character?.id,character?.key,...character?.aliases||[]]:[])].filter(Boolean).map(voiceKey)),clips=new Map();
 // Voice bundles use Hero.OriginId, while their exported display names can
 // differ from the character resource (watcher -> yuna, both origin 569).
 // Resolve IDs from the chosen native source to keep merged forms separate.
 const origins=source?.sourceIdentity?.originIds??(!native?.nativeMembers&&character?.origins?.length===1?character.origins:[]);
 for(const origin of origins)if(Number.isInteger(origin)&&origin>0)keys.add(String(origin));
 // Named export folders establish ownership; identical voice IDs link the native
 // numeric bundles used by other languages, without guessing from similar names.
 for(const key of [...keys])for(const clip of index.get(key)||[])for(const version of catalog.byName.get(clip.name)||[]){const folder=String(version.group||version.id).match(/(?:^|\/)voices_[^/]+\/(\d+)(?:\/|$)/)?.[1];if(version.kind==='voice'&&folder&&version.name.startsWith(folder))keys.add(folder);}
 for(const key of keys)for(const clip of index.get(key)||[]){const semantic=(clip.language||'')+'|'+clip.name,current=clips.get(semantic);if(!current||catalog.defaults?.[clip.name]===clip.id)clips.set(semantic,clip);}return [...clips.values()].sort((a,b)=>(a.language||'').localeCompare(b.language||'')||a.name.localeCompare(b.name));
}
export async function relatedCharacterAudio(catalog,{resource,character,appearance=resource,skin}={}){
 const registry=await fxCatalog(),registered=resolveCharacter(registry.characters,character||resource),native=registered?await nativePack(registered):null,groups=native?characterAudioGroups(native,catalog,{appearance,skin}):[],voices=characterVoiceClips(catalog,registered,native,{resource,appearance,skin});if(voices.length)groups.push({key:'voice',label:'配音',clips:voices});return groups.length?{character:registered?.id||resource,groups}:null;
}
