"""Source idioms for phased melee and offset staff shots; source clocks retained."""
import hashlib

def compile_batch2_root_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];category='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not category:return None
 end=a.get('ActionDuration',a.get('Duration',1));p=dict(action=name,behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],end=end,meleeTimeline=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 f=lambda key:['field',key]
 e=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',**kw)
 dash=lambda:dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=f('DashSpeed'),stopOffset=0)
 if category=='basic' and "self.attack_type == self.action_type.strike" in lua and '0.65' in lua and 'self.dash_end_timing' in lua:
  p['clips']=[dict(key='cast',at=0)];p['moves']=[dash()]
  if a['AttackType']=='slash':p['events']=[e('cast',a['HitTiming'],anchor='center',offset=f('Offset'),directed=True,follow=True,followSpine=True,triggerDisposeAt=a['DashTiming']+a['DashDuration'])]
  else:p['events']=[e('cast',.65,negativeKey='cast_rev',anchor='feet',offset=f('Offset'),directed=True)]
  return p
 if category=='support' and 'self.need_adjust = vector_util.magnitude(diff) < 3' in lua and "'slash_flip'" in lua:
  p['nativeMotion']=dict(op='supportDashReturn',threshold=3,initialDistance=3,advanceAt=.05,advanceDuration=.15,finishOffset=.5,returnAt=.5,returnDuration=.2)
  p['clips']=[dict(key='cast',at=0,end=.05),dict(key='dash',at=.05,end=.5)]
  p['events']=[e('cast',.05,anchor='center',follow=True,followSpine=True,directed=True,triggerDisposeAt=.5),e('slash',.2,negativeKey='slash_flip',anchor='target',directed=True),e('explosion',.2,anchor='targetGround',offset=-.5,directed=True)]
  return p
 if category=='cwp' and 'self.fx_name' in lua and "'screen_fire'" in lua and "'JumpAerialDuration'" in lua:
  p['exclusive']=True;p['cancelJumpAtEnd']=True;p['moves']=[dash()]
  p['clips']=[dict(key='dash',at=a['DashTiming'],track='Upper'),dict(key='slash',at=a['SlashTiming'],track='Upper'),dict(key='smash',at=a['SmashTiming'],track='Upper')]
  p['spine']=[dict(at=a['JumpTiming'],height=3,duration=a['JumpDuration'],aerialDuration=a['JumpAerialDuration'])]
  p['events']=[e('screen_cast',0,screen=True,directed=False),e('dash',a['DashTiming'],anchor='center',follow=True,followSpine=True,directed=True,triggerDisposeAt=a['DashTiming']+a['DashDuration']),e('jump',a['JumpTiming'],anchor='center',directed=False)]
  for i,t in enumerate(a['HitTiming']):p['events'] += [e('slash' if i==0 else 'explosion',t,anchor='center' if i==0 else 'target',directed=True),e('screen_fire',t,screen=True,directed=False)]
  return p
 if category=='basic' and 'self.shoot_fx_offset[direction_util.up] = 1.25' in lua and 'self.side_quaternion' in lua:
  p['nativeAim']=dict(bone='b.aim',originHeight=.375);p['sourceProjectilePools']=True
  p['clips']=[dict(key='cast',at=0)];shot=a['AttackType']=='proj';fix=a['ShootTiming'][-1] if shot else a['AttackTiming'];start=a['ShootTiming'][0] if shot else 0
  p['events']=[e('shoot',start,anchor='center',offset=1,offsetByFacing=dict(back=1.25,front=.75,left=1,right=1),follow=True,directed=True,triggerDisposeAt=fix)]
  if shot:
   p['clips'].append(dict(key='loop',at=.2))
   for i,t in enumerate(a['ShootTiming']):p['events'].append(dict(op='projectile',at=t,index=0,offset=a['ShootOffset'],sideOffset=a['SideOffset'][i],directional=True))
   p['sourceBoundary']='Stationary preview has no joystick dash direction; explicit move-input is not fabricated.'
  else:
   p['events'].append(e('attack',fix,anchor='center',directed=True));p['nativeRecoils']=[dict(at=fix,duration=.2,height=0,distance=.2,angle=0)]
  return p
 if category=='role' and "'MinRadius'" in lua and 'self:apply_self_buff()' in lua and 'role_util.setup_role_action' in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('explosion',a['AttackTiming'],anchor='feet',directed=False)];return p
 if category=='support' and 'self.weapon_bone.WorldRotationX - 45' in lua and "'explosion', self.target_pos" in lua:
  p['clips']=[dict(key='cast',at=0),dict(key='attack',at=.3)]
  p['events']=[e('cast',.1,bone='[base]weapon1',follow=True,directed=False,triggerDisposeAt=a['HitTiming'],link=dict(boneOffset=1,boneDirection=False,boneFollowUntil=end,boneAngleDegreesByFacing=dict(left=-45,right=45,front=45,back=45))),e('explosion',a['HitTiming'],anchor='targetGround',directed=False)]
  return p
 if category=='cwp' and 'projectile_type.field' in lua and 'self.explosion_offsets' in lua and 'self.weapon_bone.WorldRotationX - 45' in lua:
  p['exclusive']=True;p['sourceProjectilePools']=True;p['clips']=[dict(key='cast',at=0,fallbackKey='castfallback'),dict(key='attack',at=a['ShootTiming'][0],fallbackKey='attackfallback')]
  p['events']=[e('cast',0,bone='[base]weapon1',follow=True,directed=False,triggerDisposeAt=end,link=dict(boneOffset=1,boneDirection=False,boneFollowUntil=end,boneAngleDegreesByFacing=dict(left=-45,right=45,front=45,back=45))),e('screen',a['ShootTiming'][0],screen=True,directed=False)]
  for i,t in enumerate(a['ShootTiming']):p['events'].append(dict(op='projectile',at=t,index=0 if i==0 else 2 if i==len(a['ShootTiming'])-1 else 1,offset=a['ShootOffset'],directional=True))
  last=a['ShootTiming'][-1];count=a['ExplosionCount']
  for i in range(count):p['events'].append(e('explosion',last+a['HitDelay']+a['ExpandDuration']*i/count,anchor='origin',height=0,offset=a['Width']*.5+(a['MaxLength']-a['Width'])*i/max(1,count-1),directed=True))
  p['independentFieldEnd']=last+a['HitDelay']+a['ReduceTiming']+a['ReduceDuration'];return p
 return None
