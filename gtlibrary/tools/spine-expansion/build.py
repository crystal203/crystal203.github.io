import os
"""Build a dependency-closed supplement, leaving pinned CDN assets untouched."""
import json,re,hashlib,shutil,collections
from pathlib import Path
W=Path(os.environ.get('GT_SPINE_WORK','E:/GTFiles/_manual/spine-expansion'));R=Path('D:/github/gtlibrary');S=W/'staged';D=Path('E:/GTFiles/static_data_dec')
def read(p):return p.read_text('utf-8-sig')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(rel,value):
 p=S/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value,'utf-8')
def jsdata(p):
 s=read(p);return json.loads(s[s.index('{'):s.rindex('}')+1])
rows=json.loads(read(W/'inventory.json'));parsed=json.loads(read(W/'parse-validation.json'));valid={x['atlas']:{s['file']:s for s in x['skeletons']} for x in parsed['results']}
strings=json.loads(read(D/'strings-zhCN.json'));refs=collections.defaultdict(list)
for table in ['npc','heroes','monsters']:
 for row in json.loads(read(D/(table+'.json'))):
  values=row.get('SpineAssetName') or {};values=values.values() if isinstance(values,dict) else [values]
  for value in values:
   if not isinstance(value,str):continue
   bundle,_,skin=value.partition('#');name=bundle.rsplit(':',1)[-1].rsplit('/',1)[-1]
   refs[name].append({'table':table,'id':row.get('Id'),'name':row.get('Name'),'asset':value,'skin':skin})
registry=jsdata(R/'resources/registry.js');index=json.loads(read(R/'resources/search-index.json'))
previous=R/'resources/spine-expansion/catalog.json'
if previous.exists():
 keys={(folder,row['name']) for folder,items in json.loads(read(previous))['groups'].items() for row in items}
 index['entities']=[e for e in index['entities'] if (e.get('spine',{}).get('folder'),e.get('spine',{}).get('name')) not in keys]
resource_source=read(R/'core/resources.js');start=resource_source.index('aliases=')+8;end=resource_source.index(',domains=',start);aliases=json.loads(resource_source[start:end])
catalog={'version':1,'groups':{'character':[],'illust':[],'effect':[]}};audits=[];excluded=[];used={};dedup=0
for row in rows:
 name=row['name'];folder=row['folder'];sources=row['sources']
 if folder=='other':
  if any('/characters_kong/' in s for s in sources) or name in refs or name.startswith('memorial_sg_'):folder='character'
  elif any('/visual_novel/' in s or '/illust_spine/' in s for s in sources):folder='illust'
  elif any(s.startswith('theatre/') or '/spine/' in s for s in sources):folder='effect'
 if folder=='other' or not row['complete']:
  excluded.append({'name':name,'reason':'outside character/illustration/effect scope' if folder=='other' else 'missing texture dependency','sources':sources});continue
 good=valid.get(row['atlas'],{});skels=[]
 for sk in row['skeletons']:
  if sk['file'] not in good:
   excluded.append({'name':name,'file':sk['file'],'reason':'source skeleton cannot parse against its referenced atlas'});continue
  stem=Path(sk['file']).name.split('.skel')[0]
  variant=stem[len(name):].lstrip('_') if stem.startswith(name) else stem
  if re.fullmatch(r'\d+',variant or 'x'):variant=''
  skels.append((variant,sk))
 if not skels:continue
 # Identical exports share one entry; distinct source revisions retain their own identity.
 signature=hashlib.sha256((sha(row['atlas'])+str(sorted((v,sha(s['file'])) for v,s in skels))+str(sorted(sha(p) for p in row['pageFiles'].values()))).encode()).hexdigest()
 if (folder,name,signature) in used:
  used[(folder,name,signature)]['sources'].extend(s for s in sources if s not in used[(folder,name,signature)]['sources']);dedup+=1;continue
 public=name if not any(k[:2]==(folder,name) for k in used) else name+'__source_'+signature[:8]
 relevant=refs.get(name,[]);names=set();search={name,public,*sources}
 for entry in relevant:
  search.update(str(x) for x in [entry['name'],entry['asset'],entry['id'],entry['skin']] if x)
  key=entry['name'] or '';label=strings.get(key) or strings.get('name_'+key)
  if label and len(label)<100:names.add(label)
 for _,sk in skels:
  search.update(good[sk['file']]['skins'])
 names.update([strings[name]] if name in strings and len(strings[name])<100 else [])
 label=next(iter(names)) if len(names)==1 else name
 if name=='aw_hana_kid':label=strings['aw_main_character']+'（幼年）'
 if public!=name:label+=' · '+signature[:8]
 search.update(names);search.add(label)
 out='resources/spine-expansion/'+folder+'/'+public+'/'
 atlastext=read(Path(row['atlas']));files=[]
 for i,(page,src) in enumerate(row['pageFiles'].items()):
  dest=public+'__page'+str(i)+'.png';atlastext=re.sub(r'^'+re.escape(page)+r'\r?$',dest,atlastext,flags=re.M)
  target=S/out/dest;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,target)
  aliases['resources/spine/'+folder+'/'+dest]=out+dest;files.append({'path':out+dest,'source':src,'sha256':sha(target)})
 write(out+public+'.atlas',atlastext);aliases['resources/spine/'+folder+'/'+public+'.atlas']=out+public+'.atlas'
 variants=[];seen_variant={}
 for variant,sk in skels:
  digest=sha(sk['file'])
  if variant in seen_variant:
   if seen_variant[variant]==digest:continue
   variant=(variant or 'default')+'_'+digest[:8]
  seen_variant[variant]=digest;variants.append(variant)
  dest=public+('_'+variant if variant else '')+'.bytes';shutil.copyfile(sk['file'],S/out/dest)
  aliases['resources/spine/'+folder+'/'+dest]=out+dest;files.append({'path':out+dest,'source':sk['file'],'sha256':digest})
 variants.sort(key=lambda x:({'':0,'front':1,'back':2,'side':3,'tentacle':4}.get(x,9),x))
 item={'name':public,'label':label,'variants':variants,'aliases':sorted(search),'sources':list(sources)}
 catalog['groups'][folder].append(item);used[(folder,name,signature)]=item
 identity=public.removeprefix('illust_') if folder=='illust' else public
 if identity in registry['entities'] and registry['entities'][identity].get('spine',{}).get('name')!=public:identity='spine_'+folder+'_'+public
 prior=registry['entities'].get(identity,{})
 entity={**prior,'id':identity,'name':label,'aliases':sorted(set(prior.get('aliases',[]))|search),'spine':{'folder':folder,'name':public}}
 if folder=='illust':entity['illust']={'folder':folder,'name':public}
 registry['entities'][identity]=entity
 for alias in [public,*search]:registry['aliases'].setdefault(alias,identity)
 index['entities'].append({'id':'spine:'+folder+':'+public,'name':label,'aliases':sorted(search),'spine':{'folder':folder,'name':public},'kind':'spine'})
 audits.append({'name':public,'folder':folder,'sourceName':name,'sources':sources,'atlasSource':row['atlas'],'atlasSourceSha256':sha(row['atlas']),'staticReferences':relevant,'variants':variants,'files':files})
for folder,items in catalog['groups'].items():items.sort(key=lambda x:x['name'])
write('resources/spine-expansion/catalog.json',json.dumps(catalog,ensure_ascii=False,separators=(',',':')))
write('resources/spine-expansion/effect-assets.js','window.spineAssets = [];\n');write('resources/spine-expansion/effect-names.json','{}\n')
aliases['resources/spine/effect/assets.js']='resources/spine-expansion/effect-assets.js';aliases['resources/spine/effect/names.zh.json']='resources/spine-expansion/effect-names.json'
write('core/resources.js',resource_source[:start]+json.dumps(aliases,separators=(',',':'))+resource_source[end:])
write('resources/registry.js','window.GTLibraryRegistry = '+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+';\n')
index['counts']['spine']=sum(e.get('kind')=='spine' for e in index['entities']);write('resources/search-index.json',json.dumps(index,ensure_ascii=False,separators=(',',':')))
summary={'counts':{f:len(v) for f,v in catalog['groups'].items()},'deduplicated':dedup,'excluded':excluded,'resources':audits}
write('tools/spine-expansion-audit.json',json.dumps(summary,ensure_ascii=False,indent=2))
print('Prepared',summary['counts'],'deduplicated',dedup,'excluded',len(excluded),'MB',round(sum(p.stat().st_size for p in (S/'resources/spine-expansion').rglob('*') if p.is_file())/1024**2,1))
