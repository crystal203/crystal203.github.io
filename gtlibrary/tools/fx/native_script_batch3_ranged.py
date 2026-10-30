"""Ranged source recipes; reuse timeline/projectile evaluation."""
import hashlib

def compile_batch3_ranged_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];cat='basic' if name.startswith('Manual') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not cat:return None
 p=dict(action=name,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能'}[cat],end=a.get('ActionDuration',a.get('Duration',1)),meleeTimeline=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',**kw)
 if 'self.angle_table = cs_util.get_float_table_from_dictionary(params, \'Angles\')' in lua and 'self.scatter' in lua and 'self.current_hit_count' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='discrete-offset-fan',nativeAim=dict(bone='b.aim',originHeight=.375),sourceProjectilePools=True);return p
 if 'self.fire_circle_center_offset = 1' in lua and '90, -130, -90, 130, 180' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='radial-circle-lasers');return p
 if 'self.is_laser_stared' in lua and "self.action, 'laser_end'" in lua:
  stop=a['AttackTiming']+a['AttackDuration'];p.update(exclusive=True,clips=[dict(key='cast',at=0),dict(key='attack',at=a['AttackTiming'])],events=[e('cast',0,offset=a['Offset'],directed=True,follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration']),e('laser',a['AttackTiming'],offset=a['Offset'],directed=True,follow=True,followSpine=True,until=stop),e('screen',a['AttackTiming'],screen=True,directed=False),e('laser_end',stop,offset=a['Offset'],directed=True,follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration'])]);return p
 if 'self.columns[self.sync_mode]' in lua and "string.format('shoot%d', mode)" in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='dual-mode-burst',sourceProjectilePools=True,nativeAim=dict(bone='b.aim',originHeight=.5));return p
 if "self, 'sword', init_pos - offset * bone_rot" in lua and 'self.jump_dest_pos = self.target_pos + 2 * self.dir_vector' in lua:
  p.update(clips=[dict(key='action',at=0,end=.6)],moves=[dict(op='move',at=0,duration=.2,offset=-4),dict(op='move',at=.2,duration=.15,offset=0),dict(op='move',at=.35,duration=.05,offset=2),dict(op='move',at=.6,duration=.2,to='origin')],spine=[dict(op='jump',at=.6,height=.7,duration=.3)],events=[e('sword',0,bone='[base]elbowL',directed=True,follow=True,triggerDisposeAt=.6,link=dict(boneOffset=.25,boneDirection=True)),e('dash',.2,anchor='feet',follow=True,directed=True,triggerDisposeAt=.4),e('slash',.3,anchor='target',directed=True),e('hit',.3,anchor='target',directed=True)]);return p
 if "self.cs_action, 'ready'" in lua and 'self.main_damage_scale' in lua and 'self.shoot_helper[1], bounds_util.get_center(self.owner), self.sync_dir_vector' in lua:
  p.update(exclusive=True,sourceProjectilePools=True,nativeAim=dict(bone='b.aim',originHeight=.375),clips=[dict(key='ready',at=0),dict(key='shoot',at=a['ShootTiming'])],events=[e('cast',0,offset=1,directed=False,follow=True),e('screen',a['ShootTiming'],screen=True,directed=False),dict(op='projectile',index=0,at=a['ShootTiming'],offset=0,muzzleOffset=1,directional=True)]);return p
 if 'function action_state_class:update_mode1' in lua and 'self.bounds_offset = 0.4 * vector_util.up' in lua and 'RequestCartridgeBounce' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='dual-mode-arc-and-stream',sourceProjectilePools=True,nativeAim=dict(bone='b.aim',originHeight=.775));return p
 if 'self.proj.life_time = distance / self.speed' in lua and 'self:shoot_proj(bounds_util.get_center(self.owner), target_pos)' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='independent-rocket',nativeAim=dict(bone='b.aim',originHeight=.775));return p
 if 'self.helicopter_fx' in lua and 'index * self.shoot_term - 0.25' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='helicopter-salvo',exclusive=True);return p
 if 'self.android_key_table' in lua and 'self.punch_shoot_timing' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='four-step-summoned-arsenal',sourceProjectilePools=True);return p
 if 'self.android_key_table' in lua and 'for index = 1, 4 do' in lua and 'cast_offset = 0.3' in lua:
  p.update(behavior='source-batch3-ranged',rangedOperation='four-summoned-lasers');return p
 if 'local field_fx' in lua and 'field_state_class' in lua and 'self.reduce_timing' in lua:
  p.update(exclusive=True,independentFieldEnd=a['AttackTiming']+a['ReduceTiming']+a['ReduceDuration'],clips=[dict(key='cast',at=0),dict(key='cast',at=0,track='Emotion')],events=[e('cast',0,directed=False,follow=True),e('screen',a['AttackTiming'],screen=True,directed=False),e('field',a['AttackTiming'],directed=True)]);return p
 return None
