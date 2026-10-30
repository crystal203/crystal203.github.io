"""Source C# composite managers whose own non-combo branch is executable."""
from native_csharp_melee import ELF

def compile_native_manager_plan(a):
    if a['Name'].split(':')[0]!='ManualMotorcycleStunt':return None
    return dict(behavior='native-manager',category='basic',action=a['Name'],
        constantPresets=['FX_single_projectile'],sourceSha256=ELF,
        source='native ARM64 ManualMotorcycleStuntBattleAction 0x8aec09c/0x8aedc28/0x8aeed9c/0x8aef47c/0x8aef760; cartridge 0x8af06e4/0x8aeff28',
        nativeManager=dict(operation='distanceMagazine',parameterOptionField='OptionId',mythOptionField='MythOptionId',
            distanceField='ShootDist',periodField='ShootTerm',capacityField='Columns',reloadField='ReloadDuration',
            projectileField='ProjName',offsetField='ShootOffset',animationKey='action',reloadAnimationKey='reload',
            originHeight=.25,weaponBone='[base]elbowL',boneByFacing={'back':'[base]elbowR'},
            boneExtraOffsetByFacing={'back':.15,'front':.15},boneSideOffsetByFacing={'back':.05},
            casing=dict(key='cartridge',smokeKey='smoke',angleRange=10,delayMin=.01,delayMax=.03,
                speed=6,bouncedSpeed=2,velocity=5,gravity=12.5,timeScale=2,elasticity=.4,bounceScale=.4)))
