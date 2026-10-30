"""Source recipes for burst, dash and independently moving ranged effects."""
import hashlib

def compile_batch4_ranged_plan(a,lua,path):
 if not lua:return None
 n=a['Name'];cat='basic' if n.startswith('Manual') else 'support' if n.startswith('BasicSupport:') else 'cwp' if n.startswith('Cwp') else 'role' if n.startswith('Role') else None
 if not cat:return None
 p=dict(action=n,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能','role':'职业技能'}[cat],end=a.get('ActionDuration',a.get('Duration',1)),meleeTimeline=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),sourceProjectilePools=True)
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',**kw)
 def proj(at,**kw):return dict(op='projectile',index=0,at=at,directional=True,**kw)
 def custom(op):p.update(behavior='source-batch4-ranged',rangedOperation=op);return p
 if 'self.used_bullet + 1 == self.cwp_buff_seed' in lua and cat=='basic':return custom('six-round-reload')
 if 'self.hit_timing = {' in lua and '0.69' in lua and 'self.is_max_stamina' in lua and cat=='role':
  p.update(clips=[dict(key='roll',at=0,track='Upper'),dict(key='shoot',at=.2,track='Upper'),dict(key='reload',at=.8,track='Upper')],moves=[dict(op='dash',at=0,duration=.2,speed=20,sign=-1)],events=[proj(t,offset=['add',['field','_shootOffset',.5],0],muzzleOffset=.3) for t in [.25,.36,.47,.58,.69,.8]]+[e('cartridge',.8+i*.06,directed=True) for i in range(6)]);return p
 if 'self.fire_fx' in lua and 'self.hit_timing' in lua and 'self.action_duration' in lua and 'attack_timing = attack_timing - hit_term' in lua:
  p.update(exclusive=True,clips=[dict(key='action',at=0,track='Upper')],events=[e('cast',0,directed=False,follow=True),e('screen',a['AttackTiming'],screen=True,directed=False),e('fire',a['AttackTiming'],anchor='feet',follow=True,directed=False,triggerDisposeAt=a['ActionDuration'])]);return p
 if 'self.main_damage_scale = 0.6' in lua and "self, 'last'" in lua:
  p.update(clips=[dict(key='aim',at=0,track='Upper'),dict(key='shoot',at=a['HitTiming'][-1],track='Upper')],events=[e('cast',0,directed=False),e('target',a['HitTiming'][0],anchor='target',directed=False)]+[e(k,a['HitTiming'][-1],offset=.5,directed=True) for k in ['last','trail']]+[e('hit',t,anchor='target',directed=False) for t in a['HitTiming']]);return p
 if 'self.dash_pivot_dist' in lua and 'self.proj_type.cwp_tumbling' in lua:return custom('pivot-tumble-shoot')
 if 'self.cast_fx' in lua and 'self:get_shoot_target_pos()' in lua and cat=='cwp':return custom('jump-arrow-explosion')
 if cat=='support' and 'self.fx_cast' in lua and 'self.shoot_helper[1]' in lua:
  p.update(clips=[dict(key='cast',at=0),dict(key='shoot',at=a['ShootTiming'])],events=[e('cast',0,directed=True,triggerDisposeAt=a['ShootTiming']),proj(a['ShootTiming'],offset=0)]);return p
 if 'self.quaternion_list[idx]' in lua and 'self.cwp_shoot_helper' in lua:return custom('multi-shot-combo')
 if 'self.bullet_fx' in lua and 'self.max_cartridge_count' in lua:
  p.update(exclusive=True,clips=[dict(key='cast',at=0),dict(key='fire',at=a['ShootTiming'])],events=[e('screen',0,screen=True,directed=False)]+[e(k,a['ShootTiming'],offset=.8,follow=k!='smoke',directed=True,triggerDisposeAt=a['ActionDuration']-.2 if k!='smoke' else a['ActionDuration']) for k in ['fire','bullet','smoke']]+[e('hit',t,anchor='target',directed=False) for t in a['HitTiming']]+[e('cartridge',a['ShootTiming']+(a['HitTiming'][-1]-a['ShootTiming'])*i/9,directed=True) for i in range(10)]);return p
 if cat=='support' and 'self:parabola_lerp' in lua:return custom('jump-bomb')
 if 'self:update_slash' in lua and 'self:update_upper' in lua:return custom('dash-slash-combo')
 if 'self.fx_flag' in lua and 'self.waterpool_timing = 0.15' in lua:return custom('flag-target-dash')
 if 'self.boat_move_length = 12' in lua:return custom('crossing-boat')
 if 'self:counter_routine' in lua and "self.action, 'explosion'" in lua:
  p.update(clips=[dict(key='action',at=0),dict(key='attack',at=a['ActionDuration'],track='Upper')],events=[e('cast',0,directed=True,follow=True,triggerDisposeAt=a['ActionDuration']),e('explosion',a['ActionDuration'],anchor='target',directed=False)]);return p
 if 'self.punch_type' in lua and 'self.break_hit_timing' in lua:return custom('alternating-punch-break')
 if 'self.orbit_quaternion' in lua and 'local count = 5' in lua:return custom('five-orbit-buff')
 if cat=='cwp' and 'self.first_hit_timing' in lua and "self.action, 'field'" in lua:
  p.update(clips=[dict(key='cast2',at=0,fallbackKey='fallback')],events=[e('cast',0,directed=False),e('field',a['HitTiming'][0],anchor='targetGround',directed=True),e('screen',a['HitTiming'][0],screen=True,directed=False),e('explosion',a['HitTiming'][-1],anchor='targetGround',directed=True)]);return p
 if cat=='support' and 'self.fusion_fx' in lua:
  p.update(clips=[dict(key='cast',at=0)],events=[e('cast',0,directed=False,follow=True),e('fusion',0,anchor='targetGround',directed=False,triggerDisposeAt=a['HitTiming'][-1]),e('explosion',a['HitTiming'][-1],anchor='targetGround',directed=False)]);return p
 return None
