"""C# native action type recipes, interpreted as ordinary timeline operations.
Pinned to the same ELF used by native-controller-image.py. No hero runtime dispatch.
"""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'

def compile_native_melee_plan(a):
    typ=a['Name'].split(':')[0]
    f=lambda key:['field',key]
    ev=lambda key,at=0,**kw:dict(op='effect',key=key,at=at,**kw)
    plan=dict(behavior='timeline',category='basic',id='basic',label='普通攻击',action=a['Name'],
              end=a.get('ActionDuration',1),clips=[dict(key='action',at=0)],moves=[],spine=[],events=[],meleeTimeline=True)
    if typ=='ManualMotorcycleCrash':
        # ctor8af0b18 stay=duration*.1, dash=floor((duration*.9-stay)*10)/10.
        stay=a['ActionDuration']*.1
        import math
        dash=math.floor((a['ActionDuration']*.9-stay)*10)/10
        plan.update(moves=[dict(op='dash',at=stay,duration=dash,speed=f('DashSpeed'),stopOffset=.3)],
                    events=[ev('attack',stay,offset=.3,follow=True,followSpine=True,anchor='center')])
        method='0x8af1364/0x8af15fc'
    elif typ=='ManualMotorcycleSlash':
        # OnSpineCallback8af3624: authored sfx event, actual animation rate.
        plan.update(events=[ev('action',spineEvent=dict(animationKey='action',nameField='SpineEventName'),
                               anchor='center',fourWay=True,follow=True,followSpine=True)])
        method='0x8af3098/0x8af3624'
    elif typ=='ManualMotorcycleSpinningSlash':
        plan.update(events=[ev('attack',a['ActionDuration']*.1,anchor='center',fourWay=True,
                               follow=True,followSpine=True,triggerDisposeAt=f('ActionDuration'))])
        method='0x8af3930/0x8af3a14'
    elif typ=='EugeneSupport':
        plan.update(category='support',id='support',label='连锁技能',sideDirection=True,end=a['Duration'],clips=[],animationArrays=True,
                    nativeMotion=dict(op='sideVaultReturn',approach=f('JumpDuration'),hold=f('JumpInterval'),retreat=f('BackJumpDuration'),returnInterpolation=.1,clearance=.2,backDistance=4,approachAngle=60,retreatAngle=360,heightRampStart=.75,jumpHeight=f('BackJumpHeight'),pivot=.38499999046325684),
                    events=[ev('spark',a['JumpDuration'],anchor='center',directed=False,mirrorXForNegative=True,nativePoolTransform='sideMirror'),
                            ev('kick',a['JumpDuration']+a['JumpInterval'],negativeKey='flip',anchor='center',height=1,directed=False)])
        method='0x8c1e058/0x8c1eeec/0x6b1c7cc/0x6cc5bb4'
    elif typ=='CwpEugeneMotorcycleStunt':
        plan.update(category='cwp',id='cwp',label='专武技能',exclusive=True,
                    clips=[dict(key='action',at=0,fallbackAnimationKey='actionbackup')],
                    nativeMotion=dict(op='projectedOrbit',radius=.6,range=['fieldIndex','Size',0],angleStart=-180,angleRange=900),
                    events=[ev('action',anchor='feet',follow=True,followSpine=True,directed=False),ev('screen',screen=True,directed=False),
                            ev('trail',anchor='feet',sideOffset=.6,follow=True,fourWay=True,triggerDisposeAt=f('ActionDuration')),
                            ev('shoot',anchor='feet',bone='[base]elbowL',directionBone='[base]elbowL',boneByFacing={'back':'[base]elbowR'},boneOffset=.75,triggerDisposeAt=f('ActionDuration')),
                            dict(op='radial-debris',at=0,term=.05,until=f('ActionDuration'),minRadius=.8,radius=['fieldIndex','Size',2],angleStart=-180,angleRange=900,originOffset=.375,
                                 hitKey='hit',debrisKey='cartridge',bounceKey='smoke',speed=6,bouncedSpeed=2,velocity=5,gravity=12.5,timeScale=2,elasticity=.4,bounceScale=.4)])
        method='0x8bb69b4/0x8bb7680/0x8bb8a34/0x8bb8e8c'
    else:return None
    for event in plan['events']:
        if event['op']=='effect' and not event.get('screen'):
            event.setdefault('nativePoolTransform','directional' if event.get('key') not in ['kick','shoot'] else 'direct')
    plan.update(source='native ARM64 '+method,sourceSha256=ELF,nativeMethods=method)
    return plan
