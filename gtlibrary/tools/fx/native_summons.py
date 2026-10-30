"""Follow native SummonableId references and resolve their original character bundles."""
import hashlib,json
from pathlib import Path

def collect_summonables(rows,costumes,source,config):
    def refs(value):
        if isinstance(value,dict):
            for key,item in value.items():
                if key=='SummonableId' and isinstance(item,int):yield item
                yield from refs(item)
        elif isinstance(value,list):
            for item in value:yield from refs(item)
    ids=set(refs([rows,costumes]))
    if not ids:return [],[],None
    path=Path(source)/'summonable.json'
    if not path.exists():raise FileNotFoundError('Missing native summonable.json: '+str(path))
    records=json.loads(path.read_text(encoding='utf-8'));selected=[r for r in records if r['Id'] in ids]
    if ids-{r['Id'] for r in selected}:raise ValueError('Missing SummonableId records')
    pools=[];result=[]
    for original in selected:
        row=dict(original);spine=row['SpineAssetName'];name=spine.get('default') if isinstance(spine,dict) else spine
        bundle,asset=name.split(':',1) if ':' in name else (name,name)
        candidates=[]
        for root in [config['bundleRoot'],*config.get('bundleFallbackRoots',[])]:
            candidates=[p for p in Path(root).rglob(bundle) if p.is_file() and 'characters' in p.parts]
            if candidates:break
        if len(candidates)!=1:raise ValueError('Ambiguous/missing summon character bundle: '+bundle)
        bundle_path=candidates[0].relative_to(root).as_posix();preset='summonable:'+str(row['Id'])
        row['preset']=preset;pools.append({'PresetName':preset,'AssetName':asset,'AssetBundleName':bundle_path,'TimeLimit':1,'DisposingType':'Destroy','entity':True})
        result.append(row)
    return result,pools,{'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
