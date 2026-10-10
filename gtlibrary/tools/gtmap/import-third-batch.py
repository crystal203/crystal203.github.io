"""Third batch: +617 maps, direct Unity bundle geometry/materials, static gzip packs."""
from pathlib import Path
import sys,json,hashlib,zipfile,collections,shutil,gzip,re,gc,math
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'gtmap/assets';WORK=ROOT/'tools/gtmap';CACHE=WORK/'native-cache';CACHE.mkdir(exist_ok=True)
sys.path.insert(0,str(WORK));from strict_kong import Reader,parse
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs');import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from UnityPy.helpers import CompressionHelper
APK=zipfile.ZipFile('E:/GTFiles/_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
SOURCE=Path('E:/GTFiles/files/Tilemaps');DECODED=Path('E:/GTFiles/Tilemaps_decoded');NATIVE=Path('E:/GTFiles/files/AssetBundles/Android')
old=json.loads((WORK/'batches/second-823.json').read_text(encoding='utf8'));have={m['id'] for m in old['maps']}
set_order=['ondemand/afterworld/tilesets:afterworld.tileset','ancient','ancient_red','forest','gimmick','desert','market','dungeon','sanjose','cave','house','lab','snowworld','steampunk','library','china','china_night','inside','pvp_arena','titantavern','prison','guild','store','event_inn','throneroom','cave2','prologue','heavencore','character','ondemand/expedition/tilesets:expedition_chosenone.tileset','ondemand/v2_65_queencastle/tilesets:queencastle.tileset','ondemand/v2_49_queenship/tilesets:queenship.tileset','ondemand/v2_39_demonshire/tilesets/demonshire:demonshire.tileset','ondemand/coop_expedition/tilesets:coop_expedition.tileset','ondemand/archaic/tilesets:archaic.tileset','ondemand/fox/tilesets:fox.tileset','ondemand/highschool/tilesets:school.tileset','ondemand/movie/tilesets:movie.tileset']
files={p.stem:p for p in SOURCE.rglob('*.bytes')};exclude_path=WORK/'batches/third-exclusions.json';excluded=set(json.loads(exclude_path.read_text()) if exclude_path.exists() else [])
candidates=[]
for p in sorted(DECODED.rglob('*.tilemap')):
 r=Reader(p.read_bytes())
 if r.take(4)!=b'KONG':continue
 v=r.unpack('i')
 if v not in (12,13,14,15,16) or p.stem in have|excluded or p.stem not in files:continue
 r.take(16);sets=[]
 for _ in range(r.count(100)):
  sets.append(r.string())
  for _ in range(r.count()):r.string()
 if not sets or not any(s!='gimmick' for s in sets) or any(s not in set_order for s in sets):continue
 candidates.append((p,sets,v))
candidates.sort(key=lambda row:('test' in row[0].stem.lower(),any(s.startswith('ondemand/') and s!=set_order[0] for s in row[1]),row[0].stem))
assert len(candidates)>=617,len(candidates);selected=candidates[:617]
cache_rows={}
for path in [WORK/'evidence/expansion-map-cache.ndjson',WORK/'evidence/third-map-cache.ndjson']:
 if path.exists():
  for line in path.read_text(encoding='utf8').splitlines():
   try:row=json.loads(line);cache_rows[row['id']]=row
   except json.JSONDecodeError:pass
rows=[];used=collections.defaultdict(set)
labels={'cave':'洞窟','house':'城镇房屋','lab':'实验室','snowworld':'雪原','steampunk':'蒸汽工业','library':'图书馆','china':'武侠城镇','china_night':'武侠城镇夜景','inside':'室内','pvp_arena':'竞技场','titantavern':'旅馆','prison':'监狱','guild':'公会','store':'商店','event_inn':'活动旅馆','prologue':'序章','heavencore':'天堂堡垒核心','forest':'森林','market':'市场','dungeon':'地牢','desert':'沙漠','ancient':'古代遗迹','ancient_red':'红色遗迹'}
for p,sets,v in selected:
 sha=hashlib.sha256(p.read_bytes()).hexdigest();row=cache_rows.get(p.stem)
 if not row or row['sha256']!=sha:
  d=parse(p.read_bytes());tiles=[t for l in d['layers'] for part in l.get('partitions',[]) for t in part['tiles']]
  row={'id':p.stem,'sha256':sha,'version':v,'tiles':len(tiles),'layers':len(d['layers']),'events':sum(len(l.get('events',[])) for l in d['layers']),'sets':sets,'used':sorted({(d['tilesets'][t['ts']-1]['name'],t['name']) for t in tiles})}
  with (WORK/'evidence/third-map-cache.ndjson').open('a',encoding='utf8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
  del d,tiles
 for s,n in row['used']:used[s].add(n)
 theme=next(s for s in sets if s!='gimmick');label=labels.get(theme,theme.split(':')[-1].replace('.tileset',''))
 rows.append({k:row[k] for k in ('id','sha256','version','tiles','events','layers','sets')}|{'name':p.stem,'group':label,'category':files[p.stem].relative_to(SOURCE).parts[0],'file':'maps/'+files[p.stem].name,'batch':3,'templateKeys':[str(set_order.index(s)+1)+':'+n for s,n in row['used']]})
 shutil.copyfile(files[p.stem],OUT/'maps'/files[p.stem].name)
 if len(rows)%50==0:print('Validated third maps',len(rows),flush=True)
(WORK/'batches/third-plan.json').write_text(json.dumps({'sourceCount':len(files),'deployedCount':1440,'previousCount':823,'addedCount':617,'maps':old['maps']+rows},ensure_ascii=False,separators=(',',':')),encoding='utf8')
# Reuse existing native texture pixels without changing any older deployed PNG.
from PIL import Image
image_paths={}
for p in (OUT/'textures').glob('*.png'):
 with Image.open(p) as im:
  im=im.convert('RGBA');image_paths[(im.size,hashlib.sha256(im.tobytes()).hexdigest())]='textures/'+p.name
bundle_bytes={}
def blob(name):
 if name not in bundle_bytes:
  p=NATIVE/name;bundle_bytes[name]=p.read_bytes() if p.is_file() else APK.read('assets/AssetBundles/Android/'+name)
 return bundle_bytes[name]
def ident(obj,prefix):return prefix+'-'+hashlib.sha256((obj.assets_file.name+':'+str(obj.path_id)).encode()).hexdigest()[:24]
def flat(a,n):return [float(v) for row in a for v in row[:n]] if a else None
def matrix(t):
 q=t.m_LocalRotation;x,y,z,w=[getattr(q,k) for k in 'xyzw'];r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],float)
 for i,k in enumerate('xyz'):r[:,i]*=getattr(t.m_LocalScale,k);r[i,3]=getattr(t.m_LocalPosition,k)
 return r
master={'templates':{},'meshes':{},'materials':{},'textures':{},'setOrder':set_order,'renderProfile':{'colorSpace':'Gamma','playerSettingsActiveColorSpace':0},'environment':{'clouds':{}}};issues=[];shader_dir=WORK/'evidence/native-shaders';shader_dir.mkdir(exist_ok=True)
for ts,s in enumerate(set_order,1):
 if s not in used:continue
 name=s.split(':')[0] if ':' in s else 'tilesets/'+s;filename=s.split(':')[-1] if ':' in s else s+'.tileset';env=UnityPy.Environment();loaded=set();dependencies={}
 def load(n):
  if n in loaded:return
  try:data=blob(n)
  except KeyError:
   loaded.add(n);dependencies[n]='missing source bundle';issues.append({'type':'missingDependency','bundle':n,'tileset':s});return
  loaded.add(n);file=env.load_file(data,name=n)
  dependencies[n]=hashlib.sha256(data).hexdigest()
  for o in list(env.objects):
   if o.type.name=='AssetBundle' and o.assets_file.name not in getattr(load,'seen',set()):
    if not hasattr(load,'seen'):load.seen=set()
    load.seen.add(o.assets_file.name)
    for dep in o.read().m_Dependencies:load(dep)
 load(name)
 for n in ['Resources/unity_builtin_extra','unity default resources']:
  try:env.load_file(APK.read('assets/bin/Data/'+n),name=n.rsplit('/',1)[-1])
  except KeyError:pass
 signature=hashlib.sha256(json.dumps({'source':dependencies,'used':sorted(used[s]),'exportVersion':2},sort_keys=True).encode()).hexdigest()
 saved=CACHE/(signature+'.json.gz')
 if saved.exists():
  result=json.loads(gzip.decompress(saved.read_bytes()));print('Reused native theme',s,flush=True)
 else:
  print('Export native theme',s,'dependencies',len(loaded),flush=True);result={'templates':{},'meshes':{},'materials':{},'textures':{},'issues':[]};root=next(v.read() for k,v in env.container.items() if k.endswith('/'+filename+'.prefab'))
  rt=next(c.component.read() for c in root.m_Component if c.component.type.name=='Transform');native_tiles={p.read().m_GameObject.read().m_Name:p.read() for p in rt.m_Children}
  def texture(ref):
   if not ref.path_id:return None
   obj=ref.deref();tid=ident(obj,'nt')
   if tid in result['textures']:return tid
   tex=obj.read();im=tex.image.convert('RGBA');pixel=(im.size,hashlib.sha256(im.tobytes()).hexdigest());url=image_paths.get(pixel)
   if not url:
    url='textures/'+tid+'.png';im.save(OUT/url);image_paths[pixel]=url
   settings=tex.m_TextureSettings;result['textures'][tid]={'url':url,'name':tex.m_Name,'filter':settings.m_FilterMode,'wrap':settings.m_WrapU,'srgb':tex.m_ColorSpace==1};return tid
  def material(ref):
   if not ref.path_id:return None
   obj=ref.deref();key=ident(obj,'nm')
   if key in result['materials']:return key
   raw=obj.read_typetree();source=obj.read();shader=source.m_Shader.read();state=shader.object_reader.read_typetree()['m_ParsedForm'];sub=state['m_SubShaders'][0];render=sub['m_Passes'][0]['m_State'];props=state['m_PropInfo']['m_Props'];tags=dict(sub['m_Tags']['tags']);blend=render['rtBlend0']
   profile={'name':shader.m_ParsedForm.m_Name,'pathId':source.m_Shader.path_id,'queueTag':tags.get('QUEUE',tags.get('Queue','Geometry')),'srcBlend':blend['srcBlend']['val'],'dstBlend':blend['destBlend']['val'],'depthWrite':bool(render['zWrite']['val']),'depthTest':render['zTest']['val'],'cull':render['culling']['val'],'defaults':{p['m_Name']:dict(zip('rgba',[p['m_DefValue['+str(i)+']'] for i in range(4)])) for p in props if p['m_Type'] in (0,1)},'properties':[p['m_Name'] for p in props],'textureDefaults':{p['m_Name']:p['m_DefTexture']['m_DefaultName'] for p in props if p['m_Type']==4}}
   texenvs={slot:{'texture':texture(tex.m_Texture),'scale':{'x':tex.m_Scale.x,'y':tex.m_Scale.y},'offset':{'x':tex.m_Offset.x,'y':tex.m_Offset.y}} for slot,tex in source.m_SavedProperties.m_TexEnvs};main=texenvs.get('_MainTex',{})
   result['materials'][key]={'name':raw['m_Name'],'queue':raw['m_CustomRenderQueue'],'nativeShader':profile,'colors':dict(raw['m_SavedProperties']['m_Colors']),'floats':dict(raw['m_SavedProperties']['m_Floats']),'texenvs':texenvs,'texture':main.get('texture'),'scale':main.get('scale',{'x':1,'y':1}),'offset':main.get('offset',{'x':0,'y':0}),'nativeSource':{'assetFile':obj.assets_file.name,'pathId':obj.path_id}}
   target=shader_dir/(str(source.m_Shader.path_id)+'.txt')
   if shader.compressedBlob and not target.exists():
    chunks=[]
    for i,platform in enumerate(shader.platforms):
     for j,length in enumerate(shader.compressedLengths[i]):
      start=shader.offsets[i][j];data=CompressionHelper.decompress_lz4(bytes(shader.compressedBlob)[start:start+length],shader.decompressedLengths[i][j]);chunks.extend(data[m.start():].split(b'\0',1)[0].decode('utf8') for m in re.finditer(b'#ifdef VERTEX',data))
    target.write_text('\n\n'.join(chunks),encoding='utf8')
   return key
  def mesh(ref):
   if not ref.path_id:return None
   obj=ref.deref();key=ident(obj,'ng')
   if key in result['meshes']:return key
   source=obj.read();handler=MeshHandler(source);handler.process()
   if not handler.m_Vertices:return None
   indices=[]
   for sub,tri in zip(source.m_SubMeshes,handler.get_triangles()):
    assert sub.topology in (0,1,2),sub.topology
    arr=[int(i)+int(sub.baseVertex or 0) for f in tri for i in f];assert len(arr)%3==0 and (not arr or max(arr)<handler.m_VertexCount)
    indices.append(arr)
   result['meshes'][key]={'name':source.m_Name,'positions':flat(handler.m_Vertices,3),'normals':flat(handler.m_Normals,3),'uv':flat(handler.m_UV0,2),'uv2':flat(handler.m_UV1,2),'colors':flat(handler.m_Colors,4),'submeshes':indices,'nativeSource':{'assetFile':obj.assets_file.name,'pathId':obj.path_id}}
   return key
  for tile in sorted(used[s]):
   key=str(ts)+':'+tile;parts=[];t=native_tiles.get(tile)
   if t is None:
    result['issues'].append({'type':'missingNativeTemplate','tile':tile,'key':key,'tileset':s});result['templates'][key]={'name':tile,'parts':[]};continue
   def visit(t,transform,is_root=False):
    go=t.m_GameObject.read()
    if not is_root and not go.m_IsActive:return
    refs={c.component.type.name:c.component for c in go.m_Component}
    if 'MeshFilter' in refs and 'MeshRenderer' in refs:
     mr=refs['MeshRenderer'].read()
     if mr.m_Enabled:
      try:
       mk=mesh(refs['MeshFilter'].read().m_Mesh);mats=[material(m) for m in mr.m_Materials]
       if mk:parts.append({'mesh':mk,'materials':mats,'matrix':transform.reshape(-1).tolist(),'node':go.m_Name})
      except (FileNotFoundError,KeyError) as ex:result['issues'].append({'type':'unresolvedNativeReference','tile':tile,'node':go.m_Name,'reason':str(ex)})
    for kind in ['SpriteRenderer','SkinnedMeshRenderer','ParticleSystem']:
     if kind in refs:result['issues'].append({'type':kind,'tile':tile,'node':go.m_Name})
    for c in t.m_Children:
     child=c.read();visit(child,transform@matrix(child))
   visit(t,np.eye(4),True);result['templates'][key]={'name':tile,'parts':parts}
   if not parts:result['issues'].append({'type':'noStaticMesh','tile':tile,'key':key})
  def preserve_finite(v,path=''):
   if isinstance(v,float) and not math.isfinite(v):
    assert path.startswith('/materials/'),('Nonfinite geometry',path)
    value='NaN' if math.isnan(v) else ('Infinity' if v>0 else '-Infinity')
    result['issues'].append({'type':'nativeNonFiniteParameter','field':path,'value':value})
    return value
   if isinstance(v,dict):return {k:preserve_finite(a,path+'/'+str(k)) for k,a in v.items()}
   if isinstance(v,list):return [preserve_finite(a,path+'/'+str(k)) for k,a in enumerate(v)]
   return v
  result=preserve_finite(result)
  saved.write_bytes(gzip.compress(json.dumps(result,separators=(',',':'),allow_nan=False).encode(),mtime=0))
 for section in ['templates','meshes','materials','textures']:master[section].update(result[section])
 issues.extend(result['issues']);print('Native total',len(master['templates']),len(master['meshes']),len(master['materials']),flush=True)
 del env,result;gc.collect()
# Preserve confirmed afterworld billboard emitters with their recovered original slots.
seed=json.loads((WORK/'batches/expansion-master.json').read_text(encoding='utf8'))
for key,spec in seed.get('environment',{}).get('clouds',{}).items():
 if key not in master['templates']:continue
 master['environment']['clouds'][key]=spec;mk=spec['material'];master['materials'][mk]=seed['materials'][mk]
 for slot in master['materials'][mk]['texenvs'].values():
  if slot['texture']:master['textures'][slot['texture']]=seed['textures'][slot['texture']]
# Preserve actual GLES vertex/fragment programs in dependency-closed browser packs.
for material in master['materials'].values():
 profile=material['nativeShader'];path=shader_dir/(str(profile['pathId'])+'.txt')
 if not path.exists() or not path.stat().st_size:continue
 text=path.read_text(encoding='utf8');programs=re.split(r'(?=#ifdef VERTEX)',text)
 programs=[p for p in programs if '#ifdef FRAGMENT' in p and '#version 300 es' in p]
 if not programs:continue
 program=programs[1] if profile['name']=='MatCap/Detail Alpha ZWrite' and len(programs)>1 else programs[0]
 profile['gles']=program
 if profile['name']=='MatCap/Detail Alpha ZWrite':profile.update(srcBlend=5,dstBlend=10,depthWrite=True)
(WORK/'batches/third-master.json.gz').write_bytes(gzip.compress(json.dumps(master,separators=(',',':'),allow_nan=False).encode(),mtime=0))
(WORK/'evidence/third-export-audit.json').write_text(json.dumps({'templates':len(master['templates']),'meshes':len(master['meshes']),'materials':len(master['materials']),'textures':len(master['textures']),'shaderCounts':dict(collections.Counter(m['nativeShader']['name'] for m in master['materials'].values())),'issues':issues},ensure_ascii=False),encoding='utf8')
print('Third native export complete',len(rows),flush=True)
