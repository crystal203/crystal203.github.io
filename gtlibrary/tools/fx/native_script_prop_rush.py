"""Bounded source prop-rush and airborne impact choreography; no actor IDs."""
import hashlib

def compile_prop_rush_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];base=dict(action=name,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 if name.startswith('BasicSupport:') and all(s in lua for s in ["self.horse_init_offset = vector(0, 0.03, -0.3)","self.first_pos = self.target_pos + dist_vector","horse_spine:SetAlphaFade(1, 0.15)","math.max(1.05 - time_passed, 0)","self.fx_horse.transform.position"]):
  return dict(**base,behavior='source-prop-rush',category='support',id='support',label='连锁技能',end=a['Duration'],
   choreography=dict(firstDistance=5,approachDuration=.1,throwAt=.15,propAt=.35,castAt=.5,rushAt=.65,rushEnd=1.05,returnAt=.95,propOffset=[0,.03,-.3],propForward=.8,dashOffset=[0,.75,0],propFadeDuration=.15,propAnimation='run_side',fps=60),
   actorReaction=dict(requiredOrigins=a.get('TargetOriginId',[]),defaultEmotion='cast',partyReactionEmotion='cast_reaction',stage='non-arena'),
   boundaries='flat preview has no obstacle/event-zone clipping or invented party members')
 if name.startswith('Cwp') and all(s in lua for s in ["character_util.jump(self.owner, 3, self.dash_duration, 0.1, false)","self.fx_contrail = battle_util.instantiate_effect(","'ground', character_util.get_position(self.owner)","'attack', battle_util.get_ground_pos(character_util.get_position(self.owner))"]):
  f=lambda k:['field',k]
  return dict(**base,behavior='timeline',category='cwp',id='cwp',label='专武技能',exclusive=True,end=a['ActionDuration'],meleeTimeline=True,cancelJumpAtEnd=True,
   clips=[dict(key='attack',at=0)],moves=[dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=f('DashSpeed'))],
   spine=[dict(at=f('DashTiming'),height=3,duration=f('DashDuration'),aerialDuration=.1)],
   events=[dict(op='effect',key='cast',at=0,anchor='center',follow=True,followSpine=True,directed=False,nativePoolTransform='direct'),
    dict(op='effect',key='screen',at=0,screen=True,directed=False),
    dict(op='effect',key='ground',at=f('DashTiming'),anchor='feet',directed=False,nativePoolTransform='direct'),
    dict(op='effect',key='contrail',at=f('DashTiming'),anchor='center',follow=True,followSpine=True,directed=False,nativePoolTransform='direct',triggerDisposeAt=f('ActionDuration')),
    dict(op='effect',key='attack',at=['fieldIndex','HitTiming',0],anchor='feet',directed=False,nativePoolTransform='direct')])
 return None
