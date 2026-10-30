"""Batch five exact Lua class recipes; dynamic geometry uses source-batch5-a."""
import hashlib

def compile_batch5_a_plan(a,lua,path):
 if not lua:return None
 n=a['Name'];typ=n.split(':')[0];cat='basic' if typ.startswith('Manual') else 'role' if typ.startswith('Role') else 'cwp' if typ.startswith('Cwp') else 'support' if typ=='BasicSupport' else None
 if not cat:return None
 exact=typ if cat!='support' else a.get('LuaAddOn','')+'Support'
 if "newclass('"+exact+'BattleAction' not in lua and 'newclass("'+exact+'BattleAction' not in lua:return None
 if not any(t in exact for t in ['DemonCeo','DemonGovernor','DemonInspector','DemonPowergirl','DemonSlayer','GuardianAngel','HalfVampire','Parvati']):return None
 p=dict(behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],action=n,end=a.get('ActionDuration',a.get('Duration',1)),exclusive=cat=='cwp',clips=[],events=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def ev(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor=kw.pop('anchor','center'),nativePoolTransform='direct' if kw.get('directed')==False else 'directional',nativePoolLifetime=True,**kw)
 def clip(key,at=0,**kw):return dict(key=key,at=at,**kw)
 def proj(at,**kw):return dict(op='projectile',at=at,index=0,directional=True,nativePoolTransform='directional',**kw)
 def dyn(op):p.update(behavior='source-batch5-a',batch5Operation=op);return p
 if typ=='ManualDemonCeo':return dyn('ceo-basic')
 if typ=='RoleDemonCeo':p.update(clips=[clip('action')],events=[ev('cast',anchor='feet',directed=False,follow=True,followSpine=True),ev('explosion',a['ShootTiming'],anchor='targetGround',directed=False,maxDistance=a['AttackRange'])],independentFieldEnd=a['ShootTiming']+a['HitTiming'])
 elif typ=='CwpDemonCeo':return dyn('ceo-cwp')
 elif exact=='DemonCeoSupport':p.update(clips=[clip('action'),clip('action',track='Emotion')],events=[ev('cast',anchor='targetGround',directed=False),ev('fire',anchor='target',directed=False)])
 elif typ=='ManualDemonGovernor':
  if a['AttackType']=='proj':return dyn('governor-high-projectile')
  p.update(clips=[clip('shoot',track='Upper')],events=[proj(a['ShootTiming'],offset=.8,muzzleAtOwner=True)])
 elif typ=='RoleDemonGovernor':p.update(clips=[clip('cast',track='Upper')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('attack',a['AttackTiming'])])
 elif typ=='CwpDemonGovernor':p.update(clips=[clip('cast',track='Upper')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('screen',screen=True,directed=False),ev('explosion',a['AttackTiming'],anchor='targetGround',directed=False,maxDistance=a['AttackRange'])],independentFieldEnd=a['AttackTiming']+a['HitTiming'][-1])
 elif exact=='DemonGovernorSupport':return dyn('governor-agents')
 elif typ=='ManualDemonInspector':p.update(clips=[clip('attack')],events=[ev('attack',a['AttackTiming'],anchor='feet' if a['AttackType']=='strike' else 'center')],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])])
 elif typ=='RoleDemonInspector':return dyn('inspector-hook')
 elif typ=='CwpDemonInspector':p.update(clips=[clip('cast',fallbackKey='castfallback',track='Upper')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('screen',screen=True,directed=False),ev('aoe',a['HitTiming'][0],anchor='feet',directed=False,follow=True)])
 elif exact=='DemonInspectorSupport':p.update(clips=[clip('cast')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('chain',a['HitTiming'][0],anchor='targetGround',directed=False),ev('explosion',a['HitTiming'][-1],anchor='targetGround',directed=False)])
 elif typ=='ManualDemonPowergirl':return dyn('powergirl-basic')
 elif typ=='RoleDemonPowergirl':return dyn('powergirl-rock')
 elif typ=='CwpDemonPowergirl':p.update(optionParameterSource='active-non-special-option',clips=[clip('cast'),clip('jump',a['DashTiming']),clip('land',a['DashTiming']+a['DashDuration']*.5)],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('trail',directed=False,follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration']),ev('jump',a['DashTiming'],anchor='feet',directed=False),ev('explosion',a['AttackTiming'],anchor='feet',directed=False),ev('screen',a['AttackTiming'],screen=True,directed=False)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])],spine=[dict(at=a['DashTiming'],duration=a['DashDuration'],height=3,aerialDuration=.1)])
 elif exact=='DemonPowergirlSupport':return dyn('powergirl-rush-return')
 elif typ=='ManualDemonSlayer':return dyn('slayer-basic')
 elif typ=='CwpDemonSlayer':p.update(clips=[clip('cast'),clip('ready',a['AttackTiming'])],events=[ev('ready',directed=False),ev('cast',anchor='target',directed=False),ev('screen',a['AttackTiming'],screen=True,directed=False),ev('explosion',a['AttackTiming'],anchor='targetGround',directed=False)],independentFieldEnd=a['AttackTiming']+a['HitDuration'])
 elif typ=='RoleDemonSlayer':return dyn('slayer-spheres')
 elif exact=='DemonSlayerSupport':return dyn('slayer-wave')
 elif typ=='ManualGuardianAngel':return dyn('angel-basic')
 elif typ=='RoleGuardianAngel':return dyn('angel-transform')
 elif typ=='CwpGuardianAngel':p.update(clips=[clip('cast',fallbackKey='castfallback'),clip('cast',track='Emotion')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('screen',screen=True,directed=False),ev('explosion',a['SyncTiming'],anchor='targetGround',maxDistance=a['AttackRange'],directed=False)],spine=[dict(at=0,duration=a['ActionDuration'],height=1,aerialDuration=.2)],independentFieldEnd=a['SyncTiming']+a['HitTiming'][-1])
 elif exact=='GuardianAngelSupport':return dyn('angel-jump-strike-return')
 elif typ=='ManualHalfVampire':return dyn('halfvampire-basic')
 elif typ=='RoleHalfVampire':return dyn('halfvampire-transform')
 elif typ=='CwpHalfVampire':p.update(clips=[clip('action',fallbackKey='actionbackup')],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('screen',screen=True,directed=False),ev('fire',a['HitTiming'][0],anchor='targetGround',maxDistance=a['AttackRange'],directed=False),ev('explosion',a['HitTiming'][-1],anchor='targetGround',maxDistance=a['AttackRange'],directed=False)])
 elif exact=='HalfVampireSupport':return dyn('halfvampire-blink-laser')
 elif typ=='ManualParvati':return dyn('parvati-basic')
 elif typ=='RoleParvati':return dyn('parvati-wire')
 elif typ=='CwpParvati':return dyn('parvati-cwp-projectile')
 elif exact=='ParvatiSupport':p.update(clips=[clip('action')],events=[ev('cast',directed=False),ev('hit',a['HitTiming'][0],directed=False),ev('dash',.8,directed=False),ev('dash',1,directed=False)],moves=[dict(op='lerp',at=.17,duration=0,to='target'),dict(op='lerp',at=.9,duration=.1,to='origin')],alpha=[dict(at=0,**{"from":1},value=0,duration=.03),dict(at=a['HitTiming'][0],**{"from":0},value=1,duration=.03),dict(at=.8,**{"from":1},value=0,duration=.03),dict(at=1,**{"from":0},value=1,duration=.03)])
 else:return None
 return p
