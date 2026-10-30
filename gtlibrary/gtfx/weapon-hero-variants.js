// WeaponSpec.IsNeedSpecOverride: correct owner + explicit ExclusiveNumber != 1.
export function sourceHero(native,hero){return native.heroClasses?.[hero]?hero:native.profile?.defaultSkin||hero;}
export function weaponHeroClasses(native,hero){hero=sourceHero(native,hero);return [...new Set([native.heroClasses?.[hero],...Object.values(native.weaponFormVariants?.[hero]||{}).map(v=>v.heroClass)].filter(Boolean))];}
export function nativeForWeapon(native,hero,weapon,exclusive=true){
 const spec=native.weapons?.[weapon],number=spec?.exclusiveNumber;
 if(!exclusive||!spec?.exclusive||number==null||number===1)return native;
 const canonical=sourceHero(native,hero),variant=native.weaponFormVariants?.[canonical]?.[String(number)];
 if(!variant)throw Error('Missing native exclusive Hero override: '+hero+' / '+number);
 return {...native,heroClasses:{...native.heroClasses,[canonical]:variant.heroClass,[hero]:variant.heroClass},heroOptionIds:{...native.heroOptionIds,[canonical]:variant.optionIds,[hero]:variant.optionIds},awakeningByHero:{...native.awakeningByHero,[canonical]:variant.awakening,[hero]:variant.awakening},activeWeaponHeroVariant:{hero,sourceHero:canonical,weapon,number,sourceOverrides:variant.sourceOverrides}};
}
