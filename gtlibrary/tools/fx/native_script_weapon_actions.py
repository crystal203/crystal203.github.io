import hashlib

def compile_weapon_action_plan(a,lua,path):
    """Compile weapon action contracts; dispatch is by source structure/native type."""
    f=lambda k:['field',k]
    ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,anchor='center',**kw)
    name=a['Name'];typ=name.split(':')[0]
    p=dict(behavior='timeline',category='basic',id='basic',label='普通攻击',action=name,
           end=a.get('ActionDuration',a.get('Duration',1)),clips=[],events=[],moves=[],spine=[],meleeTimeline=True)
    source=str(path);sha=hashlib.sha256((lua or '').encode()).hexdigest()
    if typ in ['ManualRifle','ManualChargeBow']:
        p.update(behavior='native-weapon',requiredPoolPresets=['FX_single_projectile','FX_normal_arrow'],source='native ARM64 0x8b39fb4/0x8b1bc9c',sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
        return p
    elif lua and 'self.action_type.shieldbash' in lua and 'function action_state_class:update_stinger' in lua:
        ascent='bounds_util.get_center(self.owner) + self.dir_vector' in lua and "'hit'," in lua
        p['clips']=[dict(key='attack',at=0)]
        attack=a['AttackType'];at=f('AttackTiming')
        if attack in ['slash','backslash']:
            p['events']=[ev('slash',at,follow=True,followSpine=True,fourWay=not ascent,nativePoolTransform='directional')]
        elif attack=='shieldbash':
            p['events']=[ev('bash',at,follow=True,followSpine=True,fourWay=not ascent,nativePoolTransform='directional',
                            **({} if ascent else dict(offsetByFacing=dict(left=.8,right=.8,front=.8,back=1),heightByFacing=dict(left=.35,right=.35))))]
            if ascent:p['events'].append(ev('hit',at,offset=1,follow=True,followSpine=True,nativePoolTransform='directional'))
        else:
            p['events']=[ev('dash',at,follow=True,followSpine=not ascent,fourWay=not ascent,
                            nativePoolTransform='directional',triggerDisposeAt=f('ActionDuration'),
                            **({} if ascent else dict(bone='[base]weapon1',link=dict(boneDirection=False,boneFollowUntil=a['ActionDuration']))))]
            p['spine']=[dict(at=at,height=.2,duration=.125)]
        if 'DashTiming' in a:p['moves']=[dict(op='dash',at=f('DashTiming'),duration=f('DashDuration'),speed=f('DashSpeed'),stopOffset=a.get('MinDistance',0))]
    elif lua and "'free_cast'" in lua and 'self.max_shield_count' in lua and "'GroundTiming'" in lua:
        p.update(category='role',id='role',label='角色技能',clips=[dict(key='cast',at=0)],
                 events=[ev('cast',.165,offset=1,fourWay=True,directed=False),
                         dict(op='effect',key='thunder',at=f('AttackTiming'),anchor='targetGround',maxDistance=f('AttackRange'),directed=False)])
    elif lua and 'self.activate_ascent_option' in lua and "instantiate_effect(self, 'sword', target_pos)" in lua:
        p.update(category='support',id='support',label='连锁技能',end=a['Duration'],clips=[dict(key='cast',at=0,end=a.get('ControllingDuration',.2))],optionParameterSource='active-ascent-option',
                 events=[dict(op='effect',key='sword',at=f('HitTiming'),anchor='target',directed=False)])
    elif lua and 'function action_state_class:on_field_routine' in lua and 'local height = 10' in lua and 'self.unchecked_label' in lua:
        p.update(behavior='native-weapon-skill',category='cwp',id='cwp',label='专武技能',nativeWeaponSkill='falling-chain',exclusive=True)
    elif lua and 'self.charge_start_timing' in lua and 'self.pass_crash_behaviour.PushingTargets.Count' in lua:
        p.update(behavior='native-weapon-skill',category='cwp',id='cwp',label='专武技能',nativeWeaponSkill='charge-impact',exclusive=True)
    elif typ=='CwpKnightThunderStrike':
        p.update(behavior='native-weapon-skill',category='cwp',id='cwp',label='专武技能',nativeWeaponSkill='thunder-sequence',exclusive=True)
        source='native ARM64 0x8bc5c3c/0x8bc6904/0x8bc73b0/0x8bc6acc';sha='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
    elif typ=='CwpPlitviceFlameOfPurification':
        p.update(behavior='native-weapon-skill',category='cwp',id='cwp',label='专武技能',nativeWeaponSkill='targeted-area',exclusive=True)
        source='native ARM64 0x8b95fd0/0x8bd35b0/0x8bd371c/0x8b96430';sha='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
    elif typ in ['TwohandSlash','TwohandBackSlash']:
        back=typ=='TwohandBackSlash';duration=a['ActionDuration'];at=duration*.75
        p.update(clips=[dict(animation='twohand_attack2' if back else 'twohand_attack',at=0,speed=.6/duration)],
                 moves=[dict(op='dash',at=duration*(.45 if back else .4),duration=duration*(.55 if back else .6)-.05,speed=8,stopOffset=.3)],
                 events=[dict(op='effect',presetField='SlashPreset',at=at,anchor='feet',fourWay=True,directed=True,
                              scale=1.1,mirrorXByFacing=['left','right'] if back else ['front','back'])])
        source='native ARM64 TwohandSlash/BackSlash ctor, SetupAttack, OnAttack';sha='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
    elif typ=='TwohandStomp':
        duration=a['ActionDuration']
        p.update(clips=[dict(animation='twohand_attack4',at=0,speed=1.467/duration)],
                 moves=[dict(op='dash',at=duration*.2,duration=duration*.8-.05,speed=10,stopOffset=.3)],
                 events=[dict(op='effect',preset='FX_shockwave',at=duration*.75,anchor='feet',directed=False,scale=1.5)])
        source='native ARM64 0x8c4fb3c/0x8c4ff30/0x8c509c4';sha='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
    else:return None
    if lua and p['behavior']=='timeline':
        for event in p['events']:
            if event.get('op')=='effect' and not event.get('screen'):event.setdefault('nativePoolTransform','direct' if event.get('directed') is False else 'directional')
    p.update(source=source,sourceSha256=sha)
    return p
