"""Bind hero voice text to explicit gtAudio clip IDs from the offline package.

No fuzzy names or cross-language fallbacks. Identical text can share a recording
between a costume's ordinary/myth variants when that language has no separate take.
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--audio', type=Path, help='Staged gtaudio; defaults to repo/gtaudio')
    parser.add_argument('--source', type=Path, default=Path('E:/GTFiles/static_data_dec'))
    parser.add_argument('--package', type=Path, default=Path('E:/GTFiles/GTOfflineServer'))
    parser.add_argument('--unity-libs', type=Path)
    parser.add_argument('--out', type=Path, help='Output root; defaults to --repo')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    output = args.out or args.repo
    audio = args.audio or args.repo / 'gtaudio'
    catalog = read(audio / 'data/catalog.json')
    imported = read(audio / 'data/offline-package.json')
    provenance = read(audio / 'data/provenance.json')
    clips = {c['id']: c for c in catalog['clips']}
    types = read(Path(__file__).with_name('voice-types.json'))['values']
    heroes = read(args.source / 'heroes.json')
    origins = {h['OriginId']: h.get('VoiceId', h['OriginId']) for h in heroes if h.get('Playable')}
    index = read(args.repo / 'gtwiki/data/catalog.json')
    by_name = collections.defaultdict(list)
    for bundle in imported['sources']:
        match = re.search(r'/voices_(cn|en|ja)/(\d+)$', bundle['source'])
        if not match:
            continue
        lang, origin = match.groups()
        for id_ in bundle['clips']:
            c = clips[id_]
            by_name[(lang, int(origin), c['name'])].append(c)
    # Some bundles contain obsolete copies under assets/audio/music alongside
    # the actual hero takes. Use Unity's container identity to distinguish them.
    ambiguous = {provenance[c['id']]['offlinePackageSource']
                 for choices in by_name.values() if len({c['sha256'] for c in choices}) > 1
                 for c in choices if not provenance[c['id']].get('assetPaths')}
    paths = {}
    if ambiguous:
        if args.unity_libs:
            sys.path.insert(0, str(args.unity_libs))
        import UnityPy
        for bundle in sorted(ambiguous):
            env = UnityPy.load((args.package / 'assets/resources' / bundle).read_bytes())
            paths[bundle] = collections.defaultdict(list)
            for asset_path, obj in env.container.items():
                paths[bundle][str(obj.path_id)].append(asset_path)

    def lookup(lang, voice_id, name):
        options = by_name.get((lang, voice_id, name), [])
        if len({c['sha256'] for c in options}) > 1:
            canonical = []
            for c in options:
                p = provenance[c['id']]
                asset_paths = p.get('assetPaths') or paths.get(p['offlinePackageSource'], {}).get(str(p['pathId']), [])
                if any('/ondemand/voices_' + lang + '/' in v for v in asset_paths):
                    canonical.append(c)
            if canonical:
                options = canonical
        # Byte-identical duplicate objects only need one button/recording.
        unique = {}
        objects = set()
        for c in sorted(options, key=lambda c: (not c['file'].endswith('.flac'), c['id'])):
            meta = provenance[c['id']]
            identity = (meta['bundleSha256'], str(meta['pathId']))
            if identity in objects:
                continue
            objects.add(identity)
            unique.setdefault(c['sha256'], c['id'])
        return list(unique.values())

    personalities = {'cool': 0, 'mukuchi': 1, 'youki': 2,
                     'kougekiteki': 0, 'teinei': 1, 'nekketsu': 2}
    languages = {'zhCN': 'cn', 'enUS': 'en', 'jaJP': 'ja'}
    counts = collections.Counter()
    missing = []
    linked_heroes = set()
    total = 0
    for summary in index['heroes']:
        hero = read(args.repo / 'gtwiki/data' / summary['file'])
        voice_id = origins[summary['originId']]
        groups = hero.get('voiceLines', [])
        for group in groups:
            suffix = group['id'][len(hero['id']):].strip('_')
            personality = next((p for p in personalities if suffix == p or suffix.endswith('_' + p)), None)
            if personality:
                suffix = suffix.removesuffix(personality).strip('_')
            for row in group['lines']:
                total += 1
                row['audio'] = {lang: [] for lang in languages}
                row.pop('audioShared', None)
                code = types.get(row['type'])
                if code is None:
                    missing.append({'hero': hero['id'], 'group': group['id'], 'type': row['type'], 'reason': 'unknown native enum'})
                    continue
                name = str(voice_id * 10000 + personalities.get(personality, 0) * 1000 + code)
                if suffix:
                    name += '_' + suffix
                row['audioName'] = name
                for lang, bundle_language in languages.items():
                    row['audio'][lang] = lookup(bundle_language, voice_id, name)
        # The client reuses non-myth costume recordings for unchanged lines.
        # Require identical text for that exact language/type, same personality
        # and costume; never substitute an unrelated hero or costume.
        for group in groups:
            if '_myth' not in group['id']:
                continue
            base_id = group['id'].replace('_myth', '')
            base = next((g for g in groups if g['id'] == base_id), None)
            if not base:
                continue
            base_rows = {r['type']: r for r in base['lines']}
            for row in group['lines']:
                other = base_rows.get(row['type'])
                if not other:
                    continue
                for lang in languages:
                    if not row['audio'][lang] and row['texts'][lang] and row['texts'][lang] == other['texts'][lang] and other['audio'][lang]:
                        row['audio'][lang] = other['audio'][lang][:]
                        row.setdefault('audioShared', {})[lang] = base_id
        for group in groups:
            for row in group['lines']:
                for lang in languages:
                    if row['audio'][lang]:
                        counts[lang] += 1
                        linked_heroes.add(hero['id'])
                    else:
                        missing.append({'hero': hero['id'], 'group': group['id'], 'type': row['type'], 'language': lang})
        hero.setdefault('sources', {})['voiceAudio'] = 'gtaudio/data/offline-package.json; CharacterVoiceType; heroes.json VoiceId'
        write(output / 'gtwiki/data' / summary['file'], hero)
    report = dict(heroes=len(index['heroes']), heroesWithAudio=len(linked_heroes), lines=total,
                  linked=dict(counts), missing=missing, package={k: imported[k] for k in ('gameVersion', 'resourceVersion', 'apkSha256')})
    if args.report:
        write(args.report, report)
    print(json.dumps({k: v for k, v in report.items() if k != 'missing'}), flush=True)


if __name__ == '__main__':
    main()
