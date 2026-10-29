"""Bake source Unity birth positions and Flip for eligible fixed-seed bursts.

Uses only the Python standard library and an installed Unity editor. Outputs a
versioned sidecar; import-character-native.py reapplies it after prefab refresh.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from fixed_emission import apply_native_emission, eligible, node_path, signature


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--prefab-root', type=Path, required=True)
    parser.add_argument('--unity', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True, help='New temporary Unity project directory')
    parser.add_argument('--output', type=Path, required=True, help='native-emission directory')
    args = parser.parse_args()
    manifest = json.loads(args.index.read_text(encoding='utf8'))
    work = args.work_dir.resolve()
    if work.exists():
        parser.error('--work-dir must be a new directory')
    jobs = []
    sources = []
    for effect in manifest['effects']:
        systems = [system for system in effect['systems'] if eligible(system)]
        if not systems:
            continue
        matches = list(args.prefab_root.rglob((effect.get('assetName') or effect['preset']) + '.prefab'))
        if len(matches) != 1:
            raise ValueError(f'Expected one source prefab for {effect["preset"]}: {matches}')
        prefab = f'Assets/source-{len(sources)}.prefab'
        sources.append((matches[0], prefab))
        for system in systems:
            jobs.append({'prefab': prefab, 'preset': effect['preset'], 'path': node_path(effect, system['node']),
                         'signature': signature(system), 'seed': system['seed'] & 0xffffffff,
                         'count': int(system['modules']['EmissionModule']['m_Bursts'][0]['countCurve']['scalar'])})
    if not jobs:
        raise ValueError('No supported fixed-seed stationary bursts in this index')
    (work / 'Assets/Editor').mkdir(parents=True)
    (work / 'Packages').mkdir()
    (work / 'Packages/manifest.json').write_text('{"dependencies":{}}', encoding='utf8')
    (work / 'ProjectSettings').mkdir()
    version = args.unity.parent.parent.name
    (work / 'ProjectSettings/ProjectVersion.txt').write_text(f'm_EditorVersion: {version}\n', encoding='utf8')
    shutil.copy2(Path(__file__).with_name('BakeFixedEmission.cs'), work / 'Assets/Editor/BakeFixedEmission.cs')
    for source, target in sources:
        shutil.copy2(source, work / target)
    (work / 'request.json').write_text(json.dumps({'systems': jobs}), encoding='utf8')
    command = [str(args.unity), '-batchmode', '-nographics', '-projectPath', str(work),
               '-executeMethod', 'BakeFixedEmission.Run', '-logFile', str(work / 'unity.log')]
    print(f'Baking {len(jobs)} systems in {work}', flush=True)
    subprocess.run(command, check=True, timeout=240, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    result = json.loads((work / 'result.json').read_text(encoding='utf8'))
    result['sources'] = [{'prefab': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
                         for source, _ in sources]
    args.output.mkdir(parents=True, exist_ok=True)
    output = args.output / (manifest['character'] + '.json')
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    apply_native_emission(manifest, args.output)
    args.index.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    print(f'Applied {len(result["systems"])} native emission records -> {output}')


if __name__ == '__main__':
    main()
