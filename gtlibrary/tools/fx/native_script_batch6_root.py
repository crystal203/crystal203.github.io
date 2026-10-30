"""Source-only operations for the final basic/native group."""
import hashlib

def compile_batch6_root_plan(a,lua,path):
 n=a['Name'];typ=n.split(':')[0]
 if typ in ['ManualHealShotgun','ManualRecoveryBow','RoleHealLaser'] or n=='SingleTargetHeal:LeafFairy' or typ=='CwpDemonBrother':
  cat='basic' if typ in ['ManualHealShotgun','ManualRecoveryBow'] else 'cwp' if typ=='CwpDemonBrother' else 'role'
  return dict(action=n,behavior='source-batch6-root',category=cat,id=cat,label={'basic':'普通攻击','cwp':'专武技能','role':'角色技能'}[cat],exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('ShootTerm',.4)),operation={'ManualHealShotgun':'heal-shotgun','ManualRecoveryBow':'recovery-bow','RoleHealLaser':'heal-laser','SingleTargetHeal':'heal-bow','CwpDemonBrother':'brother-cwp'}[typ],source='native ARM64 0x8ae918c/0x8ae975c/0x8afd4dc/0x8afdaac/0x8b79d44/0x8c0bd24; '+str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else 'd33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db',requiredPoolPresets=['FX_single_projectile','FX_normal_arrow'])
 if typ not in ['ManualBattleBallGirl','CwpBattleballGirl']:return None
 if not lua:return None
 basic=typ.startswith('Manual')
 return dict(action=n,behavior='source-batch6-root',category='basic' if basic else 'cwp',id='basic' if basic else 'cwp',label='普通攻击' if basic else '专武技能',exclusive=not basic,end=a.get('AnimDuration',a.get('ActionDuration',1)),operation='bat-basic' if basic else 'bat-meteor',source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
