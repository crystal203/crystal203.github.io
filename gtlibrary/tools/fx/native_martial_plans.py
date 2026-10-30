"""Source idioms for dash/jump melee and return-to-origin support choreography."""
import hashlib

def compile_martial_plan(a,lua,path):
 name=a['Name'];category='basic' if name.startswith('Manual') else 'role' if name.startswith('Role') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not category:return None
 f=lambda key,*fallback:['field',key,*fallback]
 ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,**kw)
 anim=lambda key,at=0,**kw:dict(key=key,at=at,**kw)
 plan=dict(behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=name,exclusive=category=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),mythPresetSource='action',meleeTimeline=True,clips=[],events=[],moves=[])
 if category=='basic' and 'self.dash_speed = self.dash_speed *' in lua and 'character_util.jump(self.owner, 2.3, duration)' in lua:
  dt=a['DashTiming'];hits=a['HitTiming']
  plan.update(clips=[anim('action',track='Upper'),anim('action',track='Emotion')],moves=[dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=['mul',f('DashSpeed'),f('DashMultiplier',1)])],spine=[dict(at=f('DashTiming'),duration=f('DashDuration') if dt>0 else ['add',f('DashDuration'),.2],height=2.3 if dt>0 else .5,aerialDuration=0 if dt>0 else .3)])
  plan['events']=[ev('hit',t-.05,offset=f('Offset'),directed=False) for i,t in enumerate(hits) if dt==0 or i==0]
  if dt>0:plan['events'].insert(0,ev('right',hits[0]-.1,directionKeys=dict(right='right',left='left',front='down',back='up'),fourWay=True,offset=-1.2,sideOffsetOnly=True,directed=False,unlessCostumeId=170032))
  if dt>0:plan['events'].insert(0,ev('slash',dt,anchor='target',directed=False,whenCostumeId=170032,positionRule=dict(type='targetOrDashEnd',distance=['mul',f('DashSpeed'),f('DashMultiplier',1),f('DashDuration'),.5],offset=f('Offset'),radius=['mul',f('Radius'),f('RadiusMultiplier',1)],hittableScale=.8)))
 elif category=='role' and 'self.activate_cwp_option == nil' in lua and 'self.special_buff_info' in lua and 'self.dash_timing' in lua:
  plan.update(optionParameterSource='active-non-special-option',clips=[anim('action'),anim('dash',f('DashTiming'),whenOptionParameters=True)],moves=[dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=f('DashSpeed'),free=True,whenOptionParameters=True)],events=[ev('aura',anchor='feet',follow=True,followSpine=True,directed=False,unlessOptionParameters=True),ev('dash',f('DashTiming'),anchor='feet',follow=True,followSpine=True,whenOptionParameters=True,unlessCostumeId=170032),ev('dash_right',f('DashTiming'),anchor='feet',follow=True,followSpine=True,whenOptionParameters=True,whenCostumeId=170032,fourWay=True,directionKeys=dict(right='dash_right',left='dash_left',front='dash_down',back='dash_up'))])
 elif category=='support' and 'self.jump_dest_pos = self.target_pos + 0.5 * -self.dir_vector' in lua and 'character_util.jump(self.owner, 2.2, 0.6, 0.4, true)' in lua:
  plan.update(cancelJumpAtEnd=True,sideDirection=True,clips=[anim('action',end=.95)],moves=[dict(op='lerp',at=0,duration=.2,offset=-3),dict(op='lerp',at=.5,duration=.1,offset=-.5),dict(op='lerp',at=.95,duration=.15,to='origin')],spine=[dict(at=0,height=2.2,duration=.6,aerialDuration=.4,allowAdd=True),dict(at=.95,height=.5,duration=.2)],events=[ev('cast',.2,followSpine=True,until=f('HitTiming'),directed=False,unlessCostumeId=170032),ev('cast',.2,follow=True,followSpine=True,until=f('HitTiming'),directed=False,whenCostumeId=170032),ev('kick',.5,anchor='feet',offset=.5,follow=True,followSpine=True,followUntil=.6,euler=[0,-60,0],negativeEuler=[0,60,0],directed=False,unlessCostumeId=170032),ev('trail',.5,follow=True,followSpine=True,directed=False,unlessCostumeId=170032,triggerDisposeAt=f('Duration')),ev('trail_flip',0,negativeKey='trail',follow=True,followSpine=True,directed=False,whenCostumeId=170032,triggerDisposeAt=f('Duration')),ev('flip',f('HitTiming'),negativeKey='hit',anchor='target',directed=False)])
 elif category=='cwp' and "character_util.recoil_type_1(self.owner, -self.dir_vector, 0.75, 0, 0.2, 50)" in lua and "self.position - vector_util.up, self.dir_vector" in lua:
  plan.update(clips=[anim('ready'),anim('action',a['ActionDuration']-.075),anim('ready',track='Emotion')],nativeRecoils=[dict(at=0,distance=.3,height=0,duration=.45,angle=15),dict(at=a['ActionDuration']-.05,distance=.75,height=0,duration=.2,angle=50,directionSign=-1)],events=[ev('cast',anchor='feet',follow=True,followSpine=True,directed=False),ev('screen',screen=True,directed=False),ev('fire',f('ActionDuration'),anchor='feet')])
 else:return None
 plan.update(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 return plan
