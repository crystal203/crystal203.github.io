"""Build FX character families from native hero origins and costume target IDs.
Keeps the source catalog intact; only the viewer's selectable character list is grouped.
"""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
# Viewer families may span source origins; native Hero/Costume IDs stay intact.
VIEW_FAMILIES=[{'origins':{1,2},'id':'knight','name':'骑士'}]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def normalize(s):return re.sub(r'_\d+$','',s or '')
def compact(s):return (s or '').replace('_','').lower()
def names(value):
 if isinstance(value,dict):return [v for v in value.values() if isinstance(v,str)]
 return [value] if isinstance(value,str) else []
def build(output=None,catalog_path=None,source=None):
 output=Path(output or ROOT/'gtfx/assets');source=Path(source or output/'native-source')
 catalog=read(Path(catalog_path or output/'catalog.json'))['characters'];heroes=[h for h in read(source/'heroes.json') if h.get('Playable')]
 all_items=read(source/'items.json');items=[i for i in all_items if i.get('Type') in ('costume','supercostume')]
 registry=json.loads((ROOT/'resources/registry.js').read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
 portrait_frames=read(ROOT/'resources/previews/portraits.json')['frames']
 by_id={h['Id']:h for h in heroes};hero_names={};costume_names={}
 for h in heroes:
  keys=[h['Name'],h.get('PortraitAssetName'),*names(h.get('SpineAssetName'))]
  for key in filter(None,keys):
   for k in [key,*re.split('[#:]',key)]:hero_names.setdefault(normalize(k),set()).add(h['OriginId'])
 for item in items:
  for key in [item['Name'],item.get('PortraitAssetName'),*names(item.get('AssetName')),*names(item.get('SpriteName'))]:
   if key:
    for k in [key,*re.split('[#:]',key)]:costume_names.setdefault(compact(k),[]).append(item)
 def entity(key):return registry['entities'].get(registry['aliases'].get(key,key),{})
 def targets(item):return {by_id[i]['OriginId'] for i in item.get('TargetCharacterIds',[]) if i in by_id}
 def strings(v):
  if isinstance(v,str):return {v}
  if isinstance(v,dict):return set().union(*(strings(x) for x in v.values()))
  if isinstance(v,list):return set().union(*(strings(x) for x in v))
  return set()
 actions=read(source/'battleactions.json');actions=actions.values() if isinstance(actions,dict) else actions
 weapon_effects={}
 for action in actions:
  origin={by_id[i['ExclusiveCharacterId']]['OriginId'] for i in all_items if i.get('ExclusiveCharacterId') in by_id and i.get('SuperBattleAction')==action.get('Name')}
  for value in strings(action):
   if value.startswith('fx_') and origin:weapon_effects.setdefault(value,set()).update(origin)
 bases=[];costumes=[];excluded=[]
 for entry in catalog:
  keys=[entry['id'],entry.get('key'),entry.get('portraitKey'),*entry.get('aliases',[])]
  origin=set().union(*(hero_names.get(normalize(k),set()) for k in keys if k))
  matched={i['Id']:i for k in keys if k for i in costume_names.get(compact(k),[])}
  if matched and not origin:
   costumes.append((entry,set().union(*(targets(i) for i in matched.values()))));continue
  pack=output/'native-characters'/f"{entry['id']}.json"
  # Exact catalog Hero/Portrait/Spine aliases own identity. Imported costume
  # appearance inventories are not evidence that different origins are one hero.
  # Only use a pack's exact default hero when catalog identity is unavailable.
  if pack.exists() and not origin:
   profile=read(pack).get('profile',{})
   origin.update(hero_names.get(normalize(profile.get('defaultSkin','')),set()))
  if origin:bases.append((entry,origin))
  else:
   manifest=read(output/entry['index']);refs=[e['preset'] for e in manifest['effects']]
   known=[weapon_effects.get(p,set()) for p in refs];owners=set().union(*known)
   if refs and all(known) and len(owners)==1:costumes.append((entry,owners))
   else:excluded.append(entry['id'])
 groups=[]
 for entry,origins in bases:
  overlaps=[g for g in groups if g['origins']&origins]
  if not overlaps:groups.append({'base':entry,'members':[entry],'origins':set(origins)})
  else:
   g=overlaps[0];g['members'].append(entry);g['origins'].update(origins)
   for other in overlaps[1:]:g['members']+=other['members'];g['origins'].update(other['origins']);groups.remove(other)
 # Explicit presentation grouping is independent of native source identity.
 for family in VIEW_FAMILIES:
  matches=[g for g in groups if g['origins']&family['origins']]
  if not matches:continue
  merged=matches[0]
  merged['base']=next((m for g in matches for m in g['members'] if m['id']==family['id']),merged['base'])
  merged['displayName']=family['name']
  merged['nativeAggregation']='appearance-source'
  for other in matches[1:]:merged['members']+=other['members'];merged['origins'].update(other['origins']);groups.remove(other)
 for entry,origins in costumes:
  matches=[g for g in groups if g['origins']&origins]
  if matches:
   for g in matches:g['members'].append(entry)
  else:excluded.append(entry['id'])
 result=[]
 for g in groups:
  base=g['base'];portraits={};aliases=set();members=g['members']
  for member in members:
   aliases.update(filter(None,[member['id'],member.get('key'),*entity(member.get('key') or member['id']).get('aliases',[]),entity(member.get('key') or member['id']).get('name')]))
  def portrait(key,kind,appearance):
   if key not in portrait_frames:return
   title=entity(appearance).get('name') or entity(key).get('name') or key
   if key not in portraits or kind=='myth':portraits[key]={'key':key,'kind':kind,'appearance':appearance,'name':title}
  rows=[h for h in heroes if h['OriginId'] in g['origins']]
  appearance_kinds={}
  for h in sorted(rows,key=lambda h:('_myth' in h['Name'],'_ascent' in h['Name'],h['Id'])):
   kind='myth' if h['Name'].endswith('_myth') else 'ascent' if h['Name'].endswith('_ascent') else 'base'
   for key in [h['Name'],*names(h.get('SpineAssetName'))]:
    for part in [key,*re.split('[#:]',key)]:
     if part:appearance_kinds[normalize(part)]=kind
   portrait(h.get('PortraitAssetName'),kind,normalize(h['Name']))
  for item in items:
   if targets(item)&g['origins']:
    aliases.update([item['Name'],entity(item['Name']).get('name',item['Name'])])
    if item.get('PortraitAssetName'):portrait(item['PortraitAssetName'],'special' if item.get('IsSpecial') else 'supercostume' if item['Type']=='supercostume' else 'costume',item['Name'])
  result.append({'id':base['id'],'key':base.get('key'),'name':g.get('displayName') or entity(base.get('key') or base['id']).get('name') or base['name'],
   **({'nativeAggregation':g['nativeAggregation']} if g.get('nativeAggregation') else {}),
   'origins':sorted(g['origins']),'members':[m['id'] for m in members],'portraits':list(portraits.values()),'appearanceKinds':appearance_kinds,'aliases':sorted(aliases)})
 result={'version':1,'characters':result,'excluded':excluded}
 (output/'character-groups.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 return result
if __name__=='__main__':
 result=build();print(json.dumps({'characters':len(result['characters']),'merged':[{'id':g['id'],'members':g['members']} for g in result['characters'] if len(g['members'])>1],'excluded':result['excluded']},ensure_ascii=False))
