"""Source discrete projectile/finisher and independently timed fields."""
import hashlib

def compile_batch3_root_plan(a,lua,path):
 if not lua:return None
 n=a['Name'];cat='basic' if n.startswith('Manual') else 'support' if n.startswith('BasicSupport:') else 'role' if n.startswith('Role') else 'cwp' if n.startswith('Cwp') else None
 if not cat:return None
 p=dict(action=n,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','role':'角色技能','cwp':'专武技能'}[cat],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),end=a.get('ActionDuration',a.get('Duration',1)),events=[],clips=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,recordProjectileHits=True)
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',**kw)
 if cat=='basic' and 'discrete_stamina_action_util.use_stamina' in lua:
  if 'self.break_hit_timing' in lua and 'self.shoot_offset = 0.5' in lua and isinstance(a.get('HitTiming'),list) and a.get('StaminaPerAction'):
   p.update(behavior='source-batch3-discrete',discrete=dict(operation='projectile-melee-finisher',normalAnimations=['action'],normalShoot=0,normalOffset=.5,breakAnimation='break',breakEffect='break',breakEffectAt=a['HitTiming'][0],normalRecoil=dict(distance=.1,height=.1,duration=.05),breakRecoil=dict(distance=.35,height=.1,duration=.25),passiveOptionField='OptionId'))
   return p
  if 'self.anim_keys[rand_idx]' in lua and 'self.break_rev' in lua:
   p.update(behavior='source-batch3-discrete',discrete=dict(operation='projectile-variant-finisher',normalAnimations=['normal1','normal2','normal3'],randomAnimation=True,normalShoot=a['ShootTiming'],normalOffset=a['ShootOffset'],breakAnimation='break',breakShoot=a['ShootTiming'],breakIndices=[1,2],breakHitKey='hit2',breakEndKeys=['end','end2'],breakEndOffset=-.26,breakRecoil=dict(distance=.25,height=.3,duration=.15),expireUsesHit=True))
   return p
  if 'self.shoot_index' in lua and 'self.shoot_offset_break = 0.5' in lua:
   p.update(behavior='source-batch3-discrete',nativeAim=dict(bone='b.aim',originHeight=.375),discrete=dict(operation='alternating-offset-finisher',normalAnimations=['shoot1','shoot2'],normalShoot=a['ShootTiming'],normalOffset=.1,normalSides=[-.2,.2],breakAnimation='break',breakEffect='break',enhancedBreakEffect='break_enhanced',breakEffectAt=a['BreakShootTiming'],breakCast='break_cast',breakOffset=.5,breakHitKey='break_hit',normalRecoil=dict(distance=.13,height=.05,duration=.15)))
   return p
 if cat=='support' and 'self.hit_dps_multipliers' in lua and "self, 'charge', self.target_pos" in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',0,anchor='origin',directed=False),e('charge',a['HitTiming'][0],anchor='targetGround',directed=False),e('explosion',a['HitTiming'][-1],anchor='targetGround',directed=False)];return p
 if cat=='support' and 'MetamorphSkinName' in lua:
  p['skinPath']=[dict(at=0,end=p['end'],skinField='MetamorphSkinName')];at=a['HitTiming'][0];p['clips']=[dict(key='action',at=at-.2)];p['events']=[e('cast',0,anchor='center',directed=False),e('ready',0,anchor='targetGround',directed=False,triggerDisposeAt=at),e('explosion',at,anchor='targetGround',directed=False)];p['nativeRecoils']=[dict(at=at-.2,distance=.2,height=.1,duration=.2,angle=15)];return p
 if cat=='cwp' and 'self.storm_fx' in lua and "'MainRadius'" in lua:
  p['exclusive']=True;p['clips']=[dict(key='action',at=0,track='Upper')];p['events']=[e('cast',0,anchor='center',follow=True,followSpine=True,directed=False),e('screen',a['HitTiming'],screen=True,directed=False),e('storm',a['HitTiming'],anchor='center',follow=True,directed=False)];p['independentFieldEnd']=a['HitTiming']+a['HitDuration'];return p
 if cat=='cwp' and "'AttackRange'" in lua and "'SyncTiming'" in lua and 'self.first_shake_timing' in lua:
  at=a['SyncTiming'];p['exclusive']=True;p['clips']=[dict(key='cast',at=0,fallbackKey='fallback')];p['events']=[e('cast',0,anchor='center',follow=True,followSpine=True,directed=False),e('explosion',at,anchor='targetGround',maxDistance=a['AttackRange'],directed=False),e('range',at,anchor='targetGround',maxDistance=a['AttackRange'],directed=False),e('screen',a['HitTiming'][0]+.05,screen=True,directed=False)];p['independentFieldEnd']=a['HitTiming'][-1];return p
 if cat=='role' and 'self:use_hp_cost()' in lua and 'battle_util.melee_short_dash' in lua:
  p['moves']=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])];p['clips']=[dict(key='cast',at=a['DashTiming']+a['DashDuration']),dict(key='explosion',at=a['AttackTiming'])];p['events']=[e('cast',a['DashTiming']+a['DashDuration'],anchor='center',directed=False),e('screen',a['AttackTiming'],screen=True,directed=False),e('explosion',a['AttackTiming'],anchor='feet',directed=False)];return p
 if cat=='support' and 'self:check_position_passed' in lua and 'self.proj_speed' in lua:
  p.update(behavior='source-batch3-special',operation='linear-passing-support',launchAt=.85,shootOffset=.8,hitFlipForRight=True)
  return p
 if cat=='cwp' and 'local deg = 70 * index' in lua and 'self.fx_fires' in lua:
  p.update(behavior='source-batch3-special',operation='prepared-ring-volley',worldRingDegrees=70,ringRadius=1)
  return p
 return None
