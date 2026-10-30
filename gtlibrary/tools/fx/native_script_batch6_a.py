"""Exact Lua recipes for the six batch-six-A families."""
import hashlib

def compile_batch6_a_plan(a,lua,path):
 if not lua:return None
 typ=a['Name'].split(':')[0];cat='basic' if typ.startswith('Manual') else 'role' if typ.startswith('Role') else 'cwp' if typ.startswith('Cwp') else 'support' if typ=='BasicSupport' else None
 if not cat:return None
 exact=typ if cat!='support' else a.get('LuaAddOn','')+'Support'
 if exact not in ['ManualExorcistGirl','RoleExorcistGirl','CwpExorcistGirl','ExorcistGirlSupport','ManualSummerAmy','RoleSummerAmy','CwpSummerAmy','SummerAmySupport','ManualSummerShapira','RoleSummerShapira','CwpSummerShapira','SummerShapiraSupport','ManualValentineAmerisSlash','ManualValentineAmerisArc','ManualValentineAmerisExtra','RoleValentineAmeris','CwpValentineAmeris','ValentineAmerisSupport','ManualKunoichi','RoleKunoichi','CwpKunoichi','KunoichiSupport','ManualFuturePrincess','RoleFuturePrincess','CwpFuturePrincess','FuturePrincessSupport','ManualInnuit','RoleInnuitAscent','CwpInnuit','ManualVampireNoble','RoleVampireNobleAscent','CwpVampireNoble','VampireNobleSupport','ManualRedhoodAscent','RoleRedhoodAscent']:return None
 if "newclass('"+exact+"BattleAction'" not in lua and 'newclass("'+exact+'BattleAction"' not in lua:return None
 p=dict(behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],action=a['Name'],end=a.get('ActionDuration',a.get('Duration',1)),exclusive=cat=='cwp',clips=[],events=[],moves=[],spine=[],meleeTimeline=True,sourceProjectilePools=True,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 def ev(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor=kw.pop('anchor','center'),nativePoolTransform='direct' if kw.get('directed')==False else 'directional',nativePoolLifetime=True,**kw)
 def clip(key,at=0,**kw):return dict(key=key,at=at,**kw)
 def dyn(op):p.update(behavior='source-batch6-a',batch6Operation=op);return p
 def dash(at=None):return dict(op='dash',at=a.get('DashTiming',0) if at is None else at,duration=a['DashDuration'],speed=a['DashSpeed'])
 if typ=='ManualInnuit':
  p.update(staminaCost=a['StaminaPerAction'],clips=[clip('cast',track='Upper'),clip('shoot',a['ShootTiming'],track='Upper')],events=[ev('cast',offset=a['ShootOffset'],follow=True,triggerDisposeAt=a['ShootTiming']),dict(op='projectile',at=a['ShootTiming'],index=0,offset=a['ShootOffset'],directional=True,nativePoolTransform='directional')],breakClips=[clip('breakcast',track='Upper'),clip('breakcast',track='Emotion')],breakEvents=[ev('breakcast',anchor='feet',directed=False,follow=True),ev('break',a['ShootTiming'],anchor='feet')],nativeRecoils=[dict(at=a['ShootTiming'],duration=.2,distance=.2,height=.1,angle=0)])
  if a.get('RoleAction'):return dyn('innuit-basic')
 elif typ=='RoleInnuitAscent':return dyn('innuit-role')
 elif typ=='CwpInnuit':return dyn('innuit-cwp')
 elif typ=='ManualVampireNoble':p['autonomous']=a['Name'].endswith(':White');p['targetRange']=7;p['masterRange']=100;return dyn('vampire-bats')
 elif typ=='RoleVampireNobleAscent':p.update(clips=[],summon=True,sourceSilent=True)
 elif typ=='CwpVampireNoble':return dyn('vampire-cwp')
 elif exact=='VampireNobleSupport':return dyn('vampire-support')
 elif typ=='ManualRedhoodAscent':return dyn('redhood-ascent')
 elif typ=='RoleRedhoodAscent':return dyn('redhood-role')
 elif typ=='ManualExorcistGirl':
  if a['AttackType']=='extra':return dyn('exorcist-extra')
  p.update(clips=[clip('cast')],moves=[dash()],events=[ev('cast',a['AttackTiming']-.02,follow=True,triggerDisposeAt=a['ActionDuration'])])
 elif typ=='RoleExorcistGirl':p.update(clips=[clip('cast')],sourceSilent=True)
 elif typ=='CwpExorcistGirl':return dyn('exorcist-cwp')
 elif exact=='ExorcistGirlSupport':return dyn('exorcist-support')
 elif typ=='ManualSummerAmy':return dyn('amy-basic')
 elif typ=='RoleSummerAmy':return dyn('amy-transform')
 elif typ=='CwpSummerAmy':p.update(clips=[clip('cast'),clip('throw',a['ShootTiming']-.2,track='Upper')],events=[ev('cast',fourWay=True),ev('screen',a['ShootTiming'],screen=True,directed=False),dict(op='projectile',at=a['ShootTiming'],index=0,directional=True,offset=0,impact='field',nativePoolTransform='directional')],recordProjectileHits=True,independentFieldEnd=a['ShootTiming']+a['FieldDuration']+1)
 elif exact=='SummerAmySupport':return dyn('amy-support')
 elif typ=='ManualSummerShapira':return dyn('shapira-basic')
 elif typ=='RoleSummerShapira':p.update(clips=[clip('cast')],moves=[dash()],spine=[dict(at=a['DashTiming'],duration=a['JumpDuration'],height=a['JumpHeight'],aerialDuration=a['AerialDuration'])],events=[ev('trail',a['DashTiming'],directed=False,follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration']),ev('jump',a['DashTiming'],anchor='feet',directed=False),ev('explosion',a['HitTiming'],anchor='feet',directed=False)])
 elif typ=='CwpSummerShapira':return dyn('shapira-cwp')
 elif exact=='SummerShapiraSupport':return dyn('shapira-support')
 elif typ=='ManualValentineAmerisSlash':p.update(clips=[clip('cast')],moves=[dash()],events=[ev('cast',a['AttackTiming'],follow=True,triggerDisposeAt=a['ActionDuration'])])
 elif typ=='ManualValentineAmerisArc':p.update(clips=[clip('cast')],events=[ev('cast',a['AttackTiming'],follow=True)])
 elif typ=='ManualValentineAmerisExtra':return dyn('ameris-extra')
 elif typ=='RoleValentineAmeris':return dyn('ameris-role')
 elif typ=='CwpValentineAmeris':return dyn('ameris-cwp')
 elif exact=='ValentineAmerisSupport':p.update(clips=[clip('cast')],events=[ev('fire',directed=False),ev('explosion',a['HitTiming'][0],anchor='target',directed=False)])
 elif typ=='ManualKunoichi':return dyn('kunoichi-basic')
 elif typ=='RoleKunoichi':return dyn('kunoichi-role')
 elif typ=='CwpKunoichi':p.update(clips=[clip('cast'),clip('fire',a['AttackTiming'])],events=[ev('cast',directed=False,follow=True,followSpine=True),ev('screen',a['AttackTiming'],screen=True,directed=False),dict(op='projectile',at=a['AttackTiming'],index=0,directional=True,offset=0,impact='explosion',nativePoolTransform='directional')],independentFieldEnd=a['AttackTiming']+a['HitTiming'][-1]+1)
 elif exact=='KunoichiSupport':return dyn('kunoichi-support')
 elif typ=='ManualFuturePrincess':
  kind=a['AttackType']
  if kind=='magic':return dyn('princess-magic')
  if kind=='stomp':p.update(clips=[clip('action',track='Upper')],moves=[dash(0)],events=[ev('stomp',a['HitTiming'],offset=a['Offset'],directed=False)])
  elif kind=='thrust':return dyn('princess-thrust')
  else:p.update(clips=[clip('slash',track='Upper')],moves=[dash(a['HitTiming'])],events=[ev('slash',a['HitTiming']-.02,offset=.2,fourWay=True,follow=True,followSpine=True)])
 elif typ=='RoleFuturePrincess':p.update(clips=[clip('cast',track='Upper'),clip('cast',track='Emotion')],events=[ev('range',anchor='feet',directed=False,follow=True,followSpine=True)])
 elif typ=='CwpFuturePrincess':return dyn('princess-cwp')
 elif exact=='FuturePrincessSupport':p.update(animationArrays=True,spine=[dict(at=0,duration=a['JumpDuration'],height=a['JumpHeight'],aerialDuration=a['AerialDuration'])],events=[ev('wing',anchor='feet',directed=False,follow=True,followSpine=True,triggerDisposeAt=p['end']),ev('barrier',a['BarrierTiming'],directed=False,follow=True,followSpine=True)])
 else:return None
 return p
