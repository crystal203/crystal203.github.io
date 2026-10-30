"""Source-structural fan waves, expanding boxes and eased returning effects."""
import hashlib
import re


def compile_fan_plan(a,lua,path):
    name=a['Name'];common=dict(action=name,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if (lua and all(s in lua for s in ['self.attack_type == \'wave\'', 'self.attack_type == \'blast\'',
            'self.distance * progress', "battle_util.set_upper_anim(self, self.cs_action, 'action')",
            "battle_util.instantiate_effect(self, 'firework', bounds_util.get_center(target))"])
            and a.get('AttackType') in ['wave','blast'] and 'HitTiming' in a):
        if a['AttackType']=='wave' and not a.get('ProjectileInfo'):return None
        if a['AttackType']=='blast' and not all(k in a for k in ['Length','Width','PresetInfo']):return None
        return dict(**common,behavior='source-fan-actions',category='basic',id='basic',label='普通攻击',
                    nativeFan=dict(kind='wave' if a['AttackType']=='wave' else 'expanding-box',
                        animationKey='action',track='Upper',fieldKey='field',passiveHitKey='firework',healKey='heal',
                        recoil=[.1,0] if a['AttackType']=='wave' else [.3,.1],
                        boxExpand=.25,boxHitTerm=.1,boxMaxHits=2,muzzleOffset=.5,simulationFps=60,
                        projectileGrowth=dict(parameter='ExtraSingleParameters',index=0,
                            nativeType='Oak.FestivalGirlProjectile',methods=['0x6a4b0c8','0x6a4b2a8','0x6a4b494'])))
    if (lua and 'battle_util.get_lowest_hp_target(' in lua and 'self.self_multiplier' in lua
            and 'buff_util.cure_all_debuffs(self.owner, target)' in lua and a.get('ProjectileInfo')):
        return dict(**common,behavior='source-fan-actions',category='role',id='role',label='角色技能',
                    nativeFan=dict(kind='party-heal-projectile',animationKey='action',track='Upper',
                        recoil=[.1,0],recoilDefaultDuration=.3,simulationFps=60,
                        projectileGrowth=dict(parameter='ExtraSingleParameters',index=0,
                            nativeType='Oak.FestivalGirlProjectile',methods=['0x6a4b0c8','0x6a4b2a8','0x6a4b494']),
                        targetSelection='lowest injured party member excluding self; otherwise current four-way look direction'))
    if (lua and all(s in lua for s in ['self.init_ease_func = CS.Oak.Interpolations.EaseOutCubic',
            'self.return_ease_func = CS.Oak.Interpolations.EaseInCubic', 'for index = 1, 3 do',
            'self.boomerang_cycle = (self.boomerang_duration - self.cast_time) * 0.5',
            'self.fx_angle_offset = fx_max_radius / dist * self.angle * 0.5',
            'effect_util.dispose_via_type(self.fx_boomerang_table[index].proj, true)'])
            and all(k in a for k in ['BoomerangLifeTime','CastTime','InclusionRadius','Angle'])):
        get=lambda key:float(re.search(r'local '+key+r'\s*=\s*([\d.]+)',lua)[1])
        return dict(**common,behavior='source-fan-actions',category='cwp',id='cwp',label='专武技能',exclusive=True,
                    nativeFan=dict(kind='eased-three-return',minRadius=get('fx_min_radius'),maxRadius=get('fx_max_radius'),
                        castKey='cast',screenKey='screen',bodyKey='boomerang',trailKey='contrail',endKey='end',
                        animationKey='cast',fallbackKey='fallback',emotionKey='cast',simulationFps=60,
                        bodyDispose='immediate',trailDispose='native-pool-type',rotation='identity'))
    if (not lua and name.startswith('BasicSupport:') and a.get('HealTimings') and a.get('CureOnHeal')
            and a.get('EffectAnchors')==['Party'] and len(a.get('EffectPresetNames',[]))==1):
        common.update(source='native ARM64 Oak.BasicSupportBattleAction',
                      sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
        return dict(**common,behavior='source-fan-actions',category='support',id='support',label='连锁技能',
                    nativeFan=dict(kind='party-heal-support',simulationFps=60,
                        sourceNative='Oak.BasicSupportBattleAction.UpdateFrame 0x8c16060 / InstantiateEffect 0x8c1ac2c',
                        nativeElf='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'))
    return None
