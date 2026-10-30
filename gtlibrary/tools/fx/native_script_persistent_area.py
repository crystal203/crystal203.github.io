"""Source-guarded persistent expanding areas and independently updated fields."""
import hashlib
import re


def compile_persistent_area_plan(a, lua, path):
    if not lua:
        return None
    common = dict(action=a['Name'], source=str(path), sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if (all(s in lua for s in ['function local_class:persistent_begin', 'function local_class:enter_action_state',
                              'self.damage_length * progress * self.current_attack_type.size_modifier',
                              'discrete_stamina_action_util.use_stamina(self.cs_action)',
                              "battle_util.set_upper_anim(self, self.cs_action, 'cast')",
                              "'proj_break', bounds_util.get_center(self.character), self.locked_dir"])
            and all(k in a for k in ['HitTiming', 'StaminaPerAction', 'DamageExpandDuration'])):
        recoil = re.findall(r'recoil_type_1\(self.character, self.locked_dir,\s*([\d.]+),\s*([\d.]+),\s*self.action_duration\s*\*\s*([\d.]+)\)', lua)
        offset = re.search(r'fire_fx_init_pos = bounds_util.get_center\(self.character\) \+ ([\d.]+) \* self.locked_dir', lua)
        if len(recoil) != 2 or not offset:
            return None
        return dict(**common, behavior='source-persistent-area', category='basic', id='basic', label='普通攻击',
                    nativeArea=dict(fireOffset=float(offset[1]),
                                    recoilNormal=[float(x) for x in recoil[1]], recoilBreak=[float(x) for x in recoil[0]],
                                    animationKey='cast', emotionKey='cast', breakEmotionKey='break',
                                    fireKey='fire', breakFireKey='fire_break', projectileKey='proj', breakProjectileKey='proj_break',
                                    optionHitKey='option_hit', animationTrack='Upper', simulationFps=60))
    if (all(s in lua for s in ['function local_class:create_proj(proj_info, dir_vector, sync_pos)',
                              'self.proj_func = self:create_proj', 'proj_pos = proj_pos + dir_vector * speed * dt',
                              'wait_duration < proj_time_passed and proj_time_passed < wait_duration + accel_duration',
                              'if proj_time_passed > duration then', 'if self.is_exclusive_weapon then',
                              "battle_util.instantiate_effect(self, 'proj', fx_pos)",
                              "battle_util.instantiate_effect(self, 'angel', fx_pos)"])
            and all(k in a for k in ['WaitDuration', 'ProjectileAccel', 'ProjectileAccelDuration', 'ProjectileDuration'])):
        return dict(**common, behavior='source-accelerated-field', category='cwp', id='cwp', label='专武技能', exclusive=True,
                    nativeArea=dict(projectileKey='proj', exclusiveCompanionKey='angel', castKey='cast', hitKey='hit',
                                    animationKey='cast', emotionKey='cast', darkenAlpha=.65, darkenEnterDuration=.2,
                                    darkenExitProjectileTime=2.5, simulationFps=60,
                                    independentTail=True, initialRotation='identity', updateRotation='unchanged'))
    return None
