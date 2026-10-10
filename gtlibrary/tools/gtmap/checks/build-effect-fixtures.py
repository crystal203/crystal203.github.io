from pathlib import Path
import json,gzip
root=Path('D:/github/gtlibrary');out=root/'tools/gtmap/checks'
with gzip.open(root/'tools/gtmap/batches/final-master.json.gz','rt',encoding='utf8') as f:pack=json.load(f)
manifest=json.loads((root/'gtmap/assets/native-effects.json').read_text())
keys=set()
for ts,path in manifest['sets'].items():
 with gzip.open(root/'gtmap/assets'/path,'rt',encoding='utf8') as f:extra=json.load(f)
 keys.update(str(pack['setOrder'].index(ts)+1)+':'+name for name in extra['templates'])
templates={k:pack['templates'][k] for k in keys};meshes={p['mesh']:pack['meshes'][p['mesh']] for t in templates.values() for p in t['parts']};materials={m:pack['materials'][m] for t in templates.values() for p in t['parts'] for m in p['materials'] if m in pack['materials']};needed={e['texture'] for m in materials.values() for e in m['texenvs'].values() if e.get('texture')};textures={k:pack['textures'][k] for k in needed if k in pack['textures']}
fixture={'setOrder':pack['setOrder'],'templates':templates,'meshes':meshes,'materials':materials,'textures':textures,'environment':{}}
(out/'effects-fixtures.json.gz').write_bytes(gzip.compress(json.dumps(fixture,separators=(',',':')).encode(),mtime=0))
print('Fixtures',len(templates),'meshes',len(meshes))
