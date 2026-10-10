"""Publish the final catalog only after dependency-closed gzip packs are complete."""
from pathlib import Path
import json,gzip,hashlib,collections
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT/'tools/gtmap';OUT=ROOT/'gtmap/assets'
with gzip.open(WORK/'batches/final-master.json.gz','rt',encoding='utf8') as stream:master=json.load(stream)
plan=json.loads((WORK/'batches/final-plan.json').read_text(encoding='utf8'))
assert len(plan['maps'])==2054 and plan['previousCount']==1440 and plan['addedCount']==614
audit=json.loads((WORK/'evidence/final-export-audit.json').read_text(encoding='utf8'))
missing_keys={x['key'] for x in audit['issues'] if x.get('type')=='missingNativeTemplate'}
missing_dependencies=[x for x in audit['issues'] if x.get('type')=='missingDependency']
for m in plan['maps'][1440:]:
 keys=m['templateKeys'];m['preview']={'staticTemplates':sum(bool(master['templates'][k]['parts']) for k in keys),'missingTemplates':sum(k in missing_keys for k in keys),'missingDependencies':sorted({x['bundle'] for x in missing_dependencies if x['tileset'] in m['sets']})}
sizes={section:{k:len(json.dumps(v,separators=(',',':'))) for k,v in master[section].items()} for section in ['templates','meshes','materials','textures']}
def dependencies(keys):
 deps={s:set() for s in ['templates','meshes','materials','textures']};deps['templates']=set(keys)
 for k in keys:
  for p in master['templates'][k]['parts']:
   deps['meshes'].add(p['mesh']);deps['materials'].update(m for m in p['materials'] if m)
  if k in master['environment']['clouds']:deps['materials'].add(master['environment']['clouds'][k]['material'])
 for k in deps['materials']:
  m=master['materials'][k]
  for slot in m['texenvs'].values():
   if slot['texture']:deps['textures'].add(slot['texture'])
 return deps
def estimate(deps):return sum(sizes[s][k]+len(k)+6 for s,keys in deps.items() for k in keys)
groups=collections.defaultdict(list)
for m in plan['maps'][1440:]:groups['|'.join(sorted(m['sets']))].append(m)
reports=[]
for group,maps in sorted(groups.items()):
 chunks=[];keys=set();batch=[]
 for m in maps:
  candidate=keys|set(m['templateKeys']);amount=estimate(dependencies(candidate))
  if batch and amount>14*1024*1024:chunks.append((batch,keys));batch=[];keys=set();candidate=set(m['templateKeys'])
  assert estimate(dependencies(candidate))<64*1024*1024,'Single map model too large: '+m['id']
  batch.append(m);keys=candidate
 if batch:chunks.append((batch,keys))
 slug=hashlib.sha256(group.encode()).hexdigest()[:12]
 for i,(maps,keys) in enumerate(chunks):
  deps=dependencies(keys);pack={s:{k:master[s][k] for k in sorted(kk)} for s,kk in deps.items()};pack.update(setOrder=master['setOrder'],renderProfile=master['renderProfile'],environment={'clouds':{k:v for k,v in master['environment']['clouds'].items() if k in keys}})
  for t in pack['textures'].values():assert (OUT/t['url']).is_file()
  raw=json.dumps(pack,separators=(',',':'),allow_nan=False).encode();compressed=gzip.compress(raw,mtime=0);assert len(compressed)<20*1024*1024
  target='packs/final-'+slug+'-'+str(i+1)+'.json.gz';(OUT/target).write_bytes(compressed)
  for m in maps:m['pack']=target;del m['templateKeys']
  reports.append({'path':target,'bytes':len(compressed),'decodedBytes':len(raw),'maps':len(maps),'templates':len(keys),'meshes':len(pack['meshes']),'materials':len(pack['materials']),'textures':len(pack['textures'])})
for m in plan['maps']:assert (OUT/m['file']).is_file() and (OUT/m['pack']).is_file()
assert len({m['id'] for m in plan['maps']})==2054
(WORK/'evidence/final-pack-audit.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
(OUT/'catalog.json').write_text(json.dumps(plan,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Published final batch: +614, total 2054, packs',len(reports),'compressed bytes',sum(p['bytes'] for p in reports),'max decoded bytes',max(p['decodedBytes'] for p in reports),flush=True)
