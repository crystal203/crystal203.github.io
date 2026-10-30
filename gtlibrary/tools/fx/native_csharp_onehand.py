"""Registered source contract for legacy one-hand melee action classes."""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'


def compile_onehand_plan(a):
    typ=a['Name'].split(':')[0]
    if typ not in ['OnehandSlash','OnehandBackSlash','OnehandShieldBash','OnehandStinger']:
        return None
    duration=a['ActionDuration']
    common=dict(operation='registered-onehand',nativeType=typ,lengthSource='WeaponSpec.Length')
    if typ in ['OnehandSlash','OnehandBackSlash']:
        back=typ=='OnehandBackSlash'
        common.update(attack='slash',animation='sword_attack2' if back else 'sword_attack',
          animationTime=.5 if back else .3499999940395355,
          hitFraction=.3199999928474426 if back else .449999988079071,
          dashSpeed=8,dashStopOffset=.15000000596046448,dashTail=.05000000074505806,
          defaultLength=1.7000000476837158,lengthReference=1.7000000476837158,
          effectField='SlashPreset',effectDefault='FX_SwordSlash_simple',offset=.25,height=.10000000149011612,
          scale=.699999988079071,negativeYDirections=['back','left'] if back else ['right','front'])
        methods=['0x8b53e98','0x8b5413c','0x8b544b8','0x8b54c34'] if back else ['0x8b56224','0x8b564c4','0x8b56840','0x8b56fc0']
        pools=['FX_SwordSlash_simple']
    elif typ=='OnehandShieldBash':
        common.update(attack='bash',animation='sword_shield_attack',animationTime=.6669999957084656*1.100000023841858,
          hitFraction=.3199999928474426,effectLead=.029999999329447746,effectDefault='FX_SlashLine_Hit',
          offset=.800000011920929,upOffset=1,heightForSide=.3499999940395355)
        methods=['0x8b55148','0x8b554d4','0x8b55f4c'];pools=['FX_SlashLine_Hit']
    else:
        common.update(attack='stinger',animation='sword_attack_stab',animationTime=.2669999897480011,
          hitFraction=.10000000149011612,dashSpeed=10,dashStopOffset=.15000000596046448,
          dashTail=.05000000074505806,effectField='DashPreset',defaultLength=1.5,
          bone='[base]weapon1',jumpHeight=.20000000298023224,jumpDuration=.125)
        methods=['0x8b574e4','0x8b5770c','0x8b57a18','0x8b57c8c','0x8b585a8','0x8b58754','0x8b587a4'];pools=[a['DashPreset']] if a.get('DashPreset') else []
    return dict(behavior='source-continuous-arsenal',category='basic',id='basic',label='普通攻击',
        action=a['Name'],end=duration,nativeArsenal=common,events=[],clips=[],moves=[],spine=[],
        source='native ARM64 '+','.join(methods),sourceSha256=ELF,nativeMethods=methods,
        requiredPoolPresets=pools,sourceIdiom='registered-onehand-melee-v1')
