"""Registered source primitives for the Normal heroes' basic class actions."""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_batch5_d_plan(a,lua,path):
 n=a.get('Name');ops={'ManualBat:WeakMagic':('weak-magic',.25,'0x8b14d6c/0x8b15698/0x8b15904',['FX_shoot_01','FX_hit_projectile','MagicCircle_AppearIdle','MagicCircle_Cancel']), 'ManualWeakBasket':('weak-basket',.5,'0x8b0d2d4/0x8b0d684',['FX_single_projectile']), 'SingleTargetHeal:Weak':('weak-heal',.4,'0x8b79280/0x8b79d44',['FX_single_projectile']), 'ManualMissile:TeatanHero':('teatan-missile',.5,'0x8b301cc/0x8b30e08/0x8b3143c/0x8b31990',[])}
 if n in ('ManualClawSlash:PetLeft','ManualClawSlash:PetRight'):
  if not all(k in a for k in ('AnimationName','ClawPreset','SpineEventName','DashDuration','DashDistanceCap','ActionDuration')):return None
  op,end,methods,pools='pet-claw',a['ActionDuration'],'0x8ad76e8/0x8ad78d8/0x8ad7a48/0x8ad7b68',[a['ClawPreset']]
 elif n in ops:op,end,methods,pools=ops[n]
 else:return None
 return dict(behavior='source-batch5-d',batch5Operation=op,category='role' if op=='weak-heal' else 'basic',id='role' if op=='weak-heal' else 'basic',label='治疗' if op=='weak-heal' else '普通攻击',action=n,end=end,requiredPoolPresets=pools,source='native ARM64 '+methods,sourceSha256=ELF,nativeMethods=methods)
