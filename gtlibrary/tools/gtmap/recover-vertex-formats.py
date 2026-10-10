"""Recover descriptors for raw byte-colored map meshes; no magnitude heuristics."""
from pathlib import Path
import sys,json,gzip,hashlib,zipfile,gc
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs');import UnityPy
ROOT=Path('D:/github/gtlibrary');SOURCE=Path('E:/GTFiles/files/AssetBundles/Android');WORK=ROOT/'tools/gtmap'
APK=zipfile.ZipFile('E:/GTFiles/_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
with gzip.open(WORK/'batches/final-master.json.gz','rt',encoding='utf8') as f:master=json.load(f)
wanted={k:m['nativeSource'] for k,m in master['meshes'].items() if m.get('colors') and max(m['colors'])>1}
for path in (ROOT/'gtmap/assets/effects').glob('*.json.gz'):
 with gzip.open(path,'rt',encoding='utf8') as f:extra=json.load(f)
 for k,m in extra['meshes'].items():
  if m.get('colors') and max(m['colors'])>1:wanted.setdefault(k,None)
sets=master['setOrder'];del master;gc.collect();found={};audit=[]
aliases={'futurecastle':'ondemand/v2_3_futurecastle/tilesets/futurecastle','school':'ondemand/highschool/tilesets','roguelike_mall':'ondemand/ancientmall/tilesets'}
for ts in sets:
 if len(found)==len(wanted):break
 name=aliases.get(ts,ts.split(':')[0] if ':' in ts else 'tilesets/'+ts);env=UnityPy.Environment();seen=set();dependencies={}
 def load(n):
  if n in seen:return
  seen.add(n);p=SOURCE/n
  try:data=p.read_bytes() if p.exists() else APK.read('assets/AssetBundles/Android/'+n)
  except (FileNotFoundError,KeyError):return
  env.load_file(data,name=n);dependencies[n]=hashlib.sha256(data).hexdigest()
  for o in list(env.objects):
   if o.type.name=='AssetBundle':
    for d in o.read().m_Dependencies:load(d)
 load(name);n=0
 for o in env.objects:
  if o.type.name!='Mesh':continue
  key='ng-'+hashlib.sha256((o.assets_file.name+':'+str(o.path_id)).encode()).hexdigest()[:24]
  if key not in wanted or key in found:continue
  raw=o.read_typetree();channel=raw['m_VertexData']['m_Channels'][3];found[key]={'color':channel['format'],'dimension':channel['dimension']&15};n+=1
 audit.append({'tileset':ts,'dependencies':dependencies,'recovered':n});print(ts,n,'total',len(found),'/',len(wanted),flush=True)
 del env;gc.collect()
assert len(found)==len(wanted),list(wanted.keys()-found.keys())
(ROOT/'gtmap/assets/vertex-formats.json').write_text(json.dumps(found,separators=(',',':')),encoding='utf8')
(WORK/'evidence/vertex-format-audit.json').write_text(json.dumps({'formats':found,'sources':audit},indent=2),encoding='utf8')
