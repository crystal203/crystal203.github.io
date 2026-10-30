"""Source-idiom recipes for equipment-dependent and summoned-actor actions.
Dispatch uses script operations/fields; no character IDs belong in the player.
"""
import hashlib,re
from native_summoned_plans import compile_summoned_plan

def compile_complex_plan(a,lua,path):
 summoned=compile_summoned_plan(a,lua,path)
 if summoned:return summoned
 name=a['Name'];category='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not category:return None
 f=lambda key:['field',key]
 add=lambda *args:['add',*args]
 event=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,**kw)
 plan={'behavior':'timeline','category':category,'id':category,'label':{'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],'action':name,'exclusive':category=='cwp','end':a.get('ActionDuration',a.get('Duration',1)),'clips':[],'events':[],'moves':[]}
 def anim(key,at=0,**kw):plan['clips'].append(dict(key=key,at=at,**kw))
 def dash(at=0):plan['moves'].append(dict(op='dash',at=at,duration=f('DashDuration'),speed=f('DashSpeed')))
 if 'function action_state_class:thrust_routine' in lua and 'self.shield_hit_count = ' in lua:
  kind=a['AttackType']
  if kind in ['throw','slash']:
   if kind=='slash':anim('action');plan['events'].append(event('charge',follow=True,directed=False))
   anim('shoot',['sub',f('ShootTiming'),.1])
   shot=dict(op='projectile',at=f('ShootTiming'),offset=.5,projectileField='ThrowProjectileInfo' if kind=='throw' else 'SlashProjectileInfo',hitKey='hit')
   if kind=='throw':shot.update(ricochet=int(re.search(r'self.shield_hit_count\s*=\s*(\d+)',lua)[1]),countField='ShieldHitCount')
   plan['events'].append(shot)
  elif kind=='thrust':
   dash(f('DashTiming'));anim('thrust',f('DashTiming'));plan['events']=[event('thrust',add(f('DashTiming'),.05),follow=True,bone='[base]weapon1',directionBone='[base]armL',boneOffset=.5)]
  elif kind=='spin':
   dash(f('DashTiming'));anim('slash',f('DashTiming'),speed=3.4);anim('slash',add(f('DashTiming'),.11),speed=1.05)
   plan['events']=[event('slash',add(f('DashTiming'),.095),follow=True,fourWay=True,mirrorXZForNegative=True)]
  else:return None
 elif category=='role' and a.get('ShieldMultiplier') is not None and 'melee_short_dash' in lua:
  anim('shield');dash(f('DashTiming'));plan['events']=[event('shield',f('HitTiming'),anchor='feet')]
 elif category=='cwp' and 'self.action_duration - 0.05' in lua and 'self.sub_damage_scale' in lua and isinstance(a.get('HitTiming'),list) and a.get('AttackRange') is not None:
  anim('ready');plan['events']=[event('ready',follow=True,directed=False),event('cast',['sub',f('ActionDuration'),.05],anchor='feet',follow=True,directed=False),event('explosion',add(f('ActionDuration'),a['HitTiming'][0]),anchor='targetGround',maxDistance=f('AttackRange'),directed=False),event('screen',add(f('ActionDuration'),a['HitTiming'][0]),screen=True,directed=False)]
 elif category=='support' and isinstance(a.get('HitTiming'),list) and a['HitTiming'] and 'shoot_helper_util.shoot_direction_at_position' in lua and 'character_util.get_entity_id(self.target)' in lua:
  anim('action');plan['events']=[event('cast',directed=False),event('slash',.1,anchor='feet')]+[dict(op='projectile',at=t,offset=.5) for t in a['HitTiming']]
 elif category=='basic' and 'self.atk_type.stamina_break' in lua and "instantiate_effect(self, 'field'" in lua:
  anim('action');plan.update(staminaCost=a['StaminaPerAction'],breakClips=[dict(key='field',at=0)],breakEvents=[event('field')]);plan['events']=[dict(op='projectile',at=0,offset=0,muzzleOffset=.5,homing=True)]
 elif category=='role' and 'summonable_util.get_summmoned(self.owner)' in lua and 'battle_util.start_effect' in lua:
  anim('action');plan['summon']=True
 elif category=='support' and "vfx_cast_key .. '_enhanced'" in lua and 'summonable_util.get_summmoned' in lua:
  plan['events']=[event('cast',anchor='target',enhancedKey='cast_enhanced',directed=False),event('explosion',f('HitTiming'),anchor='target',enhancedKey='explosion_enhanced',directed=False)]
  plan['animationArrays']=True
 elif category=='cwp' and 'function local_class:create_aoe' in lua and a.get('AOEShrinkTime') is not None:
  anim('cast');anim('fire',f('CastTime'));plan['events']=[event('cast',anchor='feet',follow=True,directed=False),event('screen',screen=True,directed=False),event('proj',f('CastTime'),anchor='feet')]
 elif category=='basic' and 'self.sync_position' in lua and 'summonable_util.get_master' in lua and a.get('HitTiming') is not None:
  anim('action');dash();plan['events']=[event('slash',f('HitTiming'),anchor='feet',height=.7,offset=.2,follow=True,fourWay=True)]
 elif category=='role' and "instantiate_effect(self, 'range'" in lua and 'summonable_util.get_master' in lua:
  anim('action');plan['events']=[event('range',anchor='feet',follow=True,directed=False)]
 else:return None
 plan.update(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 return plan
