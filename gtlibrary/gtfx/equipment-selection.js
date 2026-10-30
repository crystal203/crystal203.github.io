/** Equipment menus and effective source contracts, independent of actor identity. */
import {nativeForAppearance} from './character-catalog.js';
import {nativeForWeapon,weaponHeroClasses} from './weapon-hero-variants.js';
import {mainWeaponSlots} from './equipment-options.js';
const primaryTypes=(native,profile,hero)=>{
 const classes=weaponHeroClasses(native,hero);if(!classes.length)classes.push(native.heroClasses?.[profile.defaultSkin]);
 return [...new Set(Object.values(native.styles||{}).filter(s=>classes.includes(s.Class)&&s.ManualBattleActions?.length).map(s=>s.Weapon1).filter(t=>t&&t!=='none'&&t!=='custom'))];
};
export function preferredWeapons(native,profile,hero=profile.defaultSkin){
 const source=nativeForAppearance(native,hero,hero);if(source.previewPolicy?.excludeWeaponSkill)return [];const types=primaryTypes(source,profile,hero),myth=(source.heroClasses?.[hero]||'').endsWith('_myth'),groups=new Map();
 for(const [code,w]of Object.entries(source.weapons||{})){
  if(!w.exclusive||!types.includes(w.weaponType)||!w.action)continue;
  const list=groups.get(w.action)||[];list.push({code,...w});groups.set(w.action,list);
 }
 const result=[...groups.values()].map(list=>list.sort((a,b)=>Number(b.code.endsWith('_myth')===myth)-Number(a.code.endsWith('_myth')===myth)||a.sourceItemId-b.sourceItemId)[0]);
 const current=profile.weaponByAppearance?.[hero]||profile.weapon;
 return result.sort((a,b)=>Number(b.code===current)-Number(a.code===current)||a.sourceItemId-b.sourceItemId);
}
export function weaponChoices(native,profile,hero,catalog){
 const source=nativeForAppearance(native,hero,hero),preferred=preferredWeapons(native,profile,hero);
 if(!preferred.length&&!source.previewPolicy?.excludeWeaponSkill){const code=profile.weaponByAppearance?.[hero]||profile.weapon;if(code)preferred.push({code,weaponType:profile.weaponType,...source.weapons?.[code]});}
 const seen=new Set(preferred.map(w=>w.code));
 const types=primaryTypes(source,profile,hero);if(!types.length)types.push(profile.weaponType);
 const ordinary=types.flatMap(type=>(catalog[type]||[]).flatMap(code=>{if(seen.has(code))return [];seen.add(code);return [{code,weaponType:type,...source.weapons?.[code],preferred:false}];}));
 return [...preferred.map(w=>({...w,preferred:true})),...ordinary];
}
export function equipmentProfile(native,profile,appearance,hero,weapon,catalog={}){
 const appearanceSource=nativeForAppearance(native,appearance,hero),source=nativeForWeapon(appearanceSource,hero,weapon),supported=primaryTypes(source,profile,hero),type=source.weapons?.[weapon]?.weaponType||supported.find(t=>catalog[t]?.includes(weapon))||profile.weaponType;
 const cls=source.heroClasses?.[hero]||source.heroClasses?.[source.profile?.defaultSkin],styles=Object.values(source.styles||{}).filter(s=>s.Class===cls&&s.Weapon1===type&&s.ManualBattleActions?.length),style=styles.find(s=>s.Name===profile.nativeStyle)||styles[0];
 return {...profile,nativeHeroClass:cls,activeHeroOptionIds:source.heroOptionIds?.[hero],defaultSkin:profile.defaultSkinByAppearance?.[appearance]||source.profile?.defaultSkin||profile.defaultSkin,weaponType:type,weaponSlots:mainWeaponSlots(type,type===profile.weaponType?profile.weaponSlots:undefined),nativeStyle:style?.Name||profile.nativeStyle,idleAnimation:style?.CustomIdle||profile.idleAnimation};
}
export function sourceExclusiveWeapon(native,profile,appearance,hero,weapon){
 const source=nativeForAppearance(native,appearance,hero);if(source.previewPolicy?.excludeWeaponSkill)return false;const value=source.weapons?.[weapon]?.exclusive;
 return typeof value==='boolean'?value:weapon===(profile.weaponByAppearance?.[hero]||profile.weaponByAppearance?.[appearance]||profile.weapon);
}
export function shieldAllowedForWeapon(native,profile,hero){
 const source=nativeForAppearance(native,hero,hero),cls=profile.nativeHeroClass||source.heroClasses?.[hero]||source.heroClasses?.[profile.defaultSkin];
 return Object.values(source.styles||{}).some(s=>s.Class===cls&&s.Weapon1===profile.weaponType&&s.Weapon2==='shield');
}
export function preferredWeaponSelection(native,profile,hero,previous=''){
 const preferred=preferredWeapons(native,profile,hero),prior=native.weapons?.[previous];
 return preferred.find(w=>w.action===prior?.action)?.code||profile.weaponByAppearance?.[hero]||profile.weapon||preferred[0]?.code||'';
}
/** Only the selected WeaponSpec installs a weapon skill; other source plans stay dormant. */
export function selectedWeaponPlans(native,plans,weapon){
 if(native.previewPolicy?.excludeWeaponSkill)return plans.filter(p=>!(p.category==='cwp'||p.id==='cwp'||p.action?.startsWith('Cwp')));
 const selected=native.weapons?.[weapon]?.action,known=Object.keys(native.weapons||{}).length>0;
 return plans.filter(p=>!(p.category==='cwp'||p.id==='cwp'||p.action?.startsWith('Cwp'))||(!known||!!selected&&(p.action===selected||p.augmentAction===selected)));
}
