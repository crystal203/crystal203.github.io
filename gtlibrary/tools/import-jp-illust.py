"""Extract Japanese illustration bundles directly; never substitute portrait sprites."""
import sys,json,hashlib,re
from pathlib import Path
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs')
import UnityPy
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('E:/GTFiles/files/AssetBundles/Android/ondemand/illusts')
OUT=ROOT/'resources/illust-jp';OUT.mkdir(parents=True,exist_ok=True)
rp=ROOT/'resources/registry.js';s=rp.read_text(encoding='utf-8');registry=json.loads(s[s.index('{'):s.rindex('}')+1])
rows=[];aliases={};audit=[]
for bundle in sorted(SOURCE.glob('*_kong')):
 env=UnityPy.load(str(bundle));texts={};textures={}
 for obj in env.objects:
  if obj.type.name=='TextAsset':
   d=obj.read();texts[d.m_Name]=d.m_Script.encode('utf-8','surrogateescape')
  elif obj.type.name=='Texture2D':
   d=obj.read();textures[d.m_Name]=d
 atlases=[n for n in texts if n.endswith('.atlas')]
 if len(atlases)!=1:raise ValueError((bundle.name,'unexpected atlases',atlases))
 atlas=atlases[0];name=atlas[:-6];skel=name+'.skel'
 if skel not in texts:raise ValueError((bundle.name,'missing skeleton'))
 atlastext=texts[atlas].decode('utf-8');pages=re.findall(r'^([^\s].*\.png)\r?\n(?:size:|filter:|format:)',atlastext,re.M)
 if not pages:raise ValueError((bundle.name,'no texture pages'))
 files=[name+'.atlas',name+'.bytes'];(OUT/files[0]).write_bytes(texts[atlas]);(OUT/files[1]).write_bytes(texts[skel])
 for page in pages:
  stem=Path(page).stem;matches=[d for n,d in textures.items() if n==stem or n==stem+'.rgba4444']
  if len(matches)!=1:raise ValueError((bundle.name,page,list(textures)))
  matches[0].image.save(OUT/page);files.append(page)
 for texname,d in textures.items():
  if texname.startswith('bg_'):d.image.save(OUT/(texname+'.png'));files.append(texname+'.png')
 id=name.removeprefix('illust_');base=id.removesuffix('_kong');entity=registry['entities'].get(base,{})
 prior=registry['entities'].get(id,{})
 label=entity.get('name') or prior.get('name') or base
 if label.endswith('（日服立绘）'):label=label[:-6]
 entry={**prior,'id':id,'name':label+'（日服立绘）','aliases':sorted(set(prior.get('aliases',[])+[id,name,base,label,'日服','日服立绘','日本服','JP illustration'])),'spine':{'folder':'illust','name':name},'illust':{'folder':'illust','name':name}}
 if entity.get('fx'):entry['fx']=entity['fx']
 registry['entities'][id]=entry;registry['aliases'][id]=id;registry['aliases'][name]=id
 rows.append({'id':id,'name':name,'label':entry['name'],'pages':pages,'backgrounds':[f for f in files if f.startswith('bg_')],'files':files})
 for file in files:aliases['resources/spine/illust/'+file]='resources/illust-jp/'+file
 audit.append({'bundle':str(bundle),'sourceSha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'skeletonSha256':hashlib.sha256(texts[skel]).hexdigest(),'files':{f:hashlib.sha256((OUT/f).read_bytes()).hexdigest() for f in files}})
 print('Imported',bundle.name,flush=True)
(OUT/'catalog.json').write_text(json.dumps({'illustrations':rows},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'aliases.json').write_text(json.dumps(aliases,separators=(',',':')),encoding='utf-8')
rp.write_text('window.GTLibraryRegistry = '+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
r=ROOT/'core/resources.js';s=r.read_text(encoding='utf-8');start=s.index('aliases=')+8;end=s.index(',domains=',start);old=json.loads(s[start:end]);old.update(aliases);s=s[:start]+json.dumps(old,separators=(',',':'))+s[end:];r.write_text(s,encoding='utf-8')
(ROOT/'tools/jp-illust-audit.json').write_text(json.dumps({'count':len(rows),'source':str(SOURCE),'resources':audit},ensure_ascii=False,indent=2),encoding='utf-8')
print('Imported total',len(rows),'bytes',sum(p.stat().st_size for p in OUT.glob('*')))
