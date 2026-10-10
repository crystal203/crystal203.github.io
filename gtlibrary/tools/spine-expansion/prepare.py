"""Inventory exported Spine dependencies without re-extracting bundles."""
import os,json,re,hashlib,collections
from pathlib import Path
A=Path('D:/GTAsset/FullExtract/ExportedProject/Assets');R=Path('D:/github/gtlibrary');W=Path(os.environ.get('GT_SPINE_WORK','E:/GTFiles/_manual/spine-expansion'))
def read(p):return p.read_text('utf-8-sig',errors='replace')
def guid(p):
 m=re.search(r'^guid: (\w+)',read(Path(str(p)+'.meta')),re.M);return m[1] if m else None
def ref(s,key):
 m=re.search(r'\b'+key+r':.*?guid: (\w+)',s);return m[1] if m else None
paths=[Path(root)/f for root,ds,fs in os.walk(A) for f in fs if not f.endswith('.meta')]
texts={};assets={};textures={};materials={};prefabs=collections.defaultdict(list)
for p in paths:
 if p.suffix=='.bytes' and '.skel' in p.name or '.atlas' in p.name and p.suffix=='.txt': texts[guid(p)]=p
 elif p.suffix=='.asset' and ('_SkeletonData' in p.name or '_Atlas' in p.name):assets[guid(p)]=p
 elif p.suffix=='.png':textures[guid(p)]=p
 elif p.suffix=='.mat':materials[guid(p)]=p
 elif p.suffix=='.prefab':prefabs[p.stem].append(p)
print('Indexed',len(paths),'files',len(texts),'Spine texts',flush=True)
existing={p.stem for p in (R/'gtasset/assets').rglob('*.atlas')};existing.update(x['name'] for x in json.loads(read(R/'resources/illust-jp/catalog.json'))['illustrations'])
groups={};unresolved=[]
for g,p in assets.items():
 if '_SkeletonData' not in p.name:continue
 s=read(p);skel=texts.get(ref(s,'skeletonJSON'));ag=re.search(r'atlasAssets:\s*\n\s*- .*?guid: (\w+)',s)
 if not skel or not ag:continue
 ap=assets.get(ag[1])
 if not ap:continue
 at=read(ap);atlas=texts.get(ref(at,'atlasFile'))
 if not atlas:continue
 name=atlas.name.split('.atlas')[0]
 if name in existing:continue
 key=str(atlas)
 group=groups.setdefault(key,{'name':name,'atlas':str(atlas),'atlasAsset':str(ap),'skeletons':[],'textures':[],'sources':[]})
 group['skeletons'].append({'file':str(skel),'asset':str(p),'guid':g,'scale':float(re.search(r'\n  scale: ([^\n]+)',s)[1])})
 if not group['textures']:
  for mg in re.findall(r'guid: (\w+)',at.split('materials:')[-1]):
   mp=materials.get(mg)
   if mp:
    ms=read(mp);tg=re.search(r'_MainTex:\s*\n\s*m_Texture:.*?guid: (\w+)',ms)
    if tg and tg[1] in textures:group['textures'].append(str(textures[tg[1]]))
for group in groups.values():
 name=group['name'];group['sources']=[str(p.relative_to(A)).replace('\\','/') for p in prefabs.get(name,[])]
 # Use SkeletonData references to find actual owning prefabs when filenames differ.
missing_guids={sk['guid']:gr for gr in groups.values() for sk in gr['skeletons'] if not gr['sources']}
for n,ps in prefabs.items():
 for p in ps:
  if p.stat().st_size>3000000:continue
  for g in set(re.findall(r'guid: (\w+)',read(p))):
   if g in missing_guids:
    gr=missing_guids[g];src=str(p.relative_to(A)).replace('\\','/')
    if src not in gr['sources']:gr['sources'].append(src)
rows=[]
for gr in groups.values():
 name=gr['name'];sources=gr['sources'];sp=' '.join(sources).lower()
 if 'illust' in name.lower() or 'illiust' in name.lower():folder='illust'
 elif any('/characters/' in '/'+s or '/bosses/' in '/'+s or s.startswith('characters/') for s in sources):folder='character'
 elif any(s.startswith('effects/') or '/effects/' in s or '/effect/' in s for s in sources):folder='effect'
 else:folder='other'
 gr['folder']=folder
 gr['pages']=re.findall(r'^([^\s].*\.png)\r?\n(?:size:|filter:|format:)',read(Path(gr['atlas'])),re.M)
 # Match pages to the material's exact Texture2D, never guess a duplicate basename.
 gr['pageFiles']={}
 for page in gr['pages']:
  matches=[p for p in gr['textures'] if Path(p).stem==Path(page).stem or Path(p).stem==Path(page).stem+'.rgba4444']
  if len(matches)==1:gr['pageFiles'][page]=matches[0]
  elif len(gr['pages'])==len(gr['textures'])==1:gr['pageFiles'][page]=gr['textures'][0]
 gr['complete']=len(gr['pageFiles'])==len(gr['pages']) and bool(gr['pages'])
 rows.append(gr)
(W/'inventory.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),'utf-8')
print('Groups',len(rows),'classes',collections.Counter(x['folder'] for x in rows),'incomplete',collections.Counter(x['folder'] for x in rows if not x['complete']))
print('Other examples',[(x['name'],x['sources'][:2]) for x in rows if x['folder']=='other'][:35])
print('Hana',[x for x in rows if x['name']=='aw_hana_kid'])
