"""Write dependency-closed static packs; atomically publish the enlarged catalog last."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'gtmap/assets'
master=json.loads((ROOT/'tools/gtmap/batches/expansion-master.json').read_text(encoding='utf8'))
usage=json.loads((ROOT/'tools/gtmap/batches/expansion-usage.json').read_text(encoding='utf8'))
plan=json.loads((ROOT/'tools/gtmap/batches/expansion-plan.json').read_text(encoding='utf8'))
assert plan['addedCount']==617 and plan['deployedCount']==823
for path,sha in json.loads((ROOT/'tools/gtmap/evidence/first-texture-hashes.json').read_text(encoding='utf8')).items():assert hashlib.sha256((OUT/path).read_bytes()).hexdigest()==sha, 'Old texture changed: '+path
reports=[]
for target,keys in usage.items():
 templates={k:master['templates'][k] for k in keys};meshes={};materials={};textures={};clouds={}
 for k,t in templates.items():
  for p in t['parts']:
   meshes[p['mesh']]=master['meshes'][p['mesh']]
   for m in p['materials']:
    if m is not None:materials[m]=master['materials'][m]
  if k in master.get('environment',{}).get('clouds',{}):
   clouds[k]=master['environment']['clouds'][k];materials[clouds[k]['material']]=master['materials'][clouds[k]['material']]
 for m in materials.values():
  assert m.get('texture') or (m['nativeShader']['name']=='Unlit/Lava-Distort-Flow' and m['texenvs']['_LavaTex']['texture']),m['name']
  for env in m['texenvs'].values():
   if env['texture']:textures[env['texture']]=master['textures'][env['texture']]
 for t in textures.values():assert (OUT/t['url']).is_file()
 pack={'templates':templates,'meshes':meshes,'materials':materials,'textures':textures,'setOrder':master['setOrder'],'renderProfile':master['renderProfile'],'environment':{'clouds':clouds}}
 dest=OUT/target;dest.write_text(json.dumps(pack,separators=(',',':')),encoding='utf8')
 assert dest.stat().st_size<20*1024*1024, 'Pack exceeds cache limit: '+target
 reports.append({'path':target,'bytes':dest.stat().st_size,'templates':len(templates),'meshes':len(meshes),'materials':len(materials),'textures':len(textures)})
for m in plan['maps']:assert (OUT/m['file']).is_file() and (OUT/m['pack']).is_file()
assert len({m['id'] for m in plan['maps']})==823
(OUT/'catalog.json').write_text(json.dumps(plan,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT/'tools/gtmap/evidence/expansion-pack-audit.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
print('Published local catalog: +617 / total 823, packs:',len(reports),'max pack bytes:',max(r['bytes'] for r in reports),flush=True)
