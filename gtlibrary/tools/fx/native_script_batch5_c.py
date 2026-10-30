"""Registered ManualDeathFist weak punches, backed by ARM64 and native Spine callbacks."""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'

def compile_batch5_c_plan(a,lua,path):
    name=a.get('Name')
    if name=='MachineGunArrow' and all(k in a for k in ('ShootDurationBase','ShootCycleBase','ColumnsBase','SpreadAngleBase')):
        return dict(behavior='source-batch5-c',category='cwp',id='cwp',label='普通武器技能',action=name,end=a['ShootDurationBase'],batch5Operation='native-machinegun-arrow',exclusive=False,source='native ARM64 MachineGunArrow ctor 0x8ac18bc, ShootState 0x8ac37fc/0x8ac3e0c',sourceSha256=ELF,requiredPoolPresets=['FX_single_projectile','FX_normal_arrow'])
    if name=='Sequence:BombBullet' and a.get('BattleActionSequence')==['SeqExplosionProj:BombBullet']:
        return dict(behavior='source-batch5-c',category='cwp',id='cwp',label='普通武器技能',action=name,end=.3,batch5Operation='native-bombbullet-sequence',exclusive=False,source='native ARM64 Sequence 0x8c01024 / SeqProjectileBase 0x8bfef94 / SeqExplosionProj 0x8bf8f98',sourceSha256=ELF)
    if name=='SeqExplosionProj:BombBullet' and all(k in a for k in ('PrepareDuration','Speed','LifeTime','PresetInfo','Size')):
        return dict(behavior='source-batch5-c',category='internal',id='sequence-projectile',label='普通武器技能子动作',action=name,end=a['ActionDuration'],batch5Operation='native-bombbullet-child',source='native ARM64 SeqExplosionProj 0x8bf8f98/0x8bf9ec0',sourceSha256=ELF)
    if a.get('Name') not in ('ManualDeathFist:WeakLeftFist','ManualDeathFist:WeakRightFist'):return None
    required=('ActionDuration','StayDuration','DashDuration','DashDistanceCap','AnimationName','EmotionName','SpineEventName')
    if not all(k in a for k in required):return None
    # The supported weak recipe uses the common authored .233333334s jab. Both
    # first-entry skeletons were read; the source's short attack branch is active.
    if (a['ActionDuration'],a['StayDuration'],a['SpineEventName']) != (.4,.2,'sfx'):return None
    return dict(behavior='source-batch5-c',category='basic',id='basic',label='普通攻击',action=a['Name'],end=a['ActionDuration'],
        batch5Operation='native-weak-deathfist',requiredPoolPresets=['fx_m_gauntlet_dash'],
        source='native ARM64 ManualDeathFist 0x8adbdf0/0x8adc150/0x8adc940; ManualSpineEventBaseAction 0x8b85e48',
        sourceSha256=ELF,nativeMethods='0x8adbdf0/0x8adc150/0x8adc940/0x8b85e48/0x668dd30',
        nativeJabDuration=.23333333432674408,nativeJabSfxTime=.1666666716337204)
