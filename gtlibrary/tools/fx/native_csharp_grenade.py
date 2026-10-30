"""Registered C# grenade recipes from the 3.51.0 ARM64 image.

Only the source compiler selects native action classes; the player interprets
the emitted trajectory and pool rules without character-name dispatch.
"""
ELF = 'd33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'


def compile_native_grenade_plan(a):
    typ = a['Name'].split(':')[0]
    if typ == 'ManualMadScientist':
        category = 'basic'
        rule = dict(kind='manual', parameterOptionField='OptionId',
                    ascentOptionField='AscentOptionId', periodField='ShootPeriod',
                    defaultPeriod=.5, animation='basket_attack', animationEnd=.33,
                    grenadeField='GrenadePreset', explosionField='ExplosionPreset',
                    groundField='GroundPreset', breakSuffix='Super',
                    shootPreset='FX_shoot_01',
                    staminaBreakField='StaminaBreakType',
                    autoAimRange=7,
                    recoil=dict(distance=.2, height=.1, duration=.3, angle=8),
                    breakRecoil=dict(distance=.3, height=.2, duration=.25, angle=8),
                    velocity=10, gravity=20, timeScale=1.25, spin=False)
        methods = '0x8b21114/0x8b2ca3c/0x8b2deb0/0x8b2e794/0x8b2ebac/0x6501c94/0x6502420'
    elif typ == 'MadScientistSupport':
        category = 'support'
        rule = dict(kind='apex', ascentOptionField='AscentOptionId',
                    grenadeField='GrenadePreset', explosionField='ExplosionPreset',
                    trailField='TrailPreset', throwField='GrenadeThrowTiming',
                    arrivalField='GrenadeArrivalTiming', apexField='GrenadePeakHeight',
                    rotationField='GrenadeRotationMultiplier', animationArrays=True,
                    recoil=dict(distance=.3, height=.2, duration=.425, angle=16))
        methods = '0x8c28bb4/0x8c29354/0x8c29820/0x8c298c4'
    elif typ == 'CwpMadScientistFormulaA':
        category = 'cwp'
        rule = dict(kind='area', ascentOptionField='AscentOptionId',
                    animationKey='shot', emotionKey='shot', grenadeKey='grenade',
                    shootKey='shot', cloudKey='cloud', screenKey='screen',
                    velocity=10, gravity=20, timeScale=1.25, spin=True)
        methods = '0x8bc8ecc/0x8bc9ab4/0x8bca0b4/0x8bca8d4/0x8bcaf74/0x8bcb6ec/0x6501c94/0x6502420'
    else:
        return None
    return dict(behavior='timeline', category=category, id=category,
                label={'basic': '普通攻击', 'support': '连锁技能', 'cwp': '专武技能'}[category],
                action=a['Name'], exclusive=category == 'cwp',
                end=a.get('ActionDuration', a.get('Duration', .5)),
                nativeGrenade=rule, clips=[], moves=[], spine=[], events=[],
                **({'staminaCost': 20} if category == 'basic' else {}),
                source='native ARM64 ' + methods, sourceSha256=ELF,
                nativeMethods=methods)
