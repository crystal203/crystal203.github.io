"""Data-only migration check; no rendering, screenshots or appearance loops."""
import argparse,json,sys,subprocess,os
from functools import lru_cache
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
config=json.loads(Path(__file__).with_name('import-config.json').read_text(encoding='utf8'))
configured=config.get('pythonExecutable')
needs_allocator=config.get('pythonAllocator') and not os.environ.get('PYTHONMALLOC')
if needs_allocator or (configured and Path(configured).resolve()!=Path(sys.executable).resolve()):
    env=dict(os.environ)
    if needs_allocator:env['PYTHONMALLOC']=config['pythonAllocator']
    raise SystemExit(subprocess.call([configured or sys.executable,str(Path(__file__).resolve()),*sys.argv[1:]],env=env))
for extra in config.get('pythonExtraLibs',[]):sys.path.insert(0,extra)
if config.get('pythonLibs'):sys.path.insert(0,config['pythonLibs'])
from native_asset_store import read,digest,pixels,reachable
from PIL import Image
arg=argparse.ArgumentParser();arg.add_argument('--before',type=Path,required=True);args=arg.parse_args()
assets=repo/'gtfx/assets';cache=args.before.parent
@lru_cache(maxsize=4096)
def image_hash(path):return digest(pixels(path))
def path_for(texture):
    path=(assets/'characters'/texture['url']).resolve()
    if not path.exists():path=cache/'removed-textures'/path.name
    assert path.is_file(),str(path)
    return str(path)
def sampler(texture):
    return [int((texture.get('filterMode') or 0)>0),texture.get('wrapU',0 if texture.get('repeat') else 1),texture.get('wrapV',0 if texture.get('repeat') else 1)]
def normalized(manifest):
    textures=manifest['textures'];sprites=manifest['sprites'];memo={}
    def visit(value):
        if isinstance(value,str):
            if value in memo:return memo[value]
            if value in sprites:
                s=sprites[value];t=textures[s['texture']];image=pixels(path_for(t));aw,ah=image.size;x,y,w,h=s['uv']
                rect=tuple(round(v) for v in (x*aw,(1-y-h)*ah,(x+w)*aw,(1-y)*ah))
                image=image.crop(rect)
                if s.get('rotated'):image=image.transpose(Image.Transpose.ROTATE_90)
                flip=s.get('atlasFlip',[0,0])
                if flip[0]:image=image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                if flip[1]:image=image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                result={k:v for k,v in s.items() if k not in ('texture','uv','rotated','clampUv','atlasFlip')}
                result.update(pixels=digest(image),sampler=sampler(t));memo[value]=result;return result
            if value in textures:
                t=textures[value];result={'pixels':image_hash(path_for(t)),'sampler':sampler(t)};memo[value]=result;return result
            return value
        if isinstance(value,list):return [visit(v) for v in value]
        if isinstance(value,dict):return {k:visit(v) for k,v in value.items()}
        return value
    return visit(manifest['effects'])
results=[]
for before_path in sorted(args.before.glob('*.json')):
    before=read(before_path);after=read(assets/'characters'/before_path.name)
    assert normalized(before)==normalized(after),before_path.stem+': effect semantics changed'
    refs=reachable(after)
    assert all(set(after[k])==v for k,v in refs.items()),'unused registry entries'
    for texture in after['textures'].values():assert (assets/'characters'/texture['url']).resolve().is_file()
    results.append({'character':after['character'],'effects':len(after['effects']),'spriteRecords':len(after['sprites']),'textureRecords':len(after['textures']),'atlasFrames':sum(bool(s.get('clampUv')) for s in after['sprites'].values())})
# All character manifests must still resolve their URLs, including unmodified characters.
preexisting_missing=set()
# Shared atlases recur across hundreds of manifests. Check each URL once.
urls=set()
for manifest_path in (assets/'characters').glob('*.json'):
    urls.update(t['url'] for t in read(manifest_path).get('textures',{}).values())
for url in urls:
    path=(assets/'characters'/url).resolve()
    if not path.is_file():
        assert not (cache/'removed-textures'/path.name).exists(),'cleanup removed a referenced image: '+str(path)
        preexisting_missing.add(path.name)
assert not (assets/'native-prefabs').exists()
for pack in (assets/'native-characters').glob('*.json'):assert 'sourcePrefabs' not in read(pack)
print(json.dumps({'passed':True,'scope':'resource hashes, sampling metadata and references only','results':results,'unrelatedMissingFilesNotRemovedByMigration':len(preexisting_missing)}))
