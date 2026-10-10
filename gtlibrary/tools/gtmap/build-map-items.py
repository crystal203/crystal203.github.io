"""Build static item/treasure metadata and tile component defaults; no runtime service."""
from pathlib import Path
import argparse, json, gzip, re

ROOT=Path(__file__).resolve().parents[2] if Path(__file__).parent.name=='gtmap' else Path('D:/github/gtlibrary')
# World display order differs from the original atlas numbering in worlds 1-8.
EARLY_WORLD_COINS={1:1,2:2,3:4,4:5,5:6,6:7,7:8,8:3}
def coin_sprite(world):return 'purple_coin_'+str(EARLY_WORLD_COINS.get(world,world))

def read_atlas(path):
 # LibGDX size is the unrotated sprite size; rotated packed footprints are h by w.
 frames={};current=None;page={}
 for line in path.read_text(encoding='utf-8-sig').splitlines():
  if not line.strip():continue
  if not line.startswith(' ') and ':' not in line:
   current=None if line.endswith('.png') else line.strip()
   if current:frames[current]={}
  elif ':' in line:
   k,v=line.strip().split(':',1);(frames[current] if current else page)[k]=v.strip()
 pair=lambda v:[int(x.strip()) for x in v.split(',')]
 result={}
 for name,f in frames.items():
  x,y=pair(f['xy']);w,h=pair(f['size']);ow,oh=pair(f.get('orig',f['size']));ox,oy=pair(f.get('offset','0,0'))
  result[name]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':f['rotate'] in ['true','90'],'sourceSize':{'w':ow,'h':oh},'spriteSourceSize':{'x':ox,'y':oh-oy-h,'w':w,'h':h}}
 w,h=pair(page['size']);return {'frames':result,'meta':{'image':'pickup-items.png','size':{'w':w,'h':h}}}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--static',type=Path,default=Path('E:/GTFiles/static_data_dec'));ap.add_argument('--assets',type=Path,default=Path('D:/GTAsset/FullExtract/ExportedProject/Assets'));a=ap.parse_args()
 read=lambda name:json.loads((a.static/(name+'.json')).read_text(encoding='utf-8-sig'))
 items=read('items');zh=read('strings-zhCN');en=read('strings-enUS');meta=read('stagemetaitem')
 atlas_names={}
 for path in sorted((ROOT/'gtatlas/assets').glob('*.zh.json')):
  for key,label in json.loads(path.read_text(encoding='utf8')).items():
   if isinstance(label,str) and '\ufffd' not in label and re.search(r'[\u3400-\u9fff]',label):atlas_names.setdefault(key,label)
 names={}
 chinese=lambda label:isinstance(label,str) and '\ufffd' not in label and bool(re.search(r'[\u3400-\u9fff]',label))
 for item in items:
  key=item['Name'];sprites=item.get('SpriteName',{});label=zh.get(key);matched=key
  if not chinese(label):
   base=re.sub(r'_(normal|common|rare|unique|legend|legendary|epic)$','',key)
   candidates=[sprites.get('default'),base,key]
   label=None
   for candidate in candidates:
    if not candidate:continue
    translated=atlas_names.get(candidate) or zh.get(candidate)
    if chinese(translated):label=translated;matched=candidate;break
  if not label or '\ufffd' in label:label=en.get(key)
  if not label or '\ufffd' in label:label={'gold':'金币','experience':'经验结晶','starpiece':'星片','star_piece':'黄色碎片','mole_glove':'鼹鼠手套'}.get(key,key)
  names[str(item['Id'])]={'name':label,'nameKey':matched,'key':key,'type':item['Type'],'sprite':sprites}
 defaults={};manifest=json.loads((ROOT/'gtmap/assets/native-states.json').read_text());sets=set(manifest['sets'])|{'gimmick','gimmick_part2','gimmick_part3'}
 for path in a.assets.rglob('*.tileset.prefab'):
  stem=path.name.removesuffix('.tileset.prefab');matches=[s for s in sets if s==stem or s.split(':')[-1]==stem+'.tileset']
  if not matches:continue
  text=path.read_text(encoding='utf-8-sig');objects={}
  for m in re.finditer(r'^--- !u!1 &(-?\d+)\n(.*?)(?=^---|\Z)',text,re.M|re.S):
   name=re.search(r'^  m_Name: (.*)$',m[2],re.M)
   if name:objects[m[1]]=name[1].strip("'\"").replace("''","'")
  for m in re.finditer(r'^--- !u!114 &-?\d+\n(.*?)(?=^---|\Z)',text,re.M|re.S):
   spec=re.search(r'^  componentSpec: (".*")$',m[1],re.M);go=re.search(r'm_GameObject: \{fileID: (-?\d+)\}',m[1])
   if not spec or not go or go[1] not in objects:continue
   try:value=json.loads(json.loads(spec[1]))
   except (ValueError,TypeError):continue
   for key in matches:defaults.setdefault(key,{})[objects[go[1]]]=value
 stages=read('stages');chapters={r['ChapterId']%10000:r['ChapterNo'] for r in read('chapterdata')['Chapter'] if 10000<=r['ChapterId']<10100}
 coins={}
 for stage in stages:
  chapter=chapters.get(stage.get('ChapterId')) if 100000000<=stage['Id']<200000000 else None;tilemap=stage.get('Tilemap',{})
  if chapter and isinstance(tilemap,dict):
   for name in tilemap.values():
    if isinstance(name,str):coins.setdefault(name,coin_sprite(chapter))
 # Published world categories also cover older map variants no longer listed by stages.
 for m in json.loads((ROOT/'gtmap/assets/catalog.json').read_text(encoding='utf8'))['maps']:
  world=next((re.fullmatch(r'world_(\d+)',c) for c in [m.get('category',''),*m.get('categoryPath',[])] if re.fullmatch(r'world_(\d+)',c)),None)
  coins[m['id']]=coin_sprite(int(world[1])) if world else 'purple_coin_event'
 atlas=read_atlas(a.assets/'spritesheets/items/items/items.atlas.txt')
 atlases={'items':atlas}
 for name in ['characters','questItems']:
  atlases[name]=json.loads((ROOT/('gtatlas/assets/'+name+'.json')).read_text(encoding='utf8'))
 for item in names.values():
  sprite=item['sprite'].get('default');item['atlas']=next((name for name,data in atlases.items() if sprite in data['frames']),None)
 import shutil
 shutil.copyfile(a.assets/'spritesheets/items/items/items.png',ROOT/'gtmap/assets/textures/pickup-items.png')
 result={'atlas':atlas,'atlases':atlases,'coinSprites':coins,'version':2,'items':names,'maps':meta,'defaults':defaults,'source':'static_data_dec/items.json, stagemetaitem.json, chapterdata.json, stages.json; map catalog world categories; exported tileset componentSpec','coinPolicy':{'worlds1to8':[1,2,4,5,6,7,8,3],'worlds9plus':'world number','other':'purple_coin_event'}}
 out=ROOT/'gtmap/assets/item-metadata.json.gz';out.write_bytes(gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));print('items',len(names),'maps',len(meta),'defaultSpecs',sum(map(len,defaults.values())),'bytes',out.stat().st_size,flush=True)
if __name__=='__main__':main()
