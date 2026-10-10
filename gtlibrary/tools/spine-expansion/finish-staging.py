import os
import json,re,shutil,hashlib
from pathlib import Path
W=Path(os.environ.get('GT_SPINE_WORK','E:/GTFiles/_manual/spine-expansion'));S=W/'staged';R=Path('D:/github/gtlibrary')
def read(p):return p.read_text('utf-8-sig')
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')),'utf-8')
cat=json.loads(read(S/'resources/spine-expansion/catalog.json'));audit=json.loads(read(S/'tools/spine-expansion-audit.json'))
p=S/'core/resources.js';s=read(p);start=s.index('aliases=')+8;end=s.index(',domains=',start);aliases=json.loads(s[start:end]);canonical={};replaced={};saved=0
for row in audit['resources']:
 variants=[]
 for f in row['files']:
  old=f['path'];digest=f['sha256'];target=S/old
  if old.endswith('.bytes'):
   stem=Path(f['source']).name.split('.skel')[0]
   m=re.search(r'_(front|back|side|tentacle)$',stem)
   v=m[1] if m else stem[len(row['sourceName']):].strip(' _') if stem.startswith(row['sourceName']) else stem
   if v in variants:v=(v or 'default')+'_'+digest[:8]
   variants.append(v);logical='resources/spine/'+row['folder']+'/'+row['name']+('_'+v if v else '')+'.bytes';aliases[logical]=old
  if digest in canonical:
   replacement=canonical[digest];replaced[old]=replacement
   assert target.resolve().is_relative_to((S/'resources/spine-expansion').resolve())
   saved+=target.stat().st_size;target.unlink();f['path']=replacement
  else:canonical[digest]=old
 row['variants']=sorted(variants,key=lambda x:({'':0,'front':1,'back':2,'side':3,'tentacle':4}.get(x,9),x))
for k,v in list(aliases.items()):aliases[k]=replaced.get(v,v)
p.write_text(s[:start]+json.dumps(aliases,separators=(',',':'))+s[end:],'utf-8')
bykey={(r['folder'],r['name']):r for r in audit['resources']}
for folder,rows in cat['groups'].items():
 for row in rows:
  row['variants']=bykey[(folder,row['name'])]['variants'];row['aliases']=sorted(set(row['aliases'])|set(row['sources']))
dump(S/'resources/spine-expansion/catalog.json',cat)
audit['deduplicatedFiles']=len(replaced);audit['bytesSaved']=saved;dump(S/'tools/spine-expansion-audit.json',audit)
s=read(R/'sw.js').replace('previews|illust-jp|spine-recovered','previews|illust-jp|spine-recovered|spine-expansion');(S/'sw.js').write_text(s,'utf-8')
# Keep evidence of the verified original-bundle bytes and explicit source defect.
checks=[]
for q in (W/'source-check').iterdir():
 export=Path('D:/GTAsset/FullExtract/ExportedProject/Assets/TextAsset')/(q.name+('.txt' if q.suffix=='.atlas' else '.bytes'))
 checks.append({'bundle':'ondemand/afterworld/characters/aw_hana_kid' if q.name.startswith('aw_') else 'characters/part1/big_maiden','asset':q.name,'sha256':hashlib.sha256(q.read_bytes()).hexdigest(),'exportMatches':q.read_bytes()==export.read_bytes()})
dump(S/'tools/spine-expansion-source-check.json',checks)
print('Deduplicated',len(replaced),'files, saved MB',round(saved/1024**2,1))
