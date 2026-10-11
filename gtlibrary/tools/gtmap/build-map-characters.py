"""Build browser-only map character lookups from local exported/static data."""
from pathlib import Path
import argparse, gzip, json, re

ROOT = Path(__file__).resolve().parents[2]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', type=Path, default=ROOT)
    ap.add_argument('--static', type=Path, default=Path('E:/GTFiles/static_data_dec'))
    ap.add_argument('--assets', type=Path, default=Path('D:/GTAsset/FullExtract/ExportedProject/Assets'))
    ap.add_argument('--output', type=Path)
    args = ap.parse_args()
    read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
    text = (args.root/'gtasset/assets/character/assets.js').read_text(encoding='utf-8-sig')
    match = re.search(r'(?:window\.)?spineAssets\s*=\s*(.*?);\s*(?:window\.|$)', text, re.S)
    raw = json.loads(match[1])
    assets = {}
    for row in raw:
        name = row if isinstance(row, str) else row['name']
        assets[name] = {'variants': ['front', 'back', 'side'] if isinstance(row, str) else row.get('variants', ['front','back','side'])}
    supplement = read(args.root/'resources/spine-expansion/catalog.json')
    for row in supplement['groups']['character']:
        assets[row['name']] = {'variants': row['variants']}
    registry_text = (args.root/'resources/registry.js').read_text(encoding='utf-8-sig')
    registry = json.loads(registry_text[registry_text.index('{'):registry_text.rindex('}')+1])
    zh = read(args.static/'strings-zhCN.json')
    aliases = {}
    for key, entity_id in registry['aliases'].items():
        entry = registry['entities'].get(entity_id, {}).get('spine', {})
        if entry.get('folder') == 'character' and entry.get('name') in assets:
            aliases[key] = entry['name']
    for row in supplement['groups']['character']:
        for alias in row.get('aliases', []):
            if '/' in alias or alias.isdigit() or alias in {row['name'],*(Path(source).stem for source in row.get('sources',[]))}: aliases.setdefault(alias, row['name'])
        for source in row.get('sources',[]):
            aliases.setdefault(Path(source).stem,row['name'])
    rows = {}
    for table in ['heroes', 'npc', 'monsters']:
        for row in read(args.static/(table+'.json')):
            name = row['Name']
            value = {'id': row['Id'], 'key': name, 'name': zh.get(name) or name,
                     'spine': row.get('SpineAssetName'), 'weapons': [row.get('DefaultWeapon1'), row.get('DefaultWeapon2')], 'table': table}
            rows[name] = value
            rows[str(row['Id'])] = value
    # SkeletonData scale is serialized by the game, rather than estimated from
    # the current attachment's bounds (which change with each animation).
    scale_count = 0
    for file in (args.assets/'MonoBehaviour').glob('*SkeletonData.asset'):
        stem = file.stem.removesuffix('_SkeletonData')
        name = re.sub(r'_(front|back|side)$', '', stem)
        if name not in assets: continue
        source = file.read_text(encoding='utf-8-sig')
        scale = re.search(r'^  scale: ([\d.eE+-]+)$', source, re.M)
        mix = re.search(r'^  defaultMix: ([\d.eE+-]+)$', source, re.M)
        if scale:
            assets[name]['scale'] = float(scale[1]); scale_count += 1
        if mix: assets[name]['mix'] = float(mix[1])
    # APK built-in resources have their own SkeletonData scale, absent from
    # the downloaded-bundle FullExtract. Do not replace it with an estimate.
    apk_path=args.root/'tools/gtmap/evidence/apk-character-resources.json'
    if apk_path.exists():
        for entry in read(apk_path)['resources']:
            if entry['name'] in assets:
                assets[entry['name']].update(scale=entry['scale'],mix=entry['mix'],defaultSkin=entry.get('defaultSkin',''))
    # Resolve actual SkeletonData GUIDs for prefab names which differ from
    # their atlas. Ambiguous multi-skeleton prefabs remain explicitly unresolved.
    guid_assets={}
    for file in (args.assets/'MonoBehaviour').glob('*.asset'):
        if '_SkeletonData' not in file.name and '_Atlas' not in file.name:continue
        meta=Path(str(file)+'.meta')
        if meta.exists():
            match=re.search(r'^guid: (\w+)',meta.read_text(encoding='utf-8-sig'),re.M)
            if match:guid_assets[match[1]]=file
    resolutions=[];nonspine=[];skin_candidates={}
    wanted={key for key,row in rows.items() if not key.isdigit() and key not in assets and key not in aliases}
    for row in rows.values():
        value=row.get('spine')
        if isinstance(value,dict):value=value.get('default') or next(iter(value.values()),'')
        if isinstance(value,str):wanted.add(value.split('#')[0].split(':')[-1].split('/')[-1] if '/' in value else value.split('#')[0].split(':')[0])
    for group in supplement['groups']['character']:
        wanted.update(Path(source).stem for source in group.get('sources',[]))
    for file in args.assets.rglob('*.prefab'):
        if file.stem not in wanted:continue
        source=file.read_text(encoding='utf-8-sig');matches=set()
        for block in source.split('--- !u!114'):
            match=re.search(r'skeletonDataAsset:.*?guid: (\w+)',block)
            if not match:continue
            guid=match[1]
            sk=guid_assets.get(guid)
            if not sk:continue
            value=sk.read_text(encoding='utf-8-sig')
            ag=re.search(r'atlasAssets:\s*\n\s*- .*?guid: (\w+)',value)
            atlas=guid_assets.get(ag[1]) if ag else None
            name=re.sub(r'_Atlas(?:_\d+)?$', '',atlas.stem) if atlas else ''
            if name in assets:
                matches.add(name)
                skin=re.search(r'^  initialSkinName:([^\r\n]*)',block,re.M)
                if skin and skin[1].strip():skin_candidates.setdefault(name,[]).append((file.stem,skin[1].strip().strip(chr(34))))
        if len(matches)==1:
            aliases[file.stem]=next(iter(matches));resolutions.append({'alias':file.stem,'resource':aliases[file.stem],'prefab':str(file.relative_to(args.assets)),'evidence':'SkeletonData → Atlas GUID'})
        elif 'skeletonDataAsset:' not in source:
            nonspine.append({'id':file.stem,'prefab':str(file.relative_to(args.assets)),'kind':'non-Spine prefab'})
    for name,candidates in skin_candidates.items():
        primary={skin for prefab,skin in candidates if prefab==name}
        values=primary or {skin for _,skin in candidates}
        if len(values)==1 and not assets[name].get('defaultSkin'):assets[name]['defaultSkin']=next(iter(values))
    garage_path=args.root/'tools/gtmap/evidence/garage-character-resource.json'
    if garage_path.exists():
        entry=read(garage_path)
        if entry['name'] in assets:assets[entry['name']]['scale']=entry['scale']
    result = {'version': 1, 'rows': rows, 'assets': assets, 'aliases': aliases,
              'evidence': {'direction': {'1':'back','2':'right','4':'front','8':'left'}, 'nativeMethod':'VectorExtensions.ToDirection RVA 0x763868061820', 'scales': scale_count,'prefabAliases':resolutions,'nonSpine':nonspine}}
    output = args.output or args.root/'gtmap/assets/character-metadata.json.gz'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode('utf8'),mtime=0))
    print('Character assets:',len(assets),'lookup keys:',len(rows),'serialized scales:',scale_count,'bytes:',output.stat().st_size)

if __name__ == '__main__': main()
