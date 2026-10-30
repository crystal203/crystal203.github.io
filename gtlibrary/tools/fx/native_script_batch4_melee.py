"""Fourth batch Lua signatures, compiled into shared source timelines."""
import hashlib
from pathlib import Path

def compile_batch4_melee_plan(a,lua,path):
 if not lua:return None
 typ=a['Name'].split(':')[0]
 category='basic' if typ.startswith('Manual') else 'role' if typ.startswith('Role') else 'support' if typ=='BasicSupport' else 'cwp' if typ.startswith('Cwp') else None
 if not category:return None
 if category=='support' and a.get('LuaAddOn'):
  candidate=Path(path).parent/'Support'/(a['LuaAddOn']+'SupportBattleAction.lua')
  if candidate.exists():path=candidate;lua=path.read_text(encoding='utf8')
 p=dict(behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=a['Name'],end=a.get('ActionDuration',a.get('Duration',1)),exclusive=category=='cwp',clips=[],events=[],moves=[],spine=[],meleeTimeline=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def ev(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor=kw.pop('anchor','center'),nativePoolTransform='direct' if kw.get('directed')==False else 'directional',nativePoolLifetime=True,**kw)
 def dyn(operation):p.update(behavior='source-batch4-melee',sourceMelee=dict(operation=operation));return p
 if category=='basic' and 'self.attack_type == \'slash\'' in lua and 'self.hit_timing - 0.02' in lua and a.get('AttackType') in ['slash','stomp']:
  slash=a['AttackType']=='slash';p.update(clips=[dict(key='action',at=0,track='Upper')],events=[ev('slash',a['HitTiming'],offset=.2,fourWay=slash,follow=slash,followSpine=slash)],sourceProjectilePools=True)
  if slash:p['events'].append(dict(op='projectile',at=a['HitTiming'],directional=True,nativePoolTransform='directional'))
 elif category=='role' and "instantiate_effect(self, 'range'" in lua and 'self.activate_cwp_option' in lua:
  p.update(clips=[dict(key='action',at=0,track='Upper')],events=[ev('range',anchor='feet',directed=False,follow=True,followSpine=True)],buffApplications=[dict(buffField='BuffName')])
 elif category=='cwp' and 'self:create_stigma_field(stigma_pos)' in lua:
  explosion=a['CastTime']+a['StigmaExplosionTime'];p.update(clips=[dict(key='cast',at=0),dict(key='cast',at=0,track='Emotion')],events=[ev('cast',anchor='feet',directed=False,follow=True,followSpine=True),ev('screen',screen=True,directed=False),ev('field',a['CastTime'],anchor='targetGround',directed=False),ev('stigma',a['CastTime'],anchor='targetGround',directed=False,triggerDisposeAt=explosion),ev('explosion',explosion,anchor='targetGround',directed=False)],independentFieldEnd=explosion+max(a['HitTimings']))
 elif category=='basic' and "'smash', init_pos" in lua and a.get('ProjectileInfo'):
  p.update(clips=[dict(key='smash',at=0)],events=[ev('smash',a['HitTiming'],anchor='feet',offsetByFacing=dict(right=.7,left=.7,back=1,front=.5),directed=False),dict(op='projectile',at=a['HitTiming'],directional=True,height=-.375,nativePoolTransform='directional')],nativeRecoils=[dict(at=0,duration=a['HitTiming'],distance=.1,height=0,angle=0)],sourceProjectilePools=True)
 elif category=='cwp' and "string.format('jingak%d', index)" in lua and isinstance(a.get('HitTiming'),list):
  p['clips']=[dict(key='jingak1',fallbackKey='fallback',at=0)];p['events']=[ev('ready',directed=False)]
  for i,t in enumerate(a['HitTiming']):
   p['events'] += [ev('screen',t,screen=True,directed=False),ev('cast',t,anchor='feet',directed=False),ev('jingak'+str(i+1),t,anchor='feet')]
   if i+1<len(a['HitTiming']):p['clips'].append(dict(key='jingak'+str(i+2),fallbackKey='fallback',at=t))
 elif category=='basic' and 'self.crash_end_timing' in lua and 'self.combo_index == 3' in lua and 'DashTiming' in a:return dyn('dash-spin-flip-combo')
 elif category=='support' and 'self.wave_fx' in lua and 'time_passed, self.life_time' in lua:return dyn('independent-straight-wave')
 elif category=='cwp' and 'dolphin_state_class' in lua and 'simulationSpeed = 1 + 0.75' in lua:return dyn('independent-target-dolphin')
 elif category=='basic' and 'self.effect_target_time' in lua and 'RefreshCycleCount' in a:
  return dyn('periodic-held-rush')
 elif category=='role' and 'self.charge_calculator' in lua and 'SpecialOptionId' in a:
  p.update(clips=[dict(key='charge',at=a['DashTiming'],track='Upper')],events=[ev('charge',a['DashTiming'],follow=True,followSpine=True)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],free=True)])
 elif category=='support' and 'self.first_pos' in lua and 'self.second_pos' in lua and 'EaseInQuint' in lua:return dyn('fade-dash-return-slash')
 elif category=='cwp' and 'self.clone_lengths' in lua and 'clone_state_class' in lua:return dyn('independent-four-clone-charge')
 elif category=='basic' and 'self.action_type.strike' in lua and a.get('AttackType') in ['stomp','slash','strike'] and 'DashTiming' in a:
  kind=a['AttackType'];slash=kind=='slash';at=a['ActionDuration']*.16 if slash else a['DashTiming']+a['DashDuration']
  p.update(clips=[dict(key='action',at=0,track='Upper')],events=[ev(kind,at,anchor='center' if slash else 'feet',offset=1.5 if kind=='stomp' else .3,fourWay=slash,follow=slash,followSpine=slash)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],free=True)])
 elif category=='support' and 'self.jump_dest_pos' in lua and "self.animation_info['attack'].timescale = 1.5" in lua:
  p.update(clips=[dict(key='action',at=0,track='Upper',speed=1.5),dict(key='attack',at=.4,track='Upper',speed=1.5),dict(key='attack',at=.6,track='Upper',speed=1.5,end=1)],events=[ev('cast',.1,directed=False),ev('sword',.1,anchor='feet',directed=False,follow=True,followSpine=True,triggerDisposeAt=1,link=dict(weaponAttachment=True)),ev('dash',.6,anchor='feet',follow=True,followSpine=True,triggerDisposeAt=.8,until=.8),ev('slash',.7,anchor='target')],moves=[dict(op='lerp',at=0,duration=.1,to='target',offset=-4),dict(op='lerp',at=.6,duration=.15,to='target'),dict(op='lerp',at=.75,duration=.05,to='target',offset=2),dict(op='lerp',at=1,duration=.2,to='origin')],spine=[dict(at=0,duration=.1,height=.7),dict(at=1,duration=.3,height=.7)])
 elif category=='cwp' and 'self.real_proj_life_time' in lua and 'self.proj_speed = 20' in lua:return dyn('projectile-catchup-cross-slash')
 else:return None
 return p





