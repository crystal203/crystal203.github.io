"""Compile summon/beam/stamina Lua idioms; runtime dispatch remains actor independent."""
import hashlib

def compile_summoned_plan(a,lua,path):
 name=a['Name'];category='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not category:return None
 f=lambda k:['field',k]
 ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,**kw)
 plan=dict(behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=name,exclusive=category=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),clips=[],events=[],moves=[])
 if 'discrete_stamina_action_util.is_break_attack' in lua and 'self.break_shoot_timing' in lua and "self.action, 'laser'" in lua:
  plan.update(staminaCost=a['StaminaPerAction'],clips=[dict(key='cast',at=0,track='Upper')],breakClips=[dict(key='break',at=0,track='Upper')],breakEvents=[ev('laser',f('BreakShootTiming'),offset=f('ShootOffset')),dict(op='effect',at=f('BreakShootTiming'),projectileIndex=1,projectileStage='ShootEffectPreset',offset=f('ShootOffset')),dict(op='effect',at=f('BreakShootTiming'),projectileIndex=1,projectileStage='HitPreset',anchor='target',maxRange=f('BreakLength'))])
  plan['events']=[dict(op='projectile',at=f('ShootTiming'),offset=f('ShootOffset'))]
 elif category=='role' and a.get('Role')=='Summoner' and "role_util.setup_role_action" in lua and 'self.owner.Position + dir_vector * distance' in lua:
  # TriggerActionWithPosition is consumed by native SummonOption. The unobstructed
  # preview uses the literal source distance; manual summonPosition can override it.
  plan.update(summon=True,summonOffset=1,clips=[dict(key='action',at=0,track='Upper')])
 elif 'summonable_util.get_master' in lua and 'self.shoot_offset_y = vector(0,0.5,0)' in lua and "self.action, 'laser'" in lua:
  plan.update(autonomous=True,targetRange=a['SearchRange'],masterRange=a['RadarRange'],clips=[dict(key='action',at=f('ShootTiming'))],events=[ev('cast',f('ShootTiming'),height=.5,offset=f('ShootOffset')),ev('laser',f('ShootTiming'),height=.5,offset=f('ShootOffset'))],passiveEvents=[ev('laser_range',anchor='feet',follow=True),ev('radar',anchor='masterFeet',follow=True)])
 elif category=='support' and 'self.laser_fx' in lua and 'self.ground_fx' in lua and "'laser', battle_util.get_ground_pos(self.target_pos)" in lua:
  plan['clips']=[dict(key='cast',at=0)]
  plan['events']=[ev('cast',anchor='feet'),ev('laser',.3,anchor='targetGround'),ev('ground',.3,anchor='targetGround')]
 elif category=='cwp' and 'self.proj_pos - self.shoot_offset * self.dir_vector' in lua and 'self.main_damage_scale' in lua and a.get('ShootDuration') is not None:
  plan['clips']=[dict(key='cast',fallbackKey='castfallback',at=0)]
  plan['events']=[ev('cast',follow=True),ev('screen',screen=True,directed=False),ev('laser',f('ShootTiming'),offset=f('ShootOffset'))]+[ev('hit',a['ShootTiming']+a['HitDelay']+i*a['DamageTerm'],anchor='target',directed=False,maxRange=a['Length']+a['ShootOffset']) for i in range(a['MaxHit'])]
 else:return None
 plan.update(mythPresetSource='option' if 'battle_util.parse_option_param(summonable_util.get_master' in lua else 'action',source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 return plan
