"""Add 617 maps (30% of originals). Original and previous batch assets remain intact."""
from pathlib import Path
import sys,json,collections,shutil,re,hashlib
import numpy as np
import yaml
from collections import Counter
ROOT_WEB=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
from strict_kong import Reader,parse
SOURCE=Path('E:/GTFiles/files/Tilemaps');DECODED=Path('E:/GTFiles/Tilemaps_decoded')
first=json.loads((ROOT_WEB/'tools/gtmap/batches/first-206.json').read_text(encoding='utf8'));have={m['id'] for m in first['maps']}
files={p.stem:p for p in SOURCE.rglob('*.bytes')}
set_order=['ondemand/afterworld/tilesets:afterworld.tileset','ancient','ancient_red','forest','gimmick','desert','market','dungeon','sanjose']
candidates=[]
for p in sorted(DECODED.rglob('*.tilemap')):
 try:
  r=Reader(p.read_bytes());assert r.take(4)==b'KONG';v=r.unpack('i')
  if v not in (12,13,14,15,16) or p.stem in have or p.stem not in files:continue
  r.take(16);sets=[]
  for _ in range(r.count(100)):
   sets.append(r.string())
   for _ in range(r.count()):r.string()
  if not sets or not any(s!='gimmick' for s in sets) or any(s not in set_order for s in sets):continue
  candidates.append((p,sets,v))
 except Exception as e:continue
# Reuse existing dependencies first, then ordinary stages and other legacy themes.
candidates.sort(key=lambda x:(any(s not in set_order[:5] for s in x[1]), 'test' in x[0].stem.lower(), x[0].stem))
assert len(candidates)>=617, len(candidates)
selected=candidates[:617]
cache_path=ROOT_WEB/'tools/gtmap/evidence/expansion-map-cache.ndjson'
cache={}
if cache_path.exists():
 for line in cache_path.read_text(encoding='utf8').splitlines():
  try:r=json.loads(line);cache[r['id']]=r
  except json.JSONDecodeError:pass
catalog=[];used={};usage={}
for p,sets,v in selected:
 raw=p.read_bytes();sha=hashlib.sha256(raw).hexdigest();row=cache.get(p.stem)
 if not row or row['sha256']!=sha:
  d=parse(raw);tiles=[t for l in d['layers'] for part in l.get('partitions',[]) for t in part['tiles']]
  unique=sorted({(d['tilesets'][t['ts']-1]['name'],t['name']) for t in tiles})
  row={'id':p.stem,'sha256':sha,'version':v,'tiles':len(tiles),'layers':len(d['layers']),'events':sum(len(l.get('events',[])) for l in d['layers']),'sets':sets,'used':unique}
  with cache_path.open('a',encoding='utf8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
  del d,tiles
 for setname,name in row['used']:used[(set_order.index(setname)+1,name)]=name
 non_gimmick=sorted(s for s in sets if s!='gimmick');identity='|'.join(sorted(sets));slug=hashlib.sha256(identity.encode()).hexdigest()[:12]
 pack='packs/expansion-'+slug+'.json'
 usage.setdefault(pack,set()).update(f'{set_order.index(s)+1}:{n}' for s,n in row['used'])
 group={'ancient':'古代遗迹','ancient_red':'红色遗迹','forest':'森林','desert':'沙漠','market':'市场','dungeon':'地牢','sanjose':'车库','ondemand/afterworld/tilesets:afterworld.tileset':'冥界'}.get(non_gimmick[0] if non_gimmick else '', '机关')
 name=p.stem;shutil.copyfile(files[name],ROOT_WEB/'gtmap/assets/maps'/files[name].name)
 catalog.append({k:row[k] for k in ('id','sha256','version','tiles','events','layers','sets')}|{'name':name,'group':group,'category':files[name].relative_to(SOURCE).parts[0],'file':'maps/'+files[name].name,'pack':pack,'batch':2})
 if len(catalog)%50==0:print('Validated new maps',len(catalog),flush=True)
plan={'sourceCount':len(files),'deployedCount':len(first['maps'])+len(catalog),'previousCount':206,'addedCount':len(catalog),'maps':first['maps']+catalog}
(ROOT_WEB/'tools/gtmap/batches/expansion-plan.json').write_text(json.dumps(plan,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT_WEB/'tools/gtmap/batches/expansion-usage.json').write_text(json.dumps({k:sorted(v) for k,v in usage.items()}),encoding='utf8')
class UnityLoader(yaml.CSafeLoader):
    pass

def unity_int(loader, node):
    # Unity permits an object literally named "_". PyYAML incorrectly resolves
    # that scalar as an integer, then fails after removing its underscores.
    if not node.value.replace('_', ''):
        return node.value
    return yaml.constructor.SafeConstructor.construct_yaml_int(loader, node)

UnityLoader.add_constructor('tag:yaml.org,2002:int', unity_int)

BASE = ROOT_WEB
OUT = BASE / 'gtmap/assets'
ROOT = Path('D:/GTAsset/FullExtract/ExportedProject/Assets')
sys.path.insert(0, str(Path(__file__).parent))
from strict_kong import parse

GUIDS = dict(s.split('\t', 1) for s in Path('E:/GTFiles/GTMap/GTMapBuiltIn/Library/GTMapIndex/guididx_b3c48bde.tsv').read_text().splitlines())
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'textures').mkdir(exist_ok=True)
issues = []
meshes, materials, textures, templates = {}, {}, {}, {}
def documents(path, classes=None):
    text = path.read_text(encoding='utf-8')
    out = {}
    for m in re.finditer(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n(.*?)(?=^--- !u!|\Z)', text, re.M | re.S):
        kind, fid, chunk = int(m[1]), int(m[2]), m[3]
        if classes is not None and kind not in classes:
            continue
        chunk = re.sub(r'(?m)^(\s*(?:m_IndexBuffer|_typelessdata):)\s*(\w+)\s*$', r'\1 "\2"', chunk)
        value = yaml.load(chunk, Loader=UnityLoader)
        out[fid] = (kind, next(iter(value.values())))
    return out

def path_for(ref):
    guid = ref.get('guid')
    return Path(GUIDS[guid]) if guid in GUIDS else None

def texture(ref):
    path = path_for(ref)
    if path is None or path.suffix.lower() != '.png':
        return None
    guid = ref['guid']
    if guid not in textures:
        destination=OUT / 'textures' / (guid + '.png')
        if not destination.exists():shutil.copyfile(path,destination)
        meta = yaml.load(Path(str(path) + '.meta').read_text(), Loader=yaml.CSafeLoader)['TextureImporter']
        settings = meta.get('textureSettings', {})
        textures[guid] = {'url': 'textures/' + guid + '.png', 'name': path.name,
                          'filter': settings.get('filterMode', 1),
                          'wrap': settings.get('wrapU', settings.get('wrapMode', 0)),
                          'srgb': bool(meta.get('sRGBTexture', 1))}
    return guid

def material(ref):
    guid = ref.get('guid')
    if guid in materials:
        return guid
    path = path_for(ref)
    if path is None:
        issues.append({'type': 'unresolvedMaterial', 'guid': guid, 'fileID': ref.get('fileID')})
        return None
    _, mat = next(iter(documents(path).values()))
    props = mat.get('m_SavedProperties', {})
    def mapping(value):
        return {k: v for obj in value for k, v in obj.items()} if isinstance(value, list) else (value or {})
    floats = mapping(props.get('m_Floats'))
    floats.update(mapping(props.get('m_Ints')))
    colors = mapping(props.get('m_Colors'))
    tex = mapping(props.get('m_TexEnvs'))
    main = tex.get('_MainTex', {})
    texid = texture(main.get('m_Texture', {}))
    texenvs = {name: {'texture': texture(env.get('m_Texture', {})),
                     'scale': env.get('m_Scale', {'x': 1, 'y': 1}),
                     'offset': env.get('m_Offset', {'x': 0, 'y': 0})}
               for name, env in tex.items()}
    materials[guid] = {'name': mat['m_Name'], 'texture': texid,
                       'texenvs': texenvs,
                       'shaderGuid': mat.get('m_Shader', {}).get('guid'),
                       'queue': mat.get('m_CustomRenderQueue', -1),
                       'floats': floats, 'colors': colors,
                       'scale': main.get('m_Scale', {'x': 1, 'y': 1}),
                       'offset': main.get('m_Offset', {'x': 0, 'y': 0})}
    if not texid:
        issues.append({'type': 'materialWithoutMainTexture', 'name': mat['m_Name'], 'guid': guid})
    return guid

def mesh(ref):
    guid = ref.get('guid')
    if guid in meshes:
        return guid
    path = path_for(ref)
    if path is None:
        issues.append({'type': 'unresolvedMesh', 'guid': guid, 'fileID': ref.get('fileID')})
        return None
    _, value = next(iter(documents(path).values()))
    vertex = value['m_VertexData']
    count, channels = vertex['m_VertexCount'], vertex['m_Channels']
    data = bytes.fromhex(vertex['_typelessdata'])
    sizes = {0: 4, 1: 2, 2: 1, 3: 1, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 2, 10: 4, 11: 4}
    strides = {}
    for c in channels:
        if c['dimension']:
            s = c['stream']
            strides[s] = max(strides.get(s, 0), c['offset'] + sizes[c['format']] * c['dimension'])
    starts, offset = {}, 0
    for stream in sorted(strides):
        starts[stream] = offset
        offset = (offset + count * strides[stream] + 15) & ~15
    def channel(index, dims):
        c = channels[index]
        if c['dimension'] == 0:
            return None
        fmt = {0: '<f4', 1: '<f2', 2: 'u1', 3: 'i1', 4: '<u2', 5: '<i2'}.get(c['format'])
        if fmt is None:
            raise ValueError(f'Unsupported vertex format {c["format"]}: {path}')
        a = np.ndarray((count, c['dimension']), dtype=fmt, buffer=data,
                       offset=starts[c['stream']] + c['offset'],
                       strides=(strides[c['stream']], sizes[c['format']])).astype(float)
        if c['format'] in (2, 3, 4, 5):
            a /= {2: 255, 3: 127, 4: 65535, 5: 32767}[c['format']]
        return a[:, :dims].reshape(-1).tolist()
    ib = bytes.fromhex(value['m_IndexBuffer'])
    width = 2 if value.get('m_IndexFormat', 0) == 0 else 4
    indices = np.frombuffer(ib, dtype='<u2' if width == 2 else '<u4').astype(int)
    submeshes = []
    for s in value['m_SubMeshes']:
        if s['topology'] != 0:
            raise ValueError('Non-triangle topology: ' + str(path))
        first = s['firstByte'] // width
        ind = indices[first:first+s['indexCount']] + s.get('baseVertex', 0)
        if len(ind) % 3 or (len(ind) and max(ind) >= count):
            raise ValueError('Invalid mesh indices: ' + str(path))
        submeshes.append(ind.tolist())
    meshes[guid] = {'name': value['m_Name'], 'positions': channel(0, 3),
                    'normals': channel(1, 3), 'uv': channel(4, 2), 'colors': channel(3, 4), 'submeshes': submeshes}
    return guid

def matrix(t):
    q = t['m_LocalRotation']; x,y,z,w = (q[k] for k in 'xyzw')
    r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0], [0,0,0,1]],float)
    for i,k in enumerate('xyz'):
        r[:,i] *= t['m_LocalScale'][k]
        r[i,3] = t['m_LocalPosition'][k]
    return r



paths=[ROOT / 'ondemand/afterworld/tilesets/afterworld/afterworld.tileset.prefab']+[ROOT/('tilesets/'+name+'/'+name+'.tileset.prefab') for name in set_order[1:]]
counts = Counter()
for ts, path in enumerate(paths, 1):
    if not any(k[0]==ts for k in used):continue
    print('Reading', path.name, flush=True)
    docs = documents(path, {1, 4, 23, 33, 198, 212})
    go_by_name = {v['m_Name']: fid for fid,(c,v) in reversed(list(docs.items())) if c == 1}
    by_go = {}
    for fid,(kind,v) in docs.items():
        if kind != 1 and 'm_GameObject' in v:
            by_go.setdefault(v['m_GameObject']['fileID'], {})[kind] = v
    for (tile_ts, name), _ in sorted(used.items()):
        ti = name
        if ts != tile_ts:
            continue
        root = go_by_name.get(name)
        if root is None:
            issues.append({'type':'missingTemplate','tile':name,'key':f'{ts}:{name}'});templates[f'{ts}:{name}']={'name':name,'parts':[]};continue
        parts = []
        def visit(goid, transform, is_root=False):
            go = docs[goid][1]
            components = by_go.get(goid, {})
            if 'm_LocalPosition' not in components.get(4,{}): issues.append({'type':'missingTransformPosition','tile':name,'node':go.get('m_Name')})
            if not is_root and not go.get('m_IsActive', 1):
                return
            if 198 in components:
                counts['particleNodes'] += 1
            if 33 in components and 23 in components and components[23].get('m_Enabled', 1):
                mid = mesh(components[33]['m_Mesh'])
                mats = [material(m) for m in components[23].get('m_Materials', [])]
                if mid:
                    parts.append({'mesh': mid, 'materials': mats,
                                  'matrix': transform.reshape(-1).tolist(), 'node': go['m_Name']})
            if 212 in components:
                issues.append({'type': 'spriteRenderer', 'tile': name, 'node': go['m_Name']})
            for child in components.get(4, {}).get('m_Children', []):
                ct = docs[child['fileID']][1]
                visit(ct['m_GameObject']['fileID'], transform @ matrix(ct))
        visit(root, np.eye(4), True)
        templates[f'{ts}:{ti}'] = {'name': name, 'parts': parts}
        if not parts:
            issues.append({'type': 'noStaticMesh', 'tile': name, 'key': f'{ts}:{ti}'})
        counts['templates'] += 1
    print('Exported templates', counts['templates'], flush=True)


bundle={'templates':templates,'meshes':meshes,'materials':materials,'textures':textures,'setOrder':set_order}
(ROOT_WEB/'tools/gtmap/batches/expansion-master.json').write_text(json.dumps(bundle,separators=(',',':')),encoding='utf8')
(ROOT_WEB/'tools/gtmap/evidence/expansion-export-audit.json').write_text(json.dumps({'templates':len(templates),'issues':issues},ensure_ascii=False),encoding='utf8')
print('Exported expansion:',len(catalog),len(templates),len(meshes),len(materials),flush=True)
