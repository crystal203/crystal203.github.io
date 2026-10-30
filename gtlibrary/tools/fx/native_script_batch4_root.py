"""Source contracts for independent emitters, discrete finishers and held lasers."""
import hashlib

def compile_batch4_root_plan(a,lua,path):
 if not lua:return None
 n=a['Name'];cat='basic' if n.startswith('Manual') else 'support' if n.startswith('BasicSupport:') else 'role' if n.startswith('Role') else 'cwp' if n.startswith('Cwp') else None
 family=next((v for v in ['SeaWitch','DemonOperator','DemonEngineer','Watcher','StreamerGirl'] if v in n),None)
 if not cat or not family:return None
 p=dict(action=n,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),end=a.get('ActionDuration',a.get('Duration',1)),events=[],clips=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,recordProjectileHits=True)
 if cat=='cwp':p['exclusive']=True
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,nativePoolLifetime=True,nativePoolTransform='directional' if kw.get('directed') else 'direct',anchor='center',directed=False)|kw
 def clip(key,at=0,**kw):return dict(key=key,at=at)|kw
 if n=='ManualSeaWitch':
  p.update(behavior='source-batch3-discrete',discrete=dict(operation='projectile-melee-finisher',normalAnimations=['action1','action2'],normalShoot=0,normalOffset=.5,breakAnimation='break',breakEffect='break',breakEffectAt=a['HitTiming'][0],normalRecoil=dict(distance=.1,height=.1,duration=.05),breakRecoil=False,expireUsesHit=True,chanceOptionField='OptionId'))
 elif n in ['ManualWatcher','ManualDemonEngineer']:
  watcher=family=='Watcher';p.update(behavior='source-batch3-discrete',discrete=dict(operation='projectile-variant-finisher',normalAnimations=['normal' if watcher else 'cast'],normalShoot=a['ShootTiming'],normalOffset=a.get('Offset',.5),breakAnimation='break',breakShoot=a['BreakShootTiming'],breakIndices=[1,1],animationTrack='Base' if watcher else 'Upper',expireUsesHit=watcher,breakEndKeys=None if watcher else ['expire','expire'],breakEndOffset=0))
 elif n=='ManualSeaWitchTentacle':
  p.update(autonomous=True,targetRange=a['SearchRange'],masterRange=1e30,continuous=True,passiveEvents=[e('loop',anchor='feet',follow=True)])
  p['clips']=[clip('action')];p['events']=[dict(op='target-line',at=a['ShootTiming'],keys=['proj','trail'],impact='explosion',speed=a['Speed'],height=1.5,offset=.3,impactHeight=.1)]
 elif n.startswith('ManualWatcherTotem:'):
  p.update(autonomous=True,targetRange=a['SearchRange'],masterRange=1e30);p['clips']=[clip('cast',a['HitTiming'])];p['events']=[e('cast',a['HitTiming'],offset=a.get('Offset',0),directed=True,nativePoolTransform='directional')]
 elif n=='ManualDemonOperator':p.update(behavior='source-batch4-root',operation='charge-fixed-laser')
 elif n=='ManualStreamerGirl':p.update(behavior='source-batch4-root',operation='drone-held-laser')
 elif n=='RoleSeaWitch':p['clips']=[clip('action',track='Upper')];p['sourceBoundary']='Source heals and buffs existing summons; summon adapter owns tentacle bodies.'
 elif n=='RoleWatcher':p.update(summon=True,summonOffset=a['Offset'],summonDuration=a['SummonDuration'],independentFieldEnd=a['SummonDuration']);p['clips']=[clip('cast')]
 elif n=='RoleDemonOperator':p['events']=[e('buff',anchor='feet',height=.5,follow=True,followSpine=True)];p['sourceBoundary']='Ownership effect is created by matching BuffAddEvent, shield recipients are actual owner/party/summons only.'
 elif n=='RoleDemonEngineer':p.update(behavior='source-batch4-root',operation='healing-drone')
 elif n=='RoleStreamerGirl':p.update(behavior='source-batch4-root',operation='drone-role-fire')
 elif cat=='support':
  if family=='SeaWitch':p['clips']=[clip('action'),clip('action',track='Emotion')];p['events']=[e('cast',anchor='target'),e('explosion',a['HitTiming'],anchor='targetGround')]
  elif family=='DemonOperator':p['clips']=[clip('action')];p['events']=[e('screen',.1,screen=True),e('hacking',.1,anchor='target',triggerDisposeAt=a['HitTiming']),e('explosion',a['HitTiming'],anchor='target')]
  elif family=='Watcher':p['clips']=[clip('cast')];p['events']=[e('cast',anchor='feet'),e('explosion',a['FxExplosionTiming'],anchor='targetGround')]
  elif family=='DemonEngineer':p['clips']=[clip('cast')];p['events']=[e('cast'),e('explosion_rev',anchor='targetGround',negativeKey='explosion',directed=True,nativePoolTransform='directional',fourWay=True)]
  else:p.update(behavior='source-batch4-root',operation='three-dances')
 elif cat=='cwp':
  if family=='SeaWitch':p.update(behavior='source-batch4-root',operation='independent-linear-wave')
  elif family=='DemonOperator':p['clips']=[clip('action',fallbackKey='actionfallback')];p['events']=[e('cast',triggerDisposeAt=p['end']),e('fire',a['AttackTiming']),e('field',a['AttackTiming'],anchor='targetGround',maxDistance=a['AttackRange']),e('screen',a['AttackTiming'],screen=True)];p['independentFieldEnd']=a['AttackTiming']+a['HitDuration']
  elif family=='Watcher':p['clips']=[clip('cast',track='Upper')];p['events']=[e('cast',follow=True,followSpine=True),e('field',a['HitTiming'],anchor='feet',follow=True,triggerDisposeAt=a['HitTiming']+a['HitDuration']),e('screen',a['HitTiming'],screen=True)];p['independentFieldEnd']=a['HitTiming']+a['HitDuration']
  elif family=='StreamerGirl':p['sideDirection']=True;p['clips']=[clip('cast',fallbackKey='fallback')];p['spine']=[dict(at=0,height=1,duration=.35,aerialDuration=.07)];p['events']=[e('cast'),e('screen',screen=True),e('field',a['AttackTiming'],anchor='targetGround')];p['independentFieldEnd']=a['AttackTiming']+a['HitTiming'][-1]
  else:p.update(behavior='source-batch4-root',operation='elevated-cannon-laser')
 else:return None
 return p
