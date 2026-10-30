"""Compile source contracts for direct persistent shots and deployed field batteries.
Dispatch depends on Lua operations and field contracts, never character identities.
"""
import hashlib
import json
import re
from pathlib import Path


def compile_projectile_pattern(a, lua, path):
    if not lua:
        return None
    name = a['Name']
    category = next((c for prefix, c in [('Manual', 'basic'), ('Role', 'role'), ('BasicSupport:', 'support'), ('Cwp', 'cwp'), ('Myth', 'myth')] if name.startswith(prefix)), None)
    if not category:
        return None
    plan = dict(behavior='source-projectile-pattern', category=category, id=category,
                label={'basic': '普通攻击', 'role': '角色技能', 'support': '连锁技能', 'cwp': '专武技能', 'myth': '开花技能'}[category],
                action=name, exclusive=category == 'cwp', mythOnly=category == 'myth',
                end=a.get('ActionDuration', a.get('Duration', 1)), clips=[], events=[], spine=[])
    if (category=='support' and "self.ground_fx = battle_util.instantiate_effect(self, 'ground', battle_util.get_ground_pos(self.target_pos))" in lua
            and "self.laser_fx = battle_util.instantiate_effect(self, 'laser', battle_util.get_ground_pos(self.target_pos))" in lua):
        plan.update(pattern='effect-at-start',clips=[dict(key='cast',track='Base',start=0)],
                    directionContract='omitted rotation -> Vector3.zero -> pool identity rotation; actor facing is independent',
                    events=[dict(key='cast',at=0,anchor='feet',directed=False),dict(key='laser',at=.3,anchor='targetGround',directed=False),dict(key='ground',at=.3,anchor='targetGround',directed=False)])
    elif (category=='basic' and "'MythProjectileInfo'" in lua
            and 'CS.Oak.ActionEffectHelper.RequestCartridgeBounce' in lua and isinstance(a.get('ShootTiming'),list)):
        times=a['ShootTiming'];plan.update(pattern='scheduled-projectiles',combo=True,mythProjectileSource='action-field',
                    clips=[dict(key='action',track='Upper',start=0)] + [dict(key='shoot',track='Upper',start=t-.05) for t in times if t>=.05 and any(r.get('Name')=='shoot' for r in a.get('AnimationInfo',[]))],
                    shots=[dict(at=t,index=0,offset=0 if a.get('AttackType')=='grenade' else None,cannon=a.get('AttackType')=='grenade') for t in times],
                    recoils=[dict(at=t-.05,distance=.3,height=.1,duration=.15,angle=8) for t in times if t>=.05],
                    cartridgeRandom=a.get('AttackType')!='grenade')
    elif (category=='role' and 'self.action.mine_state:spawn' in lua and "bone_follower.boneName = 'body'" in lua):
        plan.update(pattern='independent-mines',clips=[dict(key='action',track='Upper',start=0)],
                    nativeRecoil=dict(at=0,distance=.2,height=.1,duration=.08,angle=8),
                    mythParameterFields=['MineSearchRange','Radius'])
    elif (category=='cwp' and 'function bomb_stat_class:sync(info)' in lua
          and 'local coefficients_a = (y2 - current_offset * x2 / x1)' in lua):
        plan.update(pattern='independent-bombs',arcOffset=1.2,explosionOffset=.5,
                    clips=[dict(key='action',fallbackKey='actionbackup',track='Upper',start=0)],
                    events=[dict(key='cast',at=0,anchor='feet',follow=True)],
                    recoils=[dict(at=t-.07,distance=.25,height=.1,duration=.09,angle=20) for t in a['ShootTiming']])
    elif (category=='support' and "battle_util.instantiate_effect(self, 'hit', bounds_util.get_center(self.target))" in lua
          and isinstance(a.get('HitTiming'),(int,float)) and not a.get('ProjectileInfo')):
        plan.update(pattern='effect-at-start',clips=[dict(key='action',track='Base',start=0)],
                    events=[dict(key='cast',at=0,anchor='center'),dict(key='hit',at=a['HitTiming'],anchor='target')])
    elif (category=='basic' and 'function bonus_state_class:shoot_projectile()' in lua
            and 'character_util.has_active_buff_consider_remove(self.owner, self.role_buff_id)' in lua):
        def offsets(state):
            section=lua.split('function '+state+':init(param)',1)[1].split('function '+state+':apply_myth_option',1)[0]
            values={}
            for d,shoot,fire in re.findall(r'offset_table\[direction_util\.(\w+)\] = \{ shoot_offset = vector\(([^)]+)\), fire_offset = vector\(([^)]+)\)',section):
                values[d]=dict(shoot=[float(v) for v in shoot.split(',')],fire=[float(v) for v in fire.split(',')])
            return values
        plan.update(pattern='scheduled-projectiles',staminaCost=a['StaminaPerAction'],
                    magazine=dict(count='stamina',sourceGate='persistent_is_available then role buff bonus; otherwise stamina gate'),
                    clips=[dict(key='cast',fallbackKey='cast_fallback',track='Base',start=0,end=a['ShootTiming']),dict(key='shoot',track='Base',start=a['ShootTiming'])],
                    shots=[dict(at=a['ShootTiming'],index=0)],events=[],aimOffsets=offsets('action_state_class'),
                    recoilByFacing=dict(side=dict(at=a['ShootTiming'],distance=.5,height=.1,duration=.4,angle=-20),vertical=dict(at=a['ShootTiming'],distance=.3,height=0,duration=.2,angle=0)),
                    bonus=dict(optionSource='special',buffField='RoleBuffName',castKey='cast_ex',castAnimation='cast_ex',shootAnimation='shoot_ex',
                               aimOffsets=offsets('bonus_state_class'),shootOffset=.9,muzzleOffset=1.5,
                               recoilByFacing=dict(side=dict(distance=.7,height=.1,duration=.4,angle=20),vertical=dict(distance=.3,height=.5,duration=.4,angle=0))))
        plan['mythProjectileSource']='option'
    elif (category=='role' and 'self.enable_jump' in lua and 'battle_util.get_stick_direction(self.cs_action)' in lua
          and 'self.land_timing = self.jump_duration + self.dash_timing' in lua):
        land=a['DashTiming']+a['DashDuration'];plan.update(pattern='joystick-role',optionPresetSource='active-special-option',
                    mythOptionPresetSource='special-option',clips=[dict(key='reload',track='Base',start=0)],
                    events=[dict(key='fx_end',at=land-.1,anchor='feet')],
                    nativeRecoil=dict(at=land-.1,direction=[0,0,1],distance=.2,height=.1,duration=.2,angle=0),
                    joystickBranch='stationary default; moving branch requires explicit stick input',
                    grantBuff=dict(key='buff',endKey='buff_end',at=a['ActionDuration'],nameField='RoleBuffName'),
                    roleJump=dict(at=a['DashTiming'],duration=a['DashDuration'],dashDuration=a['DashDuration']+a['DashTiming'],speed=a['DashSpeed'],height=a['JumpHeight'],aerial=a['AerialDuration'],
                                  offsets={'left':[.6,0,-1],'right':[-.6,0,-1],'back':[.5,0,-1],'front':[-.2,0,-1]},
                                  directions={'left':[.3,0,-1],'right':[-.3,0,-1],'back':[.1,0,-1],'front':[0,0,-1]}))
    elif (category=='support' and 'self.fire_fx_timing' in lua and "'knockback2'" in lua
          and 'area_collision_util.update_v2' in lua):
        plan.update(pattern='effect-at-start',
                    clips=[dict(key='cast',track='Base',start=0,end=a['ShootAnim']),dict(key='cast',track='Emotion',start=0),
                           dict(key='shoot',track='Base',start=a['ShootAnim'],end=.6),dict(key='knockback2',track='Base',start=.6)],
                    events=[dict(key='fire',at=0,anchor='center',follow=True,directed=True,until=plan['end']),dict(key='laser',at=a['ShootTiming'],anchor='feet',directed=True)],
                    collisionHit=dict(at=a['ShootTiming'],key='hit',lengthField='Length',widthField='Width'),
                    sourceMoves=[dict(at=a['ShootTiming'],duration=a['DashDuration'],speed=a['DashSpeed'],sign=-1)],
                    recoilByFacing=dict(side=dict(at=a['ShootTiming'],distance=.4,height=.3,duration=.4,angle=0),
                                        back=dict(at=a['ShootTiming'],distance=.2,height=0,duration=.4,angle=-30),
                                        front=dict(at=a['ShootTiming'],distance=.2,height=0,duration=.4,angle=20)))
    elif (category=='cwp' and 'self.recoil_swap = true' in lua and 'self.default_height = 1 + 2 / self.search_range' in lua):
        plan.update(pattern='aim-field',clips=[dict(key='cast',fallbackKey='cast_fallback',track='Base',start=0,end=.5),dict(key='cast',track='Emotion',start=0)],
                    events=[],fieldTiming=a['FieldTiming'],fieldKey='explosion',fireKey='fire',fireTiming=a['ShootTiming'],
                    recoilDirection=[0,0,1],recoilDistance=.1,recoilDuration=.1,recoilAngle=-7,screenFromSource=False)
    elif (category=='basic' and 'self.action.drain_state:add_proj(each_target)' in lua
            and 'self.fx_counter = self.fx_counter % 2' in lua and 'self.speed = self.action.search_range / drain_duration' in lua):
        plan.update(pattern='target-drain',staminaCost=a['StaminaPerAction'],
                    magazine=dict(count='stamina',sourceGate='Discrete stamina repeated until break'),
                    clips=[dict(key='action',track='Upper',start=0)],breakShots=[dict(at=a['ShootTiming'],index=0,offset=0,muzzleOffset=.5)],
                    castAlternates=['cast1','cast2'],emptyAlternates=['none1','none2'],hitKey='hit',
                    drainKeys=['drain','trail'],drainAt=a['HitTiming'],healAt=a['HealTiming'],searchField='SearchRange',
                    extraHit=dict(key='optionhit',probabilityField='Probability'),breakVoiceRandom=True)
    elif (category=='support' and 'self.elemental_spine.SpineOffset = 3 * vector_util.up' in lua
          and 'self.target_pos + 3.6 * vector_util.up' in lua):
        hit=a['HitTiming'];plan.update(pattern='effect-at-start',
                    clips=[dict(key='action',track='Base',start=0,end=hit)],
                    events=[dict(key='cast',at=0,anchor='feet',follow=True),
                            dict(key='elemental',at=0,anchor='targetGround',until=plan['end'],
                                 link=dict(skeletonView='front',skeletonAlpha=[dict(at=0,fromValue=0,to=1,duration=.2),dict(at=hit,fromValue=1,to=0,duration=.4)],
                                           skeletonOffsetPath=[dict(time=t,position=[0,3+(t-hit)/.3 if t>hit+.1 else 3,0]) for t in [0,hit+.1,hit+.1+1/60,plan['end']]])),
                            dict(key='charge',at=.15,anchor='targetGround',height=3.6,until=hit),
                            dict(key='explosion',at=hit,anchor='targetGround')])
        for event in plan['events']:
            for fade in event.get('link',{}).get('skeletonAlpha',[]):fade['from']=fade.pop('fromValue')
    elif (category=='cwp' and 'self.flower_girl_spine:SetAnimation' in lua
          and 'self.flower_girl_key = self.has_flower_girl' in lua):
        plan.update(pattern='companion-beam',directionMode='assistant-fourway',clips=[dict(key='action',track='Upper',start=0)],
                    beamTiming=.25,beamOffset=1,companions=[dict(keys=['elemental','flower'],sideAngle=90,backOffset=-.5),
                    dict(keys=['elemental','alpaca'],sideAngle=-90,backOffset=-.5,skin='alpaca_girl_5',skinExceptionCostume=170016)],
                    companionAnimation='shoot',fadeIn=.2,events=[])
    elif (category=='myth' and 'target_pos = battle_util.get_ground_pos(bounds_util.get_center(self.target))' in lua
          and "battle_util.instantiate_effect(self, 'explosion', target_pos)" in lua):
        plan.update(pattern='effect-at-start',clips=[dict(key='cast',track='Base',start=0)],
                    events=[dict(key='explosion',at=0,anchor='targetGround')])
    elif (category == 'basic' and 'local added_label = self.myth_cwp_attack and 1 or 0' in lua
            and '0.35 * offset_vector' in lua and 'discrete_stamina_action_util.use_stamina' in lua):
        plan.update(pattern='scheduled-projectiles', staminaCost=a['StaminaPerAction'],
                    magazine=dict(count='stamina', sourceGate='is_there_stamina_for_action; last use consumes remaining stamina'),
                    shots=[dict(at=0,index=0,side=.35,muzzle=False,hitKey='hit'),dict(at=.05,index=0,side=-.35,muzzle=False,hitKey='hit')],
                    breakShots=[dict(at=0,index=1,side=.35,muzzle=False),dict(at=0,index=1,side=-.35,muzzle=False)],
                    clips=[dict(key='action',track='Upper',start=0)],
                    breakClips=[dict(key='break',track='Upper',start=0),dict(key='break',track='Emotion',start=0)],
                    muzzleBones=['[base]weapon1','[base]weapon2'],muzzleOffset=.3,
                    nativeRecoil=dict(at=0,distance=.25,height=.1,duration=.15,angle=8),
                    breakRecoil=dict(at=0,distance=.35,height=.1,duration=.25,angle=8))
    elif (category == 'cwp' and "local fx_key = last_shoot and 'screenlast' or 'screenfire'" in lua
          and "'shootbackup' .. index" in lua and isinstance(a.get('ShootTiming'),list)):
        times=a['ShootTiming'];plan.update(pattern='scheduled-projectiles',
                    clips=[dict(key='shoot'+str(i+1),fallbackKey='shootbackup'+str(i+1),track='Upper',start=t-.1,end=(times[i+1]-.1 if i+1<len(times) else plan['end'])) for i,t in enumerate(times)],
                    events=[dict(key='cast',at=0,anchor='center',follow=True),dict(key='screen',at=0,anchor='feet',screen=True),
                            dict(key='cast',at=times[-1]-.2,anchor='center',follow=True)] +
                           [dict(key='screenlast' if i==len(times)-1 else 'screenfire',at=t,anchor='feet',screen=True) for i,t in enumerate(times)],
                    shots=[dict(at=t,index=1 if i==len(times)-1 else 0,hitKey='hit') for i,t in enumerate(times)],
                    recoils=[dict(at=t,distance=.4 if i==len(times)-1 else .2,height=.2,duration=.15,angle=8) for i,t in enumerate(times)])
    elif (category == 'support' and "battle_util.instantiate_effect(self, 'hit', self.target_pos)" in lua
          and 'character_util.hide_weapon(self.owner, true' in lua and isinstance(a.get('HitTiming'),list)):
        plan.update(pattern='effect-at-start',hideWeapon=True,
                    clips=[dict(key='action',track='Base',start=0),dict(key='action',track='Emotion',start=0)],
                    events=[dict(key='cast',at=0,anchor='center'),dict(key='hit',at=0,anchor='targetGround')])
    elif (category == 'role' and 'buff_util.apply_buff_info(self.owner, self.owner, self.buff_info)' in lua
          and 'function action_state_class:on_event(e)' in lua and not a.get('ProjectileInfo')):
        plan.update(pattern='effect-at-start',optionPresetSource='active-option',mythOptionPresetSource='cwp-option',
                    clips=[dict(key='action',track='Base',start=0)],events=[dict(key='cast',at=0,anchor='center',follow=True)],
                    ownershipBuff=dict(key='buff',nameField='BuffName'))
    elif (category == 'myth' and "battle_util.instantiate_effect(self, 'main', character_util.get_position(self.owner))" in lua):
        plan.update(pattern='effect-at-start', clips=[dict(key='cast',track='Base',start=0)],
                    events=[dict(key='main',at=0,anchor='feet')])
    elif (category == 'cwp' and 'function field_state_class:fall_routine(index, pos)' in lua
            and 'self.basement_spine:SetAnimation(upper_track, \'attack\', false)' in lua
            and all(k in a for k in ['ShootTiming', 'HitDelay', 'DeployTiming', 'AttackRange'])):
        # Retain constants from the source expressions, and reject source variants
        # rather than silently applying the wrong field-entity contract.
        required = ["local fall_delay = hit_delay - 0.2", "SetAlphaFade(1, 0.2)",
                    "SetAlphaFade(0, 0.5)", "local offset = 0.3 * vector_util.up",
                    "random_util.get_random_value() * 180 + 90",
                    "random_util.get_random_value() * (self.attack_range - 1.5) + 1.5"]
        if not all(x in lua for x in required):
            return None
        plan.update(pattern='deployed-battery', fadeIn=.2, fadeOut=.5,
                    fireHeight=.3, deployHeight=.03, fallLead=.2,
                    minRandomRadius=1.5, randomAngleMin=90, randomAngleSpan=180,
                    searchHeight=3, variantCount=3, bodyAnimation='attack', bodyTrack='Upper',
                    keys={'body': 'base', 'range': 'range', 'screen': 'screen', 'deploy': 'deploy',
                          'fire': 'fire', 'shoot': 'shoot%d', 'fall': 'fall%d', 'impact': 'explosion%d'},
                    clips=[dict(key='deploy', track='Base', start=0)])
    elif (category == 'basic' and a.get('ProjectileInfo') and isinstance(a.get('ShootTiming'), (int, float))
          and 'battle_util.persistent_is_available(self.cs_action)' in lua
          and 'self.action:on_action_available()' in lua
          and "battle_util.set_upper_anim(self.action, self.cs_action, 'action')" in lua
          and 'self.shoot_helper[label], shoot_pos, self.dir_vector, label)' in lua):
        plan.update(pattern='direct-projectile', magazine=dict(count='weapon.magazineSize', period='ActionDuration',
                    sourceGate='attacking && persistent_is_available -> on_action_available -> sync -> reenter'),
                    shootField='ShootTiming', offset='weapon.shootOffset', clips=[dict(key='action', track='Upper', start=0)])
        if "self, 'target', self.action_state.cwp_last_target" in lua:
            plan['ownershipMarker'] = 'target'
    elif (category == 'role' and 'self.homing = trigger_info_util.contains_number(info)' in lua
          and 'self.shoot_helper[label], shoot_pos, self.dir_vector, label, nil, self.homing and self.target or nil' in lua
          and a.get('ProjectileInfo') and isinstance(a.get('ShootTiming'), (int, float))):
        plan.update(pattern='direct-projectile', shootField='ShootTiming', offset='weapon.shootOffset',
                    homingTrigger='contains_number', clips=[dict(key='action', track='Upper', start=0), dict(key='action', track='Emotion', start=0)],
                    events=[dict(key='cast', at=0, anchor='center', follow=True)])
        match = re.search(r'recoil_type_1\(self.owner, self.dir_vector, ([\d.]+), ([\d.]+), ([\d.]+)\)', lua)
        if match:
            plan['nativeRecoil'] = dict(at=a['ShootTiming'], distance=float(match[1]), height=float(match[2]), duration=float(match[3]), angle=8)
    elif (category == 'support' and 'self.shoot_timing + 0.3' in lua
          and 'character_util.jump(self.owner, 0.7, 0.3)' in lua and a.get('ProjectileInfo')
          and 'self.shoot_helper[shoot_index], shoot_pos, self.target_dir, label)' in lua):
        switch = a['ShootTiming'] + .3
        plan.update(pattern='direct-projectile', shootField='ShootTiming', offset='weapon.shootOffset',
                    clips=[dict(key='action', track='Base', start=0, end=switch),
                           dict(key='shoot', track='Base', start=switch, end=a['ControllingDuration']),
                           dict(key='shoot', track='Emotion', start=switch, end=a['ControllingDuration'])],
                    events=[dict(key='cast', at=0, anchor='center')],
                    spine=[dict(at=a['ShootTiming'], duration=.3, height=.7)])
    elif (category == 'myth' and "battle_util.instantiate_effect(self, 'cast', self.trigger_pos)" in lua
          and not a.get('ProjectileInfo')):
        plan.update(pattern='effect-at-start', clips=[dict(key='cast', track='Base', start=0)],
                    events=[dict(key='cast', at=0, anchor='feet')])
    else:
        return None
    plan['mythPresetSource'] = 'action' if 'battle_util.parse_action_and_myth_param(' in lua else 'none'
    plan['mythProjectileSource'] = plan.get('mythProjectileSource') or 'option' if 'battle_util.parse_projectile_param(self.cs_shooter, myth_param)' in lua else plan.get('mythProjectileSource','none')
    plan['optionPresetSource'] = plan.get('optionPresetSource') or 'active-non-special-option' if ('battle_util.parse_action_param_and_apply(self.action, self.cs_action, option_param)' in lua and 'if is_special then' in lua) else plan.get('optionPresetSource','none')
    # Pool limits are distinct from converted particle/curve duration. Keep exact
    # source rules for referenced base/myth/option/projectile presets in the plan.
    source = Path(__file__).parents[2] / 'gtfx/assets/native-source/objectpoolspec.json'
    pool_bytes = source.read_bytes()
    pools = json.loads(pool_bytes)
    def strings(value):
        if isinstance(value, str): return {value}
        if isinstance(value, dict): return set().union(set(), *(strings(v) for v in value.values()))
        if isinstance(value, list): return set().union(set(), *(strings(v) for v in value))
        return set()
    wanted = strings(a)
    option_ids = a.get('MythOptionId', [])
    if not isinstance(option_ids, list): option_ids = [option_ids]
    regular_ids = a.get('OptionId', [])
    if not isinstance(regular_ids, list): regular_ids = [regular_ids]
    option_ids = list(option_ids) + regular_ids
    for row in json.loads((source.parent / 'options.json').read_bytes()):
        if row.get('Id') in option_ids: wanted |= strings(row)
    projectiles = {p['Name']: p for p in json.loads((source.parent / 'projectiles.json').read_bytes())}
    previous = set()
    while wanted != previous:
        previous = wanted.copy()
        for key in previous:
            if key in projectiles: wanted |= strings(projectiles[key])
    plan['poolRules'] = {p['PresetName']: {'dispose': p.get('DisposingType', 'None'), 'timeLimit': p.get('TimeLimit', 0)}
                         for p in pools if p.get('PresetName') in wanted}
    if plan.get('ownershipBuff') or plan.get('grantBuff'):
        buff_bytes=(source.parent/'buffs.json').read_bytes()
        plan['buffRules']={b['Name']: {'duration':b.get('Duration',0)} for b in json.loads(buff_bytes) if b.get('Name') in wanted}
        plan['buffSourceSha256']=hashlib.sha256(buff_bytes).hexdigest()
    plan['poolSourceSha256'] = hashlib.sha256(pool_bytes).hexdigest()
    plan.update(source=str(path), sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    return plan
