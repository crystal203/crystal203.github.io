"""Native Twohand-family actions, pinned C# types and source Lua signatures."""
import hashlib
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_twohand_plan(a,lua,path):
    typ=a['Name'].split(':')[0];f=lambda k:['field',k]
    p=dict(behavior='timeline',category='basic',id='basic',label='普通攻击',action=a['Name'],end=a.get('ActionDuration',a.get('Duration',1)),clips=[],events=[],moves=[],spine=[],meleeTimeline=True)
    if typ=='TwohandSpinningSlash':
        # Fixed native state duration 1.7; ready pose held until spin .5, recovery 1.5.
        p.update(end=1.7,requiredPoolPresets=['FX_Twohanded_attack','FX_Twohanded_End'],
            clips=[dict(animation='twohand_attack2',at=0,speed=0,end=.5),dict(animation='twohand_attack_spin',at=.5,speed=1,loop=True,end=1.5),dict(animation='twohand_idle',at=1.5,speed=1,track='Upper')],
            moves=[dict(op='dash',at=.5,duration=.25,speed=10,stopOffset=.3)],
            events=[dict(op='effect',preset='FX_Twohanded_attack',at=.5,anchor='feet',offset=.4,heightBoundsFactor=.4,scale=1.75,mirrorXByFacing=['front','back'],follow=True,directed=False,until=1.5),dict(op='effect',preset='FX_Twohanded_End',at=1.5,anchor='feet',offset=.4,heightBoundsFactor=.4,scale=1.75,directed=False)])
        method='0x8c4d1f4/0x8c4e4cc/0x8c4eb04'
    elif typ=='JumpStompSupport':
        if not all(k in a for k in ['EffectPresetNames','EffectCreateTimings','JumpDuration','JumpHeight','BackJumpDuration']):return None
        p.update(category='support',id='support',label='连锁技能',animationArrays=True,sideDirection=True,
            nativeMotion=dict(op='jumpStomp',approach=a['JumpDuration'],hold=a.get('JumpInterval',.1),retreat=a['BackJumpDuration'],jumpHeight=a['JumpHeight'],backJumpHeight=a.get('BackJumpHeight',1.5),contact=bool(a.get('IsContact'))),
            events=[dict(op='effect',preset=preset,at=a['EffectCreateTimings'][i],anchor='targetGround' if (a.get('EffectAnchors') or ['Self'])[i]=='Target' else 'feet',offsetVector=a.get('EffectOffset'+str(i+1)),rotateOffset=(a.get('EffectOffsetTypes') or [None]*len(a['EffectPresetNames']))[i]=='RotateLookDir',directed=False,nativePoolTransform='direct',nativePoolLifetime=True) for i,preset in enumerate(a['EffectPresetNames'])])
        method='0x8c1dc6c/0x8c22f8c/0x8c231b4/0x8c1ff38'
    elif typ=='ManualWeaponBoomerang':
        if not all(k in a for k in ['ProjPreset','TrailPreset','AnimationName','SpineEventName']):return None
        p.update(clips=[dict(animationField='AnimationName',at=0)],events=[dict(op='weapon-arc',at=0,animationField='AnimationName',nameField='SpineEventName',life=1,radius=1.5,angle=90,spinMultiplier=15)])
        method='0x8b0def4/0x8b0ed8c/0x8b0f1ac/0x8b0e8d0'
    elif typ=='CwpSuccubusHeartBreaker':
        if not all(k in a for k in ['Projectile','Columns','Parallel','SpreadAngle','ShootStartProgress','ActionDuration']):return None
        # ShootPatternInfo.AngleOffset 0x6c947fc: spreadAngle * (i-(columns-1)/2).
        if a['Parallel']:return None
        action={**a,'ProjectileInfo':[{'Name':a['Projectile']}]}
        presets={k:v for row in a.get('PresetInfo',[]) for k,v in ([(row['Name'],row['Preset'])] if 'Name' in row else row.items())}
        p.update(category='cwp',id='cwp',label='专武技能',exclusive=True,clips=[dict(key='Cast',at=0)],
            resolvedParameters=dict(action=action,presets=presets),
            events=[dict(op='effect',key=key,at=0,anchor='center',follow=True,directed=False,nativePoolTransform='direct',nativePoolLifetime=True) for key in ['Exclusive','Cast'] if key in presets]+[dict(op='projectile',at=a['ActionDuration']*a['ShootStartProgress'],index=0,offset=.5,originAngle=(i-(a['Columns']-1)/2)*a['SpreadAngle'],directionAngle=(i-(a['Columns']-1)/2)*a['SpreadAngle'],directional=True,muzzle=False) for i in range(a['Columns'])])
        method='0x8bdb7d4/0x8bdd0a0/0x8bdd8ac/0x6c947b4/0x6c99004'
    elif typ=='CwpMaidFickleLady':
        if not all(k in a for k in ['PullInTiming','ExplosionTiming','ActionDuration']):return None
        p.update(category='cwp',id='cwp',label='专武技能',exclusive=True,
            nativeMotion=dict(op='hammerLeap',speed=16.66666603088379,dashDuration=.3,returnAt=a['ExplosionTiming'],velocity=7,gravity=19.600000381469727,apexAt=.35,apexClock=.4,dropAt=.375,dropTimeScale=15,spineHeightScale=2),
            clips=[dict(key='cast',at=0),dict(key='top',at=.35),dict(key='stomp',at=.375),dict(key='explosion',at=f('ExplosionTiming'),end=a['ExplosionTiming']+.03),dict(key='cast',at=0,track='Emotion'),dict(key='explosion',at=f('ExplosionTiming'),track='Emotion')],
            events=[dict(op='effect',key='cast',at=f('PullInTiming'),anchor='center',offset=.75,directed=False,nativePoolTransform='direct',nativePoolLifetime=True),dict(op='effect',key='explosion',at=f('ExplosionTiming'),anchor='center',offset=.75,directed=False,nativePoolTransform='direct',nativePoolLifetime=True)])
        method='0x8bce830/0x8bcedf4/0x8bcf4bc/0x8bd0ab8/0x88643d0'
    elif typ=='ManualCharmStomp':
        if not all(k in a for k in ['AnimationName','SpineEventName','ActionDuration','DashDuration','StayDuration']):return None
        p.update(requiredPoolPresets=['Manual_Twohanded_Succubus_Shockwave'],
            clips=[dict(animation='rifle_victory',at=0,speed=1.6,track='Upper'),dict(animationField='AnimationName',at=0,targetDurationField='ActionDuration')],
            events=[dict(op='effect',preset='Manual_Twohanded_Succubus_Shockwave',at=0,anchor='feet',directed=False,nativePoolTransform='direct',spineEvent=dict(animationField='AnimationName',nameField='SpineEventName',targetDurationField='ActionDuration',index=1))],
            moves=[dict(op='dash',at=f('StayDuration'),duration=f('DashDuration'),speed=['div',f('DashDistanceCap'),f('DashDuration')],stopOffset=.3)])
        method='0x8ad5f08/0x8ad6204/0x8ad6478/0x8ad6ae4'
    elif lua and 'self.action.area_machine:change(nil)' in lua and 'self.owner.Position + self.offset * self.dir_vector' in lua and 'self.sub_damage_scale = (1 - self.main_damage_scale) / (#self.hit_timing - 1)' in lua:
        if not all(k in a for k in ['AttackTiming','ActionDuration','Offset','HitTiming']):return None
        p.update(category='cwp',id='cwp',label='专武技能',exclusive=True,
            clips=[dict(key='action',at=0)],
            events=[dict(op='effect',key='cast',at=0,anchor='center',follow=True,followSpine=True,directed=False,nativePoolTransform='direct',nativePoolLifetime=True),dict(op='effect',key='screen',at=f('AttackTiming'),screen=True,directed=False),dict(op='effect',key='explosion',at=f('AttackTiming'),anchor='feet',offset=f('Offset'),directed=False,nativePoolTransform='direct',nativePoolLifetime=True)],
            source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),nativeAreaEnd=a['AttackTiming']+max(a['HitTiming']))
        return p
    else:return None
    p.update(source='native ARM64 '+method,sourceSha256=ELF,nativeMethods=method)
    return p
