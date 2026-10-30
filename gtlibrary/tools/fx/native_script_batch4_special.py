"""Exact source timelines for batch four's transformation and independent-field actors."""
import hashlib

def compile_batch4_special_plan(a,lua,path):
 if not lua:return None
 classes=('ManualHeroAi','CwpHeroAi','HeroAiSupport','ManualWhiteDruid','RoleWhiteDruid','CwpWhiteDruid','WhiteDruidSupport','ManualNinjaLeader','RoleNinjaLeader','CwpNinjaLeader','NinjaLeaderSupport','ManualJadeShaman','RoleJadeShaman','CwpJadeShaman','JadeShamanSupport','ManualJadeSpirit','ManualPartyMadPandaBoss','ManualPartyMadPandaMan','ManualPartyMadPandaPanda','RolePartyMadPanda','CwpPartyMadPanda','PartyMadPandaSupport')
 if not any("newclass('"+c+"BattleAction')" in lua for c in classes):return None
 n=a['Name'];cat='basic' if n.startswith('Manual') else 'role' if n.startswith('Role') else 'support' if n.startswith('BasicSupport:') else 'cwp' if n.startswith('Cwp') else None
 if not cat:return None
 p=dict(action=n,behavior='timeline',category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[cat],end=a.get('ActionDuration',a.get('Duration',1)),meleeTimeline=True,events=[],clips=[],moves=[],spine=[],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
 if cat=='cwp':p['exclusive']=True
 def e(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor='center',directed=False,nativePoolLifetime=True,nativePoolTransform='direct')|kw
 def dash():p['moves']=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])]
 if 'self.spin_fx = battle_util.instantiate_effect(self.action, attack_key' in lua:
  dash();p['clips']=[dict(key='attack',at=0)];k=a['AttackType']
  if k=='thrust':p['clips'].append(dict(key='dash',at=a['DashTiming']));p['events']=[e('attack',a['AttackTiming'],follow=True,followSpine=True)]
  elif k=='spin':
   p['spine']=[dict(at=a['DashTiming'],height=1.5,duration=a['ActionDuration']-a['DashTiming'],aerialDuration=a['ActionDuration']-a['DashTiming']-.1)];p['events']=[e('attack',a['HitTiming'][0],follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration'],directionKeys={'left':'attackrev','right':'attack','front':'attackrev','back':'attackrev'}),e('trail',a['HitTiming'][0],follow=True,followSpine=True,triggerDisposeAt=a['ActionDuration'])]
  else:p['events']=[e('attack',a['HitTiming'],anchor='feet',offset=a['Offset'])]
  return p
 if "battle_util.instantiate_effect(self, 'sword', self.target_pos)" in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',anchor='feet'),e('sword',anchor='targetGround'),e('field',a['HitTiming'][0],anchor='targetGround'),e('explosion',a['HitTiming'][-1],anchor='targetGround')];return p
 if 'self.first_hit_timing' in lua and "battle_util.instantiate_effect(self.action, 'explosion', self.target_pos)" in lua:
  p['clips']=[dict(key='cast',at=0)];p['events']=[e('cast',follow=True,followSpine=True),e('explosion',a['HitTiming'][0],anchor='targetGround',maxDistance=a['AttackRange']),e('screen',a['HitTiming'][0],screen=True)];p['independentFieldEnd']=a['HitTiming'][-1];return p
 if 'self.on_boost and self.tiger_speed' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'tiger-combo'});return p
 if "self.origin_skin_name = owner_spine.SkinName" in lua and "self.form_weapon_slot" in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'tiger-transform'});return p
 if "character_util.jump(self.owner, 2.5, self.dash_duration)" in lua:
  dash();p['clips']=[dict(key='action',at=0)];p['spine']=[dict(at=a['DashTiming'],duration=a['DashDuration'],height=2.5)];p['events']=[e('cast',follow=True,followSpine=True),e('jump',a['DashTiming'],anchor='feet'),e('explosion',a['AttackTiming'],anchor='feet',offset=a['Offset'],directionKeys={'right':'rexplosion','left':'explosion','front':'explosion','back':'explosion'}),e('screen',a['AttackTiming'],screen=True)];p['independentFieldEnd']=a['AttackTiming']+a['HitTiming'][-1];return p
 if 'local distance = 4' in lua and 'self.start_pos = self.target_pos + distance * -self.dir_vector' in lua:
  p['clips']=[dict(key='action',at=0,end=.3),dict(key='dash',at=.3,end=.6)];p['moves']=[dict(op='lerp',at=0,duration=.3,to='target',offset=-4),dict(op='lerp',at=.3,duration=.15,to='target',offset=-1),dict(op='lerp',at=.6,duration=.2,to='origin')];p['spine']=[dict(at=0,height=1,duration=.3),dict(at=.6,height=.7,duration=.3)];p['events']=[e('dash',.3,follow=True,followSpine=True,triggerDisposeAt=.6),e('hit',a['HitTiming'],anchor='target',directionKeys={'right':'rev','left':'hit','front':'rev','back':'rev'})];return p
 if 'self.attack_type == self.action_type.backslash' in lua and "self.option_debuff" in lua:
  pass
 if 'self.attack_type == self.action_type.backslash' in lua and n.startswith('Manual') and all(k in a for k in ('DashTiming','DashDuration','DashSpeed','AttackType')):
  dash();p['clips']=[dict(key='attack',at=0)];p['events']=[e('dash' if a['AttackType']=='thrust' else 'slash',.07 if a['AttackType']=='thrust' else .19,directed=True,nativePoolTransform='directional',offset=1 if a['AttackType']=='thrust' else 0,follow=a['AttackType']=='thrust',followSpine=a['AttackType']=='thrust')];return p
 if 'self.shoot_count = 5' in lua and a.get('AttackType') in ('slash','kunai','thrust'):
  dash();p['clips']=[dict(key='attack',at=0)];k=a['AttackType']
  if k=='slash':p['events']=[e('slash',a['AttackTiming'],directed=True,nativePoolTransform='directional')]
  elif k=='kunai':p['events']=[dict(op='projectile',at=a['AttackTiming']+.05,index=0,offset=.5,originAngle=-a['Angle']/2+a['Angle']*i/4,directionAngle=-a['Angle']/2+a['Angle']*i/4,directional=True) for i in range(5)];p['sourceProjectilePools']=True
  else:
   p['clips'] += [dict(key='explosion',at=a['AttackDuration']),dict(key='cast',at=a['AttackDuration'],track='Emotion')];p['events']=[e('dash',a['DashTiming'],directed=True,nativePoolTransform='directional',follow=True,followSpine=True),e('sign',a['AttackTiming'],anchor='target'),e('explosion',a['BombTiming'],anchor='target')]
  return p
 if cat=='role' and 'damage_info.stun_duration = 0.4' in lua and "'slash'" in lua:
  dash();p['clips']=[dict(key='attack',at=0)];p['events']=[e('slash',a['AttackTiming'],directed=True,nativePoolTransform='directional')];return p
 if 'self.return_duration = self.flying_duration / 2' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'triple-return-shuriken'});return p
 if cat=='support' and 'self.mirage_start_pos_1' in lua and 'self.jump_height = 5.2' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'mirage-dash-drop'});return p
 if cat=='cwp' and 'slash_info.timer = 0.2' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'random-twin-slash'});return p
 if cat=='support' and "self.fx_summon_spine = battle_util.instantiate_effect" in lua and 'vector_util.up * 6' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'jade-drop'});return p
 if cat=='role' and 'self.action:on_summon' in lua:
  p['clips']=[dict(key='transform',at=0,track='Sub')];p['sourceBoundary']='Role manages the source summon; summoner adapter owns its autonomous actor.';return p
 if cat=='basic' and "newclass('ManualPartyMadPandaBossBattleAction')" in lua and all(k in a for k in ('Offset','ActionDuration','ActionDurationMeta','ShootTiming')):
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'whip-and-mech-mace'});return p
 if cat=='basic' and "newclass('ManualPartyMadPandaPandaBattleAction')" in lua and all(k in a for k in ('ShootTiming','ActionDuration','ProjectileInfo')):
  p['clips']=[dict(key='shoot',at=0,track='Upper')];p['events']=[dict(op='projectile',index=0,at=a['ShootTiming'],offset=.5,directional=True)];p['sourceProjectilePools']=True;p['continuous']=True;return p
 if cat=='basic' and "self.dash_fx = battle_util.instantiate_effect" in lua and a.get('CwpWeaponName'):
  dash();p['clips']=[dict(key='attack',at=a['DashTiming'],track='Upper')];p['events']=[e('dash',a['DashTiming'],offset=1.2,directed=True,nativePoolTransform='directional',follow=True,triggerDisposeAt=a['ActionDuration'])];return p
 if cat=='role' and "new_spine_controller.SkinName = 'party_mad_panda_mech_3'" in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'mech-transform'});return p
 if cat=='cwp' and 'self.mech_init_height = 10' in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'mech-orbit'});return p
 if cat=='support' and "buff_util.apply_buff(self.owner, self.owner, 'buff_party_mad_panda_role'" in lua:
  p.update(behavior='source-batch4-special',sourceSpecial={'operation':'mech-support-dash'});return p

 if cat=='role' and 'function action_state_class:on_summon_event(e)' in lua and "battle_util.set_sub_anim(self.action, self.cs_action, 'transform')" in lua:
  p['summon']=True;p['clips']=[dict(key='transform',at=0)];return p
 if cat=='basic' and "self.attack_timing + 0.2" in lua and 'self.shoot_helper[1]' in lua and 'AIBuffName' in a:
  p['clips']=[dict(key='attack',at=0)];p['events']=[dict(op='projectile',index=0,at=a['AttackTiming'],offset=0,directional=True),e('slash',a['AttackTiming']+.2,offset=.4,directed=True,nativePoolTransform='directional')];p['sourceProjectilePools']=True;return p
 if cat=='basic' and "self.attack_timing + 0.2" in lua and 'self.shoot_helper[1]' in lua and a.get('AttackType')=='backslash':
  p['clips']=[dict(key='attack',at=0)];p['events']=[dict(op='projectile',index=0,at=a['AttackTiming'],offset=0,directional=True),e('slash',a['AttackTiming']+.2,offset=.4,directed=True,nativePoolTransform='directional')];p['sourceProjectilePools']=True;return p

 return None






