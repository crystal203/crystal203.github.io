"""Index every selectable viewer resource, without loading full images at search time."""
import json,re,collections
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
sheets=read(ROOT/'resources/atlas-catalog.json');entities=[];blank=[];counts={}
for sheet in sheets:
 id=sheet['id'];data=read(ROOT/'gtatlas/assets'/f'{id}.json');zp=ROOT/'gtatlas/assets'/f'{id}.zh.json';zh=read(zp) if zp.exists() else {}
 with Image.open(ROOT/'gtatlas/assets'/f'{id}.png') as image:
  alpha=image.convert('RGBA').getchannel('A')
  for name,row in data['frames'].items():
   f=row.get('frame',row);x,y=f.get('x',0),f.get('y',0);w,h=f.get('w',f.get('width',0)),f.get('h',f.get('height',0))
   if row.get('rotated'):w,h=h,w
   if not w or not h or not alpha.crop((x,y,x+w,y+h)).getbbox():blank.append([id,name]);continue
   label=zh.get(name) or name
   entities.append({'id':f'atlas:{id}:{name}','name':label,'aliases':[name,sheet['name'],id],'atlas':{'sheet':id,'query':name},'kind':'atlasRegion'})
  counts[id]=sum(e.get('kind')=='atlasRegion' and e['atlas']['sheet']==id for e in entities)
 entities.append({'id':'atlas:'+id,'name':sheet['name']+'（图集）','aliases':[id,sheet['name']],'atlas':{'sheet':id},'kind':'atlasSheet'})
for folder in ['character','illust']:
 p=ROOT/'gtasset/assets'/folder/'assets.js';match=re.search(r'spineAssets\s*=\s*([\s\S]*?);?\s*$',p.read_text(encoding='utf-8-sig'));names=json.loads(match[1].rstrip(';\r\n '));zh=read(p.parent/'names.zh.json')
 if folder=='illust':
  jp=read(ROOT/'resources/illust-jp/catalog.json')['illustrations'];names+= [r['name'] for r in jp];zh.update({r['name']:r['label'] for r in jp})
 for name in names:
  entities.append({'id':f'spine:{folder}:{name}','name':zh.get(name) or name,'aliases':[name,name.removeprefix('illust_'),'立绘' if folder=='illust' else '像素动画', '日服立绘' if name.endswith('_kong') else folder],'spine':{'folder':folder,'name':name},'kind':'spine'})
# Supplement catalogs share the same searchable routing as the legacy manifests.
supplement=ROOT/'resources/spine-expansion/catalog.json'
if supplement.exists():
 for folder,rows in read(supplement)['groups'].items():
  for row in rows:
   entities.append({'id':f"spine:{folder}:{row['name']}",'name':row['label'],'aliases':row['aliases'],'spine':{'folder':folder,'name':row['name']},'kind':'spine'})
fx=read(ROOT/'gtfx/assets/catalog.json')
for c in fx['characters']:
 data=read(ROOT/'gtfx/assets'/c['index'])
 for e in data['effects']:
  if e.get('unavailable'):continue
  entities.append({'id':f"fx:{c['id']}:{e['id']}",'name':e.get('label') or e.get('name') or e['assetName'],'aliases':[e['assetName'],c['id'],c['key'],c['name'],'特效'],'fx':{'character':c['id'],'effect':e['id']},'kind':'fx'})
result={'version':1,'sheets':sheets,'entities':entities,'counts':{'atlasSheets':len(sheets),'atlasRegions':counts,'blankPlaceholders':len(blank),'spine':sum(e['kind']=='spine' for e in entities),'fx':sum(e['kind']=='fx' for e in entities)}}
(ROOT/'resources/search-index.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'tools/search-index-audit.json').write_text(json.dumps({'counts':result['counts'],'blankPlaceholders':blank},ensure_ascii=False,indent=2),encoding='utf-8')
print(result['counts']);print('entities',len(entities))
