"""Source idioms for offset salvos, parented companions and melee timelines."""
import hashlib
import json
from pathlib import Path

def compile_batch2_projectile_melee_plan(a,lua,path):
 if not lua:return None
 name=a['Name'];cat=next((v for k,v in [('Manual','basic'),('Role','role'),('BasicSupport:','support'),('Cwp','cwp')] if name.startswith(k)),None)
 if not cat:return None
 p=dict(behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],action=name,exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),events=[],clips=[],moves=[],spine=[],meleeTimeline=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',**kw)
 anim=lambda key,at=0,**kw:dict(key=key,at=at,**kw)
 if cat=='basic' and "shoot_pos = shoot_pos + self.offset[index]" in lua and a.get('AttackType') in ('shoot','blast'):
  p.update(clips=[anim('action')],events=[dict(op='projectile',at=t,index=0,offset=0,sideOffset=(a.get('Offset') or [0]*len(a['HitTiming']))[i],directional=True,muzzleOffset=.5,nativePoolTransform='directional') for i,t in enumerate(a['HitTiming'])]+([ev('cast',offset=.5,follow=True,directed=False,triggerDisposeAt=a['HitTiming'][0])] if a['AttackType']=='blast' else []),joystickBranch='shoot dash requires nonzero stick; stationary initial preview has no dash')
 elif cat=='support' and "'unique/mayreel_draw'" in lua and 'self.alpaca_spine' in lua:
  p.update(behavior='source-batch2-projectile-melee',operation='parented-companion',companionKey='alpaca',companionAnimation='unique/mayreel_draw',clips=[],alpha=[dict(at=0,value=1),dict(at=.1,value=0),dict(at=p['end'],value=1)],events=[ev('alpaca',anchor='feet',directed=False,follow=True,triggerDisposeAt=p['end'],link=dict(skeletonIdle='idle',skeletonClips=[dict(name='unique/mayreel_draw',start=0,end=p['end'],track='Base',loop=True,speed=1)])),ev('cast',offset=.5,directed=True,follow=True),ev('laser',a['HitTiming'],offset=.5,directed=True)])
 elif cat=='cwp' and 'self.explosion_pos - bounds_util.get_size(self.owner).y * 0.5' in lua and 'self.max_hit' in lua:
  p.update(clips=[anim('cast',fallbackKey='castbackup'),anim('cast',track='Emotion',end=a['DashTiming'])],events=[ev('cast',anchor='feet',offset=a['Offset'],directed=False,follow=True,triggerDisposeAt=a['HitTiming']),ev('screen',screen=True,directed=False),ev('explosion',a['HitTiming'],anchor='feet',offset=a['Offset'],directed=True)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],sign=-1)],nativeRecoils=[dict(at=a['DashTiming'],distance=.4,height=.2,duration=a['DashDuration'])],independentCollisionEnd=a['HitTiming']+a['ExplosionDuration'])
 elif cat=='basic' and 'function action_state_class:thrust_routine' in lua and 'self.proj.left_time' in lua:
  kind=a['AttackType']
  if kind in ('thrust','continuous'):
   p.update(clips=[anim('thrust',a['DashTiming'])],events=[ev('thrust',a['DashTiming'],offset=.5,follow=True,directed=True)],nativeAim=dict(bone='b.aim',originHeight=.375,windows=[dict(at=a['DashTiming'],end=p['end'])]))
   if kind=='thrust':p['moves']=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],stopOffset=0)]
   else:p.update(behavior='source-batch2-projectile-melee',operation='linear-contact-motion',motionAt=a['DashTiming'],motionSpeed=a['DashSpeed'])
  elif kind=='proj':p.update(clips=[anim('action',track='Upper'),anim('action',track='Emotion')],events=[ev('proj',t,negativeKey='projrev',anchor='targetGround',maxDistance=a['MaxDist'],directed=False) for t in a['ShootTiming']],sourceDamageTimes=[t+a['HitDelay'] for t in a['ShootTiming']])
  else:return None
 elif cat=='role' and "center + 1.3 * self.dir_vector" in lua and 'spine_controller:DeviateLocal' in lua:
  t=a['HitTiming'];p.update(optionParameterSource='active-non-special-option',clips=[anim('action'),anim('action',track='Emotion'),anim('thrust',t)],events=[ev('cast',whenOptionParameters=True,follow=True,followSpine=True,directed=False),ev('thrust',t,offset=1.3,directed=True)],behavior='source-batch2-projectile-melee',operation='deviate-local',deviate=dict(at=t,duration=p['end']-t,offset=.8,outFraction=.8),nativeAim=dict(bone='b.aim',originHeight=.375,windows=[dict(at=t,end=p['end'])]))
 elif cat=='cwp' and isinstance(a.get('ThrustTiming'),list) and 'vector_util.to_4way_vector' in lua:
  p.update(clips=[anim('slash',a['DashTiming']-.1)]+[anim('thrust',t) for t in a['ThrustTiming']],events=[ev('cast',follow=True,followSpine=True,directed=False),ev('screen',a['DashTiming']-.1,screen=True,directed=False),ev('slash',a['DashTiming'],fourWay=True,follow=True,followSpine=True,directed=True)]+[ev('thrust',t,directed=True) for t in a['ThrustTiming']],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],stopOffset=0)],nativeAim=dict(bone='b.aim',originHeight=.375,windows=[dict(at=t,end=min(p['end'],t+.3)) for t in a['ThrustTiming']]))
 elif cat=='support' and 'local apex = 10' in lua and 'local gravity = 40' in lua and 'function local_class:update_always' in lua:
  p.update(behavior='source-batch2-projectile-melee',operation='falling-independent-routine',clips=[anim('action')],events=[ev('cast',directed=False)],fall=dict(launchAt=a['ShootTiming'],apex=10,velocity=-5,gravity=40,horizontalDistance=7,projectileKeys=['proj','trail'],impactKey='explosion'))
 elif cat=='basic' and 'function action_state_class:stomp_routine' in lua and 'increase_timing = 0.25' in lua:
  p['moves']=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],stopOffset=0)]
  if a['AttackType']=='slash':p.update(clips=[anim('attack')],events=[ev('attack',a['AttackTiming'],follow=True,followSpine=True,directed=True)])
  elif a['AttackType']=='stomp':p.update(behavior='source-batch2-projectile-melee',operation='plateau-spine-stomp',clips=[anim('attack'),anim('stomp',.4)],optionParameterSource='active-non-special-option',events=[ev('trail',.14,follow=True,followSpine=True,directed=False,triggerDisposeAt=p['end']),ev('jump',a['HitTiming'][0],anchor='feet',directed=False),ev('stomp',a['HitTiming'][-1],anchor='feet',offset=a['StompOffset'],directed=True,unlessOptionParameters=True),ev('aoe',a['HitTiming'][-1],anchor='feet',offset=a['StompOffset'],directed=True,fourWay=True,whenOptionParameters=True)],upperAt=a['HitTiming'][0],jumpCurve=dict(at=a['DashDuration'],duration=.5,height=2,rise=.25,fallStart=.4,downFallStart=.45))
  else:return None
 elif cat=='support' and "'aoe', self.target_pos" in lua and 'self.trigger = false' in lua:
  p.update(clips=[anim('cast',end=.3)],events=[ev('cast',follow=True,followSpine=True,directed=False),ev('aoe',.3,anchor='targetGround',directed=False)])
 elif cat=='cwp' and 'function action_state_class:update_size' in lua and 'self.fx_snowball' in lua and 'self.offset = 1.2' in lua:
  # Retain the complete source Hero speed relation, never an actor-name runtime switch.
  root=Path(__file__).resolve().parents[2]/'gtfx/assets/native-source'
  styles=json.loads((root/'battlestyles.json').read_text(encoding='utf8'))['BattleStyles']
  classes={r.get('Class') for r in styles if any(str(v).split(':')[0].removeprefix('Manual')==name.removeprefix('Cwp') for v in (r.get('ManualBattleActions') or []))}
  speed_rows=[{k:r.get(k) for k in ['Name','Class','WalkSpeed','ManualWalkSpeed']} for r in json.loads((root/'heroes.json').read_text(encoding='utf8')) if r.get('Class') in classes]
  if not speed_rows or any(r.get('ManualWalkSpeed') is None for r in speed_rows):return None
  p.update(behavior='source-batch2-projectile-melee',operation='growing-contact-charge',roll=dict(offset=1.2,explosionScaleCap=2.44,previewWalkSpeed=speed_rows[0]['ManualWalkSpeed'],sourceSpeedProperty='FieldObjectStatsBehaviour.WalkSpeed; manually controlled preview source ManualWalkSpeed',nativeSpeedGetter='0x5ebe60c',nativeManualSelector='0x5ebdccc',speedSourceRows=speed_rows),events=[ev(k,directed=k not in ('screen','explosion')) for k in ['screen','spawn','snowball','trail','footstep','explosion']])
 else:return None
 return p
