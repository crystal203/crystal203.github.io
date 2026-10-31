import hashlib
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_final_native_plan(a,lua,path):
 n=a.get('Name','');typ=n.split(':')[0]
 mapping={'ManualChinaHero':('china-punch','basic'),'BasicSupport':('china-support','support'),'RoleChinaHeroAscent':('china-role','role'),'CwpChinaUltimateIceFlameBomb':('china-cwp','cwp'),'TeatanHeroSupport':('teatan-support','support'),'CwpTeatanHeroDestructionFire':('teatan-cwp','cwp'),'ManualWeaponThrowing':('weapon-throw','basic'),'KnightCaptainSupport':('weapon-rain','support'),'CwpKnightCaptainSpearImpact':('spear-impact','cwp')}
 if typ=='BasicSupport' and a.get('LuaAddOn')!='ChinaHero':return None
 if typ not in mapping:return None
 op,cat=mapping[typ]
 p=dict(behavior='source-final-native',operation=op,category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','role':'进阶角色技能','cwp':'专武技能'}[cat],exclusive=cat=='cwp',action=n,end=a.get('ActionDuration',a.get('Duration',1)),source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else ELF)

 if op.startswith('weapon-'):
  from pathlib import Path
  import json
  raw=(Path(__file__).parents[2]/'gtfx/assets/native-source/items.json').read_bytes();rows=json.loads(raw)
  p['sourceItemsSha256']=hashlib.sha256(raw).hexdigest()
  p['throwWeapons']=[dict(id=w['Id'],rarity=w['Rarity'],sprite=w['SpriteName'].get('default')) for w in rows if w.get('Type')=='weapon' and w.get('WeaponType') in ['twohandsword','staff'] and not w.get('CollaborationId') and w.get('SpriteName',{}).get('default')]
  p['requiredPoolPresets']=['Manual_KnightCaptain_Weapon','Manual_KnightCaptain_Weapon_Cast','Manual_KnightCaptain_Weapon_Fire','Manual_KnightCaptain_Weapon_Ready']
 return p
