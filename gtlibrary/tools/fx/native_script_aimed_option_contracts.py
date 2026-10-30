"""Bounded source idioms for aimed radial combos and option-gated pie hits.

Decorates an already selected timeline; never selects characters by identity.
Unreachable Lua branches remain recorded, rather than counted as implemented.
"""
import copy
import hashlib
import re


def enhance_aimed_option_contracts(plan, action, lua, path=None):
    if not plan or plan.get('behavior') != 'timeline' or not lua:
        return plan
    result = copy.deepcopy(plan)
    compact = re.sub(r'\s+', '', lua)
    f = lambda key: ['field', key]
    source_hash = hashlib.sha256(lua.encode()).hexdigest()
    contracts = result.setdefault('sourceBranchContracts', [])

    radial_combo = ('(360/self.max_hit)' in compact and 'functionaction_state_class:update_throw(' in compact
                    and 'vector_util.magnitude(stick_direction)>0' in compact
                    and isinstance(action.get('ShootTiming'), list))
    if radial_combo:
        kind = action.get('AttackType')
        if kind not in ('slash', 'proj', 'throw'):
            return plan
        for clip in result.get('clips', []):
            if clip.get('key') == 'shoot':
                clip['track'] = 'Upper'
        for event in result.get('events', []):
            if event.get('op') == 'projectile':
                event['directional'] = kind != 'proj'
                if kind == 'slash':
                    event['muzzleFourWay'] = True
            elif event.get('key') == 'cast' and kind == 'throw':
                event['followSpine'] = True
        contracts.extend([
            dict(feature='move', classification='branch-not-entered', condition='stationary preview has no raw joystick input; source requires usable routine, non-AI and nonzero raw stick at DashTiming', implementedInputBranch=False),
            dict(feature='cast', classification='bound' if kind == 'throw' else 'not-applicable', condition='AttackType == throw', eventAt=max(0, action['ShootTiming'][0]-.3) if kind == 'throw' else None),
            dict(feature='spine', classification='bound' if kind == 'throw' else 'not-applicable', condition='set_aim_point is only in update_throw; set_upper_anim is shared enter')])
        if kind == 'throw':
            result['nativeAim'] = dict(bone='b.aim', originHeight=['centerHeight'], windows=[dict(at=0, end=result['end'])])

    # Source's option is resolved before apply_damage; both successful application
    # (has_active_buff) and resistance execute the additional hit visualization.
    pie_hit = (action.get('OptionId') is not None and action.get('AttackTiming') is not None
               and all(key in action for key in ('Radius', 'Angle'))
               and 'self.activate_cwp_optionand(resisted_bufforcharacter_util.has_active_buff(t,self.debuff_info.name))' in compact
               and "battle_util.instantiate_effect(self.action,'hit',bounds_util.get_center(t))" in compact
               and 'self.attack_timing+0.15' in compact and 'self.max_offset=2' in compact)
    if pie_hit:
        result['optionParameterSource'] = 'active-option'
        result['sourceOptionHit'] = dict(key='hit', at=['add', f('AttackTiming'), .15],
            centerAt=f('AttackTiming'), offset=['max', 0, ['min', ['sub', ['distance'], .75], 2]],
            radius=f('Radius'), angle=f('Angle'), condition='option active AND (debuff resisted OR applied debuff active)',
            targetStateBoundary='flat preview collision; successful or resisted application both trigger; no complete battle buff simulation')
        contracts.append(dict(feature='hit', classification='bound', condition='active OptionId and pie-collision target; either apply result is valid', runtime='gtfx/source-option-hit-effects.js:appendSourceOptionHitEffects'))

    # A literal enter recoil with duration resolved from this action field.
    recoil = re.search(r'character_util\.recoil_type_1\(self\.owner,\s*self\.dir_vector,\s*([\d.]+),\s*([\d.]+),\s*self\.shoot_timing,\s*([\d.]+)\)', lua)
    if (recoil and isinstance(action.get('ShootTiming'), (int, float))
            and "function action_state_class:enter(" in lua and 'self.explosion_offsets' in lua):
        result['nativeRecoils'] = [dict(at=0, distance=float(recoil[1]), height=float(recoil[2]), duration=action['ShootTiming'], angle=float(recoil[3]))]
        result['nativeAim'] = dict(bone='b.aim', originHeight=['centerHeight'], windows=[dict(at=0, end=result['end'])])
        for event in result.get('events', []):
            if event.get('op') == 'projectile':
                event['directional'] = True
            elif event.get('key') in ('cast', 'spear'):
                event['followSpine'] = True
        contracts.append(dict(feature='recoil', classification='bound', condition='action enter unconditional; cancelled on exit', runtime='gtfx/native-character-motion.js:sampleNativeRecoil'))
    if not contracts:
        result.pop('sourceBranchContracts', None)
    else:
        result['sourceBranchContractSha256'] = source_hash
    return result
