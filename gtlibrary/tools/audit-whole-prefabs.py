"""Read-only audit of assembled prefab model groups; never copies model assets."""
from pathlib import Path
import argparse,collections,json,re,gzip
ROOT=Path(__file__).resolve().parents[1] if 'gtlibrary' in str(Path(__file__)) else Path('D:/github/gtlibrary')
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=Path('D:/GTAsset/FullExtract/ExportedProject/Assets'));p.add_argument('--output',type=Path,default=ROOT/'tools/gtmap/evidence/whole-prefab-audit.json');args=p.parse_args()
rows=[];examined=0;filtered=0
for file in args.source.rglob('*.prefab'):
 rel=file.relative_to(args.source);parts=[x.lower() for x in rel.parts]
 if 'tilesets' in parts:continue
 examined+=1
 if any(x.startswith(('character','effect','spine','spritesheet')) or x in ['ui','ui s3','battleui','charactertool'] for x in parts):continue
 text=file.read_text(encoding='utf-8-sig');meshfilters=[]
 for block in re.findall(r'^--- !u!33 &[^\n]+\n(.*?)(?=^---|\Z)',text,re.M|re.S):
  match=re.search(r'm_Mesh: \{fileID: (-?\d+), guid: (\w+)',block)
  if match and match[1]!='0':meshfilters.append(match[2])
 # Runtime Spine and UI renderer slots are not static 3D mesh assemblies.
 if len(meshfilters)<2:filtered+=1;continue
 category='theatre' if any(x.startswith('theatre') for x in parts) else 'worldmap' if any(x.startswith('worldmap') for x in parts) else 'tilemaps' if 'tilemaps' in parts else 'other'
 rows.append({'path':rel.as_posix(),'category':category,'meshInstances':len(meshfilters),'uniqueMeshes':len(set(meshfilters)),'objects':text.count('\nGameObject:'),'animators':text.count('\nAnimator:'),'particles':text.count('\nParticleSystem:'),'status':'not-imported-as-assembled-prefab'})
with gzip.open(ROOT/'tools/gtmap/batches/final-master.json.gz','rt',encoding='utf8') as f:sets=json.load(f)['setOrder']
result={'sourceRoot':str(args.source),'examinedNonTilesetPrefabs':examined,'excludedNonAssemblyScenes':filtered,'method':'Exclude tilesets, character/spine, effects, spritesheet and UI directories; require at least two nonempty MeshFilter references. These are assembly candidates, not a claim that every mesh is volumetric. Current map imports are tileset templates, not assembled theatre/worldmap prefab roots.','currentMapSets':sets,'candidateCount':len(rows),'categories':dict(collections.Counter(x['category'] for x in rows)),'candidates':sorted(rows,key=lambda x:(x['category'],-x['meshInstances'],x['path']))}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(result['candidateCount'],result['categories'])
