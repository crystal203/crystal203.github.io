/** Equipment eligibility follows native hero and battle-style records. */
export function shieldAllowed(native,profile,hero){
 const compatible=profile?.compatibleWeapons?.[hero]||profile?.compatibleWeapons?.[profile.defaultSkin];
 if(compatible)return compatible.includes('shield');
 const cls=native.heroClasses?.[hero]||native.heroClasses?.[profile?.defaultSkin];
 return Object.values(native.styles||{}).some(s=>s.Class===cls&&s.Weapon2==='shield');
}
export const mainWeaponSlots=(type,fallback)=>type==='claw'?[1,2]:fallback||({gauntlet:[1,2],basket:[2]}[type]||[1]);
export function equipmentStyle(native,profile,hero,weaponEquipped=true,shield){
 const cls=profile.nativeHeroClass||native.heroClasses?.[hero]||native.heroClasses?.[profile.defaultSkin];
 let candidates=Object.values(native.styles||{}).filter(s=>s.Class===cls&&s.ManualBattleActions?.length);
 if(shield!==undefined)candidates=candidates.filter(s=>s.Weapon1===(weaponEquipped?profile.weaponType:'none')&&(s.Weapon2||'none')===(shield?'shield':'none'));
 else candidates=candidates.filter(s=>s.Weapon1===profile.weaponType);
 return candidates.find(s=>s.Name===profile.nativeStyle)||candidates.sort((a,b)=>b.ManualBattleActions.length-a.ManualBattleActions.length)[0]||(shield===undefined?native.styles?.[profile.nativeStyle]:null);
}
