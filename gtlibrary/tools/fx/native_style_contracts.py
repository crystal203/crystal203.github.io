"""Preserve source BattleStyle variants with identical display/lookup names."""
def source_style_map(rows):
 result={}
 for row in rows:
  name=row['Name'];key=name
  if key in result:
   if result[key]==row:continue
   suffix='#'.join(str(row.get(k,'none')) for k in ['Class','Weapon1','Weapon2'])
   key=name+'#'+suffix;serial=2
   while key in result:
    if result[key]==row:break
    key=name+'#'+suffix+'#'+str(serial);serial+=1
   if key in result and result[key]==row:continue
  result[key]=row
 return result
