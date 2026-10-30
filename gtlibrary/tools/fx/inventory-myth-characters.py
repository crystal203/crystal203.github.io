"""Inventory playable myth heroes by native origins, independently of FX import status."""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def inventory():
 source=ROOT/'gtfx/assets/native-source/heroes.json';heroes=read(source)
 groups=read(ROOT/'gtfx/assets/character-groups.json')['characters']
 catalog={c['id']:c for c in read(ROOT/'gtfx/assets/catalog.json')['characters']}
 rows=[]
 for hero in heroes:
  if not hero.get('Playable') or not hero['Name'].endswith('_myth'):continue
  group=next((g for g in groups if hero['OriginId'] in g['origins']),None)
  entry=catalog.get(group['id']) if group else None
  path=ROOT/'gtfx/assets/native-characters'/((entry['id'] if entry else '?')+'.json')
  pack=read(path) if path.is_file() else {}
  rows.append({'hero':hero['Name'],'originId':hero['OriginId'],'characterId':entry['id'] if entry else None,
               'name':group['name'] if group else hero['Name'],'hasIndex':bool(entry and (ROOT/'gtfx/assets'/entry['index']).is_file()),
               'hasNativePack':bool(pack),'hasNativeForm':hero['Name'] in pack.get('heroClasses',{}),
               'actions':len(pack.get('actions',{})),'graphs':len(pack.get('graphs',{}))})
 return {'format':'gtfx-myth-inventory','version':1,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
         'note':'A native pack records imported data; it does not certify all action branches or visual acceptance.',
         'counts':{'heroes':len(rows),'indexes':sum(r['hasIndex'] for r in rows),'nativePacks':sum(r['hasNativePack'] for r in rows)},'heroes':rows}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args();result=inventory()
 value=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
 if args.output:args.output.write_text(value,encoding='utf8');print(json.dumps(result['counts']))
 else:print(value,end='')
