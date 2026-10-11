"""Collect native CustomSprite shadows without guessing a universal radius."""
from pathlib import Path
import argparse, gzip, json, re, sys, zipfile, hashlib

def field(block, name, default=None):
    m=re.search(r'^  '+re.escape(name)+r':\s*([^\r\n]*)',block,re.M)
    return m[1].strip() if m else default
def vec(block,name,axes,default):
    text=field(block,name,'');values=dict(re.findall(r'(\w+): ([\d.Ee+-]+)',text))
    return [float(values.get(k,v)) for k,v in zip(axes,default)]
def prefab_shadow(text):
    blocks={m[2]: (int(m[1]),m[3]) for m in re.finditer(r'--- !u!(\d+) &(-?\d+)\n(.*?)(?=--- !u!|\Z)',text,re.S)}
    transforms={field(b,'m_GameObject'): (id,b) for id,(kind,b) in blocks.items() if kind==4}
    def chain(game):
        result=[];seen=set();t=transforms.get(game)
        while t and t[0] not in seen:
            seen.add(t[0]);b=t[1];parent=field(b,'m_Father','{fileID: 0}')
            if parent=='{fileID: 0}':break
            go=field(b,'m_GameObject');gid=re.search(r'fileID: (-?\d+)',go or '')
            active=field(blocks.get(gid[1],(0,''))[1],'m_IsActive','1')!='0' if gid else True
            result.append({'position':vec(b,'m_LocalPosition','xyz',[0,0,0]),'rotation':vec(b,'m_LocalRotation','xyzw',[0,0,0,1]),'scale':vec(b,'m_LocalScale','xyz',[1,1,1]),'active':active})
            pid=re.search(r'fileID: (-?\d+)',parent);t=(pid[1],blocks[pid[1]][1]) if pid and pid[1] in blocks else None
        return list(reversed(result))
    result=[]
    for id,(kind,b) in blocks.items():
        if kind!=114 or field(b,'SpriteName')!='shadow.png':continue
        if '3af95d0ee9f462f42b715a2f6b8be6da' not in field(b,'Atlas',''):continue
        result.append({'pixelToWorld':float(field(b,'PixelToWorld','0.0085')),'localScale':vec(b,'LocalScale','xy',[1,1]),'tint':vec(b,'TintColor','rgba',[1,1,1,1]),'transforms':chain(field(b,'m_GameObject'))})
    return result[0] if len(result)==1 else None
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--assets',type=Path,default=Path('D:/GTAsset/FullExtract/ExportedProject/Assets'));ap.add_argument('--output',type=Path);args=ap.parse_args()
    meta=json.loads(gzip.decompress((args.root/'gtmap/assets/character-metadata.json.gz').read_bytes()));candidates={};prefabs={};sources=[]
    for p in args.assets.rglob('*.prefab'):
        resource=p.stem if p.stem in meta['assets'] else meta['aliases'].get(p.stem)
        if not resource:continue
        text=p.read_text('utf-8-sig');s=prefab_shadow(text)
        if s:
            prefabs[p.stem]=s;candidates.setdefault(resource,[]).append((p.stem,s));sources.append({'resource':resource,'prefab':str(p.relative_to(args.assets)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    resources={};ambiguous=[]
    for resource,items in candidates.items():
        exact=[s for name,s in items if name==resource];values=exact or [s for _,s in items]
        if all(s==values[0] for s in values):resources[resource]=values[0]
        else:ambiguous.append(resource)
    audit=json.loads((args.root/'tools/gtmap/evidence/apk-character-resources.json').read_text('utf8'))
    try:import UnityPy
    except ImportError:
        sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs');import UnityPy
    with zipfile.ZipFile(audit['sourceApk']) as z:
        for bundle in sorted({r['source'] for r in audit['resources']}):
            rows=[r for r in audit['resources'] if r['source']==bundle];env=UnityPy.load(z.read(bundle));trees={o.path_id:o.read_typetree() for o in env.objects if o.type.name in ('GameObject','Transform','MonoBehaviour')};texts={o.path_id:o.read().m_Name for o in env.objects if o.type.name=='TextAsset'}
            transforms={t['m_GameObject']['m_PathID']:(id,t) for id,t in trees.items() if 'm_LocalPosition' in t}
            def root(go):
                seen=set()
                while go in transforms and go not in seen:
                    seen.add(go);t=transforms[go][1];parent=t['m_Father']['m_PathID']
                    if not parent or parent not in trees:return go
                    go=trees[parent]['m_GameObject']['m_PathID']
                return go
            for row in rows:
                atlas={id for id,t in trees.items() if texts.get(t.get('atlasFile',{}).get('m_PathID'))==row['name']+'.atlas'}
                sk={id for id,t in trees.items() if any(a['m_PathID'] in atlas for a in t.get('atlasAssets',[]))}
                roots={root(t['m_GameObject']['m_PathID']) for t in trees.values() if t.get('skeletonDataAsset',{}).get('m_PathID') in sk}
                values=[]
                for t in trees.values():
                    if t.get('SpriteName')!='shadow.png' or root(t['m_GameObject']['m_PathID']) not in roots:continue
                    chain=[];go=t['m_GameObject']['m_PathID'];seen=set()
                    while go in transforms and go not in seen:
                        seen.add(go);tr=transforms[go][1];parent=tr['m_Father']['m_PathID']
                        if not parent:break
                        chain.append({'position':list(tr['m_LocalPosition'].values()),'rotation':list(tr['m_LocalRotation'].values()),'scale':list(tr['m_LocalScale'].values()),'active':bool(trees[go]['m_IsActive'])});go=trees[parent]['m_GameObject']['m_PathID']
                    value={'pixelToWorld':t['PixelToWorld'],'localScale':list(t['LocalScale'].values()),'tint':list(t['TintColor'].values()),'transforms':list(reversed(chain))};values.append(value)
                if values and all(s==values[0] for s in values):resources[row['name']]=values[0];sources.append({'resource':row['name'],'apkBundle':bundle,'sha256':row['bundleSha256']})
    atlas=json.loads((args.root/'gtatlas/assets/battle.json').read_text('utf8'));frame=atlas['frames']['shadow.png']
    result={'version':1,'texture':'../gtatlas/assets/battle.png','frame':frame,'size':atlas['meta']['size'],'resources':resources,'prefabs':prefabs,'evidence':{'sources':sources,'ambiguous':ambiguous,'atlas':'battle/shadow.png','shaderNote':'Native CustomSprite ground quad; texture alpha and tint preserved; WebGL depth bias replaces native Shear sorting.'}}
    output=args.output or args.root/'gtmap/assets/character-shadows.json.gz';output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));print('Native shadows:',len(resources),'resources,',len(prefabs),'prefab overrides, ambiguous:',len(ambiguous),'bytes',output.stat().st_size)
if __name__=='__main__':main()
