"""Build the explicitly incomplete 1-2 preview from native source resources.

This compiles raw ButterflyGuide routes; it does not certify controller parity.
Unknown native operations fail the build instead of silently disappearing.
"""
import argparse
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import hashlib
from screenplay_adapters import load_stage_module,build_declared_screenplays


def compile_butterfly(stage, key):
    current = [49.5, 0, -6] if key == 'butterfly_1' else [57.5, 0, -10.5]
    start = current[:]
    commands = []
    time = 0

    def walk(node):
        nonlocal current, time
        if isinstance(node, list):
            for value in node:
                walk(value)
            return
        for operation, value in node.items():
            if operation.startswith('$'):
                if operation not in ['$butterfly', '$butterfly sequence']:
                    raise ValueError('Unsupported native actor: ' + operation)
                walk(value)
            elif operation == 'direction':
                if value != 'lock':
                    raise ValueError('Unsupported native direction: ' + repr(value))
            elif operation == 'move':
                points = value['to']
                if isinstance(points[0], (int, float)):
                    points = [points]
                duration = sum(math.dist(a, b) for a, b in zip([current] + points, points)) / value['speed']
                commands.append({'at': time, 'op': 'move', 'target': 'butterfly', 'points': points,
                                 'duration': duration, 'speed': value['speed'], 'direction': {'down': 'front'}[value['direction']]})
                current = points[-1]
                time += duration
            elif operation == 'animation':
                commands.append({'at': time, 'op': 'pose', 'target': 'butterfly', 'animation': value, 'loop': True})
            elif operation == 'wait':
                time += value
            elif operation == 'set_alpha':
                commands.append({'at': time, 'op': 'fade', 'target': 'butterfly',
                                 'value': value['alpha'], 'duration': value['duration']})
                time += value['duration']
            elif operation == 'activate':
                commands.append({'at': time, 'op': 'visible', 'target': 'butterfly', 'value': value})
            else:
                raise ValueError('Unsupported native butterfly operation: ' + operation)

    if key == 'butterfly_1':
        commands.extend([{'at': 0, 'op': 'shadow', 'target': 'butterfly', 'value': True},
                         {'at': 0, 'op': 'sound', 'name': '01_fairy_01', 'fadeIn': 0.699999988079071}])
        # 0.7f is written to SfxInfo+0x58; it is NOT a coroutine wait.
    walk(stage['nativeEvents']['ButterflyGuide']['data'][key])
    return {'id': 'forest-1-2:' + key, 'family': 'forest-1-2:butterfly', 'version': 1,
            'map': stage['map'], 'title': key,
            'actors': [{**copy.deepcopy(stage['actors']['butterfly']), 'position': start}],
            'commands': commands, 'duration': time, 'blocking': False, 'preservePositions': True,
            'source': 'files/events/ButterflyGuide.json:' + key,
            'nativeEvidence': '729df04..729e948; actual literal references, not symbol labels'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--source', type=Path, default=Path('E:/GTFiles'))
    parser.add_argument('--reference', type=Path)
    args = parser.parse_args()
    reference = args.reference or args.root
    adapter=load_stage_module('forest-entrance')
    declarations=[arg for name in adapter.EVENTS for arg in ['--event',name]]
    declarations += [arg for prefix in adapter.STRING_PREFIXES for arg in ['--string-prefix',prefix]]
    subprocess.run([sys.executable, str(Path(__file__).with_name('build-stage-foundation.py')),
                    '--root', str(args.root), '--reference', str(reference), '--source', str(args.source),
                    '--stage', 'easy_forest_1_2', '--id', '1-2',*declarations], check=True)
    file = args.root / 'gtonline/assets/stage-1-2.json'
    stage = json.loads(file.read_text('utf8'))
    for key in ['butterfly_1', 'butterfly_2']:
        stage['scenes'][key] = compile_butterfly(stage, key)
    motion=json.loads((args.root/'tools/native/evidence/native-spine-motion.json').read_text('utf8'))
    stage['nativeMechanics']['spineMotion']=motion
    stage['scenes'].update(build_declared_screenplays(stage,'forest-entrance'))
    load_stage_module('forest-mainline').augment(stage,args.source)
    stage['music']={'field':'bgm_forest_bright','combat':'bgm_battle_normal'}
    stage['nativeMechanics']['vampireIdolMusic']={'actor':'vampireidol',
        'zones':{'vampireidol':'bgm_idol','vampireidol_lyric':'bgm_idol_lyric'},
        'source':'StageEventControllerVampireIdol .ctor 73ecd14 / OnEvent 73ed098',
        'limits':['Area polling approximates native enter/leave contact.',
                  'Visible actor approximates native nonzero ActiveState.',
                  'Combat BGM state normalization awaits native combat integration.']}
    stage['audit'].update({'status': 'playable-preview',
 'unknownOperations': [],
 'limitations': ['Mainline state flow is playable; exact original UI, conditional tutorial branches and '
                 'native-runtime comparison remain uncertified.',
                 'Cyclone FX, full mana rules and combat damage/AI fidelity remain incomplete.',
                 'Shared 1-1 movement, item and combat services retain their documented fidelity limits.',
                 'Jump crash alignment, aerial obstacle handling and gliding transitions remain incomplete.',
                 'Bomb native RNG sequence, stop/wind-pot state, throw trajectory and persistent fuse '
                 'restoration remain incomplete.',
                 'Floor switch customised NPC hitboxes and global reset commands remain incomplete.'],
 'storyParityCertified': False,
 'implemented': ['native map, placeholders, collider prefabs, collectibles',
                 'ButterflyGuide.json routes; native initial sleep position and shadow transition',
                 'Butterfly independent transient route guards and actual-position route durations',
                 'SealedKingdom source screenplay, theatre prefab, callbacks and StageProgress key 1',
                 'Registered SfxInfo fadeInTime and native linear fade-in envelope',
                 'VampireIdol area music and previous event/field music restoration',
                 'Shared combustible, pressure-switch and conditional-door components',
                 'Eight native jump tiles and separate flower-generated bomb objects',
                 'Directional Bounds-center jump targets, source velocity fallback, airborne pickups and repeat animation deadlines',
                 'Native bomb blink/color, max-pulse visual shake and count tick phase',
                 'ForestMainNew Section8 source dialogue, phone item/SNS callback barriers, follower 13 and '
                 'quest progress 7 to 8',
                 'SuperTutorial state sequence, DontFinish, control mask 0x17, two-door release and '
                 'final-exit flow',
                 'Native SuperCyclone weapon action timing/radius/animation for the tutorial path'],
 'pending': ['SuperTutorial: equipment recommendation UI, original-weapon comparison and exact conditional '
             'spawn coroutine branches',
             'ForestMainNew Section8: original SNS panel and exact native circular transition',
             'Quest 34 PetNew: source extracted; optional trap/bite sequence remains disabled until its '
             'native timing and branches are ported',
             'SealedKingdom: native frame-transition hold, shake RNG, speech-bubble timing and exact zone '
             'contact',
             'BurningSkull: SNS follower and combustion controller',
             'VampireIdol: NPC interaction, exact native contact and ActiveState, combat BGM state '
             'normalization',
             'Full branch, restore and frame-level comparison against native runtime',
             'Butterfly: region contact/entry, concurrent ScreenPlay jobs and native replay verification']})
    file.write_text(json.dumps(stage, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    ledger_file=args.root/'tools/native/evidence/stage-1-2-ledger.json'
    if ledger_file.exists():
        ledger=json.loads(ledger_file.read_text('utf8'))
        ledger.update(status=stage['audit']['status'],storyParityCertified=False,
                      implemented=stage['audit']['implemented'],pending=stage['audit']['pending'],
                      limitations=stage['audit']['limitations'])
        for key,name in [('controllerContracts','stage-1-2-controller-contracts.json'),
                         ('metadata','stage-1-2-metadata.json'),('registration','stage-1-2-registration.json'),
                         ('motion','native-spine-motion.json'),('sealedPrefab','sealed-kingdom-prefab.json'),
                         ('speechBubble','native-speech-bubble.json'),
                         ('screenplayCatalog','screenplay-catalog.json'),
                         ('controlFlow','iterators/control-join-identity.json'),('mainline','stage-1-2-mainline.json')]:
            proof=args.root/'tools/native/evidence'/name
            if not proof.exists():raise ValueError('Missing native evidence: '+name)
            ledger[key]={'path':proof.relative_to(args.root).as_posix(),'sha256':hashlib.sha256(proof.read_bytes()).hexdigest()}
        ledger_file.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n','utf8')


if __name__ == '__main__':
    main()
