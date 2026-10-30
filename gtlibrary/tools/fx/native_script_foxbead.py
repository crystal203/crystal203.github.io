"""Source-guarded alternating homing shots and independent radial spirit queues.

The runtime consumes structural recipes. C# support dispatch uses a registered
native type, never a Hero identifier. Source contracts are pinned to the ELF.
"""
import hashlib
import re

ELF = 'd33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'


def compile_foxbead_plan(a, lua, path):
    common = dict(action=a['Name'], source=str(path), sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if (lua and all(s in lua for s in ['self.shoot_flag = not self.shoot_flag',
            'local column = stamina_break and 2 or 1', 'function local_class:get_avail_angle',
            'est_time * battle_util.get_number(spec.HomingAngularSpeed) / 2',
            'discrete_stamina_action_util.use_stamina(self.cs_action)',
            'bounds_util.get_center(self.owner), self.shoot_dir_vector[index]',
            'if not stamina_break then', 'self.probability'])
            and all(k in a for k in ['ActionDuration', 'StaminaPerAction', 'ProjectileInfo', 'SearchRange'])):
        def value(name):
            match = re.search(r'local '+name+r'\s*=\s*([\d.]+)', lua)
            return float(match[1]) if match else None
        constants = {key: value(key) for key in ['spin', 'shoot_offset', 'back_offset']}
        if any(v is None for v in constants.values()) or len(a['ProjectileInfo']) != 2:
            return None
        return dict(**common, behavior='source-alternating-homing', category='basic', id='basic', label='普通攻击',
                    nativeShot=dict(**constants, animationKey='action', targetOrigin='bounds-center',
                                    emptyOriginOffset=.5, probabilityField='Probability', simulationFps=60,
                                    nativeStaminaMethods=['0x76b61d4','0x76b62d0','0x76b6374'],
                                    recovery='inactive-only; CharacterStatsBehaviour.UpdateStamina',
                                    staminaRecovery=dict(delay=.5,perSecond=80,sourceSha256=ELF,
                                        methods=['0x5ec1294','0x5ebce78','0x8864018'])))
    if (lua and all(s in lua for s in ['local current_dir_vector = -1 * dir_vector',
            'local angle = 360 / colmuns', 'spirit.pos = init_pos',
            'effect_util.instantiate_effect(proj_spec.PresetName, pos)',
            'while #spirit_objs > 0 and not self.is_force_canceled do',
            'time_passed = time_passed - shoot_term', 'table.remove(spirit_objs, 1)',
            'shoot_pos, shoot_dir_vector, label, nil, nil, false',
            'self.owner.Position + 0.5 * unity_class.vector3.up'])
            and all(k in a for k in ['ActionDuration','SpiritTiming','ShootTerm','Columns','Offset','ProjectileInfo'])):
        return dict(**common, behavior='source-radial-spirit-queue', category='cwp', id='cwp', label='专武技能', exclusive=True,
                    nativeShot=dict(animationKey='action', castKey='action', screenKey='screen', originHeight=.5,
                                    spiritIndex=0, cannonIndex=1, simulationFps=60, independentTail=True,
                                    initialRotation='identity', updateRotation='unchanged'))
    # Registered Oak.EightTailSupportBattleAction (not a guessed action prefix).
    if (not a.get('UseScript') and a['Name'].split(':')[0] == 'EightTailSupport'
            and all(k in a for k in ['EffectPresetNames','EffectCreateTimings','EffectAnchors','DmgTimings','Radius'])):
        return dict(behavior='source-party-support-arrays', category='support', id='support', label='连锁技能',
                    action=a['Name'], source='native ARM64 Oak.EightTailSupportBattleAction / BasicSupportBattleAction',
                    sourceSha256=ELF, nativeShot=dict(emotion='smile', simulationFps=60,
                        methods=['0x8c1cb28','0x8c1ccac','0x8c1ce14','0x8c16060','0x8c1ac2c'],
                        targetDamageHeight='owner bounds half height', partyAnchor='member feet', stationary=True))
    return None
