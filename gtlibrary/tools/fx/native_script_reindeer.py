"""Source-bound timed gun bursts, charge, sweeps, and independent clone rush.
No character identifier is used for matcher dispatch.
"""
import hashlib

def compile_reindeer_plan(a,lua,path):
 if a.get('Name','').split(':')[0]=='GrenadeSupport' and all(k in a for k in ['GrenadePreset','GrenadeArrivalTiming','GrenadeThrowTiming','GrenadePeakHeight']):
  return dict(behavior='source-reindeer-action',operation='native-apex-grenade',category='support',id='support',label='连锁技能',action=a['Name'],end=a['Duration'],constants=dict(recoilDistance=.3,recoilHeight=.2,recoilDuration=.425,recoilAngle=16),source='native ARM64 GrenadeSupport 0x8c22754/0x8c22c18/0x8c22cbc',sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
 if not lua:return None
 n=a['Name'];base=dict(action=n,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def plan(kind,category,**kw):
  return dict(**base,behavior='source-reindeer-action',operation=kind,category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],end=a.get('ActionDuration',a.get('Duration',1)),**kw)
 if all(s in lua for s in ['self.hit_seq_timings[idx] + hit_timing','self:play_sleigh_seq(idx)',"self.current_hit_fx_seq.progress * 2, 1, -1",'self:play_screen_fx(0.1)']):
  if not all(k in a for k in ['HitSeqTimings','HitSeqAngles','HitTimings','SleighSeqTimings','DamageRadius','TotalDuration']):return None
  return plan('target-scan-sequences','cwp',exclusive=True,constants=dict(screenDelay=.1,scanDuration=.6,scanTerm=.05,scanTimeMultiplier=2,jumpHeight=.75,jumpDurationScale=.75),nativeInterpolation='Oak.Interpolations.Linear 0x66d6f60: b+c*t/d; no clamp')
 if all(s in lua for s in ['self.expand_length = self.max_length - self.base_length','self.offset = 1','self.field_machine:update(dt)','self.start_pos + reduce_dist * self.dir_vector']):
  if not all(k in a for k in ['HitDelay','BaseLength','MaxLength','ExpandDuration','ReduceTiming','ReduceDuration','ShootTiming']):return None
  return plan('expanding-sleigh-field','cwp',exclusive=True,constants=dict(offset=1))
 if all(s in lua for s in ["instantiate_effect(self, 'clone'", "set_track_animation(self.ru_spine, self.base_track, 'scream'",'self.first_pos = self.target_pos + dist_vector','self.dest_pos = self.target_pos + second_dist * self.dir_vector']):
  return plan('clone-rush','support',constants=dict(firstDistance=6,lastDistance=4,blinkAt=.3,firstAt=.35,dashAt=.45,throughAt=.65,fadeAt=.8,returnAt=.85,returnDuration=.15,cloneHeight=1.5))
 if all(s in lua for s in ['self.fx_spin = battle_util.instantiate_effect(','self.current_animation_time = self.current_animation_time + dt',"self.last_direction == CS.Oak.Direction.Left and 'action_rev' or 'action'",'self.check_hit_timing = self.check_hit_timing + self.action_duration']):
  if not isinstance(a.get('HitTiming'),(float,int)) or not a.get('ActionDuration'):return None
  return plan('persistent-spin','basic',constants=dict(heightSizeMultiplier=1),continuousCycles=3,staminaContract='persistent end checks remaining stamina; source does not consume stamina or expose an ammo counter')
 if all(s in lua for s in ['self.anim_timing[index]','self.hit_timing[index] - 0.02','1.3 * self.sync_dir_vector + 0.1 * unity_class.vector3.up','self.range * 0.5']):
  if not all(isinstance(a.get(k),list) for k in ['HitTiming','AnimationKey','AnimationTiming']):return None
  return plan('timed-gun-burst','basic',constants=dict(fireOffset=1.3,fireHeight=.1,recoilDistance=.3,recoilHeight=.05,recoilAtOffset=.02))
 if all(s in lua for s in ['self.dash_speed * real_dt','self.target_action_duration = time_passed +','self.dash_fx = battle_util.instantiate_effect(','self.last_bounds_center = bounds_util.get_center(self.owner)']):
  if not all(k in a for k in ['DashTiming','DashSpeed','DashDuration','Size']):return None
  return plan('linear-charge','role',constants=dict(hitForward=.5))
 return None
