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
            if '/' in alias or alias.isdigit(): aliases.setdefault(alias, row['name'])
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
    result = {'version': 1, 'rows': rows, 'assets': assets, 'aliases': aliases,
              'evidence': {'direction': {'1':'back','2':'right','4':'front','8':'left'}, 'nativeMethod':'VectorExtensions.ToDirection RVA 0x763868061820', 'scales': scale_count}}
    output = args.output or args.root/'gtmap/assets/character-metadata.json.gz'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode('utf8'),mtime=0))
    print('Character assets:',len(assets),'lookup keys:',len(rows),'serialized scales:',scale_count,'bytes:',output.stat().st_size)

if __name__ == '__main__': main()
