"""Extend gtAudio from the indexed GTOfflineServer package, without altering it.

Existing versions and stage bindings are retained. Matching bundle/pathId exports
are reused; new PCM is stored as lossless FLAC at the original rate/channels.
"""
import argparse
import collections
import concurrent.futures
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import wave
import zipfile
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def selected(name):
    return any(part in name for part in ('/audio/', '/voices_', '/dialogues')) and not name.endswith(('.etag', '.manifest'))


def language(name):
    m = re.search(r'/(?:voices_|dialogues_)(cn|en|ja|ko)(?:/|_)', name)
    if not m:
        m = re.search(r'/prologue/(cn|en|ja|ko)(?:/|_)', name)
    return m.group(1) if m else ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, default=Path('E:/GTFiles/GTOfflineServer'))
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--out', type=Path, required=True, help='Staging gtaudio directory; existing files are read from --repo')
    parser.add_argument('--unity-libs', type=Path, required=True)
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    if not args.ffmpeg:
        parser.error('FFmpeg is required for lossless PCM storage')
    sys.path.insert(0, str(args.unity_libs))
    import UnityPy

    assets = args.package / 'assets'
    index = read(assets / 'resource-index.json')
    package = read(assets / 'package.json')
    original = args.repo / 'gtaudio'
    catalog = read(original / 'data/catalog.json')
    provenance = read(original / 'data/provenance.json')
    by_id = {c['id']: c for c in catalog['clips']}
    by_object = collections.defaultdict(list)
    for clip in catalog['clips']:
        meta = provenance[clip['id']]
        if meta.get('bundleSha256') and meta.get('pathId'):
            by_object[(meta['bundleSha256'], str(meta['pathId']))].append(clip)

    checkpoint = args.out / 'data/offline-checkpoint.jsonl'
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    previous = {}
    if checkpoint.exists():
        for line in checkpoint.read_text(encoding='utf-8').splitlines():
            row = json.loads(line)
            previous[row['source']] = row
    sources = [(row['path'], row) for row in index['files'] if selected(row['path'])]
    apk = assets / 'game.apk'
    assert hashlib.sha256(apk.read_bytes()).hexdigest() == package['apk_sha256'], 'Package APK hash mismatch'
    archive = zipfile.ZipFile(apk)
    sources += [('apk/' + n, None) for n in archive.namelist() if n.startswith('assets/AssetBundles/') and selected(n)]
    latest = []
    new_ids = set()
    verified = []
    failed = []

    def encode(data, name, raw, suffix):
        if suffix == '.wav':
            with wave.open(io.BytesIO(raw)) as stream:
                frames = stream.getnframes()
            raw = subprocess.run([args.ffmpeg, '-v', 'error', '-threads', '1', '-f', 'wav', '-i', 'pipe:0',
                                  '-c:a', 'flac', '-threads', '1', '-f', 'flac', 'pipe:1'], input=raw,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
            packed = int.from_bytes(raw[18:26], 'big')
            raw = raw[:18] + ((packed & ~0xfffffffff) | frames).to_bytes(8, 'big') + raw[26:]
            suffix = '.flac'
        assert suffix in ('.flac', '.ogg', '.wav', '.mp3'), suffix
        sha = hashlib.sha256(raw).hexdigest()
        relative = f'assets/{sha[:2]}/{sha}{suffix}'
        target = args.out / relative
        if not (original / relative).exists() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        return dict(file=relative, bytes=len(raw), sha256=sha,
                    duration=round(data.m_Length, 6), sampleRate=data.m_Frequency, channels=data.m_Channels)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for number, (source, entry) in enumerate(sources, 1):
            raw = archive.read(source[4:]) if entry is None else (assets / 'resources' / source).read_bytes()
            if entry is not None:
                assert len(raw) == entry['size'] and hashlib.sha1(raw).hexdigest() == entry['sha1'], source
            sha = hashlib.sha256(raw).hexdigest()
            if source in previous and previous[source]['sha256'] == sha:
                result = previous[source]
            else:
                env = UnityPy.load(raw)
                objects = []
                jobs = []
                for obj in env.objects:
                    if obj.type.name != 'AudioClip':
                        continue
                    reused = by_object.get((sha, str(obj.path_id)), [])
                    if reused:
                        # One AudioClip normally exports one sample; retain all
                        # distinct sample outputs if the original importer had several.
                        objects.extend({'clip': c, 'provenance': provenance[c['id']]} for c in reused)
                        continue
                    data = obj.read()
                    samples = data.samples
                    if not samples:
                        raise ValueError('No decoded samples: ' + source + ':' + str(obj.path_id))
                    for sample_name, sample in samples.items():
                        suffix = Path(sample_name).suffix.lower()
                        jobs.append((obj.path_id, data, sample_name, pool.submit(encode, data, sample_name, sample, suffix)))
                for path_id, data, sample_name, task in jobs:
                    info = task.result()
                    id_ = 'offline/' + source + '/' + data.m_Name + '@' + str(path_id)
                    kind = 'voice' if ('/voices_' in source or '/dialogues' in source or language(source)) else 'music' if '/bgms' in source or '/music' in source else 'sfx'
                    clip = dict(id=id_, name=data.m_Name, kind=kind, group='offline/' + source, **info)
                    if language(source):
                        clip['language'] = language(source)
                    meta = dict(source='offline/' + source + '/' + sample_name, bundleSha256=sha, pathId=str(path_id),
                                encoding='UnityPy sample export; original sample rate/channels; PCM stored as lossless FLAC')
                    objects.append({'clip': clip, 'provenance': meta})
                result = dict(source=source, sha256=sha, sha1=hashlib.sha1(raw).hexdigest(), bytes=len(raw), objects=objects)
                with checkpoint.open('a', encoding='utf-8') as stream:
                    stream.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
            bundle_ids = []
            for item in result['objects']:
                clip, meta = item['clip'], item['provenance']
                if clip['id'] not in by_id:
                    catalog['clips'].append(clip)
                    by_id[clip['id']] = clip
                    new_ids.add(clip['id'])
                provenance[clip['id']] = dict(meta, offlinePackageSource=source)
                bundle_ids.append(clip['id'])
                latest.append((source, clip))
            verified.append({k: result[k] for k in ('source', 'sha256', 'sha1', 'bytes')} | {'clips': bundle_ids})
            if number % 10 == 0 or number == len(sources):
                print(f'{number}/{len(sources)} bundles; {len(latest)} package clips; {len(new_ids)} new catalog records', flush=True)

    # Record container identities for name collisions. Hero bundles sometimes
    # carry obsolete music-folder copies with the same native AudioClip name.
    named = collections.defaultdict(list)
    for source, clip in latest:
        if '/voices_' in source:
            named[(source, clip['name'])].append(clip)
    ambiguous = {source for (source, name), choices in named.items()
                 if len({c['sha256'] for c in choices}) > 1}
    for source in sorted(ambiguous):
        env = UnityPy.load((assets / 'resources' / source).read_bytes())
        containers = collections.defaultdict(list)
        for asset_path, obj in env.container.items():
            containers[str(obj.path_id)].append(asset_path)
        for bundle_source, clip in latest:
            if bundle_source == source:
                provenance[clip['id']]['assetPaths'] = containers[str(provenance[clip['id']]['pathId'])]

    # Prefer the current package in its existing default language; explicit IDs
    # and per-stage bindings always remain stable across imports.
    choices = collections.defaultdict(list)
    for source, clip in latest:
        choices[clip['name']].append(clip)
    for name, clips in choices.items():
        prior = by_id.get(catalog['defaults'].get(name))
        desired = prior.get('language', '') if prior else ''
        winner = min(clips, key=lambda c: (c.get('language', '') != desired,
                     {'cn': 0, 'en': 1, 'ja': 2}.get(c.get('language'), 3), c['id']))
        catalog['defaults'][name] = winner['id']
    catalog['clips'].sort(key=lambda c: (c['kind'], c['name'].lower(), c['id']))
    unique = {c['file']: c for c in catalog['clips']}
    summary = dict(catalog['summary'], clips=len(catalog['clips']), uniqueFiles=len(unique),
                   bytes=sum(c['bytes'] for c in unique.values()), counts=dict(collections.Counter(c['kind'] for c in catalog['clips'])))
    report = dict(schema=1, gameVersion=index['game_version'], resourceVersion=index['resource_version'],
                  apkSha256=package['apk_sha256'], resourceIndexSha256=hashlib.sha256((assets / 'resource-index.json').read_bytes()).hexdigest(),
                  bundles=len(verified), clips=len(latest), newRecords=len(new_ids),
                  newFiles=sum(1 for p in (args.out / 'assets').rglob('*') if p.is_file()),
                  languages=dict(collections.Counter(language(s) or 'other' for s, c in latest)),
                  sources=verified, failures=failed)
    summary['offlinePackage'] = {k: report[k] for k in ('gameVersion', 'resourceVersion', 'bundles', 'clips', 'newRecords', 'newFiles', 'languages')}
    catalog['summary'] = summary
    write(args.out / 'data/catalog.json', catalog)
    write(args.out / 'data/provenance.json', provenance)
    write(args.out / 'data/import-report.json', summary)
    write(args.out / 'data/offline-package.json', report)
    archive.close()
    print(json.dumps(summary['offlinePackage']), flush=True)


if __name__ == '__main__':
    main()
