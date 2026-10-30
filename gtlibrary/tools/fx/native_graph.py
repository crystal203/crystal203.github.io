"""Load action graphs by their source GraphName; no actor-specific mappings."""
import hashlib, importlib, json, sys, zipfile
from pathlib import Path

def import_graphs(actions, config):
    names=sorted({a['GraphName'] for a in actions if a.get('GraphName')})
    if not names:return {}
    if config.get('pythonLibs'):sys.path.insert(0,config['pythonLibs'])
    sys.modules['UnityPy.UnityPyBoost']=None
    UnityPy=importlib.import_module('UnityPy')
    bundles={}
    result={}
    for name in names:
        bundle,asset=name.split(':',1)
        if bundle not in bundles:
            roots=([config['bundleRoot']] if config.get('bundleRoot') else [])+config.get('bundleFallbackRoots',[])
            path=next((Path(root)/bundle for root in roots if (Path(root)/bundle).is_file()),None)
            if path and path.is_file():raw=path.read_bytes()
            else:
                with zipfile.ZipFile(config['apk']) as apk:raw=apk.read('assets/AssetBundles/Android/'+bundle)
            env=UnityPy.load(raw)
            records={}
            for obj in env.objects:
                if obj.type.name!='MonoBehaviour':continue
                record=obj.read_typetree()
                if record.get('_data',{}).get('_json'):records[record['m_Name']]=record['_data']
            bundles[bundle]=(records,hashlib.sha256(raw).hexdigest())
        records,digest=bundles[bundle]
        if asset not in records:raise ValueError('Missing action graph: '+name)
        data=records[asset]
        if data.get('_objectReferences'):raise ValueError('Unresolved external graph references: '+name)
        graph=json.loads(data['_json'])['graph']
        elements=graph['elements']
        # Keep native node types/ports/defaults. Editor-only notes are excluded.
        nodes=[{k:v for k,v in n.items() if k not in ('position','guid','$version')} for n in elements if '$id' in n]
        edges=[{k:v for k,v in n.items() if k not in ('guid','$version')} for n in elements if n['$type'].endswith(('ControlConnection','ValueConnection'))]
        result[name]={'variables':graph['variables']['collection']['$content'],'nodes':nodes,'connections':edges,
                      'source':{'bundle':bundle,'asset':asset,'sha256':digest}}
    return result
