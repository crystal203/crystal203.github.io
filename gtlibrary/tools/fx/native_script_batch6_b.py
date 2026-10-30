"""Six dual weapon families: exact Lua recipes, with independent source clocks."""
import hashlib

def compile_batch6_b_plan(a,lua,path):
 n=a['Name']
 if n in ['CwpMsChromeManager','CwpLibrarianTaegeuk']:
  return dict(behavior='source-batch6-b',batch6Operation=n,category='cwp',id='cwp',label='专武技能',action=n,end=a.get('ActionDuration',.5),exclusive=True,sourceProjectilePools=True,source='native registered ARM64 '+n)
 if n in ['GaramSupport','RobotTankerSupport','PlitviceSupport','BasicSupport:FireBishop','BasicSupport:FlowerGirl']:
  return dict(behavior='source-batch6-b',batch6Operation=n,category='support',id='support',label='连锁技能',action=n,end=a.get('Duration',1),exclusive=False,clips=[],events=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,source='native source support contract '+n,sourceSha256=hashlib.sha256(str(a).encode()).hexdigest())
 if not lua:return None
 n=a['Name'];t=n.split(':')[0];cat='basic' if t.startswith('Manual') else 'role' if t.startswith('Role') else 'cwp' if t.startswith('Cwp') else 'support' if t=='BasicSupport' else None
 if not cat:return None
 exact=('Garam' if t=='CwpGaram' else t) if cat!='support' else a.get('LuaAddOn','')+'Support'
 if "newclass('"+exact+'BattleAction' not in lua and 'newclass("'+exact+'BattleAction' not in lua:return None
 allowed=['UptownLancerGirl','Garam','FireBishop','FlameCombat','FlowerGirl','Plitvice','RobotTanker','HeatBladeCombo','TacticalShield','Librarian','MsChrome']
 if not any(x in exact for x in allowed):return None
 p=dict(behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],action=n,end=a.get('ActionDuration',a.get('Duration',1)),exclusive=cat=='cwp',clips=[],events=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def e(k,at=0,**kw):return dict(op='effect',key=k,at=at,anchor=kw.pop('anchor','center'),nativePoolTransform='direct' if kw.get('directed')==False else 'directional',nativePoolLifetime=True,**kw)
 def c(k,at=0,**kw):return dict(key=k,at=at,**kw)
 def j(at=0,**kw):return dict(op='projectile',at=at,index=0,directional=True,nativePoolTransform='directional',**kw)
 def dynamic(op):p.update(behavior='source-batch6-b',batch6Operation=op);return p
 if t in ['ManualGaramBow','ManualGaramBasket','ManualGaram2','RoleGaram2','CwpGaram','CwpGaram2','ManualUptownLancerGirl','CwpUptownLancerGirl','CwpUptownLancerGirl2','ManualPlitvice','ManualPlitvice2','RolePlitvice2','CwpPlitvice2','ManualFlowerGirl','CwpFlowerGirl','CwpFlowerGirl2','ManualFlameCombat','CwpFireBishopFlameOfDestruction','ManualFireBishop2','ManualHeatBladeCombo','RoleTacticalShield','ManualRobotTanker2','RoleRobotTanker2','CwpRobotTanker2','ManualLibrarian','ManualLibrarian2','RoleLibrarian','CwpLibrarian2','ManualMsChrome','RoleMsChrome','CwpMsChrome']:
  return dynamic(t)
 if t=='ManualUptownLancerGirl2':
  kind=a['AttackType'];at=a['DashTiming'];p.update(clips=[c({'slash':'slash','spin':'walk','thrust':'thrust'}[kind],at)],moves=[dict(op='dash',at=at,duration=a['DashDuration'],speed=a['DashSpeed'])],events=[e(kind,at+a['DashDuration'] if kind=='slash' else at,follow=True,followSpine=True,fourWay=kind=='slash')]);return p
 if t=='RoleUptownLancerGirl2':p.update(clips=[c('action')],events=[e('thrust',a['AttackTiming'],offset=-1)])
 elif exact=='UptownLancerGirlSupport':return dynamic(exact)
 elif exact=='UptownLancerGirl2Support':p.update(clips=[c('cast',.2,track='Upper'),c('explosion',a['HitTiming'][0],track='Upper')],events=[e('cast',.2,directed=False),e('explosion',a['HitTiming'][0],anchor='targetGround',directed=False)])
 elif exact=='Garam2Support':return dynamic(exact)
 elif t=='RoleFireBishop2':p.update(clips=[c('action')],events=[e('cast',directed=False,follow=True,followSpine=True,triggerDisposeAt=p['end'])])
 elif t=='CwpFireBishop2':p.update(clips=[c('cast',fallbackKey='castfallback')],events=[e('cast',directed=False,follow=True,followSpine=True),e('screen',screen=True,directed=False),e('explosion',a['HitTiming'])])
 elif exact=='FireBishop2Support':return dynamic(exact)
 elif t=='ManualFlowerGirl2':
  kind=a['AttackType'];at=a['HitTiming'] if not isinstance(a['HitTiming'],list) else a['HitTiming'][0]
  p.update(clips=[c('cast',track='Upper' if kind in ['inhale','howl'] else 'Base')],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])] if 'DashTiming' in a else [],events=[e('cast',at,anchor='feet' if kind in ['inhale','howl'] else 'center',offset=a['Offset'],directed=kind not in ['inhale','howl'],follow=True,followSpine=True,triggerDisposeAt=p['end'])])
 elif exact=='FlowerGirl2Support':return dynamic(exact)
 elif exact=='Plitvice2Support':p.update(clips=[c('cast')],events=[e('cast',directed=False),e('summon',.2,anchor='targetGround',offsetVector=[0,4.5,2],directed=False),e('explosion',.8,anchor='targetGround',directed=False)])
 elif t=='ManualRobotTankerRifle':p.update(clips=[c('shoot',track='Upper')],events=[j(a['ShootTiming'],offset=.5)])
 elif t=='CwpRobotTankerPressureField':p.update(clips=[c('cwp',fallbackKey='cwpbackup')],events=[e('cast',directed=False,follow=True,followSpine=True),e('screen',screen=True,directed=False),e('field',a['AttackTiming'],anchor='targetGround',directed=False)],independentFieldEnd=a['AttackTiming']+a['Duration'])
 elif exact in ['RobotTanker2Support','LibrarianSupport','Librarian2Support','MsChromeSupport']:return dynamic(exact)
 else:return None
 if cat=='support':p.update(behavior='source-batch6-b',batch6Operation='support-timeline')
 return p
