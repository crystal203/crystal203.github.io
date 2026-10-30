"""Read-only Sprite PPtr closure audit, with exact CAB/path-ID candidate checks.

Matching CAB names do not establish matching AssetBundle contents. This tool
reports missing IDs without replacing, guessing, or modifying any source asset.
"""
import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path


def serialized_files(bundle):
    for value in getattr(bundle, 'files', {}).values():
        if hasattr(value, 'objects'):
            yield value
        else:
            yield from serialized_files(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path(__file__).with_name('import-config.json'))
    parser.add_argument('--preset', action='append', required=True, help='Exact ObjectPoolSpec PresetName')
    parser.add_argument('--prefer-apk-bundle', action='append', default=[], help='Read-only replay of an APK dependency, bypassing file roots for this exact bundle')
    parser.add_argument('--candidate-apk', type=Path, action='append', default=[], help='Inspect missing PPtrs in a candidate archive, without substituting its data')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8-sig'))
    for root in [*config.get('pythonExtraLibs', []), config.get('pythonLibs')]:
        if root:
            sys.path.insert(0, root)
    sys.modules['UnityPy.UnityPyBoost'] = None
    import UnityPy
    repo = args.config.resolve().parents[2]
    pools = json.loads((repo/'gtfx/assets/native-source/objectpoolspec.json').read_text(encoding='utf-8'))
    rows = [row for row in pools if row.get('PresetName') in args.preset]
    absent = sorted(set(args.preset) - {row['PresetName'] for row in rows})
    if absent:
        raise ValueError('Unknown source presets: ' + ', '.join(absent))
    roots = [Path(config['bundleRoot']), *map(Path, config.get('bundleFallbackRoots', []))]
    apk = zipfile.ZipFile(config['apk']) if config.get('apk') else None
    env = UnityPy.Environment()
    bundles = {}
    cab_sources = {}

    def load(name):
        if name in bundles:
            return
        path = None if name in args.prefer_apk_bundle else next((root/name for root in roots if (root/name).is_file()), None)
        member = 'assets/AssetBundles/Android/' + name
        data = path.read_bytes() if path else apk.read(member)
        origin = str(path) if path else str(config['apk']) + '!' + member
        record = {'source': origin, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        if path:
            sidecar = Path(str(path) + '.source.json')
            if sidecar.is_file():
                record['provenance'] = json.loads(sidecar.read_text(encoding='utf-8-sig'))
            marker = next((parent/'assetbundle-version' for parent in path.parents if (parent/'assetbundle-version').is_file()), None)
            if marker:
                record['rootVersionMarker'] = marker.read_text(encoding='utf-8-sig').splitlines()
        else:
            match = re.search(r'(?<!\d)(\d+\.\d+\.\d+)(?!\d)', Path(config['apk']).name)
            if match:
                record['apkFilenameVersion'] = match.group(1)
        bundles[name] = record
        bundle = env.load_file(data, name=name)
        record['serializedFiles'] = []
        for file in serialized_files(bundle):
            cab_sources[file.name.lower()] = name
            record['serializedFiles'].append({'cab': file.name, 'objects': len(file.objects), 'types': dict(Counter(obj.type.name for obj in file.objects.values()))})
        for obj in bundle.get_objects():
            if obj.type.name == 'AssetBundle':
                for dependency in obj.read().m_Dependencies:
                    load(dependency)

    for name in sorted({row['AssetBundleName'] for row in rows if row.get('AssetBundleName')}):
        load(name)
    references, missing = [], []

    def audit(ref, obj, node, usage):
        if not ref or not ref.m_PathID:
            return
        file = ref.assetsfile
        target = file.externals[ref.m_FileID-1].path.rsplit('/', 1)[-1] if ref.m_FileID else file.name
        record = {'node': node, 'usage': usage, 'originCab': file.name, 'targetCab': target, 'pathId': str(ref.m_PathID)}
        try:
            sprite = ref.read()
            if sprite.object_reader.type.name != 'Sprite':
                raise TypeError('Referenced object is ' + sprite.object_reader.type.name)
            record['spriteName'] = sprite.m_Name
        except Exception as error:
            record['error'] = str(error)
            record['targetBundle'] = cab_sources.get(target.lower())
            record['classification'] = 'existing-cab-missing-path-id' if record['targetBundle'] else 'missing-external-cab'
            missing.append(record)
        references.append(record)

    for obj in env.objects:
        if obj.type.name == 'ParticleSystem':
            source = obj.read()
            for item in source.UVModule.sprites:
                audit(item.sprite, obj, source.m_GameObject.read().m_Name, 'ParticleSystem.UVModule.sprites')
        elif obj.type.name == 'SpriteRenderer':
            source = obj.read()
            if source.m_Enabled:
                audit(source.m_Sprite, obj, source.m_GameObject.read().m_Name, 'SpriteRenderer.m_Sprite')
    candidates = []
    for path in args.candidate_apk:
        with zipfile.ZipFile(path) as candidate:
            for name in sorted({row.get('targetBundle') for row in missing} - {None}):
                member = 'assets/AssetBundles/Android/' + name
                if member not in candidate.namelist():
                    continue
                raw = candidate.read(member)
                for file in serialized_files(UnityPy.load(raw)):
                    resolved = [row['pathId'] for row in missing if row['targetCab'].lower() == file.name.lower() and int(row['pathId']) in file.objects]
                    candidates.append({'source': str(path) + '!' + member, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'cab': file.name, 'objects': len(file.objects), 'exactMissingPathIdsPresent': resolved})
    report = {'presets': args.preset, 'bundles': bundles, 'spriteReferenceCount': len(references), 'missingSpriteReferences': missing, 'candidateBundles': candidates, 'passed': not missing,
              'contract': 'A CAB name alone does not prove matching contents. Missing PPtrs require original source with the exact target CAB and path IDs; candidates are inspected only and never substituted.'}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'bundles': len(bundles), 'spriteReferences': len(references), 'missing': len(missing), 'candidateExactMatches': sum(len(row['exactMissingPathIdsPresent']) for row in candidates), 'output': str(args.output) if args.output else None}))
    if apk:
        apk.close()
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
