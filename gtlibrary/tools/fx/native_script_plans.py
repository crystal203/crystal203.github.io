from native_source_event_contracts import compile_fixed_clock_myth_plan, normalize_literal_effect_positions, compile_party_heal_support_plan
"""Compile supported Lua action idioms to declarative, actor-independent operations.
The emitted recipe retains its source hash. Runtime dispatches operations, never
character names; unsupported scripts continue through the existing plan loader.
"""
import hashlib,re
from native_complex_plans import compile_complex_plan
from native_script_melee import compile_melee_plan
from native_martial_plans import compile_martial_plan
from native_script_managed_melee import compile_managed_melee_plan
from native_csharp_melee import compile_native_melee_plan
from native_csharp_managers import compile_native_manager_plan
from native_csharp_grenade import compile_native_grenade_plan
from native_script_projectiles import compile_projectile_pattern
from native_script_orbit_cards import compile_orbit_cards_plan
from native_script_weapon_actions import compile_weapon_action_plan
from native_script_charge import compile_charge_plan
from native_script_sky_barrage import compile_sky_barrage_plan
from native_csharp_soundwave import compile_native_soundwave_plan
from native_script_persistent_area import compile_persistent_area_plan
from native_csharp_firearms import compile_native_firearm_plan
from native_script_foxbead import compile_foxbead_plan
from native_script_fan import compile_fan_plan
from native_script_prop_rush import compile_prop_rush_plan
from native_twohand_plans import compile_twohand_plan
from native_script_continuous_arsenal import compile_continuous_arsenal_plan
from native_script_reindeer import compile_reindeer_plan

from native_script_batch2_melee import compile_batch2_melee_plan
from native_script_batch2_projectile_melee import compile_batch2_projectile_melee_plan

from native_script_batch2_root import compile_batch2_root_plan
from native_script_batch2_continuous import compile_batch2_continuous_plan

from native_script_batch3_ranged import compile_batch3_ranged_plan
from native_script_batch3_support import compile_batch3_support_plan
from native_script_batch3_melee import compile_batch3_melee_plan
from native_script_batch3_root import compile_batch3_root_plan

from native_script_batch4_ranged import compile_batch4_ranged_plan
from native_script_batch4_melee import compile_batch4_melee_plan
from native_script_batch4_special import compile_batch4_special_plan
from native_script_batch4_root import compile_batch4_root_plan

from native_script_batch5_a import compile_batch5_a_plan
from native_script_batch5_b import compile_batch5_b_plan
from native_script_batch5_c import compile_batch5_c_plan
from native_script_batch5_d import compile_batch5_d_plan

from native_script_batch6_a import compile_batch6_a_plan
from native_script_batch6_b import compile_batch6_b_plan
from native_script_batch6_c import compile_batch6_c_plan
from native_script_batch6_root import compile_batch6_root_plan

def _compile_script_plan_impl(a,lua,path):
 batch6=compile_batch6_c_plan(a,lua,path) or compile_batch6_a_plan(a,lua,path) or compile_batch6_b_plan(a,lua,path) or compile_batch6_root_plan(a,lua,path)
 if batch6:return batch6
 batch5=compile_batch5_d_plan(a,lua,path) or compile_batch5_a_plan(a,lua,path) or compile_batch5_b_plan(a,lua,path) or compile_batch5_c_plan(a,lua,path)
 if batch5:return batch5
 batch4=compile_batch4_root_plan(a,lua,path) or compile_batch4_ranged_plan(a,lua,path) or compile_batch4_melee_plan(a,lua,path) or compile_batch4_special_plan(a,lua,path)
 if batch4:return batch4
 batch3=compile_batch3_ranged_plan(a,lua,path) or compile_batch3_support_plan(a,lua,path) or compile_batch3_melee_plan(a,lua,path) or compile_batch3_root_plan(a,lua,path)
 if batch3:return batch3
 continuous_batch=compile_batch2_continuous_plan(a,lua,path)
 if continuous_batch:return continuous_batch
 root_batch=compile_batch2_root_plan(a,lua,path)
 if root_batch:return root_batch
 batch2=compile_batch2_melee_plan(a,lua,path) or compile_batch2_projectile_melee_plan(a,lua,path)
 if batch2:return batch2
 arsenal=compile_continuous_arsenal_plan(a,lua,path)
 if arsenal:return arsenal
 reindeer=compile_reindeer_plan(a,lua,path)
 if reindeer:return reindeer
 twohand=compile_twohand_plan(a,lua,path)
 if twohand:return twohand
 prop=compile_prop_rush_plan(a,lua,path)
 if prop:return prop
 fan=compile_fan_plan(a,lua,path)
 if fan:return fan
 firearm=compile_native_firearm_plan(a,lua,path)
 if firearm:return firearm
 foxbead=compile_foxbead_plan(a,lua,path)
 if foxbead:return foxbead
 area=compile_persistent_area_plan(a,lua,path)
 if area:return area
 party=compile_party_heal_support_plan(a,lua,path)
 if party:return party
 soundwave=compile_native_soundwave_plan(a)
 if soundwave:return soundwave
 sky=compile_sky_barrage_plan(a,lua,path)
 if sky:return sky
 manager=compile_native_manager_plan(a)
 if manager:return manager
 charge=compile_charge_plan(a,lua,path)
 if charge:return charge
 native=compile_native_melee_plan(a)
 if native:return native
 weapon=compile_weapon_action_plan(a,lua,path)
 if weapon:return weapon
 grenade=compile_native_grenade_plan(a)
 if grenade:return grenade
 if not lua:return None
 orbit=compile_orbit_cards_plan(a,lua,path)
 if orbit:return orbit
 martial=compile_martial_plan(a,lua,path)
 if martial:return martial
 projectile=compile_projectile_pattern(a,lua,path)
 if projectile:return projectile
 managed=compile_managed_melee_plan(a,lua,path)
 if managed:return managed
 melee=compile_melee_plan(a,lua,path)
 if melee:return melee
 complex_plan=compile_complex_plan(a,lua,path)
 if complex_plan:return complex_plan
 name=a['Name'];category='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else 'myth' if name.startswith('Myth') else None
 if not category:return None
 def f(key):return ['field',key]
 def op(name,*args):return [name,*args]
 end=a.get('ActionDuration',a.get('Duration',1));events=[];clips=[];moves=[];spine=[];alpha=[];continuous=False
 def effect(key,at=0,anchor='center',**kw):return dict(op='effect',key=key,at=at,anchor=anchor,**kw)
 def anim(key,at=0,**kw):clips.append(dict(key=key,at=at,**kw))
 def dash(at=0,sign=1):moves.append(dict(op='dash',at=at,duration=f('DashDuration'),speed=f('DashSpeed'),sign=sign))
 if category=='basic' and a.get('ProjectileInfo') and isinstance(a.get('ShootTiming'),list) and '(360 / self.max_hit)' in lua:
  anim('shoot')
  for i,t in enumerate(a['ShootTiming']):events.append(dict(op='projectile',at=t,index=0,offset=f('ShootOffset'),originAngle=i*360/len(a['ShootTiming']) if a.get('AttackType')=='proj' else 0,muzzleAtOwner=a.get('AttackType')=='slash'))
  if a.get('AttackType')=='throw':events.append(effect('cast',max(0,a['ShootTiming'][0]-.3),follow=True,directed=False))
  # This script's movement is explicitly conditional on joystick input. The
  # stationary preview must not invent a target-seeking dash.
 elif category=='basic' and 'function local_class:enter_wave_state' in lua and 'self.pass_crash_behaviour' in lua and a.get('AttackType') in ('wave','stomp','slash') and all(k in a for k in ('DashSpeed','DashDuration','HitTiming')):
  anim('action');kind=a.get('AttackType');at=f('HitTiming')
  dash(.1 if kind=='wave' else 0 if kind=='stomp' else at)
  if kind=='wave':events=[effect('wave',at,'feet'),effect('slash',at,directed=False)];anim('wave',at)
  elif kind=='stomp':events=[effect('stomp',at,'feet',offset=f('Offset'),directed=False)]
  else:
   t=op('sub',at,.02);events=[effect('slash',t,offset=.2,follow=True)];anim('slash',t)
 elif category=='basic' and "self.range_fx = battle_util.instantiate_effect" in lua and 'self.effect_offset = ' in lua:
  continuous="if not prev_state then" in lua and "set_upper_anim" in lua
  offset=float(re.search(r'self.effect_offset\s*=\s*([\d.]+)',lua)[1]);anim('attack',exclusiveKey='attackcwp');events=[effect('range',offset=offset,follow=True,until=end)]
 elif category=='role' and 'self.max_offset = ' in lua and a.get('AttackTiming') is not None:
  cap=float(re.search(r'self.max_offset\s*=\s*([\d.]+)',lua)[1]);anim('action');at=f('AttackTiming');offset=op('max',0,op('min',op('sub',['distance'],.75),cap))
  events=[effect('cast',at,'feet'),effect('atk',at,'feet',offset=op('add',offset,.2))]
 elif category=='role' and 'get_second_direction' in lua:
  anim('attack');events=[dict(op='projectile-return',at=f('ShootTiming'),offset=f('ShootOffset'))]
 elif category=='role' and 'EaseInCubic' in lua and 'self.fx_proj.transform.localScale' in lua:
  anim('cast');events=[effect('cast',height=2),dict(op='moving-effect',key='proj',at=0,anchor='center',height=2,launch=.4,arrival=.6,ease='cubic',growUntil=.4),effect('explosion',f('HitTiming'),'targetGround',directed=False)]
 elif category=='cwp' and a.get('ExplosionCount') and 'self.explosion_offsets' in lua:
  anim('cast',fallbackKey='castfallback');events=[effect('cast',follow=True,directed=False),effect('screen',screen=True,directed=False),effect('spear',follow=True,directed=False,exclusive=True,until=f('ShootTiming')),dict(op='projectile',at=f('ShootTiming'),index=0,offset=f('ShootOffset'),muzzle=False),dict(op='line-burst',key='explosion',at=f('ShootTiming'),count=f('ExplosionCount'),delay=f('HitDelay'),duration=f('ExpandDuration'),width=f('Width'),length=f('MaxLength'))]
 elif category=='cwp' and all(k in a for k in ['MinRadius','MaxRadius','ShootTiming']) and '-self.dir_vector' in lua:
  anim('cast',exclusiveKey='castcwp');dash(f('DashTiming'),-1);events=[effect('cast',offset=f('Offset'),follow=True,until=f('ShootTiming'),directed=False),effect('screen',screen=True,directed=False),dict(op='projectile',at=f('ShootTiming'),index=0,offset=f('Offset'),targetGround=True,impact='explosion')]
 elif category=='cwp' and 'self.owner:Jump' in lua and isinstance(a.get('HitTiming'),list):
  anim('cast');dash(f('DashTiming'));spine=[dict(op='jump',at=0,height=.7,duration=a['HitTiming'][0]-.1)];events=[effect('cast',anchor='feet',follow=True,directed=False),effect('wing',follow=True,optional=True),effect('screen',screen=True,directed=False),effect('explosion',a['HitTiming'][0],'feet',offset=f('Offset'))]
 elif category=='support' and 'controller.SkinName' in lua and 'controller_member.SkinName' in lua:
  anim('cast',exclusiveKey='cast_eve')
  events=[effect('spawn_enemy',.3,'targetGround',height=1.75,directed=False),effect('spawn',.3,'feet',height=1.75,directed=False),
          effect('fx_syringe',.3,'targetGround',height=1.75,directed=False,skeletonSkin='red',skeletonAnimation='idle',scale=1.3,mythScale=1.6),
          effect('fx_syringe',.3,'feet',height=1.75,directed=False,skeletonSkin='blue',skeletonAnimation='idle',scale=1.3),
          effect('fx_debuff',f('AttackTiming'),'targetGround',directed=False),effect('fx_buff',f('AttackTiming'),'feet',directed=False)]
 elif category=='support' and 'self.fire_fx' in lua and 'is_last_hit' in lua:
  anim('cast');last=a['HitTiming'][-1];events=[effect('fire',anchor='target',directed=False,until=last),effect('explosion',last,'target',directed=False)]
 elif category=='support' and 'self.fall_keys[random_util.get_random_int' in lua:
  events=[effect('declare',anchor='feet',directed=False),effect('cast',directed=False),effect('spawn',.1,'targetGround',height=5,directed=False),dict(op='effect',choices=['fall1','fall2','fall3','fall4'],at=.1,anchor='target',directed=False),effect('explosion',f('HitTiming'),'target',directed=False),effect('finish',.8,directed=False)]
  # Source uses two target-relative waypoints, then returns to trigger_pos.
  moves=[dict(op='lerp',at=0,duration=.2,to='target',offset=-1.2,side=1),dict(op='lerp',at=.4,duration=.1,to='target',offset=-1.2),dict(op='lerp',at=.7,duration=.1,to='origin')]
  alpha=[{'at':0,'value':0},{'at':.8,'value':1}]
 elif category=='myth' and "instantiate_effect(self, 'explosion'" in lua and 'function local_class:on_start' in lua:
  anim('cast');target='target_pos' in lua.split("instantiate_effect(self, 'explosion'",1)[1].split(')',1)[0]
  events=[effect('explosion',anchor='target' if target else 'center',directed=False)]
  if "self.animation_info['cast'].timescale = 0.4" in lua:
   clips[0].update(speed=.4);anim('cast',.35,speed=1,continueTime=True);moves=[dict(op='dash',at=.35,duration=.3,speed=op('div',f('DashSpeed'),5),sign=-1)]
 else:return None
 return {'behavior':'timeline','category':category,'id':category,'label':{'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能','myth':'开花技能'}[category],'action':name,'exclusive':category=='cwp','mythOnly':category=='myth','end':end,'continuous':continuous,'clips':clips,'moves':moves,'spine':spine,'alpha':alpha,'events':events,'source':str(path),'sourceSha256':hashlib.sha256(lua.encode()).hexdigest()}


def compile_script_plan(a,lua,path):
 plan=compile_fixed_clock_myth_plan(a,lua,path) or _compile_script_plan_impl(a,lua,path)
 return normalize_literal_effect_positions(plan,lua,path) if plan else None
