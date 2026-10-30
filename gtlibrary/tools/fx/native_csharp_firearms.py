"""Registered native firearm operations; runtime selects operation data only."""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'

def compile_native_firearm_plan(a,lua=None,path=None):
    typ=a['Name'].split(':')[0]
    category='basic';rule=None
    if typ=='ManualPistol':
        rule=dict(operation='discrete-stamina-projectile',period=.1,staminaCost=5,
                  projectileNames=['manual_pirate_default_projectile','manual_pirate_super_projectile'],
                  shootAnimation='rifle_shoot',reloadAnimation='rifle_reload',
                  reloadAnimationDuration=31/30,shootTargetDuration=.1,reloadAt=.1,
                  lastRecoil=dict(distance=.2,height=.275,duration=.3,angle=8))
        methods='0x8afacd8/0x8afb4d0/0x8afbbc4/0x8afbd10/0x8b22834/0x8b2182c'
    elif typ=='CwpPirateBlueRoseBlossom':
        category='cwp'
        rule=dict(operation='cone-sequence',readyKey='ready',keysField='Key',timingField='Timing',
                  radiusField='Radius',angleField='Angle',
                  recoil=dict(distance=.2,height=.275,duration=.4,angle=8),
                  lastRecoil=dict(distance=.2,height=.275,duration=.6,angle=8),
                  lastDash=dict(speed=10,duration=.1))
        methods='0x8bd10a8/0x8bd2424/0x8bd291c/0x8bd27ec'
    elif typ=='ManualSniperRifle':
        rule=dict(operation='dual-mode-projectile',projectileNames=['sniper_proj_mode1','sniper_proj_mode2'],
                  prepareTarget=.3,prepareDefault=.5,shootAnimation='sniper_shoot',shootScale=2,
                  reloadAnimation='rifle_reload',reloadAt=[.1,.25],reloadScale=[2,1],reloadEnd=[.3,.75],cooldown=[1.2,1],
                  recoil=dict(distance=.2,height=.275,duration=.3,angle=8),dash=dict(speed=10,duration=.1),
                  jumpPreset='FX_Common_Jump_small',trailPreset='fx_m_sniper_trail',cartridgePreset='fx_m_cartridge_case',
                  cartridge=dict(speed=6,bouncedSpeed=2,velocity=5,gravity=12.5,timeScale=2,elasticity=.4,bounceScale=.4))
        methods='0x8b02c00/0x8b03680/0x8b04f44/0x8b054ec/0x8b05934/0x8b05aa8/0x8b05cc0/0x8b06094/0x8b06494/0x8b92efc'
    elif typ in ['ProjectileSupport','SniperSupport']:
        if not all(k in a for k in ['Projectile','ShotTimings','AnimationKeys','AnimationTimings']):return None
        category='support';rule=dict(operation='projectile-support',projectileField='Projectile',
                    timingField='ShotTimings',animationArrays=True,sideDirection=True)
        methods='0x8c2b288/0x8c2b3d4/0x8c2b7e8/0x8c2bd4c/0x8c2bffc/0x8c16060'
        if typ=='SniperSupport':
            rule.update(supportReaction=True,jumpPreset='FX_Common_Jump_small',trailPreset='fx_m_sniper_trail',cartridgePreset='fx_m_cartridge_case',muzzlePreset='FX_Common_CannonFire',
                        cartridge=dict(speed=6,bouncedSpeed=2,velocity=5,gravity=12.5,timeScale=2,elasticity=.4,bounceScale=.4))
            methods+='/0x8c30938/0x8c30b50'
    elif lua and a.get('UseScript') and 'self.ready_fx = battle_util.instantiate_effect(self.action, \'ready\', self.target_pos)' in lua and 'battle_util.instantiate_effect(self.action, \'explosion\', self.target_pos)' in lua:
        import hashlib
        category='cwp';rule=dict(operation='targeted-blast',castKey='cast',screenKey='screen',readyKey='ready',explosionKey='explosion',hitField='HitTiming',rangeField='SearchRange')
        return dict(behavior='native-firearm',category=category,id=category,label='专武技能',action=a['Name'],exclusive=True,nativeFirearm=rule,end=a['ActionDuration'],source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    else:return None
    return dict(behavior='native-firearm',category=category,id=category,
                label={'basic':'普通攻击','cwp':'专武技能','support':'连锁技能'}[category],
                action=a['Name'],exclusive=category=='cwp',nativeFirearm=rule,
                end=a.get('ActionDuration',a.get('Duration',.1)),
                requiredPoolPresets=(['FX_single_projectile'] if category=='basic' or rule.get('supportReaction') else [])+([rule[k] for k in ['jumpPreset','trailPreset','cartridgePreset','muzzlePreset'] if rule.get(k)]),
                source='native ARM64 '+methods,sourceSha256=ELF,nativeMethods=methods)
