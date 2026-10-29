"""Shared FX image storage and offline provenance. No character-specific rules."""
import copy
import hashlib
import json
import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from PIL import Image

MANAGED = ('native_', 'idolfx_', 'cwpchina_', 'shared_')
RUNTIME_ROOTS = ('apps','core','gtatlas','gtasset','gtfx','gtmap','gtonline','gtwiki','gtaudio','resources','shared','vendor')

def read(path):
    return json.loads(path.read_text(encoding='utf8'))

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf8')

def digest(image):
    image=image.convert('RGBA')
    return hashlib.sha256(str(image.size).encode()+b'\0'+image.tobytes()).hexdigest()

@lru_cache(maxsize=4)
def pixels(path):
    with Image.open(path) as image:
        return image.convert('RGBA')

def reachable(manifest):
    found={k:set() for k in ('textures','sprites','meshes')}
    def visit(value):
        if isinstance(value,str):
            for kind in found:
                if value in manifest.get(kind,{}) and value not in found[kind]:
                    found[kind].add(value);visit(manifest[kind][value])
        elif isinstance(value,dict):
            for item in value.values():visit(item)
        elif isinstance(value,list):
            for item in value:visit(item)
    visit(manifest['effects'])
    return found

def prune(manifest):
    refs=reachable(manifest)
    for kind, keys in refs.items():
        manifest[kind]={k:v for k,v in manifest.get(kind,{}).items() if k in keys}

def replace_refs(value, replacements):
    if isinstance(value,str):return replacements.get(value,value)
    if isinstance(value,list):return [replace_refs(v,replacements) for v in value]
    if isinstance(value,dict):return {k:replace_refs(v,replacements) for k,v in value.items()}
    return value

class AssetStore:
    def __init__(self, output, cache):
        self.output=Path(output).resolve();self.repo=self.output.parents[1]
        self.directory=self.output/'textures';self.cache=Path(cache).resolve()
        self.directory.mkdir(parents=True,exist_ok=True)
        if self.cache.is_relative_to(self.output) or any(self.cache.is_relative_to(self.repo/r) for r in RUNTIME_ROOTS):
            raise ValueError('Source cache must be outside web runtime roots')
        self.cache.mkdir(parents=True,exist_ok=True)
        self.stats={'atlasSprites':0,'sharedTextures':0,'removedImages':0,'removedBytes':0,'movedPrefabs':0,'nativeAtlasSprites':0,'nativeAtlasMismatch':0}
        self.atlases={};self.hashes={};self.image_hash_cache={}
        catalog=self.cache/'atlas-catalog.json'
        self.catalog_path=Path(__file__).with_name('atlas-catalog.json')
        saved=read(self.catalog_path) if self.catalog_path.exists() else (read(catalog) if catalog.exists() else [])
        signatures=set()
        def add(sprite,texture):
            if sprite.get('uv')==[0,0,1,1] and not sprite.get('rotated'):return
            signature=json.dumps([sprite,texture],sort_keys=True)
            if signature in signatures:return
            signatures.add(signature);self.atlases.setdefault(sprite.get('name'),[]).append((sprite,texture))
        for row in saved:add(row['sprite'],row['texture'])
        for path in sorted((self.output/'characters').glob('*.json')):
            manifest=read(path)
            for sprite in manifest.get('sprites',{}).values():
                texture=manifest.get('textures',{}).get(sprite.get('texture'))
                if texture:add(sprite,texture)
        # Persistent hashes avoid repeatedly decoding the entire texture library.
        hash_file=self.cache/'image-hashes.json';old=read(hash_file) if hash_file.exists() else {};current={}
        paths=sorted(self.directory.glob('*.png'),key=lambda p:(p.name.startswith(MANAGED),not p.name.startswith('shared_'),p.name))
        for path in paths:
            stat=path.stat();stamp=[stat.st_size,stat.st_mtime_ns];entry=old.get(path.name)
            h=entry['hash'] if entry and entry['stamp']==stamp else digest(pixels(str(path)))
            current[path.name]={'stamp':stamp,'hash':h};self.hashes.setdefault(h,path);self.image_hash_cache[path]=h
        write(hash_file,current)

    def path(self, texture):
        path=(self.output/'characters'/texture['url']).resolve()
        if not path.is_relative_to(self.directory):raise ValueError('Texture escapes managed directory: '+str(path))
        return path

    def bind(self, manifest, record):
        # Keep sampler state separate even when two records use the same PNG.
        signature={k:record.get(k) for k in ('url','width','height','filterMode','wrapU','wrapV','repeat')}
        key='shared_'+hashlib.sha256(json.dumps(signature,sort_keys=True).encode()).hexdigest()[:24]
        previous=manifest['textures'].get(key)
        if previous and any(previous.get(k)!=v for k,v in signature.items()):raise ValueError('Texture key collision')
        manifest['textures'][key]=copy.deepcopy(record)
        return key

    def texture(self, manifest, image, record):
        h=digest(image);path=self.hashes.get(h)
        # Shared files use the source Texture name, never the importing character.
        # Keep pre-existing generic assets; migrate historical native_<character>
        # exports and anonymous shared hashes to this global content-addressed form.
        canonical=path and re.fullmatch(r'shared_.+_[0-9a-f]{64}\.png',path.name)
        if path is None or (path.name.startswith(MANAGED) and not canonical):
            source=re.sub(r'[^A-Za-z0-9_.-]+','_',record.get('name') or 'texture').strip('._')[:48] or 'texture'
            destination=self.directory/('shared_'+source+'_'+h+'.png')
            if destination.exists():
                if digest(pixels(str(destination)))!=h:raise ValueError('Shared image content mismatch')
            elif path is not None:shutil.copy2(path,destination)
            else:image.convert('RGBA').save(destination)
            path=destination;self.hashes[h]=path
        record={**record,'url':'../textures/'+path.name,'width':image.width,'height':image.height}
        self.stats['sharedTextures']+=1
        return self.bind(manifest,record)

    def sprite(self, manifest, image, sprite, sampler=None, native_atlas=None):
        h=digest(image);sampler={'filterMode':0,'wrapU':1,'wrapV':1,'repeat':False,**(sampler or {})}
        candidates=self.atlases.get(sprite.get('name'),[]) if not sampler.get('repeat') and sampler['wrapU']==sampler['wrapV']==1 else []
        for candidate,texture in candidates:
            path=self.path(texture)
            if not path.exists():continue
            atlas=pixels(str(path));x,y,w,height=candidate['uv'];aw,ah=atlas.size
            rect=[x*aw,(1-y-height)*ah,(x+w)*aw,(1-y)*ah]
            if any(abs(v-round(v))>1e-5 for v in rect):continue
            crop=atlas.crop(tuple(round(v) for v in rect))
            if candidate.get('rotated'):crop=crop.transpose(Image.Transpose.ROTATE_90)
            flip=candidate.get('atlasFlip',[0,0])
            if flip[0]:crop=crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if flip[1]:crop=crop.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            if crop.size!=image.size or digest(crop)!=h:continue
            # Metadata (pivot/PPU/size) belongs to the original Sprite, not the atlas.
            key=self.bind(manifest,{**texture,**sampler,'repeat':False,'wrapU':1,'wrapV':1})
            self.stats['atlasSprites']+=1
            return {**sprite,'texture':key,'uv':candidate['uv'],'rotated':bool(candidate.get('rotated')),'atlasFlip':flip,'clampUv':True}
        if native_atlas is not None and not sampler.get('repeat') and sampler['wrapU']==sampler['wrapV']==1:
            original=native_atlas();atlas=original['image'];x,y,w,height=original['uv']
            rect=[x*atlas.width,(1-y-height)*atlas.height,(x+w)*atlas.width,(1-y)*atlas.height]
            crop=atlas.crop(tuple(round(v) for v in rect))
            if original['rotated']:crop=crop.transpose(Image.Transpose.ROTATE_90)
            flip=original['atlasFlip']
            if flip[0]:crop=crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if flip[1]:crop=crop.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            if all(abs(v-round(v))<1e-5 for v in rect) and crop.size==image.size and digest(crop)==h:
                key=self.texture(manifest,atlas,{'name':original['name'],**sampler})
                if original['uv']!=[0,0,1,1]:self.stats['nativeAtlasSprites']+=1
                return {**sprite,'texture':key,'uv':original['uv'],'rotated':original['rotated'],
                        'atlasFlip':flip,'clampUv':True}
            self.stats['nativeAtlasMismatch']+=1
        key=self.texture(manifest,image,{'name':sprite.get('name'),**sampler})
        return {**sprite,'texture':key,'uv':[0,0,1,1],'rotated':False}

    def optimize(self, manifest, native_sprites=None):
        # The atlas catalog was captured before dropping obsolete registry entries.
        prune(manifest)
        for key,sprite in list(manifest['sprites'].items()):
            texture=manifest['textures'][sprite['texture']];path=self.path(texture)
            if (not path.name.startswith(MANAGED) and key not in (native_sprites or {})) or sprite.get('uv')!=[0,0,1,1] or sprite.get('rotated'):continue
            image=pixels(str(path));sampler={k:texture[k] for k in ('filterMode','wrapU','wrapV','repeat') if k in texture}
            manifest['sprites'][key]=self.sprite(manifest,image,sprite,sampler,(native_sprites or {}).get(key))
        refs=reachable(manifest);mapping={}
        for key in sorted(refs['textures']):
            texture=manifest['textures'][key];path=self.path(texture)
            if path.name.startswith(MANAGED):
                mapping[key]=self.texture(manifest,pixels(str(path)),texture)
        manifest['effects']=replace_refs(manifest['effects'],mapping)
        manifest['sprites']=replace_refs(manifest['sprites'],mapping)
        prune(manifest)

    def archive_prefab(self, character, source, relative):
        destination=(self.cache/'prefabs'/character/relative).resolve()
        if not destination.is_relative_to(self.cache/'prefabs'):raise ValueError('Prefab path escapes source cache')
        destination.parent.mkdir(parents=True,exist_ok=True)
        if not destination.exists() or source.read_bytes()!=destination.read_bytes():shutil.copy2(source,destination)
        return destination.relative_to(self.cache).as_posix()

    def migrate_prefabs(self):
        source=(self.output/'native-prefabs').resolve()
        for pack_path in sorted((self.output/'native-characters').glob('*.json')):
            pack=read(pack_path);refs=pack.pop('sourcePrefabs',None)
            if refs is None:continue
            entries={}
            for preset,relative in refs.items():
                path=(self.output/relative).resolve()
                if not path.is_relative_to(source):raise ValueError('Invalid prefab provenance path')
                if path.exists():
                    parts=path.relative_to(source).parts
                    entries[preset]=self.archive_prefab(parts[0],path,Path(*parts[1:]))
            write(self.cache/'characters'/(pack_path.stem+'.json'),{'sourcePrefabs':entries});write(pack_path,pack)
        if source.exists():
            for path in sorted(source.rglob('*'),key=lambda p:len(p.parts),reverse=True):
                if path.is_file():
                    relative=path.relative_to(source);target=self.cache/'prefabs'/relative
                    if not target.exists():self.archive_prefab(relative.parts[0],path,Path(*relative.parts[1:]))
                    if path.read_bytes()!=target.read_bytes():raise ValueError('Prefab archive mismatch')
                    path.unlink();self.stats['movedPrefabs']+=1
                elif path.is_dir():path.rmdir()
            source.rmdir()

    def save_atlas_catalog(self):
        # Preserve only atlas coordinates no longer present in runtime manifests.
        # This small import-only catalog is versioned, unlike disposable caches.
        def signature(s,t):return (s.get('name'),t['url'],tuple(s['uv']),bool(s.get('rotated')),tuple(s.get('atlasFlip',[0,0])))
        live=set()
        for path in (self.output/'characters').glob('*.json'):
            m=read(path)
            for s in m.get('sprites',{}).values():
                t=m.get('textures',{}).get(s.get('texture'))
                if t:live.add(signature(s,t))
        preserved={}
        for rows in self.atlases.values():
            for s,t in rows:
                sig=signature(s,t)
                if sig not in live and self.path(t).exists():
                    preserved[sig]={'sprite':{'name':s.get('name'),'uv':s['uv'],'rotated':bool(s.get('rotated')),'atlasFlip':s.get('atlasFlip',[0,0])},
                                    'texture':{k:t[k] for k in ('url','width','height')}}
        write(self.catalog_path,list(preserved.values()))

    def clean(self):
        self.save_atlas_catalog()
        protected=set()
        for path in (self.output/'characters').glob('*.json'):
            for texture in read(path).get('textures',{}).values():protected.add(self.path(texture))
        candidates=[p for p in self.directory.glob('*.png') if p.name.startswith(MANAGED) and p.resolve() not in protected]
        if not candidates:return
        # Also protect direct references outside the character indexes. Fail closed
        # if the search fails. Diagnostics in tools/ are not runtime consumers.
        names=self.cache/'cleanup-candidates.txt';names.write_text('\n'.join(p.name for p in candidates)+'\n',encoding='utf8')
        roots=[r for r in RUNTIME_ROOTS if (self.repo/r).exists()]+[p for p in ('index.html','library.js','library.css','sw.js') if (self.repo/p).exists()]
        scan=subprocess.run(['rg','-F','-o','--no-filename','-f',str(names),'--glob','*.{js,json,html,css,atlas}',*roots],cwd=self.repo,capture_output=True,text=True)
        if scan.returncode not in (0,1):raise RuntimeError(scan.stderr)
        direct=set(scan.stdout.splitlines())
        for path in candidates:
            if path.name in direct:continue
            target=(self.cache/'removed-textures'/path.name).resolve()
            if not path.resolve().is_relative_to(self.directory) or not target.is_relative_to(self.cache/'removed-textures'):raise ValueError('Unsafe cleanup path')
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists() and target.read_bytes()!=path.read_bytes():raise ValueError('Cleanup backup collision')
            size=path.stat().st_size
            if not target.exists():shutil.copy2(path,target)
            path.unlink();self.stats['removedImages']+=1;self.stats['removedBytes']+=size
