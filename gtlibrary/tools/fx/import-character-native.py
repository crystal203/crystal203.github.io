"""Import one or more FX indexes from the original StaticData in one pass.

The index selects the character. The importer discovers its hero resources,
battle styles, actions, projectile specifications, options and pool prefabs;
the browser reads the resulting per-character JSON. Raw Unity prefabs are kept
outside the web runtime roots for provenance; the browser uses converted JSON.
"""
import argparse, collections, hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path
from native_prefab_converter import convert_missing, json_safe
from native_graph import import_graphs

repo=Path(__file__).resolve().parents[2]
config_file=Path(__file__).with_name('import-config.json')
config=json.loads(config_file.read_text(encoding='utf8')) if config_file.exists() else {}
# A dependency directory and its Python ABI are one configured unit.
configured_python=config.get('pythonExecutable')
needs_allocator=config.get('pythonAllocator') and not os.environ.get('PYTHONMALLOC')
if needs_allocator or (configured_python and Path(configured_python).resolve()!=Path(sys.executable).resolve()):
 print(f'Using configured Python: {configured_python}',flush=True)
 env=dict(os.environ)
 if needs_allocator:env['PYTHONMALLOC']=config['pythonAllocator']
 raise SystemExit(subprocess.call([configured_python or sys.executable,str(Path(__file__).resolve()),*sys.argv[1:]],env=env))
arg=argparse.ArgumentParser()
arg.add_argument('--index',type=Path,nargs='+',required=True)
arg.add_argument('--python-libs',type=Path,help='Dependency directory built for the current Python ABI')
arg.add_argument('--refresh-preset',action='append',default=[],help='Reconvert a source prefab already in the FX index')
arg.add_argument('--refresh-all',action='store_true',help='Rebuild all selected characters from their original AssetBundles')
arg.add_argument('--catalog',type=Path,default=repo/'gtfx/assets/catalog.json')
arg.add_argument('--characters-dir',type=Path,default=repo/'gtasset/assets/character')
arg.add_argument('--items',type=Path,default=repo/'gtatlas/assets/items.json')
arg.add_argument('--source-data',type=Path,default=repo/'gtfx/assets/native-source')
arg.add_argument('--prefab-root',type=Path,default=config.get('prefabRoot'))
arg.add_argument('--output',type=Path,default=repo/'gtfx/assets')
arg.add_argument('--source-cache',type=Path,default=repo/'tools/fx/source-cache')
args=arg.parse_args()
if args.python_libs:config['pythonLibs']=str(args.python_libs)
if args.prefab_root is None:arg.error('set prefabRoot in import-config.json or pass --prefab-root')
args.index=[p if p.is_absolute() else repo/p for p in args.index]
for extra in config.get('pythonExtraLibs',[]):sys.path.insert(0,extra)
if config.get('pythonLibs'):sys.path.insert(0,config['pythonLibs'])
from native_asset_store import AssetStore, write as write_asset_json
asset_store=AssetStore(args.output,args.source_cache)
config['_assetStore']=asset_store
def read(path):return json.loads(path.read_text(encoding='utf8'))
source=args.source_data
heroes=read(source/'heroes.json')
styles=read(source/'battlestyles.json')['BattleStyles']
actions=read(source/'battleactions.json')
projectiles=read(source/'projectiles.json')
options=read(source/'options.json')
pools=read(source/'objectpoolspec.json')
awakening=read(source/'awakeningnodedata.json') if (source/'awakeningnodedata.json').exists() else {}
source_items=read(source/'items.json') if (source/'items.json').exists() else []
plan_source=read(args.output/'native-action-plans.json') if (args.output/'native-action-plans.json').exists() else {}
catalog_data=read(args.catalog)
catalog={c['id']:c for c in catalog_data['characters']}
items=read(args.items)['frames']
all_prefabs={p.stem:p for p in args.prefab_root.rglob('*.prefab')}
def source_material_modes(names):
 """Resolve native material blending from Unity's shader and blend fields."""
 found=collections.defaultdict(set)
 for path in args.prefab_root.rglob('*.mat'):
  if path.stem not in names:continue
  raw=path.read_text(encoding='utf8',errors='ignore')
  shader=re.search(r'm_Shader:\s*\{fileID:\s*(\d+)',raw)
  def number(key):
   match=re.search(r'(?m)^\s*'+re.escape(key)+r':\s*(\d+)',raw)
   return int(match[1]) if match else None
  pair=(number('_BlendA'),number('_BlendB'))
  if pair==(5,1):mode='add'
  elif pair==(5,10):mode='alpha'
  elif shader and shader[1]=='10720':mode='add' # native Particles/Additive
  elif shader and shader[1]=='10721':mode='alpha' # native Particles/Alpha Blended
  elif number('_DstBlend')==1:mode='add'
  elif number('_DstBlend')==10:mode='alpha'
  else:continue
  found[path.stem].add(mode)
 return {name:next(iter(modes)) for name,modes in found.items() if len(modes)==1}
def normalize_materials(manifest):
 names={mat.get('name') for effect in manifest['effects'] for system in effect.get('systems',[])+effect.get('statics',[])
        for mat in [system.get('material'),system.get('trailMaterial'),*(system.get('materials') or [])] if mat}
 modes=source_material_modes(names)
 changed=0
 for effect in manifest['effects']:
  for system in effect.get('systems',[])+effect.get('statics',[]):
   for mat in [system.get('material'),system.get('trailMaterial'),*(system.get('materials') or [])]:
    if mat and 'nativeBlend' not in mat and mat.get('name') in modes and mat.get('blend')!=modes[mat['name']]:
     mat['blend']=modes[mat['name']];changed+=1
 return changed
def compact(s):return re.sub(r'[^a-z0-9]','',s.lower())
def strings(value):
 if isinstance(value,str):
  if value.startswith('fx_'):yield value
 elif isinstance(value,list):
  for part in value:yield from strings(part)
 elif isinstance(value,dict):
  for part in value.values():yield from strings(part)
def fields(rows):
 return {r.get('Name',k):r.get('Preset',v) for row in rows or [] for k,v in row.items() for r in [row] if (k=='Name' and row.get('Preset')) or (k!='Name' and isinstance(v,str) and v.startswith('fx_'))}
def plans_for(rows,pool_directions):
 plans=[]
 for a in rows:
  name=a['Name'];p=fields(a.get('PresetInfo'))|fields(a.get('MythPresetInfo'))
  if name.startswith('BasicSupport:') and a.get('EffectPresetNames'):
   plans.append({'id':'support','label':'连锁技能','action':name,'sourceArrays':True})
  elif name.startswith('Myth') and p:
   events=[{'key':k,'phaseField':'HitTiming' if 'explosion' in k or 'hit' in k else None,'directed':False} for k in p]
   for e in events:
    if e['phaseField'] is None:e.pop('phaseField')
   plans.append({'id':'myth','label':'开花技能','action':name,'mythOnly':True,'animation':'cast','events':events})
  elif name.startswith('Cwp') and p:
   events=[]
   for k in p:
    # EffectPool rotates only presets with a source Direction vector.
    variants=[row.get('Preset') for key in ('PresetInfo','MythPresetInfo') for row in a.get(key,[]) if row.get('Name')==k]
    e={'key':k,'directed':any(preset in pool_directions for preset in variants)}
    if k=='screen':e.update(screen=True,phaseFrameField='SpineEventFrame',phaseIndex=0)
    elif k=='range':e.update(phaseFrameField='SpineEventFrame',phaseIndex=1)
    elif k=='target':e.update(anchor='target',phaseFrameField='SubEventFrame',phaseIndex=1)
    events.append(e)
   plans.append({'id':'cwp','label':'专武技能','action':name,'exclusive':True,'animation':(a.get('AnimationInfo') or [{}])[0].get('Name','action'),'events':events})
 return plans

for index_path in args.index:
 manifest=read(index_path)
 char_id=manifest['character'];entry=catalog[char_id];resource=entry['key'];token=compact(resource)
 resources=[resource,*entry.get('aliases',[])]
 hero_rows=[h for h in heroes if any(h.get('Name')==r or h.get('Name','').startswith(r+'_') for r in resources)]
 classes={h.get('Class') for h in hero_rows if h.get('Class')}
 style_rows=[s for s in styles if s.get('Class') in classes and s.get('BattleActions')]
 action_names={name for s in style_rows for field in ('BattleActions','ManualBattleActions') for name in s.get(field) or []}
 character_plan_source=plan_source.get(char_id,[])
 action_names.update(p.get('action') or p.get('augmentAction') for p in character_plan_source)
 origins={h.get('OriginId') for h in hero_rows}
 action_names.update(w.get('SuperBattleAction') for w in source_items if w.get('ExclusiveCharacterId') in origins)
 # Follow explicit prefab references for legacy action names. A class-name
 # substring is unsafe: "china" also occurs in unrelated chefs and monsters.
 tokens={compact(r) for r in resources}
 known_presets={e['preset'] for e in manifest['effects']}
 action_rows=[a for a in actions if a.get('Name') and (a['Name'] in action_names or
              any(t in compact(a['Name']) for t in tokens))]
 if not action_rows:raise SystemExit(f'{char_id}: no BattleAction source rows')
 graphs=import_graphs(action_rows,config)
 option_ids={a[k] for a in action_rows for k in ('OptionId','MythOptionId','AscentOptionId','CwpOptionId') if isinstance(a.get(k),int)}
 option_ids.update(o['OptionId'] for h in hero_rows for o in h.get('Options',[]))
 awakening_rows=[o for o in awakening.get('NodeOptions',[]) if o.get('OriginId') in origins]
 option_ids.update(o['OptionId'] for o in awakening_rows)
 option_names={p.get('option') for p in character_plan_source}
 option_rows=[o for o in options if o.get('Id') in option_ids or o.get('Name') in option_names or o.get('Name','').startswith(resource+'_')]
 projectile_names={n for a in action_rows for key in ('ProjName','MythProjName','ProjectileInfo') for value in (a.get(key) or []) for n in ([value] if isinstance(value,str) else [value.get('Name')] if isinstance(value,dict) else []) if n}
 projectile_rows=[p for p in projectiles if p.get('Name') in projectile_names or p.get('Name','').startswith(resource+'_proj')]
 wanted=set(strings(graphs))|set(strings(action_rows))|set(strings(option_rows))|set(strings(projectile_rows))|{e['preset'] for e in manifest['effects']}
 pool_rows=[p for p in pools if p.get('PresetName') in wanted]
 for effect in manifest['effects']:
  if effect['preset'] not in {p['PresetName'] for p in pool_rows}:
   pool_rows.append({'PresetName':effect['preset'],'AssetName':effect['assetName'],'AssetBundleName':None,'TimeLimit':effect.get('duration')})
 order={e['preset']:i for i,e in enumerate(manifest['effects'])}
 refresh=[p['PresetName'] for p in pool_rows] if args.refresh_all else args.refresh_preset
 converted=convert_missing(manifest,pool_rows,args.output,config,refresh)
 manifest['effects'].sort(key=lambda e:order.get(e['preset'],len(order)))
 material_fixes=normalize_materials(manifest)
 pool_directions={p['PresetName']:p['Direction'] for p in pool_rows if p.get('Direction')}
 for effect in manifest['effects']:
  if effect['preset'] in pool_directions:effect['direction']=pool_directions[effect['preset']]
 primary=sorted((s for s in style_rows if not s['Class'].endswith('_myth') and s.get('ManualBattleActions')),
                key=lambda s:(-len(s['ManualBattleActions']),s['Name']))
 if not primary:raise SystemExit(f'{char_id}: no manual BattleStyle')
 style=primary[0]
 side_files=[p.stem[:-5] for p in args.characters_dir.glob('*_side.bytes')]
 pattern=re.compile(r'(^|_)(?:'+'|'.join(re.escape(r) for r in resources)+r')($|_)')
 appearances=sorted(n for n in side_files if pattern.search(n))
 hero_appearances=sorted((h['Name'] for h in hero_rows if h['Name'] in appearances),key=lambda n:(n.endswith('_myth'),n))
 appearances=hero_appearances+[n for n in appearances if n not in hero_appearances]
 if not appearances:raise SystemExit(f'{char_id}: no Spine appearance source')
 default_skin=next((h['Name'] for h in sorted(hero_rows,key=lambda h:h['Name'],reverse=True) if re.search(r'_5$',h['Name'])),appearances[0])
 weapon_type=style.get('Weapon1') or 'none';base_weapon='cwp_'+compact(resource)
 weapon=base_weapon if base_weapon in items else next((k for k in items if k.startswith('cwp_') and compact(k[4:])==token),None)
 weapon_rows=[w for w in source_items if w.get('SuperBattleAction') in {a['Name'] for a in action_rows} and w.get('ExclusiveCharacterId') in {h.get('OriginId') for h in hero_rows}]
 if weapon_rows:
  chosen=sorted(weapon_rows,key=lambda w:(str(w.get('Name','')).endswith('_myth'),-w.get('Rarity',0),w['Id']))[0]
  sprite=chosen.get('SpriteName',{});weapon=sprite.get('default') if isinstance(sprite,dict) else sprite
 weapon_by={a:weapon+'_myth' for a in appearances if a.endswith('_myth') and weapon and weapon+'_myth' in items}
 profile={'appearances':appearances,'defaultSkin':default_skin,'weapon':weapon or '',
          'weaponType':weapon_type,'weaponSlots':{'gauntlet':[1,2],'basket':[2]}.get(weapon_type,[1]),'nativeStyle':style['Name'],
          'preferredEffect':manifest['effects'][0]['preset']}
 if weapon_by:profile['weaponByAppearance']=weapon_by
 character_plans=plan_source.get(char_id) or plans_for(action_rows,pool_directions)
 for plan in character_plans:
  if plan.get('basicVariantByAppearance'):profile['nativeVariantByAppearance']=plan['basicVariantByAppearance']
 prefab_refs={}
 for pool in pool_rows:
  asset=pool.get('AssetName');src=all_prefabs.get(asset)
  if not src:continue
  prefab_refs[pool['PresetName']]=asset_store.archive_prefab(char_id,src,src.relative_to(args.prefab_root))
 pack={'format':'gt-native-character','version':1,'sourceResource':resource,'frameRate':30,
       'profile':profile,'plans':character_plans,'graphs':graphs,
       'heroOptionIds':{h['Name']:sorted({o['OptionId'] for o in h.get('Options',[]) if o.get('OptionId')}|({o['OptionId'] for o in awakening_rows if o.get('OriginId')==h.get('OriginId')} if h.get('Rank')==6 else set())) for h in hero_rows},
       'previewAwakening':'full for Rank 6',
       'weapons':{(w.get('SpriteName') or {}).get('default',w['Name']):{'action':w['SuperBattleAction'],'optionIds':[o['OptionId'] for o in w.get('StaticOptions',[])]} for w in weapon_rows},
       'styles':{s['Name']:s for s in style_rows},'actions':{a['Name']:a for a in action_rows},
       'projectiles':{p['Name']:p for p in projectile_rows},
       'options':{o['Name']:o for o in option_rows if o.get('Name')},
       'heroClasses':{h['Name']:h['Class'] for h in hero_rows if h.get('Class')},
       'presetDirections':pool_directions,
       'nativeSource':manifest.get('nativeSource'),
       'staticDataHashes':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ['heroes.json','battlestyles.json','battleactions.json','projectiles.json','options.json','objectpoolspec.json']},
       }
 write_asset_json(args.source_cache/'characters'/(char_id+'.json'),{'sourcePrefabs':prefab_refs})
 target=args.output/'native-characters'/(char_id+'.json');target.parent.mkdir(parents=True,exist_ok=True)
 target.write_text(json.dumps(json_safe(pack),allow_nan=False,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 entry['count']=len(manifest['effects'])
 entry['available']=sum(not e.get('unavailable') for e in manifest['effects'])
 for effect in manifest['effects']:
  for system in effect['systems']:system.pop('nativeEmission',None)
 asset_store.optimize(manifest)
 index_path.write_text(json.dumps(json_safe(manifest),allow_nan=False,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 print(f'{char_id}: {len(style_rows)} styles, {len(action_rows)} actions, {len(projectile_rows)} projectiles, '
       f'{len(option_rows)} options, {len(prefab_refs)} source prefabs, {converted} converted effects, {material_fixes} material corrections -> {target}')
(args.output/'catalog.json').write_text(json.dumps(catalog_data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')

asset_store.migrate_prefabs()
asset_store.clean()
print('Shared resources:',json.dumps(asset_store.stats))
