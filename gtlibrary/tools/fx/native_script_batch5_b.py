"""Exact Lua action recipes for the fifth batch's collaboration heroes."""
import hashlib,re
from pathlib import Path

def compile_batch5_b_plan(a,lua,path):
 n=a['Name'];cat='basic' if n.startswith('Manual') else 'support' if n.startswith('BasicSupport:') else 'cwp' if n.startswith('Cwp') else 'role' if n.startswith('Role') else None
 if not cat:return None
 if cat=='support' and a.get('LuaAddOn') in ['Lina','Maam','PlagueDoctor','Shuran','SlimeMilim','SlimeRimuru','Xellos']:
  path=(Path(path).parent if Path(path).parent.name=='Support' else Path(path).parent/'Support')/(a['LuaAddOn']+'SupportBattleAction.lua');lua=path.read_text(encoding='utf8')
 if not lua:return None
 cls=re.search(r"newclass\('([^']+)'\)",lua)
 if not cls:return None
 cls=cls[1]
 if not any(cls==(prefix+hero+'BattleAction') for hero in ['Lina','Maam','PlagueDoctor','Shuran','SlimeMilim','SlimeRimuru','Xellos'] for prefix in ['Manual','Role','Cwp']) and cls not in [h+'SupportBattleAction' for h in ['Lina','Maam','PlagueDoctor','Shuran','SlimeMilim','SlimeRimuru','Xellos']]:return None
 p=dict(action=n,category=cat,id=cat,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能','role':'职业技能'}[cat],end=a.get('ActionDuration',a.get('Duration',1)),exclusive=cat=='cwp',behavior='timeline',meleeTimeline=True,sourceProjectilePools=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor=kw.pop('anchor','center'),nativePoolLifetime=True,nativePoolTransform='direct' if kw.get('directed')==False else 'directional',**kw)
 def c(key,at=0,**kw):return dict(key=key,at=at,**kw)
 def shot(at,**kw):return dict(op='projectile',at=at,directional=True,nativePoolTransform='directional',**kw)
 def dash(at=None,**kw):return dict(op='dash',at=a.get('DashTiming',0) if at is None else at,duration=a['DashDuration'],speed=a['DashSpeed'],**kw)
 def dyn(op):p.update(behavior='source-batch5-b',operation=op);return p
 if cls=='ManualLinaBattleAction':
  p.update(clips=[c('action',track='Upper')],events=[shot(a['ShootTiming'],offset=.2 if a['AttackType']=='brass' else .5,homing=a['AttackType']=='brass')])
 elif cls=='RoleLinaBattleAction':
  p.update(clips=[c('action',track='Upper')],events=[e('cast',anchor='feet',directed=False,follow=True,followSpine=True,triggerDisposeAt=a['ShootTiming']),dict(op='target-line',at=a['ShootTiming'],height=1.5,keys=['proj','trail'],speed=a['Speed'],impact='explosion',impactHeight=.1)],optionParameterSource='active-non-special-option')
 elif cls=='CwpLinaBattleAction':
  p.update(clips=[c('action',fallbackKey='actionbackup')],events=[e('cast',anchor='feet',directed=False,follow=True,followSpine=True),e('blade',anchor='feet',directed=False,follow=True,followSpine=True,triggerDisposeAt=p['end'],link=dict(weaponAttachment=True)),e('explosion',a['AttackTiming'],anchor='feet',offset=1),e('screen',a['AttackTiming'],screen=True,directed=False)],spine=[dict(at=.25,height=2,duration=.45,aerialDuration=.35)],independentFieldEnd=a['AttackTiming']+a['HitDuration'])
 elif cls=='LinaSupportBattleAction':return dyn('lina-support')
 elif cls=='ManualMaamBattleAction':
  if a['AttackType']=='rush':p.update(clips=[c('attack' if i%2==0 else 'attackrev',t) for i,t in enumerate(a['HitTiming'])],events=[e('attack',a['HitTiming'][0],follow=True,triggerDisposeAt=p['end'])])
  else:p.update(clips=[c('cast'),c('attack',a['DashTiming'])],events=[e('attack',a['AttackTiming'],negativeKey='attackrev' if a['AttackType']=='punch' else 'attack',follow=True,followSpine=True)],moves=[dash()])
 elif cls=='RoleMaamBattleAction':p.update(clips=[c('dash')],events=[e('cast',directed=False,follow=True,followSpine=True),e('heal',a['HealTiming'],directed=False,follow=True,followSpine=True)])
 elif cls=='CwpMaamBattleAction':p.update(clips=[c('cast'),c('dash',a['DashTiming'])],events=[e('cast',directed=False,follow=True,followSpine=True),e('tiger',.2,directed=False),e('screen',.2,screen=True,directed=False),e('attack',a['HitTiming'][0])],moves=[dash()])
 elif cls=='MaamSupportBattleAction':return dyn('maam-support')
 elif cls=='ManualPlagueDoctorBattleAction':
  typ=a['AttackType'];p['clips']=[c('attack')]
  if typ.startswith('slash'):p.update(events=[e(typ,.05,follow=True,followSpine=True),shot(a['ShootTiming'],offset=a['Offset'],muzzle=False)],moves=[dash()],optionParameterSource='active-non-special-option')
  elif typ=='stab':p.update(events=[e('stab',a['HitTiming'],follow=True,followSpine=True)],moves=[dash()])
  else:p['events']=[e('thunder',a['HitTiming'],anchor='targetGround',directed=False,maxDistance=a['AttackRange'])]
 elif cls=='RolePlagueDoctorBattleAction':return None
 elif cls=='CwpPlagueDoctorBattleAction':return dyn('plague-field')
 elif cls=='PlagueDoctorSupportBattleAction':p.update(clips=[c('cast'),c('explosion',a['HitTiming'][-1])],events=[e('moon',anchor='target',directed=False,triggerDisposeAt=a['HitTiming'][-1]),e('explosion',a['HitTiming'][-1],anchor='target',directed=False)])
 elif cls=='ManualSlimeRimuruBattleAction':
  keys={k for row in a.get('PresetInfo',[]) for k in row};p.update(clips=[c('cast'),c('attack',a['AttackTiming'])],moves=[dash()],events=([e('cast',directed=False,follow=True,followSpine=True)] if 'cast' in keys else [])+[e('attack',a['AttackTiming'],follow=True,followSpine=True)]+([e('wave',a['AttackTiming'],anchor='feet')] if 'wave' in keys else []))
 elif cls=='RoleSlimeRimuruBattleAction':p.update(clips=[c('cast'),c('attack',a['AttackTiming'])],events=[e('dash',a['DashTiming'],follow=True,followSpine=True),e('attack',a['AttackTiming'],follow=True,followSpine=True)],moves=[dash(free=True)],alpha=[dict(at=0,from_=1,value=0,duration=.03),dict(at=a['DashDuration'],from_=0,value=1,duration=.03)])
 elif cls=='CwpSlimeRimuruBattleAction':p.update(clips=[c('cast',fallbackKey='castfallback')],events=[e('cast',directed=False,follow=True,followSpine=True),e('screen',screen=True,directed=False),e('attack',a['HitTiming'][0],follow=True,triggerDisposeAt=a['HitTiming'][-1])])
 elif cls=='SlimeRimuruSupportBattleAction':p.update(clips=[c('cast')],events=[e('aoe',anchor='targetGround',directed=False)])
 elif cls=='ManualShuranBattleAction':
  typ=a['AttackType'];at=a['AttackTiming'];p['clips']=[c('attack')]
  if typ=='backjump':return dyn('shuran-backjump')
  p.update(moves=[dash()],events=[e('stomp',at,anchor='feet',directed=False)] if typ=='stomp' else [e('dash',at)] if typ=='dash' else [e('bodycheck',a['DashTiming'],follow=True,followSpine=True),e('hit',at)])
 elif cls=='RoleShuranBattleAction':return dyn('shuran-pill')
 elif cls=='CwpShuranBattleAction':p.update(clips=[c('cast')],events=[e('screen',screen=True,directed=False),e('cast',offset=a['Offset'],follow=True,followSpine=True,triggerDisposeAt=p['end']),shot(a['ShootTiming'],offset=a['Offset'],muzzle=False,impact='explosion')],moves=[dash(a['ShootTiming'],sign=-1)])
 elif cls=='ShuranSupportBattleAction':p.update(sideDirection=True,clips=[c('ducking'),c('uppercut',.15),c('back',.6)],events=[e('cast',anchor='origin'),e('slashup',.3,negativeKey='slashup_rev',anchor='feet',directed=False)],moves=[dict(op='lerp',at=0,duration=.1,to='target',offset=-.5),dict(op='lerp',at=.6,duration=.5,to='origin')],spine=[dict(at=.35,height=4,duration=.75,aerialDuration=.1)],alpha=[dict(at=0,from_=1,value=0,duration=.03),dict(at=.1,from_=0,value=1,duration=.2)])
 elif cls=='ManualSlimeMilimBattleAction':
  p['clips']=[c('cast',track='Upper')]
  if a['AttackType']=='shoot':p['events']=[e('cast',a['AttackTiming'],offset=a['OffsetX'],follow=True,followSpine=True),shot(a['AttackTiming'],offset=a['OffsetX'],muzzle=False)]
  elif a['AttackType']=='throw':return dyn('milim-throw')
  else:p['events']=[e('explosion',a['AttackTiming'],anchor='targetGround',directed=False,maxDistance=a['AttackRange'])]
 elif cls=='RoleSlimeMilimBattleAction':return dyn('milim-kick')
 elif cls=='CwpSlimeMilimBattleAction':p.update(clips=[c('dash',fallbackKey='dashfallback'),c('cast',a['ExplosionTiming']),c('cast',a['ExplosionTiming'],track='Emotion')],events=[e('screen',screen=True,directed=False),e('cast',a['CastTiming'],directed=False,follow=True,followSpine=True),e('explosion',a['ExplosionTiming'],anchor='feet',directed=False,follow=True,triggerDisposeAt=p['end'])],moves=[dash()])
 elif cls=='SlimeMilimSupportBattleAction':return dyn('milim-support')
 elif cls=='ManualXellosBattleAction':return dyn('xellos-projectiles')
 elif cls=='RoleXellosBattleAction':return dyn('xellos-blink')
 elif cls=='CwpXellosBattleAction':return dyn('xellos-cwp')
 elif cls=='XellosSupportBattleAction':p.update(clips=[c('action'),c('action',.05),c('explosion',.4)],events=[e('blink',anchor='feet',directed=False),e('cast',.23,anchor='feet',directed=False),e('explosion',.4,anchor='feet',directed=False)],moves=[dict(op='lerp',at=0,duration=.05,to='target',offset=-1.5)],alpha=[dict(at=0,from_=1,value=0,duration=.01),dict(at=.05,from_=0,value=1,duration=.03)])
 else:return None
 for x in p.get('alpha',[]):
  if 'from_' in x:x['from']=x.pop('from_')
 return p
