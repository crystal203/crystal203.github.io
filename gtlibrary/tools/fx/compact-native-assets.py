"""Migrate existing imports through the same shared resource store as new imports."""
import argparse,json,sys,subprocess,os
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
from native_asset_store import AssetStore,read,write
arg=argparse.ArgumentParser()
arg.add_argument('--index',nargs='+',type=Path,required=True)
arg.add_argument('--native-atlases',action='store_true',help='Resolve remaining standalone frames back to original Unity atlas textures')
arg.add_argument('--source-cache',type=Path,default=repo/'tools/fx/source-cache')
args=arg.parse_args()
store=AssetStore(repo/'gtfx/assets',args.source_cache)
for path in args.index:
    path=path if path.is_absolute() else repo/path
    manifest=read(path);sources={}
    if args.native_atlases:
        from native_atlas import original_sprite_sources
        sources,info=original_sprite_sources(manifest,config);print(path.stem,info,flush=True)
    store.optimize(manifest,sources);write(path,manifest)
    print(path.stem,store.stats,flush=True)
store.migrate_prefabs();store.clean()
write(args.source_cache/'last-compaction.json',store.stats)
print(json.dumps(store.stats),flush=True)
