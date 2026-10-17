"""1-2 controller lowering. Shared screenplay parsing remains stage-independent.

The source manifest records the remaining UI/combat fidelity limitations.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

def augment(stage, source):
    source=Path(source)
    spec=importlib.util.spec_from_file_location('mainline_screenplay',Path(__file__).resolve().parents[1]/'screenplay-compiler.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    raw=(source/'files/events/ForestMainNew.json').read_bytes()
    document=json.loads(raw)
    strings=json.loads((source/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'))
    stage['strings'].update({k:v for k,v in strings.items() if k.startswith(('forest_main_s8','super_tutorial'))})
    stage['nativeEvents']['ForestMainNew']={'sha256':hashlib.sha256(raw).hexdigest(),'data':document}
    actions=[]
    def drop(compiler):
        # DropPhone enumerates the current party, eating for .5f per member.
        # On the first 1-2 entry only the leader belongs to that party.
        compiler.emit('pose','leader',animation='eat',loop=False)
        compiler.time+=module.single(.5)
        compiler.emit('pose','leader',animation='idle')
        compiler.emit('pose','maiden',animation='idle')
        compiler.time+=module.single(.3)
        compiler.emit('pose','maiden',animation='throw',loop=False)
        compiler.emit('sound',name='01_throw_01')
        actions.append(dict(at=compiler.time,name='ForestPhoneDrop'))
        compiler.time+=module.single(.3)
        compiler.emit('pose','maiden',animation='idle')
    def await_callback(name):
        def callback(compiler):
            compiler.emit('awaitCallback',name=name)
            # Distinguish the continuation from the barrier in the finite
            # timeline representation; this is not an invented native wait.
            compiler.time+=.001
        return callback
    local={'setting':[{'$maiden':{'find':'maiden'}},{'$player':{'find':'player'}}],
           'section_8':document['section_8']}
    compiler=module.ScreenplayCompiler(stage,{'DropPhone':drop,'GetPhone':await_callback('ForestPhoneGet'),'PhoneCall':await_callback('ForestPhoneSNS')})
    plan=compiler.compile(local,'section_8','files/events/ForestMainNew.json')
    plan.update(nativeEvidence='ForestMainNewSection8 707b23c..707d738',gameActions=actions)
    plan['commands'] += [dict(at=0,op='pose',target='leader',direction='left'),dict(at=plan['duration'],op='pose',target='leader',animation='victory_get',direction='left',loop=False),
                         dict(at=plan['duration'],op='sound',name='01_stage_intro_jump_01')]
    plan['gameActions'] += [dict(at=plan['duration'],name='StageTitle'),dict(at=plan['duration'],name='ForestPhoneComplete')]
    plan['duration']+=module.single(1.8)
    stage['scenes']['forest_phone']=plan
    stage['nativeMechanics']['itemPresentation']['20017']={
        'name':strings['forest_main_s8_phone_title'],'title':strings['forest_main_s8_phone_title'],
        'subtitle':strings['forest_main_s8_phone_subtitle'],'body':strings['forest_main_s8_phone_description']}
    build_tutorial(stage,source)

def build_tutorial(stage,source):
    actors=stage['actors'];commands=[]
    group=stage['battles']['super_tutorial_goblins']['actors']
    for i,handle in enumerate(group):
        x=[-.8,.8,.8,-.8][i];z=[-.5,.5,-.5,.5][i]
        commands += [dict(at=0,op='teleport',target=handle,position=[0,0,0],nativeSpawnOffset=[x,0,z-10]),
            dict(at=0,op='visible',target=handle,value=True),
            dict(at=0,op='move',target=handle,points=[[0,0,0]],duration=10/9,speed=9,direction='back',nativeWaypointOffset=[x,0,z]),
            dict(at=10/9,op='jump',target=handle,height=.2,duration=.2,nativeJump=True)]
    text=stage['strings']['super_tutorial_goblin'];at=10/9+.2;duration=len(text)*.05+2
    commands += [dict(at=at,op='dialogue',target=group[0],text=text,code='super_tutorial_goblin',duration=duration,typeSpeed=.05,waitForClick=True,nativeTypewriter=True),
                 dict(at=at+duration,op='move',target='leader',points=[[14.5,0,32.5]],speed=2,duration=1,direction='front')]
    stage['scenes']['super_goblins']=dict(version=1,map=stage['map'],id='1-2:super_goblins',title='super_goblins',
        actors=[copy.deepcopy(actors[h]) for h in ['leader']+group],commands=commands,duration=at+duration+1,
        blocking=True,preservePositions=True,waitForDialogue=True,nativeController='SuperTutorial.AppearGoblins',
        nativeEvidence='738ebe4..7390314; exact conditional coroutine branches remain under audit')
    stage['scenes']['super_end']=dict(version=1,map=stage['map'],id='1-2:super_end',title='super_end',
        actors=[copy.deepcopy(actors['leader'])],commands=[dict(at=0,op='awaitCallback',name='SuperActionFinished'),dict(at=.001,op='pose',target='leader',animation='idle',expression='idle')],
        duration=.15,blocking=True,preservePositions=True,
        nativeEvidence='7390468..7391880; originalWeapon comparison/choice remains under audit')
    items=json.loads((source/'static_data_dec/items.json').read_text('utf-8-sig'))
    actions=json.loads((source/'static_data_dec/battleactions.json').read_text('utf-8-sig'))
    weapon=next(item for item in items if item['Id']==9010020)
    stage['nativeMechanics']['weaponSkills']={'9010020':{'level':4,'item':weapon,
        'action':next(action for action in actions if action['Name']==weapon['SuperBattleAction'])}}
    name=stage['strings'].get(weapon['Name'],weapon['Name'])
    stage['nativeMechanics']['itemPresentation']['9010020']={'name':name,'title':name}
