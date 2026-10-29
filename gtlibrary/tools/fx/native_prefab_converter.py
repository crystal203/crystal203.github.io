"""Convert missing source AssetBundle prefabs into the browser FX index.

All prefab names and bundle paths come from ObjectPoolSpec. No character
identities, attack names, or individual effect corrections belong here.
"""
import copy
import hashlib
import importlib
import json
import math
import re
import sys
import zipfile
from pathlib import Path


def json_safe(value):
    """JSON preserves Unity's infinite curves and 64-bit PPtrs without JS loss."""
    if isinstance(value,float) and not math.isfinite(value):
        return 'NaN' if math.isnan(value) else 'Infinity' if value>0 else '-Infinity'
    if isinstance(value,int) and abs(value)>9007199254740991:return str(value)
    if isinstance(value,dict):return {key:json_safe(item) for key,item in value.items()}
    if isinstance(value,(list,tuple)):return [json_safe(item) for item in value]
    return value


def convert_missing(manifest, pool_rows, output, config, refresh=()):
    existing={effect['preset'] for effect in manifest['effects']}
    refresh=set(refresh)
    missing=[row for row in pool_rows if (row.get('PresetName') not in existing or row.get('PresetName') in refresh) and row.get('AssetName')]
    if not missing:return 0
    for extra in config.get('pythonExtraLibs',[]):sys.path.insert(0,extra)
    if config.get('pythonLibs'):sys.path.insert(0,config['pythonLibs'])
    # Disable the optional extension before importing UnityPy. Disabling only
    # read_typetree leaves the C TypeTreeNode path enabled. The importer uses
    # the Python parser throughout to minimize optional native dependencies.
    sys.modules['UnityPy.UnityPyBoost']=None
    try:
        UnityPy=importlib.import_module('UnityPy')
        MeshHandler=importlib.import_module('UnityPy.helpers.MeshHelper').MeshHandler
    except ImportError as error:
        raise RuntimeError('Missing UnityPy; configure pythonLibs or install UnityPy to convert missing prefabs') from error
    bundle_root=Path(config['bundleRoot']) if config.get('bundleRoot') else None
    apk=zipfile.ZipFile(config['apk']) if config.get('apk') else None
    if not bundle_root and not apk:raise RuntimeError('Set bundleRoot or apk in import-config.json to convert missing prefabs')
    env=UnityPy.Environment();loaded=set()
    source_record=manifest.setdefault('nativeSource',{'format':'gt-native-source','version':1})
    source_record.setdefault('bundles',{})
    source_record.setdefault('settings',{})
    if apk:
        for entry in apk.namelist():
            if entry.endswith('/unity_builtin_extra'):
                raw=apk.read(entry);env.load_file(raw,name='unity_builtin_extra')
                source_record['settings']['unity_builtin_extra']={'sha256':hashlib.sha256(raw).hexdigest(),'container':Path(config['apk']).name}
            elif entry.endswith('/globalgamemanagers'):
                raw=apk.read(entry);settings=UnityPy.load(raw)
                source_record['settings']['globalgamemanagers']={'sha256':hashlib.sha256(raw).hexdigest(),'container':Path(config['apk']).name}
                for obj in settings.objects:
                    if obj.type.name=='PlayerSettings':
                        manifest['colorSpace']='gamma' if obj.read_typetree().get('m_ActiveColorSpace')==0 else 'linear'
                    elif obj.type.name=='PhysicsManager':
                        gravity=obj.read_typetree()['m_Gravity'];manifest['gravity3D']=[gravity[k] for k in ['x','y','z']]
    def load(name):
        if name in loaded:return
        loaded.add(name)
        path=bundle_root/name if bundle_root else None
        data=path.read_bytes() if path and path.exists() else apk.read('assets/AssetBundles/Android/'+name) if apk else None
        if data is None:raise FileNotFoundError(f'AssetBundle: {name}')
        bundle=env.load_file(data,name=name)
        source_record['bundles'][name]={'sha256':hashlib.sha256(data).hexdigest(),
            'unityVersion':getattr(bundle,'version_engine',None),
            'origin':'bundleRoot' if path and path.exists() else 'apk'}
        for obj in list(env.objects):
            if obj.type.name=='AssetBundle':
                for dependency in obj.read().m_Dependencies:
                    if dependency not in loaded:load(dependency)
    load_rows=pool_rows if any(not row.get('AssetBundleName') for row in missing) else missing
    for bundle in sorted({row['AssetBundleName'] for row in load_rows if row.get('AssetBundleName')}):load(bundle)
    if apk:apk.close()

    textures=manifest['textures'];sprites=manifest['sprites'];meshes=manifest['meshes']
    from native_asset_store import AssetStore
    store=config.get('_assetStore') or AssetStore(output, config.get('sourceCache') or Path(__file__).parent/'source-cache')
    texture_cache={};atlas_cache={}
    from native_atlas import sprite_atlas
    prefix='native_'+manifest['character']+'_'
    shader_sources={}
    def fragment_source(shader):
        from UnityPy.helpers.CompressionHelper import decompress_lz4
        name=shader.m_ParsedForm.m_Name
        if name in shader_sources:return shader_sources[name]
        blob=bytes(shader.compressedBlob)
        for offsets,compressed,expanded in zip(shader.offsets,shader.compressedLengths,shader.decompressedLengths):
            if not isinstance(offsets,list):offsets,compressed,expanded=[offsets],[compressed],[expanded]
            for offset,size,total in zip(offsets,compressed,expanded):
                data=decompress_lz4(blob[offset:offset+size],total)
                match=re.search(rb'#ifdef FRAGMENT\n([^\x00]+)',data)
                if match:
                    source=match[1].decode('utf8').rsplit('#endif',1)[0]
                    source=re.sub(r'^#version[^\n]*','',source,flags=re.M)
                    source=re.sub(r'UNITY_LOCATION\(\d+\)\s*','',source)
                    source=re.sub(r'layout\(location = 0\) out mediump vec4 SV_Target0;','',source)
                    source=re.sub(r'^in (?:highp|mediump|lowp) vec\d vs_\w+;','',source,flags=re.M)
                    source=source.replace('SV_Target0','gl_FragColor').replace('texture(','texture2D(')
                    shader_sources[name]=source;return source
        raise ValueError(f'No GLES fragment source for {name}')
    def key(ref,kind):return prefix+kind+'_'+str(abs(ref.path_id))
    def vec(value):return {axis:float(getattr(value,axis)) for axis in ('x','y','z')}
    def quat(value):return {axis:float(getattr(value,axis)) for axis in ('x','y','z','w')}
    def color(value):return {axis:float(getattr(value,axis)) for axis in ('r','g','b','a')}
    def flat(value,n):return [float(channel) for row in value for channel in row[:n]] if value else []
    def texture(ref):
        if not ref or not ref.path_id:return None
        name=key(ref,'tex')
        if name not in texture_cache:
            obj=ref.read();settings=obj.m_TextureSettings
            texture_cache[name]=store.texture(manifest,obj.image.convert('RGBA'),{
                'name':obj.m_Name,'filterMode':int(settings.m_FilterMode),
                'wrapU':int(settings.m_WrapU),'wrapV':int(settings.m_WrapV),
                'repeat':settings.m_WrapU==0 or settings.m_WrapV==0})
        return texture_cache[name]
    def sprite(ref):
        if not ref or not ref.path_id:return None
        name=key(ref,'sprite')
        if name not in sprites:
            obj=ref.read();image=obj.image.convert('RGBA')
            sprites[name]=store.sprite(manifest,image,{'name':obj.m_Name,
                'size':[image.width,image.height],
                'pivot':{'x':float(obj.m_Pivot.x),'y':float(obj.m_Pivot.y)},
                'pixelsToUnits':float(obj.m_PixelsToUnits)},native_atlas=lambda:sprite_atlas(obj,atlas_cache))
        return name
    def material(ref):
        white={'name':'white','blend':'alpha','texture':None,'tint':{'r':1,'g':1,'b':1,'a':1},
               'scale':{'x':1,'y':1},'offset':{'x':0,'y':0},'queue':-1}
        if not ref or not ref.path_id:return white
        obj=ref.read();props=obj.m_SavedProperties;colors=dict(props.m_Colors);envs=dict(props.m_TexEnvs)
        shader_state=None
        try:
            shader=obj.m_Shader.read();shader_name=shader.m_ParsedForm.m_Name or shader.m_Name
            # GrabPass and ShadowCaster are not the material's visible pass.
            # Standard Unlit starts with both before its parameterized color pass.
            passes=shader.m_ParsedForm.m_SubShaders[0].m_Passes
            color_passes=[p for p in passes if p.m_Type==0 and
                dict((k.upper(),v.upper()) for k,v in p.m_State.m_Tags.tags).get('LIGHTMODE','')
                not in ('SHADOWCASTER','META','DEPTHONLY','DEPTHNORMALS','MOTIONVECTORS')]
            shader_state=color_passes[0].m_State if color_passes else None
        except Exception:shader_name=''
        main=envs.get('_MainTex');second=envs.get('_MainTex2');mask=envs.get('_MaskTex') or envs.get('_Mask')
        tint=colors.get('_TintColor',colors.get('_Color'))
        result={'name':obj.m_Name,'shader':shader_name,'blend':'add' if '_add' in obj.m_Name.lower() else 'alpha',
                'texture':texture(main.m_Texture) if main else None,
                'tint':color(tint) if tint else white['tint'],
                'scale':{'x':float(main.m_Scale.x),'y':float(main.m_Scale.y)} if main else white['scale'],
                'offset':{'x':float(main.m_Offset.x),'y':float(main.m_Offset.y)} if main else white['offset'],
                'queue':int(obj.m_CustomRenderQueue)}
        if shader_state:
            floats=dict(props.m_Floats)
            def state_value(field):return float(floats.get(field.name,field.val))
            blend=shader_state.rtBlend0
            result['nativeBlend']=[state_value(blend.srcBlend),state_value(blend.destBlend)]
            result['blend']='add' if result['nativeBlend'] in ([5,1],[1,1]) else 'opaque' if result['nativeBlend']==[1,0] else 'alpha'
            result['depthTest']=state_value(shader_state.zTest)!=8
            result['depthWrite']=bool(state_value(shader_state.zWrite))
            result['cull']={0:'off',1:'front',2:'back'}.get(state_value(shader_state.culling),'off')
            result['premultiplied']=result['nativeBlend'][0]==1
        # Multipliers and tint use are shader behavior, not material-name rules.
        if shader_name.startswith(('Mobile/Particles/','Unlit/','Particles/Standard')):
            result['colorGain']=1
        if shader_name in ('Mobile/Particles/Additive','Mobile/Particles/Alpha Blended','Mobile/Particles/Additive Top','Mobile/Particles/Additive Shear','Unlit/Premultiplied Colored','Unlit/Transparent Colored'):
            result['tint']=white['tint']
        if shader_name=='Effect/TwoSidedDissolve_1pass_cvs':result['surface']='particleDissolve'
        if shader_name=='Effect/Screen/CA_BW_Distort':
            result['surface']='screenDistortion';result['fragmentSource']=fragment_source(shader)
            result['parameters']={**{name:float(v) for name,v in props.m_Floats},**{name:color(v) for name,v in props.m_Colors}}
        if shader_name.startswith('MatCap/'):
            result['surface']='matcap';matcap=envs.get('_MatCap');result['matcap']=texture(matcap.m_Texture) if matcap else None
            floats=dict(props.m_Floats)
            if '_GradColor' in colors:result['gradation']={'color':color(colors['_GradColor']),'start':float(floats.get('_GradStart',0)),'end':float(floats.get('_GradEnd',1))}
            result['cutoff']=float(floats.get('_Cutoff',0));result['colorGain']=3 if shader_name=='MatCap/Detail' else 1
            result['ignoreVertexColor']=shader_name=='MatCap/Detail'
        if second:
            result['texture2']={'texture':texture(second.m_Texture),
                                'scale':{'x':float(second.m_Scale.x),'y':float(second.m_Scale.y)},
                                'offset':{'x':float(second.m_Offset.x),'y':float(second.m_Offset.y)}}
            if shader_name in ('Effect/Mask_Additive_Tint_2Tex','Effect/Mask_Additive_Tint_2Tex_Top','Effect/Mask_Additive_Blend_2Tex_Top'):
                result['colorGain']=4 # APK GLES fragment: COLOR * Tint * Main2 * Mask * Main * 4.
        if mask and mask.m_Texture.path_id:
            result['mask']={'texture':texture(mask.m_Texture),
                            'scale':{'x':float(mask.m_Scale.x),'y':float(mask.m_Scale.y)},
                            'offset':{'x':float(mask.m_Offset.x),'y':float(mask.m_Offset.y)}}
        return result
    def mesh(ref):
        if not ref or not ref.path_id:return None
        if ref.path_id==10210:
            meshes.setdefault('builtin-quad',{'position':[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],
                'uv':[0,0,1,0,1,1,0,1],'indices':[0,1,2,0,2,3]})
            return 'builtin-quad'
        name=key(ref,'mesh')
        if name not in meshes:
            obj=ref.read();handler=MeshHandler(obj);handler.process()
            if not handler.m_Vertices:return None
            indices=[];groups=[]
            for i,(sub,tri) in enumerate(zip(obj.m_SubMeshes,handler.get_triangles())):
                group=[int(vertex)+int(sub.baseVertex or 0) for face in tri for vertex in face]
                groups.append({'start':len(indices),'count':len(group),'material':i});indices.extend(group)
            meshes[name]={'name':obj.m_Name,'position':flat(handler.m_Vertices,3),
                          'normal':flat(handler.m_Normals,3),'uv':flat(handler.m_UV0,2),
                          'color':flat(handler.m_Colors,4),'indices':indices,'groups':groups}
        return name
    roots={}
    for obj in env.objects:
        if obj.type.name=='GameObject':
            try:roots.setdefault(obj.read().m_Name,obj)
            except Exception:pass
    converted=0
    for row in missing:
        target=row['AssetName'];root=roots.get(target)
        if root is None:raise LookupError(f'{row["PresetName"]}: GameObject {target} absent from {row["AssetBundleName"]}')
        nodes=[];systems=[];statics=[];scripts=[]
        def visit(go_ref,parent='0'):
            go=go_ref.read();refs={component.component.type.name:component.component for component in go.m_Component}
            tr=refs['Transform'].read();node_id=str(go_ref.path_id)
            nodes.append({'id':node_id,'parent':parent,'name':go.m_Name,'active':bool(go.m_IsActive),
                          'position':vec(tr.m_LocalPosition),'rotation':quat(tr.m_LocalRotation),'scale':vec(tr.m_LocalScale)})
            if 'ParticleSystem' in refs and 'ParticleSystemRenderer' in refs:
                ps_ref=refs['ParticleSystem'];ps=ps_ref.read();data=ps_ref.read_typetree()
                renderer_ref=refs['ParticleSystemRenderer'];render=renderer_ref.read_typetree();raw=renderer_ref.read()
                mod={name:copy.deepcopy(value) for name,value in data.items() if name.endswith('Module') and
                     isinstance(value,dict) and (name=='InitialModule' or value.get('enabled'))}
                if 'ShapeModule' in mod and ps.ShapeModule.m_Mesh.path_id:
                    mod['ShapeModule']['mesh']=mesh(ps.ShapeModule.m_Mesh)
                if 'UVModule' in mod and mod['UVModule'].get('mode')==1:
                    mod['UVModule']['sprites']=[sprite(item.sprite) for item in ps.UVModule.sprites]
                if 'SubModule' in mod:
                    mod['SubModule']['subEmitters']=[{'emitter':str(item.emitter.path_id),'type':int(item.type),
                                                       'properties':int(item.properties),'emitProbability':float(item.emitProbability)}
                                                      for item in ps.SubModule.subEmitters]
                systems.append({'node':node_id,'sourceId':str(ps_ref.path_id),'emitterOnly':not any(item.path_id for item in raw.m_Materials),
                                'name':go.m_Name,'duration':float(data['lengthInSec']),
                                'loop':bool(data['looping']),'speed':float(data['simulationSpeed']),
                                'delay':data['startDelay'],'local':int(data['moveWithTransform'])==0,
                                'simulationSpace':int(data['moveWithTransform']),
                                'scalingMode':int(data['scalingMode']),'seed':int(data['randomSeed']),
                                'autoRandomSeed':bool(data['autoRandomSeed']),
                                'modules':mod,'material':material(raw.m_Materials[0]) if raw.m_Materials else material(None),
                                'trailMaterial':material(raw.m_Materials[1]) if 'TrailModule' in mod and len(raw.m_Materials)>1 else None,
                                'renderer':{'mode':int(render['m_RenderMode']),'alignment':int(render['m_RenderAlignment']),
                                            'pivot':render['m_Pivot'],'sort':int(render['m_SortingOrder']),
                                            'flip':render.get('m_Flip',{'x':0,'y':0,'z':0}),
                                            'vertexStreams':render.get('m_VertexStreams',[]),'useCustomVertexStreams':bool(render.get('m_UseCustomVertexStreams')),
                                            'layer':int(render['m_SortingLayerID']),'fudge':float(render['m_SortingFudge']),
                                            'length':float(render['m_LengthScale']),'velocityScale':float(render['m_VelocityScale']),
                                            'mesh':mesh(raw.m_Mesh) if render['m_RenderMode']==4 else None}})
            if 'MeshFilter' in refs and 'MeshRenderer' in refs:
                renderer=refs['MeshRenderer'].read();mesh_key=mesh(refs['MeshFilter'].read().m_Mesh)
                if mesh_key:
                    materials=[material(item) for item in renderer.m_Materials]
                    statics.append({'node':node_id,'name':go.m_Name,'mesh':mesh_key,'sprite':None,'size':[1,1],
                                    'material':materials[0] if materials else material(None),
                                    'sort':int(renderer.m_SortingOrder),'materials':materials})
            for component in go.m_Component:
                if component.component.type.name!='MonoBehaviour':continue
                source=component.component.read();cls=source.m_Script.read().m_ClassName
                values=component.component.read_typetree();values.pop('m_GameObject',None);values.pop('m_Script',None)
                scripts.append({'node':node_id,'type':cls,'fields':values})
                if cls=='CustomSprite' and source.Atlas.path_id:
                    atlas=source.Atlas.read();atlas_data=json.loads(atlas.AtlasData.read().m_Script)
                    frame=atlas_data['frames'].get(source.SpriteName) or atlas_data['frames'].get(source.SpriteName+'.png')
                    if frame:
                        mat=material(atlas.AtlasMaterial);mat['colorGain']=1;mat['tint']=color(source.TintColor)
                        rect=frame['frame'];extent=atlas_data['meta']['size'];original=frame['sourceSize']
                        sprite_key='atlas-'+key(source.Atlas,'atlas')+'-'+source.SpriteName
                        sprites[sprite_key]={'name':source.SpriteName,'texture':mat['texture'],
                            'uv':[rect['x']/extent['w'],1-(rect['y']+rect['h'])/extent['h'],rect['w']/extent['w'],rect['h']/extent['h']],
                            'size':[original['w'],original['h']],'pivot':{'x':.5,'y':.5},
                            'pixelsToUnits':1/source.PixelToWorld,'rotated':frame.get('rotated',False),'atlasFrame':frame}
                        statics[:]=[item for item in statics if item['node']!=node_id]
                        trim=frame.get('spriteSourceSize',original);local_scale=source.LocalScale
                        size=[float(trim['w']*source.PixelToWorld*local_scale.x),float(trim['h']*source.PixelToWorld*local_scale.y)]
                        statics.append({'node':node_id,'name':go.m_Name,'mesh':None,'sprite':sprite_key,'size':size,
                                        'customSprite':{'pixelToWorld':float(source.PixelToWorld),'ignoreOriginalSize':bool(source.IgnoreOriginalSize),
                                                        'localScale':{'x':float(local_scale.x),'y':float(local_scale.y)}},
                                        'material':mat,'sort':int(source.SortingOrder)})
            for child in tr.m_Children:visit(child.read().m_GameObject,node_id)
        visit(root)
        duration=max([system['duration'] for system in systems]+[float(row.get('TimeLimit') or .5)])
        preset=row['PresetName']
        if preset in refresh:manifest['effects']=[effect for effect in manifest['effects'] if effect['preset']!=preset]
        limitations=[]
        if any('CustomDataModule' in system['modules'] and system['material'].get('surface') not in ('particleDissolve','screenDistortion') for system in systems):
            limitations.append('Unmapped custom particle vertex streams')
        if any('Distort' in mat.get('shader','') and mat.get('surface')!='screenDistortion' for system in systems+statics
               for mat in [system.get('material'),*(system.get('materials') or [])] if mat):
            limitations.append('Native screen distortion shader is retained but not reproduced')
        manifest['effects'].append({'id':manifest['character']+':'+preset,'label':preset,
                                    'character':manifest['character'],'preset':preset,
                                    'assetName':target,'sourceBundle':row.get('AssetBundleName'),'direction':row.get('Direction') or [0,0,1],
                                    'scale':[1,1,1],'duration':duration,
                                    'dispose':row.get('DisposingType') or 'Destroy',
                                    'root':str(root.path_id),'nodes':nodes,'systems':systems,
                                    'statics':statics,'scripts':scripts,'limitations':limitations,'extra':True})
        converted+=1
    return converted
