"""Import every exported AudioClip + APK audio, without normalizing or resampling.

Output is content addressed; native names and provenance stay in the catalog.
Requires UnityPy only when --apk is supplied. Existing .ogg files are copied verbatim.
"""
import argparse, collections, hashlib, io, json, pathlib, shutil, struct, subprocess, sys, wave, zipfile

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')

def info(raw, suffix):
    if suffix=='.flac' and raw[:4]==b'fLaC':
        packed=int.from_bytes(raw[18:26],'big');rate=packed>>44
        return dict(duration=round((packed&0xfffffffff)/rate,6),sampleRate=rate,channels=((packed>>41)&7)+1)
    if suffix == '.wav':
        with wave.open(io.BytesIO(raw)) as w:
            return dict(duration=round(w.getnframes()/w.getframerate(),6), sampleRate=w.getframerate(), channels=w.getnchannels())
    if suffix == '.ogg':
        p=raw.find(b'\x01vorbis')
        if p >= 0:
            channels=raw[p+11]; rate=struct.unpack_from('<I',raw,p+12)[0]
            end=raw.rfind(b'OggS'); granule=struct.unpack_from('<Q',raw,end+6)[0] if end>=0 else 0
            return dict(duration=round(granule/rate,6),sampleRate=rate,channels=channels)
    return {}

def classify(name, source):
    s=source.lower()
    if name.lower().startswith('bgm') or '/music/' in s or s.endswith('/music'): return 'music'
    if 'voice' in s or 'dialogue' in s: return 'voice'
    return 'sfx'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--assets',type=pathlib.Path,required=True)
    p.add_argument('--out',type=pathlib.Path,required=True)
    p.add_argument('--apk',type=pathlib.Path)
    p.add_argument('--unity-libs',type=pathlib.Path)
    p.add_argument('--native-root',type=pathlib.Path,required=True)
    p.add_argument('--online',type=pathlib.Path,required=True)
    p.add_argument('--resume',action='store_true',help='Extend an existing export/APK catalog with cached CDN audio')
    p.add_argument('--skip-cached',action='store_true')
    a=p.parse_args(); out=a.out.resolve(); (out/'assets').mkdir(parents=True,exist_ok=True)
    clips=[]; provenance={}; stored={}; defaults={}; issues=[];bindings={};used_ids=set()
    if a.resume:
        prior=json.loads((out/'data/catalog.json').read_text('utf8'));clips=prior['clips'];provenance=json.loads((out/'data/provenance.json').read_text('utf8'))
        stored={r['sha256']:(r['file'],r['bytes']) for r in clips};defaults={k:(3 if v.startswith('recovered/') else 1 if v.startswith('apk/') else 0,v) for k,v in prior['defaults'].items()}
        bindings=prior.get('bindings',{})
        used_ids.update(r['id'] for r in clips)
    def add(name, raw, suffix, source, priority=0, **extra):
        sha=hashlib.sha256(raw).hexdigest(); file=f'assets/{sha[:2]}/{sha}{suffix}'
        if sha not in stored:
            dest=out/file;dest.parent.mkdir(parents=True,exist_ok=True)
            if not dest.exists():dest.write_bytes(raw)
            stored[sha]=(file,len(raw))
        else: file=stored[sha][0]
        id=source.removesuffix(suffix)
        if id in used_ids:id+='@'+str(extra.get('pathId') or sha[:16])
        if id in used_ids:raise ValueError('Duplicate AudioClip identity: '+id)
        used_ids.add(id)
        kind=classify(name,source); parts=source.split('/')
        language=next((x.removeprefix('voices_') for x in parts if x.startswith('voices_')), '')
        if '/prologue/' in source and kind=='voice':language=source.split('/prologue/')[1].split('/')[0]
        row=dict(id=id,name=name,kind=kind,group='/'.join(parts[:-1]),file=file,bytes=len(raw),sha256=sha,**info(raw,suffix))
        if language:row['language']=language
        clips.append(row);provenance[id]=dict(source=source,**extra)
        if name not in defaults or priority>defaults[name][0]:defaults[name]=(priority,id)
        return row
    files=sorted(p for p in a.assets.rglob('*') if p.suffix.lower() in ('.ogg','.wav','.mp3','.flac','.m4a','.aac'))
    for i,path in enumerate([] if a.resume else files):
        add(path.stem,path.read_bytes(),path.suffix.lower(),'export/'+path.relative_to(a.assets).as_posix())
        if i%2000==0:print(f'export {i}/{len(files)}',flush=True)
    mixer=json.loads((out/'data/native-mixers.json').read_text('utf8')) if a.resume else []; apk_count=sum(r['id'].startswith('apk/') for r in clips)
    if a.apk and not a.resume:
        if a.unity_libs:sys.path.insert(0,str(a.unity_libs))
        import UnityPy
        with zipfile.ZipFile(a.apk) as z:
            for entry in z.infolist():
                if not entry.filename.startswith('assets/AssetBundles/') or '/audio/' not in entry.filename:continue
                bundle=z.read(entry);env=UnityPy.load(bundle);bundle_sha=hashlib.sha256(bundle).hexdigest()
                for obj in env.objects:
                    if obj.type.name=='AudioClip':
                        data=obj.read();samples=data.samples
                        if not samples:raise RuntimeError(f'No audio samples: {entry.filename}:{obj.path_id}')
                        for sample_name,raw in samples.items():
                            suffix=pathlib.Path(sample_name).suffix.lower()
                            if suffix not in ('.ogg','.wav','.mp3'):raise RuntimeError(f'Unknown audio format: {sample_name}')
                            source='apk/'+entry.filename+'/'+data.m_Name+suffix
                            row=add(data.m_Name,raw,suffix,source,1,bundleSha256=bundle_sha,pathId=str(obj.path_id),encoding='UnityPy sample export; original rate/channels')
                            row['group']='apk/'+entry.filename.removeprefix('assets/AssetBundles/Android/')
                            apk_count+=1
                    elif 'AudioMixer' in obj.type.name or obj.type.name=='AudioSource':
                        mixer.append(dict(source=entry.filename,pathId=str(obj.path_id),type=obj.type.name,data=obj.read_typetree()))
                print(f'APK {entry.filename}: {apk_count} clips cumulative',flush=True)
    cached_count=0;bundle_count=0
    if not a.skip_cached:
        if a.unity_libs:sys.path.insert(0,str(a.unity_libs))
        import UnityPy
        base=a.native_root/'files/AssetBundles';ffmpeg=shutil.which('ffmpeg')
        for path in sorted(base.rglob('*')):
            if not path.is_file() or path.suffix in ('.etag','.tmp'):continue
            rel=path.relative_to(base).as_posix()
            if '/audio/' not in rel and '/voices_' not in rel and '/dialogues' not in rel:continue
            bundle=path.read_bytes();env=UnityPy.load(bundle);bundle_sha=hashlib.sha256(bundle).hexdigest();bundle_count+=1
            for obj in env.objects:
                if obj.type.name!='AudioClip':continue
                data=obj.read()
                for sample_name,raw in data.samples.items():
                    suffix=pathlib.Path(sample_name).suffix.lower();encoding='UnityPy sample export; original rate/channels'
                    # Lossless FLAC avoids huge decoded music files in Git. No resampling,
                    # gain changes or additional lossy encoding is performed.
                    if suffix=='.wav' and ffmpeg:
                        frames=wave.open(io.BytesIO(raw)).getnframes()
                        raw=subprocess.run([ffmpeg,'-v','error','-f','wav','-i','pipe:0','-c:a','flac','-f','flac','pipe:1'],input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout;suffix='.flac';encoding+='; lossless FLAC'
                        # Finalize STREAMINFO using the exact source PCM frame count.
                        packed=int.from_bytes(raw[18:26],'big')
                        raw=raw[:18]+((packed&~0xfffffffff)|frames).to_bytes(8,'big')+raw[26:]
                    if len(raw)>=100*1024*1024:raise RuntimeError('Clip exceeds GitHub file limit; install ffmpeg for lossless FLAC: '+data.m_Name)
                    source='cdn/'+rel+'/'+data.m_Name+suffix
                    row=add(data.m_Name,raw,suffix,source,4,bundleSha256=bundle_sha,pathId=str(obj.path_id),encoding=encoding)
                    row.update(duration=round(data.m_Length,6),sampleRate=data.m_Frequency,channels=data.m_Channels,group='cdn/'+rel)
                    cached_count+=1
            if bundle_count%25==0:print(f'cached CDN {bundle_count} bundles / {cached_count} clips',flush=True)
    # Preserve any previously recovered original clips that are absent from the full export.
    old_source=a.online/'assets/audio/source.json'
    old_meta=json.loads(old_source.read_text('utf8')) if old_source.exists() else []
    for path in sorted([] if a.resume else (a.online/'assets/audio').glob('*')):
        if path.suffix not in ('.wav','.ogg'):continue
        sha=hashlib.sha256(path.read_bytes()).hexdigest()
        if sha not in stored:
            add(path.stem,path.read_bytes(),path.suffix,'recovered/'+path.name,2,evidence=next((r for r in old_meta if r['name']==path.stem),{}))
        else:
            matches=[r for r in clips if r['sha256']==sha]
            defaults[path.stem]=(3,matches[0]['id'])
    existing=a.online.parent/'gtaudio'
    if not a.resume and (existing/'data/catalog.json').exists():
        old_catalog=json.loads((existing/'data/catalog.json').read_text('utf8'));old_provenance=json.loads((existing/'data/provenance.json').read_text('utf8'))
        for old in old_catalog['clips']:
            if not old['id'].startswith('recovered/'):continue
            raw=(existing/old['file']).read_bytes()
            if hashlib.sha256(raw).hexdigest() not in stored:
                original=old_provenance[old['id']]
                add(old['name'],raw,pathlib.Path(old['file']).suffix,original['source'],2,evidence=original.get('evidence',{}))
    handles={};bgm={};native_source=a.native_root/'static_data_dec/soundhandledata.json'
    native=json.loads(native_source.read_text('utf8'))
    for row in native['Sfx']:handles[row['Id']]=row
    for row in native['Bgm']:bgm[row['Id']]=row
    # Native defaults are recovered from MusicPlayer's SoundHandleSpec construction,
    # while static_data contains overrides. Keep both layers, with explicit precedence.
    stage=json.loads((a.online/'assets/stage-1-1.json').read_text('utf8'))
    binding=bindings.setdefault(stage['id'],{})
    for path in sorted((a.online/'assets/audio').glob('*')):
        if path.suffix not in ('.ogg','.wav'):continue
        sha=hashlib.sha256(path.read_bytes()).hexdigest();match=next((r for r in clips if r['sha256']==sha),None)
        if match is None:raise ValueError('Legacy stage clip not retained: '+str(path))
        binding[path.stem]=match['id']
    if not old_source.exists() and (existing/'data/catalog.json').exists():
        for key,values in json.loads((existing/'data/catalog.json').read_text('utf8')).get('bindings',{}).items():bindings.setdefault(key,{}).update(values)
    for evidence in old_meta:
        id=binding.get(evidence['name'])
        if id:
            archived=provenance[id].setdefault('stageEvidence',[])
            entry={'stage':stage['id'],**evidence}
            if entry not in archived:archived.append(entry)
    handles={**stage['nativeMechanics']['soundHandles'],**handles}
    for name,row in handles.items():
        if row.get('Name') and row['Name'] not in defaults:issues.append(dict(handle=name,clip=row['Name']))
    clips.sort(key=lambda r:(r['kind'],r['name'].lower(),r['id']))
    counts=dict(collections.Counter(r['kind'] for r in clips));total=sum(v[1] for v in stored.values())
    report=dict(schema=1,exportClips=len(files),apkClips=apk_count,cachedBundles=bundle_count,cachedClips=cached_count,clips=len(clips),uniqueFiles=len(stored),bytes=total,counts=counts,unresolvedHandles=issues)
    write_json(out/'data/catalog.json',dict(schema=1,clips=clips,defaults={k:v[1] for k,v in sorted(defaults.items())},bindings=bindings,summary=report))
    write_json(out/'data/provenance.json',provenance)
    write_json(out/'data/handles.json',dict(schema=1,sfx=handles,bgm=bgm,source='static_data_dec/soundhandledata.json + authenticated MusicPlayer defaults in stage-1-1 nativeMechanics.soundHandles'))
    write_json(out/'data/native-mixers.json',mixer)
    write_json(out/'data/import-report.json',report)
    print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
