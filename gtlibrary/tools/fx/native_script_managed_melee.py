"""Lua source idioms for buff-selected melee cycles and their skill choreography."""
import hashlib

def compile_managed_melee_plan(a,lua,path):
    f=lambda key,*default:['field',key,*default]
    ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,**kw)
    anim=lambda key,at=0,**kw:dict(key=key,at=at,**kw)
    n=a['Name'];category='basic' if n.startswith('Manual') else 'role' if n.startswith('Role') else 'support' if n.startswith('BasicSupport:') else 'cwp' if n.startswith('Cwp') else None
    if not category:return None
    plan=dict(behavior='timeline',category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=n,exclusive=category=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),clips=[],moves=[],spine=[],events=[],meleeTimeline=True)
    if category=='basic' and 'self.action_type.extra' in lua and 'DashSpeedMultiplier' in lua and 'self:update_stomp' in lua:
        kind=a['AttackType'];at=a.get('AttackTiming',a.get('HitTiming',a['DashTiming']))
        plan.update(clips=[anim('dash',f('DashTiming'))],moves=[dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=['mul',f('DashSpeed'),f('DashSpeedMultiplier',1)],stopOffset=0)],
                    events=[ev('dash',f('DashTiming'),optional=True,follow=True,followSpine=True),ev('attack',at,follow=kind!='stomp',followSpine=kind!='stomp',anchor='feet' if kind=='stomp' else 'center',offset=f('Offset') if kind=='stomp' else 0)])
        if kind=='stomp':
            plan['spine']=[dict(at=f('DashTiming'),height=1,duration=f('DashDuration'),aerialDuration=['mul',f('DashDuration'),.6])]
            plan['events'].append(ev('slash',at,anchor='feet',offset=f('Offset')))
    elif category=='role' and 'self.buff_info' in lua and 'self.special_buff_info' in lua and 'katana_batto_ready' in str(a.get('AnimationInfo')):
        plan.update(clips=[anim('cast')],events=[ev('cast',follow=True,followSpine=True,directed=False)],buffApplications=[dict(optionField='OptionId',buffField='BuffName'),dict(optionField='OptionId',buffField='RoleBuffName',special=True)])
    elif category=='support' and 'self.box_position = vector_util.lerp(self.first_pos, self.target_pos, 0.5)' in lua:
        plan.update(sideDirection=True,buffConditionField='RoleBuffName',clips=[anim('cast'),anim('dash',.7,end=1)],
                    moves=[dict(op='lerp',at=0,duration=.1,offset=-3),dict(op='lerp',at=.7,duration=.1,offset=1),dict(op='lerp',at=1,duration=.2,to='origin')],
                    events=[ev('cast',.1,enhancedKey='cast_enhance',follow=True,followSpine=True,directed=False),
                            ev('box',.1,anchor='targetGround',offset=-1.5,mirrorXForNegative=True,directed=False,until=f('HitTiming')),
                            ev('preslash1',.3,anchor='target',enhancedOnly=True,directed=False),ev('preslash2',.5,anchor='target',enhancedOnly=True,directed=False),
                            ev('dash',.7,negativeKey='dashrev',directed=False),ev('boxexplosion',f('HitTiming'),anchor='targetGround',offset=-1.5,directed=False),
                            ev('slash',f('HitTiming'),negativeKey='slashrev',enhancedKey='slash_enhance',negativeEnhancedKey='slashrev_enhance',anchor='target',directed=False)])
    elif category=='cwp' and 'self.role_buff_name' in lua and 'self.aoe_fx' in lua and 'self.last_hit_timing' in lua:
        hit=a['HitTiming'][0];last=a['HitTiming'][-1]
        plan.update(buffConditionField='BuffName',clips=[anim('cast'),anim('slash',hit,fallbackKey='slashfallback1')],
                    events=[ev('cast',enhancedKey='cast_enhance',directed=False),ev('screen',enhancedKey='screen_enhance',screen=True,directed=False),
                            ev('slash',hit,enhancedKey='slash_enhance',fourWay=True,triggerDisposeAt=last),
                            ev('aoe',hit,enhancedKey='aoe_enhance',anchor='targetGround',maxDistance=f('AttackRange'),directed=False,triggerDisposeAt=last)])
    else:return None
    for event in plan['events']:
        if event['op']=='effect' and not event.get('screen'):event['nativePoolTransform']='directional'
    plan.update(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    return plan
