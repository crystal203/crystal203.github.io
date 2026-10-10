"""Read original bundle particle/sprite/animator data; emit static per-tileset sidecars.
Never edits source art or existing packs. Run from library tools/gtmap.
"""
from pathlib import Path
import sys,json,gzip,hashlib,zipfile,re,math,gc,collections,argparse
import zlib
import numpy as np
import yaml
from state_assets import trim
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs')
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from UnityPy.helpers import CompressionHelper
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'gtmap/assets';WORK=ROOT/'tools/gtmap'
SOURCE=Path('E:/GTFiles/files/AssetBundles/Android')
APK=zipfile.ZipFile('E:/GTFiles/_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
with gzip.open(WORK/'batches/final-master.json.gz','rt',encoding='utf8') as f:master=json.load(f)
sets=master['setOrder'];used=collections.defaultdict(set)
for k in master['templates']:i,n=k.split(':',1);used[sets[int(i)-1]].add(n)
del master;gc.collect()
# Earlier published maps contain templates absent from the final expansion batch.
for filename in ['expansion-master.json','third-master.json.gz']:
 path=WORK/'batches'/filename
 with (gzip.open(path,'rt',encoding='utf8') if filename.endswith('.gz') else path.open(encoding='utf8')) as f:previous=json.load(f)
 for k in previous['templates']:
  i,n=k.split(':',1);used[previous['setOrder'][int(i)-1]].add(n)
 del previous;gc.collect()
MODULES=['InitialModule','ShapeModule','EmissionModule','SizeModule','RotationModule','ColorModule','UVModule','VelocityModule','ForceModule','ClampVelocityModule','NoiseModule']
def clean(v):
 if isinstance(v,float) and not math.isfinite(v):return 'Infinity' if v>0 else '-Infinity' if v<0 else 'NaN'
 if isinstance(v,list):return [clean(x) for x in v]
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items() if k not in ['serializedVersion','tangentMode','m_RotationOrder','m_ColorSpace']}
 return v
def ident(o,p):return p+'-'+hashlib.sha256((o.assets_file.name+':'+str(o.path_id)).encode()).hexdigest()[:24]
def vec(v):return {k:float(getattr(v,k)) for k in ('xyzw' if hasattr(v,'w') else 'xyz')}
aliases={'futurecastle':'ondemand/v2_3_futurecastle/tilesets/futurecastle','school':'ondemand/highschool/tilesets','roguelike_mall':'ondemand/ancientmall/tilesets'}

# Use AssetRipper's already decompressed clips, never re-extract animation binaries.
EXPORT=Path('D:/GTAsset/FullExtract/ExportedProject/Assets');clip_files=collections.defaultdict(list);clip_cache={}
for p in EXPORT.rglob('*.anim'):clip_files[p.stem].append(p)
def export_clip(clip):
 key=(clip.assets_file.name,str(clip.object_reader.path_id)) if hasattr(clip,'assets_file') else (clip.object_reader.assets_file.name,str(clip.object_reader.path_id))
 if key in clip_cache:return clip_cache[key]
 native=clip.object_reader.read_typetree();duration=native['m_MuscleClip']['m_StopTime']-native['m_MuscleClip']['m_StartTime'];candidates=[]
 for p in clip_files[clip.m_Name]+clip_files[re.sub(r'[\[\]]','_',clip.m_Name)]:
  try:
   text=re.sub(r'^%.*\n|^--- !u!\d+ &-?\d+\n','',p.read_text(encoding='utf-8-sig'),flags=re.M);a=yaml.load(text,Loader=yaml.CSafeLoader)['AnimationClip'];settings=a['m_AnimationClipSettings'];d=settings['m_StopTime']-settings['m_StartTime']
   if abs(d-duration)>.001:continue
   curves=[]
   for field,attribute in [('m_FloatCurves',None),('m_PositionCurves','m_LocalPosition'),('m_ScaleCurves','m_LocalScale'),('m_EulerCurves','localEulerAnglesRaw'),('m_RotationCurves','m_LocalRotation')]:
    for c in a.get(field,[]):curves.append({'path':c['path'],'attribute':c.get('attribute',attribute),'curve':c['curve'],'classID':c.get('classID',4)})
   if {zlib.crc32(c['path'].encode()) for c in curves}!={b['path'] for b in native['m_ClipBindingConstant']['genericBindings']}:continue
   candidates.append({'name':clip.m_Name,'duration':d,'loop':bool(settings['m_LoopTime']),'curves':curves,'source':p.relative_to(EXPORT).as_posix()})
  except Exception:continue
 if not candidates:raise ValueError('No exported clip matching '+clip.m_Name)
 # Common bundled effects precede chapter-local variants; identical variants need no duplication.
 candidates.sort(key=lambda c:('ondemand/' in c['source'],len(c['source'])))
 result=candidates[0];clip_cache[key]=result;return result

parser=argparse.ArgumentParser();parser.add_argument('--only',action='append',default=[]);parser.add_argument('--pickup',action='store_true');args=parser.parse_args();
if args.pickup:args.only=['__pickup_star_piece'];used={'__pickup_star_piece':{'star_piece'}}
manifest=json.loads((OUT/'native-states.json').read_text(encoding='utf8')) if args.only and (OUT/'native-states.json').exists() else {'version':1,'sets':{}};audit=json.loads((WORK/'evidence/native-states-audit.json').read_text(encoding='utf8')) if args.only and (WORK/'evidence/native-states-audit.json').exists() else [];audit=[a for a in audit if a['tileset'] not in args.only]
dest=OUT/'states';dest.mkdir(exist_ok=True)
for tileset,names in used.items():
 if args.only and tileset not in args.only:continue
 bundle='effects/stage/base' if tileset=='__pickup_star_piece' else aliases.get(tileset,tileset.split(':')[0] if ':' in tileset else 'tilesets/'+tileset)
 filename='star_piece' if tileset=='__pickup_star_piece' else tileset.split(':')[-1] if ':' in tileset else tileset+'.tileset'
 env=UnityPy.Environment();seen=set();dependencies={};issues=[]
 def load(n):
  if n in seen:return
  seen.add(n);p=SOURCE/n
  if not p.exists() and n.startswith('characters/'):
   matches=[SOURCE/'characters'/part/n.split('/',1)[1] for part in ['part1','part2','part3']];matches=[x for x in matches if x.exists()]
   if len(matches)==1:p=matches[0]
  try:data=p.read_bytes() if p.exists() else APK.read('assets/AssetBundles/Android/'+n)
  except (KeyError,FileNotFoundError):issues.append({'missingBundle':n});return
  env.load_file(data,name=n);dependencies[n]=hashlib.sha256(data).hexdigest()
  for o in list(env.objects):
   if o.type.name=='AssetBundle':
    for dep in o.read().m_Dependencies:load(dep)
 load(bundle)
 for n in ['Resources/unity_builtin_extra','unity default resources']:
  try:env.load_file(APK.read('assets/bin/Data/'+n),name=n.rsplit('/',1)[-1])
  except KeyError:pass
 data={'templates':{},'materials':{},'textures':{},'sprites':{},'meshes':{}}
 def png(im,name,key,settings=None):
  im=im.convert('RGBA');digest=hashlib.sha256(im.tobytes()).hexdigest();url='textures/effect-'+digest[:24]+'.png'
  if not (OUT/url).exists():im.save(OUT/url)
  data['textures'][key]={'url':url,'name':name,'width':im.width,'height':im.height,'filter':settings.m_FilterMode if settings else 1,'wrap':settings.m_WrapU if settings else 1}
  return key
 def texture(ref):
  if not ref.path_id:return None
  o=ref.deref();key=ident(o,'nt')
  if key not in data['textures']:
   t=o.read();png(t.image,t.m_Name,key,t.m_TextureSettings)
  return key
 def sprite(ref):
  if not ref.path_id:return None
  o=ref.deref();key=ident(o,'ns')
  if key not in data['sprites']:
   s=o.read();tid=png(s.image,s.m_Name,key+'-texture')
   data['sprites'][key]={'name':s.m_Name,'texture':tid,'uv':[0,0,1,1],'size':[s.m_Rect.width,s.m_Rect.height],'pivot':{'x':s.m_Pivot.x,'y':s.m_Pivot.y},'pixelsToUnits':s.m_PixelsToUnits,'source':{'assetFile':o.assets_file.name,'pathId':str(o.path_id)}}
  return key
 def material(ref):
  if not ref.path_id:return None
  o=ref.deref();key=ident(o,'nm')
  if key in data['materials']:return key
  m=o.read();raw=o.read_typetree();sh=m.m_Shader.read();parsed=sh.object_reader.read_typetree()['m_ParsedForm'];sub=parsed['m_SubShaders'][0];state=sub['m_Passes'][0]['m_State'];blend=state['rtBlend0'];props=parsed['m_PropInfo']['m_Props'];tags=dict(sub['m_Tags']['tags'])
  profile={'name':sh.m_ParsedForm.m_Name,'queueTag':tags.get('QUEUE',tags.get('Queue','Geometry')),'srcBlend':blend['srcBlend']['val'],'dstBlend':blend['destBlend']['val'],'depthWrite':bool(state['zWrite']['val']),'depthTest':state['zTest']['val'],'cull':state['culling']['val'],'defaults':{p['m_Name']:dict(zip('rgba',[p['m_DefValue['+str(i)+']'] for i in range(4)])) for p in props if p['m_Type'] in (0,1)},'textureDefaults':{p['m_Name']:p['m_DefTexture']['m_DefaultName'] for p in props if p['m_Type']==4}}
  programs=[]
  for i,platform in enumerate(sh.platforms):
   for j,length in enumerate(sh.compressedLengths[i]):
    start=sh.offsets[i][j];blob=CompressionHelper.decompress_lz4(bytes(sh.compressedBlob)[start:start+length],sh.decompressedLengths[i][j])
    programs.extend(blob[a.start():].split(b'\0',1)[0].decode('utf8') for a in re.finditer(b'#ifdef VERTEX',blob))
  programs=[p for p in programs if '#version 300 es' in p and '#ifdef FRAGMENT' in p]
  if programs:profile['gles']=programs[0]
  slots={slot:{'texture':texture(t.m_Texture),'scale':{'x':t.m_Scale.x,'y':t.m_Scale.y},'offset':{'x':t.m_Offset.x,'y':t.m_Offset.y}} for slot,t in m.m_SavedProperties.m_TexEnvs};main=slots.get('_MainTex',{})
  data['materials'][key]={'name':m.m_Name,'nativeShader':profile,'colors':dict(raw['m_SavedProperties']['m_Colors']),'floats':dict(raw['m_SavedProperties']['m_Floats']),'texenvs':slots,'texture':main.get('texture'),'scale':main.get('scale',{'x':1,'y':1}),'offset':main.get('offset',{'x':0,'y':0}),'queue':m.m_CustomRenderQueue}
  return key
 def mesh(ref):
  if not ref.path_id:return None
  o=ref.deref();key=ident(o,'ng')
  if key not in data['meshes']:
   m=o.read();h=MeshHandler(m);h.process()
   if not h.m_Vertices:return None
   flat=lambda a,n:[float(v) for row in a for v in row[:n]] if a else None
   indices=[[int(i)+int(s.baseVertex or 0) for tri in a for i in tri] for s,a in zip(m.m_SubMeshes,h.get_triangles())]
   data['meshes'][key]={'name':m.m_Name,'positions':flat(h.m_Vertices,3),'normals':flat(h.m_Normals,3),'uv':flat(h.m_UV0,2),'uv2':flat(h.m_UV1,2),'colors':flat(h.m_Colors,4),'colorFormat':m.m_VertexData.m_Channels[3].format,'submeshes':indices}
  return key
 roots=[v.read() for k,v in env.container.items() if k.lower().endswith('/'+filename.lower().replace('.tileset','')+'.prefab')] + [v.read() for k,v in env.container.items() if k.lower().endswith('/'+filename.lower()+'.prefab')]
 if not roots:roots=[v.read() for k,v in env.container.items() if k.lower().endswith('.tileset.prefab')]
 for root in roots:
  rt=next(c.component.read() for c in root.m_Component if c.component.type.name=='Transform')
  for child in ([rt.object_reader] if tileset=='__pickup_star_piece' else rt.m_Children):
   t=child.read();go=t.m_GameObject.read()
   if go.m_Name not in names:continue
   record={'root':str(t.object_reader.path_id),'nodes':[],'systems':[],'scripts':[],'staticScripts':{},'materialOverrides':{},'sprites':[],'parts':[],'controllers':[]}
   def visit(t,parent='0',isroot=False,path=''):
    g=t.m_GameObject.read();nid=str(t.object_reader.path_id);refs={c.component.type.name:c.component for c in g.m_Component}
    record['nodes'].append({'id':nid,'parent':parent,'name':g.m_Name,'path':path,'active':bool(g.m_IsActive) or isroot,'position':vec(t.m_LocalPosition) if not isroot else {'x':0,'y':0,'z':0},'rotation':vec(t.m_LocalRotation) if not isroot else {'x':0,'y':0,'z':0,'w':1},'scale':vec(t.m_LocalScale) if not isroot or tileset=='__pickup_star_piece' else {'x':1,'y':1,'z':1}})
    for c in g.m_Component:
     if c.component.type.name=='MonoBehaviour':
      try:
       typ=c.component.read().m_Script.read().m_ClassName;f=c.component.read_typetree()
       if typ in ['CustomAnimator','SortingLayer'] or typ=='RotateThis' or typ.startswith('FxUvanim'):
        if not f.get('m_Enabled',1):continue
        record['scripts'].append({'node':nid,'type':typ,'fields':f});record['staticScripts'].setdefault(g.m_Name,[]).append({'type':typ,'fields':f})
      except (FileNotFoundError,KeyError):pass
    if 'Animator' in refs:
     try:
      animator=refs['Animator'].read();co=animator.m_Controller.read();ct=co.object_reader.read_typetree();tos=dict(ct['m_TOS']);clips=[r.read() for r in co.m_AnimationClips]
      for layer in ct['m_Controller']['m_StateMachineArray']:
       layer=layer['data'];states=[]
       for state in layer['m_StateConstantArray']:
        st=state['data'];indices=[n['data']['m_ClipID'] for b in st['m_BlendTreeConstantArray'] for n in b['data']['m_NodeArray'] if n['data'].get('m_ClipID',4294967295)<len(clips)]
        clip=export_clip(clips[indices[0]]) if indices else None
        states.append({'name':tos.get(st['m_NameID'],str(st['m_NameID'])),'clip':clip,'speed':st['m_Speed'],'loop':st['m_Loop'],'transitions':st['m_TransitionConstantArray']})
       record['controllers'].append({'node':nid,'name':co.m_Name,'default':layer['m_DefaultState'],'states':states})
     except Exception as ex:issues.append({'tile':go.m_Name,'animatorError':str(ex)})
    if 'MeshRenderer' in refs and 'MeshFilter' in refs:
     mr=refs['MeshRenderer'].read();mf=refs['MeshFilter'].read()
     if mf.m_Mesh.path_id:record['parts'].append({'node':nid,'mesh':mesh(mf.m_Mesh),'materials':[material(r) for r in mr.m_Materials],'enabled':bool(mr.m_Enabled),'layer':mr.m_SortingLayerID,'sort':mr.m_SortingOrder})
    if 'MeshRenderer' in refs and g.m_Name in record['staticScripts']:
     mr=refs['MeshRenderer'].read()
     if mr.m_Enabled and not isroot:
      record['materialOverrides'][g.m_Name]=[material(r) for r in mr.m_Materials]
    if 'ParticleSystem' in refs and 'ParticleSystemRenderer' in refs:
     ps=refs['ParticleSystem'].read();raw=refs['ParticleSystem'].read_typetree();r=refs['ParticleSystemRenderer'].read()
     if r.m_Enabled:
      modules={k:raw[k] for k in MODULES if raw.get(k,{}).get('enabled')}
      if 'UVModule' in modules:modules['UVModule']['sprites']=[sprite(s.sprite) for s in ps.UVModule.sprites if s.sprite.path_id];modules['UVModule']['randomRow']=raw['UVModule'].get('rowMode',1)==1
      mats=[material(m) for m in r.m_Materials]
      if mats:
       record['systems'].append({'node':nid,'name':g.m_Name,'duration':raw['lengthInSec'],'loop':raw['looping'],'speed':raw.get('simulationSpeed',1),'delay':raw['startDelay'],'local':raw['moveWithTransform'],'scalingMode':raw.get('scalingMode',0),'seed':raw.get('randomSeed',0),'modules':modules,'materialKey':mats[0],'materialKeys':mats,'renderer':{'mode':r.m_RenderMode,'alignment':r.m_RenderAlignment,'pivot':vec(r.m_Pivot),'sort':r.m_SortingOrder,'layer':r.m_SortingLayerID,'fudge':r.m_SortingFudge,'length':r.m_LengthScale,'velocityScale':r.m_VelocityScale,'mesh':mesh(r.m_Mesh) if r.m_RenderMode==4 else None}})
      for mod,v in raw.items():
       if isinstance(v,dict) and v.get('enabled') and mod not in MODULES:issues.append({'tile':go.m_Name,'node':g.m_Name,'unsupportedModule':mod})
    if 'SpriteRenderer' in refs:
     r=refs['SpriteRenderer'].read()
     if r.m_Sprite.path_id:record['sprites'].append({'node':nid,'name':g.m_Name,'sprite':sprite(r.m_Sprite),'materials':[material(m) for m in r.m_Materials],'color':{k:getattr(r.m_Color,k) for k in 'rgba'},'flipX':r.m_FlipX,'flipY':r.m_FlipY,'sort':r.m_SortingOrder,'layer':r.m_SortingLayerID})
    for c in t.m_Children:visit(c.read(),nid,path=(path+'/' if path else '')+c.read().m_GameObject.read().m_Name)
   if tileset=='__pickup_star_piece':record['pickup']=True
   try:visit(t,isroot=True)
   except (FileNotFoundError,KeyError,ValueError) as ex:issues.append({'tile':go.m_Name,'error':str(ex)})
   if tileset=='__pickup_star_piece' or record['controllers'] or any(s['type']=='CustomAnimator' for s in record['scripts']) or any(not n['active'] or n['name'].lower() in ['red','blue','on','off'] for n in record['nodes']):data['templates'][go.m_Name]=record
 if data['templates']:
  data=trim(data)
  slug=hashlib.sha256(tileset.encode()).hexdigest()[:16];path='states/'+slug+'.json.gz';(OUT/path).write_bytes(gzip.compress(json.dumps(clean(data),separators=(',',':'),allow_nan=False).encode(),mtime=0));manifest['sets'][tileset]=path
 audit.append({'tileset':tileset,'dependencies':dependencies,'templates':len(data['templates']),'systems':sum(len(t['systems']) for t in data['templates'].values()),'sprites':len(data['sprites']),'issues':issues,'tiles':[{'name':k,'emitters':[s['name'] for s in t['systems']]} for k,t in data['templates'].items()]})
 print(tileset,'templates',len(data['templates']),'systems',audit[-1]['systems'],flush=True)
 del env,data;gc.collect()
(OUT/'native-states.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf8')
(WORK/'evidence/native-states-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print('Recovered',sum(a['templates'] for a in audit),'templates',sum(a['systems'] for a in audit),'particle systems')
