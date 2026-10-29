"""Original Unity Sprite render-data/atlas extraction; no frame repacking."""
import re
import sys
import zipfile
from pathlib import Path
from PIL import Image

def sprite_atlas(sprite, cache):
    from UnityPy.export.SpriteHelper import get_image, SpriteSettings
    atlas=sprite.m_SpriteAtlas.read() if sprite.m_SpriteAtlas else None
    if atlas is None and sprite.m_AtlasTags:
        for obj in sprite.assets_file.objects.values():
            if obj.type.name=='SpriteAtlas' and obj.peek_name()==sprite.m_AtlasTags[0]:
                atlas=obj.read();break
    data=next(v for k,v in atlas.m_RenderDataMap if k==sprite.m_RenderDataKey) if atlas else sprite.m_RD
    key=(id(sprite.assets_file),data.texture.file_id,data.texture.path_id,
         data.alphaTexture.path_id if data.alphaTexture else 0)
    if key not in cache:
        # UnityPy crops in bottom-up texture space. Store the full image in the
        # same top-down PNG convention as Texture2D.image; merge split alpha once.
        cache[key]=get_image(sprite,data.texture,data.alphaTexture).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGBA')
    image=cache[key];r=data.textureRect;settings=SpriteSettings(data.settingsRaw)
    rotation=int(settings.packingRotation) if settings.packed else 0
    return {'image':image,'name':data.texture.read().m_Name,
            'uv':[r.x/image.width,r.y/image.height,r.width/image.width,r.height/image.height],
            'rotated':rotation==4,'atlasFlip':[int(rotation in (1,3)),int(rotation in (2,3))]}

def original_sprite_sources(manifest, config):
    """Resolve only remaining standalone Sprite records; no effect simulation."""
    sys.modules['UnityPy.UnityPyBoost']=None
    import UnityPy
    wanted={}
    for key,sprite in manifest['sprites'].items():
        match=re.search(r'_sprite_(\d+)$',key)
        if match and sprite.get('uv')==[0,0,1,1] and not sprite.get('rotated'):
            wanted.setdefault(int(match[1]),[]).append((key,sprite))
    if not wanted:return {},{}
    env=UnityPy.Environment();loaded=set();root=Path(config['bundleRoot']);apk=zipfile.ZipFile(config['apk']) if config.get('apk') else None
    def load(name):
        if name in loaded:return
        loaded.add(name);path=root/name
        raw=path.read_bytes() if path.exists() else apk.read('assets/AssetBundles/Android/'+name)
        bundle=env.load_file(raw,name=name)
        for obj in list(env.objects):
            if obj.type.name=='AssetBundle':
                for dep in obj.read().m_Dependencies:load(dep)
    try:
        for name in sorted(manifest.get('nativeSource',{}).get('bundles',{})):load(name)
    finally:
        if apk:apk.close()
    found={};cache={};objects={}
    for obj in env.objects:
        if obj.type.name!='Sprite' or abs(obj.path_id) not in wanted:continue
        sprite=obj.read()
        for key,record in wanted[abs(obj.path_id)]:
            if sprite.m_Name!=record.get('name'):continue
            if key in objects:
                from native_asset_store import digest
                if digest(objects[key].image)!=digest(sprite.image):
                    raise ValueError('Conflicting original Sprite pixels: '+key)
                continue  # Identical Sprite may be embedded in multiple bundles.
            objects[key]=sprite
            found[key]=lambda s=sprite:sprite_atlas(s,cache)
    return found,{'standaloneSpriteRecords':sum(map(len,wanted.values())),'resolvedOriginalSprites':len(found)}
