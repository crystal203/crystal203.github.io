"""Native heroes2 overrides selected by an owner's exclusive weapon number."""
def collect_weapon_hero_variants(heroes,overrides,awakening):
 by_id={h['Id']:h for h in heroes};result={}
 for row in overrides:
  hero=by_id.get(row['Id']);number=row.get('ExclusiveNumber')
  if not hero or number is None or number==1:continue
  merged={**hero,**row};opened=awakening.for_hero(merged,need_spec_override=True)
  option_ids=sorted({o['OptionId'] for o in merged.get('Options',[]) if o.get('OptionId')}|set(opened['optionIds']))
  result.setdefault(hero['Name'],{})[str(number)]=dict(heroClass=merged['Class'],optionIds=option_ids,awakening=opened,sourceOverrides=row)
 return result
