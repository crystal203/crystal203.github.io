"""Collect one exact native character skeleton set and its own atlas dependencies."""
import hashlib,json,re,sys,zipfile
from pathlib import Path

def collect_appearance(resource,output,config,cache):
    if any(c in resource for c in '/\\:#'):raise ValueError('Expected an exact character resource name')
    found=[]
    for root in [config['bundleRoot'],*config.get('bundleFallbackRoots',[])]:
        found=[p for p in Path(root).rglob(resource) if p.is_file() and 'characters' in p.parts]
        if found:break
    if len(found)>1:raise ValueError('Ambiguous character bundle: '+resource)
    if found:
        path=found[0];raw=path.read_bytes();source_label=str(path)
    else:
        with zipfile.ZipFile(config['apk']) as apk:
            candidates=[n for n in apk.namelist() if '/characters/' in n and n.endswith('/'+resource)]
            if len(candidates)!=1:raise ValueError('Ambiguous/missing character bundle: '+resource)
            raw=apk.read(candidates[0]);source_label=str(config['apk'])+'!/'+candidates[0]
    digest=hashlib.sha256(raw).hexdigest();record=Path(cache)/'appearances'/(resource+'.json');output=Path(output)
    if record.exists():
        old=json.loads(record.read_text(encoding='utf8'))
        if old['bundleSha256']==digest and all((output/name).exists() and hashlib.sha256((output/name).read_bytes()).hexdigest()==sha for name,sha in old['files'].items()):return old
    for extra in config.get('pythonExtraLibs',[]):sys.path.insert(0,extra)
    sys.path.insert(0,config['pythonLibs']);sys.modules['UnityPy.UnityPyBoost']=None
    import UnityPy
    env=UnityPy.load(raw);files={};pages={};atlas_raw=None
    prefabs=[]
    for obj in env.objects:
        if obj.type.name!='AssetBundle':continue
        for name,info in obj.read().m_Container:
            if Path(name).stem==resource and name.endswith('.prefab'):prefabs.append((name,info.asset))
    if len(prefabs)!=1:raise ValueError('Ambiguous/missing native character prefab: '+resource)
    prefab_name,prefab=prefabs[0];skeletons={};visited=set()
    def visit(ref):
        identity=(str(ref.assets_file.name) if hasattr(ref,'assets_file') else '',ref.path_id)
        if identity in visited:return
        visited.add(identity);go=ref.read();transform=None
        for entry in go.m_Component:
            component=entry.component
            if component.type.name=='Transform':transform=component.read()
            elif component.type.name=='MonoBehaviour':
                script=component.read()
                if script.m_Script.read().m_ClassName!='SkeletonAnimation' or not script.skeletonDataAsset.path_id:continue
                data=script.skeletonDataAsset.read()
                match=re.search(r'_(back|front|side)_SkeletonData$',data.m_Name)
                node_view=re.fullmatch(r'spine_(back|front|side)',go.m_Name)
                view=(node_view or match).group(1) if node_view or match else None
                if not view:raise ValueError('Cannot resolve native skeleton view: '+data.m_Name)
                if match and node_view and match.group(1)!=node_view.group(1):raise ValueError('Native skeleton view mismatch: '+data.m_Name)
                if view in skeletons:raise ValueError('Duplicate native skeleton view: '+view)
                skeletons[view]=data
        if transform:
            for child in transform.m_Children:visit(child.read().m_GameObject)
    visit(prefab)
    for view,data in skeletons.items():
        asset=data.skeletonJSON.read();content=asset.m_Script
        files[resource+'_'+view+'.bytes']=content if isinstance(content,bytes) else content.encode('utf8','surrogateescape')
        for ref in data.atlasAssets:
            atlas=ref.read();text=atlas.atlasFile.read().m_Script
            text=text if isinstance(text,bytes) else text.encode('utf8','surrogateescape')
            if atlas_raw is not None and atlas_raw!=text:raise ValueError('Different atlases per view require separate bindings: '+resource)
            atlas_raw=text
            for mat in atlas.materials:
                source=dict(mat.read().m_SavedProperties.m_TexEnvs)['_MainTex'].m_Texture.read();pages[source.m_Name+'.png']=source.image
    if len(files)!=3 or atlas_raw is None:raise ValueError('Incomplete native character skeleton set: '+resource)
    files[resource+'.atlas']=atlas_raw;output.mkdir(parents=True,exist_ok=True)
    for name,content in files.items():(output/name).write_bytes(content)
    for name,image in pages.items():image.save(output/name)
    evidence={'version':2,'bundle':source_label,'bundleSha256':digest,'prefab':prefab_name,'skeletonDataByView':{view:data.m_Name for view,data in skeletons.items()},'files':{name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in [*files,*pages]}}
    record.parent.mkdir(parents=True,exist_ok=True);record.write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8');return evidence
