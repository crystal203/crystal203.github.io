"""Source recipes for party casts, charged support shots and periodic bubbles."""
import hashlib

def compile_batch3_support_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];cat='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not cat:return None
 p=dict(action=name,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],end=a.get('ActionDuration',a.get('Duration',1)),meleeTimeline=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 if cat=='cwp':p['exclusive']=True
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,directed=False,nativePoolLifetime=True,nativePoolTransform='direct',**kw)
 if cat=='basic' and "self.field.transform.localScale = 1.3" in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='charge-projectile-or-field',fieldScale=1.3,projectileOffset=.5));return p
 if cat=='basic' and "self.charge_lv2_fx" in lua and "self.collision_length * idx / self.hit_count" in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='charge-projectile-or-line'));return p
 if cat=='role' and 'self.effect_key_table[self.current_use_left]' in lua and 'self.action:set_symbol_effect(0, true)' in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='charged-heal-symbol'));return p
 if cat=='support' and 'character_util.jump(self.owner, 1.375, 0.8, 0.2)' in lua:
  p['clips']=[dict(key='action',at=0),dict(key='action',at=0,track='Emotion')];p['spine']=[dict(at=.2,height=1.375,duration=.8,aerialDuration=.2)];p['events']=[e('cast',.2,anchor='center',follow=True,followSpine=True,followUntil=.7),e('debuff',a['HitTiming'],anchor='targetGround')];p['sourceBoundary']='Owner excluded from ally buff visuals in source; no fabricated party.';return p
 if cat=='support' and 'self.hit_timing = heal_timing[1]' in lua and "instantiate_screen_effect(self, self.owner)" in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('screen',screen=True),e('heal',a['HealTimings'][0],anchor='feet',follow=True,followSpine=True)];return p
 if cat=='cwp' and "local postfix = self.index == 1 and 'b'" in lua:
  p['clips']=[dict(key='action',at=max(0,t-.1),end=t+.2,track='Upper') for t in a['HitTiming']];p['events']=[e('cast',anchor='feet',follow=True),e('screen',screen=True)]
  for t,k in zip(a['HitTiming'],['b','p','y']):p['events'] += [e('fire'+k,t,anchor='feet'),dict(op='effect',key='proj'+k,at=t,anchor='feet',heightBoundsFactor=2,directed=True,nativePoolLifetime=True,nativePoolTransform='directional')]
  return p
 if cat=='cwp' and "self.explosion_max_radius - self.explosion_min_radius" in lua and "self.expand_timing" in lua:
  p['clips']=[dict(key='cast',at=0,fallbackKey='castfallback')];p['events']=[e('cast',anchor='center'),e('fire',a['CastTiming'],anchor='feet')];return p
 if cat=='basic' and 'self.shoot_parallel_pattern[random_idx]' in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='periodic-random-parallel'));return p
 if cat=='role' and "self.shoot_timing = cs_util.get_float_from_dictionary(param, 'ShootTiming')" in lua and 'battle_util.can_apply_heal(self.owner, target)' in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',anchor='center',follow=True,followSpine=True)];p['sourceBoundary']='Only owner exists in preview party; no synthetic allied projectile target.';return p
 if cat=='support' and 'self.buff_timing = heal_timing[#heal_timing]' in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('hit',a['HealTimings'][0],anchor='target'),e('heal',a['HealTimings'][0],anchor='feet',follow=True)];return p
 if cat=='cwp' and 'local current_offset = self.radius + self.radius * 2 * (idx - 1)' in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',anchor='feet',follow=True),e('screen',screen=True)]+[e('tornado',t,anchor='origin',height=0,offset=a['Offset']+a['Radius']*(1+2*i)) for i,t in enumerate(a['HitTiming'])];p['independentStateEnd']=a['HitTiming'][-1]+a['HitDuration'];return p
 if cat=='basic' and 'self.proj_type.normal' in lua and 'self:is_get_role_buff()' in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='discrete-buff-projectile',offset=.5));return p
 if cat=='role' and 'function action_state_class:on_buff_add_event(e)' in lua and "'aura_end'" in lua:
  p.update(behavior='source-batch3-support',nativeSupport=dict(operation='self-buff-aura',applyAt=.1));return p
 if cat=='support' and "instantiate_effect(self, 'storm', self.target_pos)" in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',anchor='center'),e('storm',a['AttackTiming'],anchor='targetGround')];return p
 if cat=='cwp' and "instantiate_effect(self.action, 'circle', self.target_pos)" in lua:
  p['clips']=[dict(key='attack',at=0,fallbackKey='cast_fallback')];p['events']=[e('cast',anchor='center'),e('circle',anchor='targetGround'),e('screen',screen=True)];return p
 return None
