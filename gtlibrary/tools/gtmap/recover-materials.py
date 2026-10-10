"""Recover shader state and all texture slots directly from game bundles/APK.
Offline only; never edits source assets. Run after export_demo_assets.py.
Uses UnityPy 1.25.4 (tools/python-libs), https://github.com/K0lb3/UnityPy.
"""
from pathlib import Path
import sys, json, zipfile, hashlib
BASE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path('E:/GTFiles/GTMap/GTMapWeb/tools/python-libs')))
import UnityPy
from UnityPy.export.ShaderConverter import ShaderProgram
from UnityPy.helpers import CompressionHelper
from UnityPy.streams import EndianBinaryReader

apk = zipfile.ZipFile('E:/GTFiles/_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
env = UnityPy.Environment()
for name in ['shaders/oak', 'shaders/effect', 'effects/commons', 'tilesets/gimmick', 'tilesets/ancient', 'tilesets/ancient_red', 'tilesets/forest', 'ondemand/afterworld/tilesets']:
    path = Path('E:/GTFiles/files/AssetBundles/Android/' + name)
    env.load_file(path.read_bytes() if path.exists() else apk.read('assets/AssetBundles/Android/' + name), name=name)
for name in ['Resources/unity_builtin_extra', 'unity default resources']:
    try: env.load_file(apk.read('assets/bin/Data/' + name), name=name.rsplit('/', 1)[-1])
    except KeyError: pass
raw_mats = {o.read().m_Name: o for o in env.objects if o.type.name == 'Material'}
bundle_path = BASE / 'gtmap/assets/packs/first-batch.json'
bundle = json.loads(bundle_path.read_text())
# These four map templates have no MeshRenderer: their visible environment is
# an infinite-lifetime billboard burst. Read the original ParticleSystem child.
clouds = {}
native_gos = {o.read().m_Name: o.read() for o in env.objects if o.type.name == 'GameObject'}
def scalar_range(curve):
    return [curve['minScalar'], curve['scalar']] if curve['minMaxState'] == 3 else [curve['scalar']] * 2
for key, template in bundle['templates'].items():
    if template['name'] not in ['FX_cloud_1', 'FX_cloud_2', 'FX_cloud_1_2', 'FX_cloud_2_2']: continue
    root = native_gos[template['name']]
    child = root.m_Component[0].component.read().m_Children[0].read()
    go = child.m_GameObject.read()
    ps = next(p.component.read_typetree() for p in go.m_Component if p.component.type.name == 'ParticleSystem')
    pr = next(p.component.read() for p in go.m_Component if p.component.type.name == 'ParticleSystemRenderer')
    a, shape = ps['InitialModule'], ps['ShapeModule']
    assert not ps['looping'] and a['startLifetime']['scalar'] == float('inf')
    assert a['startSpeed']['scalar'] == 0 and shape['type'] == 5 and pr.m_RenderAlignment == 0
    assert not ps['UVModule']['enabled'] and not ps['ColorModule']['enabled'] and not ps['VelocityModule']['enabled']
    assert child.m_LocalRotation.w == 1 and all(getattr(child.m_LocalRotation, k) == 0 for k in 'xyz')
    assert all(getattr(child.m_LocalScale, k) == 1 for k in 'xyz') and shape['m_Rotation'] == dict.fromkeys('xyz', 0)
    name = pr.m_Materials[0].read().m_Name
    material_key = 'native-' + name
    bundle['materials'][material_key] = {'name': name}
    clouds[key] = {'material': material_key, 'count': min(a['maxNumParticles'], int(ps['EmissionModule']['m_Bursts'][0]['countCurve']['scalar'])),
        'position': {k: getattr(child.m_LocalPosition, k) for k in 'xyz'}, 'rotation': {k: getattr(child.m_LocalRotation, k) for k in 'xyzw'}, 'scale': {k: getattr(child.m_LocalScale, k) for k in 'xyz'},
        'shapePosition': shape['m_Position'], 'shapeScale': shape['m_Scale'],
        'size': scalar_range(a['startSize']), 'angle': scalar_range(a['startRotation']),
        'angularSpeed': scalar_range(ps['RotationModule']['curve']),
        'minColor': a['startColor']['minColor'], 'maxColor': a['startColor']['maxColor'],
        'noiseStrength': ps['NoiseModule']['strength']['scalar'],
        'sortingLayer': pr.m_SortingLayer, 'sortingOrder': pr.m_SortingOrder}
bundle['environment'] = {'clouds': clouds, 'mode': 'original billboard bursts; deterministic random seed; tiny Unity noise omitted'}
settings = UnityPy.load(apk.read('assets/bin/Data/globalgamemanagers'))
player = next(o.read_typetree() for o in settings.objects if o.type.name == 'PlayerSettings')
assert player['m_ActiveColorSpace'] == 0, 'Renderer profile requires game Gamma color space'
bundle['renderProfile'] = {'colorSpace': 'Gamma', 'playerSettingsActiveColorSpace': player['m_ActiveColorSpace']}
audit, failures = [], []
shader_dir = BASE / 'tools/gtmap/evidence/native-shaders'
shader_dir.mkdir(exist_ok=True)
for guid, mat in bundle['materials'].items():
    obj = raw_mats.get(mat['name'])
    if obj is None: raise ValueError('Missing native material: ' + mat['name'])
    raw = obj.read_typetree()
    source = obj.read()
    shader = source.m_Shader.read()
    parsed = shader.m_ParsedForm
    state = shader.object_reader.read_typetree()['m_ParsedForm']
    sub = state['m_SubShaders'][0]
    render = sub['m_Passes'][0]['m_State']
    props = state['m_PropInfo']['m_Props']
    defaults = {p['m_Name']: dict(zip('rgba', [p['m_DefValue[' + str(i) + ']'] for i in range(4)]))
                for p in props if p['m_Type'] in (0, 1)}
    tags = dict(sub['m_Tags']['tags'])
    blend = render['rtBlend0']
    profile = {'name': parsed.m_Name, 'pathId': source.m_Shader.path_id,
               'queueTag': tags.get('QUEUE', tags.get('Queue', 'Geometry')),
               'srcBlend': blend['srcBlend']['val'], 'dstBlend': blend['destBlend']['val'],
               'depthWrite': bool(render['zWrite']['val']), 'depthTest': render['zTest']['val'],
               'cull': render['culling']['val'], 'defaults': defaults,
               'properties': [p['m_Name'] for p in props]}
    mat['nativeShader'] = profile
    mat['queue'] = raw['m_CustomRenderQueue']
    saved = raw['m_SavedProperties']
    mat['colors'] = dict(saved['m_Colors'])
    mat['floats'] = dict(saved['m_Floats'])
    texenvs = {}
    for slot, tex in source.m_SavedProperties.m_TexEnvs:
        ref = tex.m_Texture
        tid = None
        if ref.path_id:
            try:
                image_data = ref.read()
                image = image_data.image
                # Keep a slot's established GUID if present, otherwise identify
                # the recovered PNG by its actual source file and path ID.
                tid = mat.get('texenvs', {}).get(slot, {}).get('texture')
                if not tid: tid = 'native-' + hashlib.sha256((ref.assetsfile.name + ':' + str(ref.file_id) + ':' + str(ref.path_id)).encode()).hexdigest()[:24]
                dest = BASE / 'gtmap/assets/textures' / (tid + '.png')
                image.save(dest)
                settings = image_data.m_TextureSettings
                bundle['textures'][tid] = {'url': 'textures/' + dest.name,
                    'name': image_data.m_Name, 'filter': settings.m_FilterMode,
                    'wrap': settings.m_WrapU, 'srgb': image_data.m_ColorSpace == 1}
            except Exception as ex:
                failures.append({'material': mat['name'], 'slot': slot, 'pathId': ref.path_id, 'reason': str(ex)})
        texenvs[slot] = {'texture': tid, 'scale': {'x': tex.m_Scale.x, 'y': tex.m_Scale.y},
                        'offset': {'x': tex.m_Offset.x, 'y': tex.m_Offset.y}}
    mat['texenvs'] = texenvs
    main = texenvs.get('_MainTex', {})
    mat['texture'] = main.get('texture')
    mat['scale'] = main.get('scale', {'x': 1, 'y': 1})
    mat['offset'] = main.get('offset', {'x': 0, 'y': 0})
    audit.append({'material': mat['name'], 'shader': profile, 'textures': texenvs})
    # UnityPy's normal export omits m_PlayerSubPrograms. Read the program blobs
    # directly so we can inspect the compiled GLES source rather than dummy text.
    target = shader_dir / (str(source.m_Shader.path_id) + '.txt')
    if shader.compressedBlob:
        chunks = []
        for i, platform in enumerate(shader.platforms):
            for j, length in enumerate(shader.compressedLengths[i]):
                start = shader.offsets[i][j]
                data = CompressionHelper.decompress_lz4(bytes(shader.compressedBlob)[start:start+length], shader.decompressedLengths[i][j])
                # Player blob headers changed in recent Unity versions; GLES
                # source is still stored as a zero-terminated UTF-8 string.
                import re
                sources = [data[m.start():].split(b'\0', 1)[0].decode('utf-8')
                           for m in re.finditer(b'#ifdef VERTEX', data)]
                if sources:
                    chunks.extend(sources)
                    continue
                try:
                    programs = ShaderProgram(EndianBinaryReader(data, endian='<'), shader.object_reader.version)
                    chunks.extend(p.Export() for p in programs.m_SubPrograms)
                except Exception as ex: chunks.append('Program parser: ' + str(ex))
        target.write_text('\n\n'.join(chunks), encoding='utf-8', errors='replace')
bundle_path.write_text(json.dumps(bundle, separators=(',', ':')), encoding='utf-8')
(BASE / 'tools/gtmap/evidence/material-recovery.json').write_text(json.dumps({'materials': audit, 'unresolved': failures}, indent=2), encoding='utf-8')
print('Recovered',len(audit),'materials; failures:',failures)
assert not failures
