"""Reviewed persistent beam/spin and independently updated area state idioms."""
import hashlib

def compile_batch2_continuous_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];category='basic' if name.startswith('Manual') else 'support' if name.startswith('BasicSupport:') else 'cwp' if name.startswith('Cwp') else None
 if not category:return None
 rule=None;events=[];clips=[]
 if category=='basic' and a.get('StaminaPerSecond') and "'cast_loop'" in lua and "'laser_loop'" in lua and 'continuous_stamina_action_util.use_stamina' in lua:
  rule={'operation':'continuous-follow-beam','loops':['cast_loop','laser_loop'],'ends':['cast_end','laser_end'],'animationKey':'cast'}
 elif category=='basic' and 'self.spin_fx.TimeScaleModifier' in lua and 'self.check_timing = self.action_duration' in lua:
  rule={'operation':'persistent-follow-spin','loops':['spin','trail'],'animationKey':'action','staminaContract':'Persistent controller; source checks available stamina at local action periods, no inferred capacity duration'}
 elif category=='cwp' and all(k in a for k in ['ExpendStart','ExpendDuration','ReduceStart','ReduceDuration','SubExpendStart','SubExpendEnd']) and 'field_state_class' in lua:
  rule={'operation':'expanding-beam-side-field','fieldStartOffsetKey':'ExpandDuration','sourceMissingFieldDefault':0}
 elif category=='cwp' and all(k in a for k in ['HitDuration','ExpandDuration','DashTiming','Radius','DamageTerm']) and 'character_util.jump(self.owner, 3' in lua:
  rule={'operation':'jump-independent-expanding-field','jumpHeight':3,'jumpAerialDuration':.1,'fieldDelay':.05}
 elif category=='support' and "self, 'explosion', battle_util.get_ground_pos(self.target_pos)" in lua:
  events=[dict(op='effect',key='cast',at=0,anchor='feet',directed=False),dict(op='effect',key='explosion',at=.3,anchor='targetGround',directed=False)];clips=[dict(key='cast',at=0)]
 elif category=='support' and "self, 'heart', self.target.Position" in lua:
  events=[dict(op='effect',key='cast',at=0,directed=False),dict(op='effect',key='heart',at=a['HitTiming'][0],anchor='targetGround',directed=False)];clips=[dict(key='action',at=0,end=a['HitTiming'][1]),dict(key='upper',at=0,end=a['HitTiming'][1],track='Upper')]
 else:return None
 plan=dict(behavior='source-batch2-continuous' if rule else 'timeline',category=category,id=category,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能'}[category],action=name,exclusive=category=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),events=events,clips=clips,moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),sourceIdiom='persistent-beam-spin-independent-field-v1')
 if rule:plan['nativeContinuous']=rule
 return plan
