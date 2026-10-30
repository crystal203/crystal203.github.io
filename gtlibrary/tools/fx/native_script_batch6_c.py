"""Native classic hero action contracts, pinned to registered ARM64 methods."""
import ast,hashlib
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_batch6_c_plan(a,lua,path):
 n=a['Name'];t=n.split(':')[0]
 if n in ('ManualClawSlash:PetLeft','ManualClawSlash:PetRight','ManualHeadButt:Pet'):
  return dict(behavior='source-batch6-c',batch6Operation=t,category='basic',id='basic',label='普通攻击',action=n,end=a['ActionDuration'],requiredPoolPresets=[a.get('ClawPreset',a.get('ReactionPreset'))],source='native ARM64 ManualSpineEventBaseAction 0x8b85e48; '+t,sourceSha256=ELF)
 if t=='ManualPalmStrike' and 'DollGirl' in n:
  return dict(behavior='source-batch6-c',batch6Operation=t,category='basic',id='basic',label='普通攻击',action=n,end=a['ActionDuration'],requiredPoolPresets=[a['PalmPreset'],'fx_m_gauntlet_charging'],source='native ARM64 PalmStrike 0x8af97bc/0x8af9a0c/0x8af9b08; SpineBase 0x8b85c6c/0x8b85e48',sourceSha256=ELF)
 if n in ('RoundAggro:DollGirl','CwpDollGirlDragonTalon','SummonObjectSupport:DollGirl','SummonObjectSupport:GhostBuster'):
  cat='role' if t=='RoundAggro' else 'cwp' if t.startswith('Cwp') else 'support'
  return dict(behavior='source-batch6-c',batch6Operation=t,category=cat,id=cat,label={'role':'角色技能','cwp':'专武技能','support':'连锁技能'}[cat],action=n,end=a.get('Duration',a.get('ActionDuration',1.1)),exclusive=cat=='cwp',source='native ARM64 '+t+' 0x8bb5b04/0x8c314c0/0x8c31cc0/0x8b6e548',sourceSha256=ELF)
 if n in ('LinearSupport:Pet','LinearSupport:Akayuki'):
  return dict(behavior='source-batch6-c',batch6Operation='LinearSupport',category='support',id='support',label='连锁技能',action=n,end=a['Duration'],source='native ARM64 LinearSupport 0x8c27720/0x8c27d5c/0x8c27c90',sourceSha256=ELF)
 if n in ('ManualGas:GhostBuster','ManualGas:DragonBoy','CwpDragonBoy'):
  cat='basic' if t=='ManualGas' else 'cwp'
  return dict(behavior='source-batch6-c',batch6Operation=t,category=cat,id=cat,label='普通攻击' if cat=='basic' else '专武技能',action=n,end=10 if cat=='basic' else a['ActionDuration'],exclusive=cat=='cwp',source='native ARM64 ManualContinuousStamina 0x8b1e3b4 20/sec; Gas 0x8b25634/0x8b25d2c; '+str(path),sourceSha256=ELF if cat=='basic' else hashlib.sha256(lua.encode()).hexdigest())
 if n=='CwpPet' and "newclass('CwpPetBattleAction')" in lua:
  return dict(behavior='source-batch6-c',batch6Operation='CwpPet',category='cwp',exclusive=True,id='cwp',label='专武技能',action=n,end=a['ActionDuration'],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 return None
