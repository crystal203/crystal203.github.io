"""Reviewed Lua idioms for continuous fire, buff ownership and independent tails.
Recipes carry source hashes; runtime dispatches operation fields, never hero names.
"""
import hashlib
import re
from native_csharp_onehand import compile_onehand_plan


def compile_continuous_arsenal_plan(a, lua, path):
    onehand=compile_onehand_plan(a)
    if onehand:return onehand
    if not lua:
        return None
    name=a['Name']
    category=next((v for k,v in [('Manual','basic'),('Role','role'),('BasicSupport:','support'),('Cwp','cwp')] if name.startswith(k)),None)
    if not category:
        return None
    rule=None
    if (category=='basic' and a.get('StaminaPerSecond') and
        'continuous_stamina_action_util.use_stamina(self.cs_action, dt)' in lua and
        'math.floor(old_time_passed / self.action_duration) + 1' in lua and
        'CS.Oak.ActionEffectHelper.RequestCartridgeBounce' in lua):
        rule=dict(operation='continuous-stamina',periodField='ActionDuration',rateField='StaminaPerSecond',
                  animationKey='action',reloadKey='reload',reloadDuration=1.0333333015441895,muzzleFromProjectile=True,
                  reloadDurationSource='rifle_reload_side duration from native default SkeletonBinary; selected skeleton adaptation remains per loaded animation',
                  specialOptionField='OptionId',shootOffsetSource='WeaponSpec.ShootOffset',
                  nativeStaminaMethods=['0x76b5d94','0x66cd4c8'],
                  sourceGate='UseStamina(dt) before indexed boundary checks; stamina > 0 and not exhausted; immediate initial shot')
    elif (category=='cwp' and all(k in a for k in ['ShootNum','ShootTerm','ShootAngleOffsets','CastDuration']) and
          'term = shoot_term * (i - 1)' in lua and 'self.fire_duration = self.action_duration - self.cast_duration' in lua):
        rule=dict(operation='cast-fire-sequence',animationKey='shoot',castKey='cast',fireKey='fire',screenKey='screen',
                  shootOffsetSource='WeaponSpec.ShootOffset',cartridgeKey='cartridge',impactKey='explosion')
    elif (category=='cwp' and all(k in a for k in ['ShootTiming','ExpandDuration','DelayDuration']) and
          'self.area_state_machine:change(self.area_state)' in lua and
          'self.explosion_timing = self.expand_duration + delay_duration' in lua):
        rule=dict(operation='delayed-expanding-field',animationKey='action',fallbackKey='actionbackup',
                  castKey='cast',fieldKey='field',screenKey='screen',slashKeys=['slash','rslash'],
                  animationResumeLead=.3,animationSpeed=1.3,slashLead=.05)
    elif (category=='support' and 'function local_class:update_always(dt)' in lua and
          'function local_class:create_proj(shoot_pos, shoot_dir, target, target_pos)' in lua and
          'magnitude <= self.proj_speed * dt' in lua):
        launch=re.search(r'check_time_passed\(old_time_passed, time_passed, ([\d.]+)\) then\s*self.target_pos.y',lua)
        rule=dict(operation='independent-impact-routine',launchAt=float(launch[1]) if launch else 0,
                  speedField='ProjectileSpeed' if 'ProjectileSpeed' in a else 'Speed',
                  projectileKey='proj',trailKey='trail',impactKey='explosion',
                  routineDuration=float(re.search(r'self.explosion_duration\s*=\s*([\d.]+)',lua)[1]),
                  hitField='HitTiming',castKey='cast' if 'Speed' in a else None,
                  animationKey='action' if 'Speed' in a else None,
                  targetHitKey='hit' if "self, 'hit'," in lua else None,
                  hitDirectionRotation=60 if "self, 'hit'," in lua else 0)
    elif category=='role' and "self, 'break', self.owner," in lua and 'CS.Oak.BuffExpiredEvent' in lua:
        rule=dict(operation='owned-buff',buffKey='buff',expireKey='break',animationKey='action',buffField='BuffName')
    elif category=='role' and 'self.special_machine' in lua and "self.action, 'buff', self.owner," in lua:
        rule=dict(operation='owned-buff',buffKey='buff',animationKey='action',buffField='BuffName',
                  conditionalHitKey='hit',specialOptionField='OptionId',specialKey='specialhit',shakeMagnitude=.08)
    elif category=='basic' and a.get('AttackType') in ['thrust','slash','stomp'] and 'function action_state_class:thrust_routine' in lua:
        rule=dict(operation='aimed-melee-combo',attackType=a['AttackType'],animationKey='action',
                  thrustKey='thrust',thrustBone='[base]weapon1',armBones=dict(up='[base]armR',other='[base]armL'),
                  thrustOffset=-.5,slashOffset=.275,stompOffset=.5,jumpHeight=1.2,thrustShakeMagnitude=.1)
    if rule is None:
        return None
    if rule['operation'] in ['continuous-stamina','cast-fire-sequence']:
        rule['cartridge']=dict(key='cartridge',angleSpan=10,speedRange=[5.5,6.5],bouncedSpeedRange=[1.5,2.5],
            velocity=5,gravity=12.5,timeScale=2,elasticity=.4,bounceScale=.4,bouncePreset='FX_Common_Jump_small',
            nativeMethods=['0x8b92968','0x8b92a54','0x8b92d50','0x8b92efc'])
    return dict(behavior='source-continuous-arsenal',category=category,id=category,
                label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],
                action=name,exclusive=category=='cwp',end=a.get('ActionDuration',a.get('Duration',1)),
                nativeArsenal=rule,events=[],clips=[],spine=[],moves=[],
                requiredPoolPresets=['FX_Common_Jump_small'] if rule.get('cartridge') else [],
                source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),
                sourceIdiom='continuous-owned-buff-independent-tail-v1')
