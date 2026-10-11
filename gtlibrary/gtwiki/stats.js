// Game levels are zero-based internally; retain full precision until display.
export function levelValue(value,max){return Math.max(1,Math.min(max,Math.trunc(Number(value)||1)));}
export function heroStats(stats,level){
  const exponent=level-1,growth=Number(stats.StatGrowthRate)||1;
  return {Hp:stats.Hp*Math.pow(growth,2*exponent),Atk:stats.Atk*Math.pow(growth,exponent),Def:stats.Def*Math.pow(growth,exponent),Recovery:stats.Recovery*Math.pow(growth,exponent)};
}
export function weaponStats(variant,level){
  const factor=Math.pow(variant.growthRate||1,level-1);
  return variant.stats.map(row=>({...row,values:row.grows?(row.baseValues||row.values).map(value=>Math.floor(value*factor+.5)):row.values}));
}
