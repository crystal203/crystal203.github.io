"""Source-only operations for the final basic/native group."""
import hashlib

def compile_batch6_root_plan(a,lua,path):
 n=a['Name'];typ=n.split(':')[0]
 if typ in ['ManualHealShotgun','ManualRecoveryBow','RoleHealLaser'] or n=='SingleTargetHeal:LeafFairy' or typ=='CwpDemonBrother':
  cat='basic' if typ in ['ManualHealShotgun','ManualRecoveryBow'] else 'cwp' if typ=='CwpDemonBrother' else 'role'
  return dict(action=n,behavior='source-batch6-root',category=cat,id=cat,label={'basic':'普通攻击','cwp':'专武技能','role':'角色技能'}[cat],exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('ShootTerm',.4)),operation={'ManualHealShotgun':'heal-shotgun','ManualRecoveryBow':'recovery-bow','RoleHealLaser':'heal-laser','SingleTargetHeal':'heal-bow','CwpDemonBrother':'brother-cwp'}[typ],source='native ARM64 0x8ae918c/0x8ae975c/0x8afd4dc/0x8afdaac/0x8b79d44/0x8c0bd24; '+str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else 'd33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db',requiredPoolPresets=['FX_single_projectile','FX_normal_arrow'])
 if n in ['ManualDimensionBow','SurvivorSupport','CwpSurvivorAutoGuidedArrow']:
  cat='basic' if typ=='ManualDimensionBow' else 'support' if typ=='SurvivorSupport' else 'cwp'
  return dict(action=n,behavior='source-batch6-root',category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能'}[cat],exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('Duration',a.get('AttackDuration',.5))),operation={'ManualDimensionBow':'dimension-bow','SurvivorSupport':'survivor-support','CwpSurvivorAutoGuidedArrow':'survivor-cwp'}[typ],requiredPoolPresets=['FX_single_projectile','FX_normal_arrow'],source='native ARM64 8ae01b4/8ae0970/8ae0f04/8ae15bc/8c32ad0/8c33320/8c33710/8bde1b4/8bdebac/8bdf7f8/8be0340; E:/GTFiles/fx-root-finish-source.json',sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
 if n in ['LaviComboPunch','ManualHeadButt:DemonSister','SingleTargetAggro:DemonSister','CwpDemonSister']:
  cat='basic' if n=='LaviComboPunch' or typ=='ManualHeadButt' else 'role' if typ=='SingleTargetAggro' else 'cwp'
  return dict(action=n,behavior='source-batch6-root',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','cwp':'专武技能'}[cat],exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('Duration',.5)),operation={'LaviComboPunch':'lavi-combo','ManualHeadButt':'lavi-head','SingleTargetAggro':'lavi-role','CwpDemonSister':'lavi-cwp'}[typ],source=str(path) if lua else 'native ARM64 8acf384/8acf814/8acd61c/8ae7738/8b77a54; E:/GTFiles/fx-lavi-final-source.json',sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else 'd33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db',requiredPoolPresets=['fx_m_punchwave','FX_Gauntlet_Hit','FX_Common_Jump_small','fx_lavi_aggro_cast','fx_lavi_aggro_hit']+(['fx_m_headexplosion'] if typ=='ManualHeadButt' else []))
 if typ=='CwpLeafFairy':
  return dict(action=n,behavior='source-batch6-root',category='cwp',id='cwp',label='专武技能',exclusive=True,end=a['ActionDuration'],operation='fairy-cwp',source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 if typ not in ['ManualBattleBallGirl','CwpBattleballGirl']:return None
 if not lua:return None
 basic=typ.startswith('Manual')
 return dict(action=n,behavior='source-batch6-root',category='basic' if basic else 'cwp',id='basic' if basic else 'cwp',label='普通攻击' if basic else '专武技能',exclusive=not basic,end=a.get('AnimDuration',a.get('ActionDuration',1)),operation='bat-basic' if basic else 'bat-meteor',source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
