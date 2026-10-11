// AlterStatCalculate uses two thresholds: internal levels 83 and 100.
// The rates are the client's defaults when constants.json omits the overrides.
// Verified against the official World 21 patch and BWIKI's Lv.100 book stats.
export function levelValue(value,max){return Math.max(1,Math.min(max,Math.trunc(Number(value)||1)));}
export function growthFactor(rate,level,kind='attack'){
  const exponent=Math.max(0,level-1),rates={attack:[1.026,1.006],defense:[1.018,1.004],hp:[1.0363,1.0082],recovery:[1.0363,1.0082]}[kind];
  return Math.pow(rate,Math.min(exponent,82))*Math.pow(rates[0],Math.min(Math.max(exponent-82,0),17))*Math.pow(rates[1],Math.max(exponent-99,0));
}
export function heroLevelCap(stage,rules){
  return rules.CharacterBase+(stage.stars===5?rules.CharacterLimitBreak+rules.CharacterBlessing:0)+(stage.label==='开花'?rules.CharacterMyth:0);
}
export function weaponLevelCap(variant,rules){
  return rules.WeaponBase+rules.WeaponLimitBreak+(variant.engrave.length||variant.engraveRandom.length?rules.WeaponEngrave:0)+(variant.label==='开花'?rules.WeaponMyth:0);
}
export function heroStats(stats,level){
  const growth=Number(stats.StatGrowthRate)||1;
  return {Hp:stats.Hp*growthFactor(growth*growth,level,'hp'),Atk:100*stats.Atk*growthFactor(growth,level),Def:stats.Def*growthFactor(growth,level,'defense'),Recovery:100*stats.Recovery};
}
export function weaponStats(variant,level){
  return variant.stats.map(row=>{
    const kind=row.name==='防御'?'defense':row.name==='恢复能力'?'recovery':'attack',factor=growthFactor(variant.growthRate||1,level,kind);
    return {...row,values:row.grows?(row.baseValues||row.values).map(value=>Math.round(value*factor)):row.values};
  });
}
