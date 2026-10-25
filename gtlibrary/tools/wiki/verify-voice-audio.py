"""Verify explicit voice bindings, language identity and imported audio bytes."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--fallback', type=Path, help='Original repository for staged assets')
    parser.add_argument('--hash-files', action='store_true')
    args = parser.parse_args()
    root = args.repo
    def file(relative):
        path = root / relative
        if not path.exists() and args.fallback:
            path = args.fallback / relative
        return path
    catalog = read(file('gtaudio/data/catalog.json'))
    package = read(file('gtaudio/data/offline-package.json'))
    provenance = read(file('gtaudio/data/provenance.json'))
    heroes = read(file('gtwiki/data/catalog.json'))['heroes']
    clips = {c['id']: c for c in catalog['clips']}
    assert len(clips) == len(catalog['clips']) == catalog['summary']['clips']
    assert dict(collections.Counter(c['kind'] for c in clips.values())) == catalog['summary']['counts']
    assert all(id_ in clips for id_ in catalog['defaults'].values())
    actual_language = {}
    imported_files = {}
    for bundle in package['sources']:
        for id_ in bundle['clips']:
            c = clips[id_]
            imported_files[c['file']] = c
        match = re.search(r'/voices_(cn|en|ja)/(\d+)$', bundle['source'])
        if match:
            for id_ in bundle['clips']:
                actual_language[id_] = match.group(1)
    linked = collections.Counter()
    for summary in heroes:
        h = read(file('gtwiki/data/' + summary['file']))
        for g in h['voiceLines']:
            for row in g['lines']:
                for lang, code in [('zhCN','cn'), ('enUS','en'), ('jaJP','ja')]:
                    refs = row['audio'][lang]
                    assert len(refs) == len(set(refs))
                    for id_ in refs:
                        clip = clips[id_]
                        assert actual_language[id_] == code, (h['id'], id_, lang)
                        assert provenance[id_]['bundleSha256']
                        assert file('gtaudio/' + clip['file']).is_file(), id_
                        if lang in row.get('audioShared', {}):
                            base = next(group for group in h['voiceLines'] if group['id'] == row['audioShared'][lang])
                            other = next(r for r in base['lines'] if r['type'] == row['type'])
                            assert row['texts'][lang] == other['texts'][lang] and row['texts'][lang]
                            assert clip['name'] == other['audioName']
                        else:
                            assert clip['name'] == row['audioName'], (clip['name'], row['audioName'])
                    linked[lang] += bool(refs)
    noxia = read(file('gtwiki/data/395.json'))
    chocolate = next(r for r in noxia['voiceLines'][0]['lines'] if r['type'] == 'TouchReactionGood2')
    for lang in ('zhCN','enUS','jaJP'):
        assert chocolate['audio'][lang], lang
        assert clips[chocolate['audio'][lang][0]]['name'] == '3950032'
    for relative, clip in imported_files.items():
        path = file('gtaudio/' + relative)
        assert path.stat().st_size == clip['bytes'], relative
        if args.hash_files:
            raw = path.read_bytes()
            assert hashlib.sha256(raw).hexdigest() == clip['sha256'], relative
            if relative.endswith('.flac'):
                assert raw[:4] == b'fLaC' and int.from_bytes(raw[18:26], 'big') & 0xfffffffff, relative
    print(json.dumps(dict(heroes=len(heroes), linked=dict(linked), packageBundles=package['bundles'],
                         packageClips=package['clips'], verifiedFiles=len(imported_files), hashVerified=args.hash_files)))


if __name__ == '__main__':
    main()
