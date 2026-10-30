"""Registered ManualSoundWave contract and reviewed normal-trigger option idiom."""
import hashlib
from native_csharp_melee import ELF


def compile_native_soundwave_plan(a):
    if a['Name'].split(':')[0] != 'ManualSoundWave':return None
    required=['ProjName','ShootFrame','Angle','DashFrame','AnimationInfo','ActionDuration']
    if not all(k in a for k in required):raise ValueError('Incomplete native sound-wave action '+a['Name'])
    return dict(behavior='native-soundwave',category='basic',action=a['Name'],
        source='native ARM64 ManualSoundWaveBattleAction .ctor 0x8b0740c / OnStart 0x8b083c0 / OnStateUpdate 0x8b08880 / CalculateSpeedScale 0x8b08ff0',sourceSha256=ELF,
        nativeSoundWave=dict(fps=30,jumpHeight=.30000001192092896,shootOffset=.5,projectileSelection='random-without-replacement',auraKey='action'))


def attach_normal_trigger_options(plan,options,lua_root):
    if plan.get('behavior')!='native-soundwave':return
    contracts=[]
    for option in options:
        if option.get('Class')!='Lua' or not option.get('ScriptName'):continue
        path=lua_root.parent/'Option'/(option['ScriptName']+'Option.lua')
        if not path.exists():continue
        lua=path.read_text(encoding='utf8')
        # This exact source idiom publishes its own option command, then start()
        # creates ownership effects. EnhanceActionName alone never installs an action.
        required=['CS.Oak.BattleActionTriggerEvent','CS.Oak.BattleActionType.Normal',
            'self.remain_cool_time > 0','self.remain_cool_time = self.cool_time',
            'CS.Oak.TriggerStageOptionCommand.CreateDefault','function local_class:start(',
            "battle_util.instantiate_ownership_effect(","self, 'buff', member, character_util.get_position(member), nil, character_util.get_transform(member)"]
        if not all(s in lua for s in required):continue
        contracts.append(dict(optionId=option['Id'],mythOptionField='MythOptionId',cooldownField='CoolTime',key='buff',anchor='feet',follow=True,directed=False,
            source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),previewRecipients='owner; stage party members and summonables need battle-party simulation'))
    if contracts:plan['normalTriggerOptions']=contracts
