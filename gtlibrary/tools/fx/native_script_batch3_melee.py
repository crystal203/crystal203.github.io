"""Third-batch source signatures; rendered through the existing timeline engine."""
import hashlib
from pathlib import Path

def compile_batch3_melee_plan(a,lua,path):
 if not lua:return None
 typ=a['Name'].split(':')[0]
 category='basic' if typ.startswith('Manual') else 'role' if typ.startswith('Role') else 'support' if typ=='BasicSupport' else 'cwp' if typ.startswith('Cwp') else None
 if not category:return None
 # Support addons carry their own implementation rather than BasicSupport.lua.
 if category=='support' and a.get('LuaAddOn'):
  candidate=Path(path).parent/'Support'/(a['LuaAddOn']+'SupportBattleAction.lua')
  if candidate.exists():path=candidate;lua=path.read_text(encoding='utf8')
 p=dict(behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=a['Name'],end=a.get('ActionDuration',a.get('Duration',1)),exclusive=category=='cwp',clips=[],events=[],moves=[],spine=[],meleeTimeline=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def ev(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor='center',nativePoolTransform='direct' if kw.get('directed')==False else 'directional',nativePoolLifetime=True,**kw)
 def dynamic(op):p.update(behavior='source-batch3-melee',sourceMelee=dict(operation=op));return p
 if category=='basic' and 'self.current_proj_type' in lua and 'SymbolDebuffName' in a:
  return dynamic('discrete-direct-explosion-projectile')
 if category=='basic' and 'self.fx_proj.transform.localScale = progress * vector_util.one' in lua:
  return dynamic('discrete-raised-growing-projectile')
 if category=='role' and 'self.proj_end_timing' in lua and 'self.symbol_machine' in lua:
  return dynamic('independent-expanding-slash-projectile')
 if category=='cwp' and 'self.back_dash_timing' in lua and 'character_util.spine_set_alpha_fade' in lua:
  return dynamic('ethereal-slash-return')
 if category=='support' and 'self.jump_pos' in lua and 'self.explosion_fx' in lua:
  return dynamic('target-drop-backjump')
 if category=='cwp' and 'self.sleigh_stop_timing = self.expand_duration' in lua:
  return dynamic('independent-expanding-sleigh')
 if category=='support' and 'self.fx_proj' in lua and '(self.jump_height + 1.5)' in lua:
  return dynamic('jump-descending-effect-projectile')
 if category=='role' and 'function pixy_state_class:attatch(info)' in lua:
  return dynamic('attached-independent-four-lasers')
 if category=='basic' and all(k in a for k in ['Charge2AttackTiming','ChargeDurations','Charge3Radius']) and "'slash360'" in lua:
  return dynamic('three-level-charge-melee')
 if category=='cwp' and all(k in a for k in ['LastHitTiming','LastRadius','DashDuration']) and 'self.dash_duration + self.dash_duration - 0.1' in lua:
  return dynamic('dash-circular-last-slash')
 if category=='role' and 'function action_state_class:counter_routine()' in lua and 'self.expired_checker' in lua:
  p.update(clips=[dict(key='action',at=0),dict(key='action',at=0,track='Emotion')],events=[ev('cast',0,anchorOverride='feet',follow=True,directed=False,triggerDisposeAt=a['ActionDuration'])],optionParameterSource='active-non-special-option',buffApplications=[dict(optionField='OptionId',buffField='BuffName')])
 elif category=='support' and a.get('ProjectileInfo') and 'local label = character_util.get_entity_id(self.target)' in lua:
  p.update(clips=[dict(key='cast',at=0),dict(key='cast',at=0,track='Emotion')],events=[ev('cast',0,directed=False),dict(op='projectile',at=a['ShootTiming'],index=0,directional=True,nativePoolTransform='directional')],sourceProjectilePools=True)
 elif category=='basic' and 'self.break_hit_timing' in lua and 'self.is_reverse = not self.is_reverse' in lua:
  return dynamic('alternating-discrete-slash')
 elif category=='cwp' and 'self.attack_duration = self.action_duration - self.cast_duration' in lua and 'self.slash_fx' in lua:
  p.update(clips=[dict(key='cast',at=0),dict(key='cast',at=0,track='Emotion'),dict(key='attack',at=a['CastDuration']),dict(key='attack',at=a['CastDuration'],track='Emotion')],events=[ev('cast',0,directed=False,follow=True,followSpine=True),ev('screen',0,directed=False,screen=True),ev('attack',a['CastDuration'],directed=False,follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration'])])
 elif category=='role' and 'self.state_machine_key.hit' in lua and 'self.sync_dir_vector, 0.1, 0, self.hit_timing' in lua:
  p.update(clips=[dict(key='action',at=0)],events=[ev('fire',a['HitTiming'],offset=.5)],nativeRecoils=[dict(at=0,duration=a['HitTiming'],distance=.1,height=0,angle=0)],independentFieldEnd=a['HitTiming']+a['AttackDuration'])
 elif category=='support' and 'self.proj_target_pos' in lua and 'self.time_to_reach_target + self.wait_duration' in lua:
  return dynamic('side-projectile-juggle')
 else:return None
 for e in p['events']:
  if 'anchorOverride' in e:e['anchor']=e.pop('anchorOverride')
 return p
