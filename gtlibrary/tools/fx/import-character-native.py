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
from native_script_plans import compile_script_plan
from native_source_event_contracts import normalize_literal_effect_positions
from native_buff_vfx import compile_buff_vfx
from native_firearm_contracts import native_firearm_projectile_names
from native_style_contracts import source_style_map
from native_hero_variants import collect_weapon_hero_variants
from native_costumes import collect_costume_overrides
from native_weapon_contracts import exclusive_origin_ids, collect_weapon_rows, weapon_metadata, materialize_sprite_projectiles
from native_summons import collect_summonables
from native_material_contract import effect_materials, material_issues, effect_render_issues, validate_materials

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
arg.add_argument('--refresh-appearance',action='append',default=[],help='Collect an exact native character skeleton and atlas from its bundle')
arg.add_argument('--refresh-preset',action='append',default=[],help='Reconvert a source prefab already in the FX index')
arg.add_argument('--repair-legacy',action='store_true',help='Reconvert referenced legacy prefabs that lack native shader/material provenance')
arg.add_argument('--defer-cleanup',action='store_true',help='Keep unused managed images until the end of a multi-batch import')
arg.add_argument('--create-hero',help='Create a missing index from this exact native Hero.Name; requires one --index')
arg.add_argument('--metadata-only',action='store_true',help='Recompile actions without reconverting existing FX resources')
arg.add_argument('--source-first',action='store_true',help='Prefer supported native/source compilers per action; keep legacy plans only for unmatched actions and augments')
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
preview_policy_file=Path(__file__).with_name('preview-policies.json')
preview_policies=read(preview_policy_file) if preview_policy_file.exists() else {}
source=args.source_data
heroes=read(source/'heroes.json')
styles=read(source/'battlestyles.json')['BattleStyles']
actions=read(source/'battleactions.json')
projectiles=read(source/'projectiles.json')
options=read(source/'options.json')
buff_file=source/'buffs.json'
buff_rows=read(buff_file) if buff_file.exists() else []
buff_source={'file':str(buff_file),'sha256':hashlib.sha256(buff_file.read_bytes()).hexdigest()} if buff_file.exists() else None
pools=read(source/'objectpoolspec.json')
from native_awakening import SourceAwakening
awakening_tree=SourceAwakening(source)
source_items=read(source/'items.json') if (source/'items.json').exists() else []
hero_variant_rows=read(source/'heroes2.json') if (source/'heroes2.json').exists() else []
plan_source=read(args.output/'native-action-plans.json') if (args.output/'native-action-plans.json').exists() else {}
catalog_data=read(args.catalog)
catalog={c['id']:c for c in catalog_data['characters']}
items=read(args.items)['frames']
from native_prefab_lookup import prefab_index
all_prefabs=prefab_index(args.prefab_root)
def compact(s):return re.sub(r'[^a-z0-9]','',s.lower())
def strings(value):
 if isinstance(value,str):
  if value.lower().startswith('fx_'):yield value
 elif isinstance(value,list):
  for part in value:yield from strings(part)
 elif isinstance(value,dict):
  for part in value.values():yield from strings(part)
def fields(rows):
 return {r.get('Name',k):r.get('Preset',v) for row in rows or [] for k,v in row.items() for r in [row] if (k=='Name' and row.get('Preset')) or (k!='Name' and isinstance(v,str) and v.lower().startswith('fx_'))}
def plans_for(rows,pool_directions,character_options,compiled_actions=None):
 plans=[];source_by_action={}
 for a in rows:
  name=a['Name'];p=fields(a.get('PresetInfo'))|fields(a.get('MythPresetInfo'))
  lua_name=(a.get('LuaAddOn') or name.removeprefix('Myth'))+('SupportBattleAction.lua' if name.startswith('BasicSupport:') else 'BattleAction.lua')
  lua_root=Path(config.get('scriptRoot','E:/GTFiles/decrypted'))/'Battle'/'BattleAction'
  lua_path=lua_root/'Support'/lua_name if name.startswith('BasicSupport:') else lua_root/(name.split(':')[0]+'BattleAction.lua')
  lua=lua_path.read_text(encoding='utf8') if lua_path.exists() else ''
  source_by_action[name]=(lua,lua_path)
  compiled=compile_script_plan(a,lua,lua_path)
  if compiled:
   if compiled_actions is not None:compiled_actions.add(name)
   compile_buff_vfx(compiled,a,rows,character_options,buff_rows,lua_root)
   plans.append(compiled);continue
  if name.startswith('BasicSupport:') and 'dir_factor_table' in lua and 'get_avail_angle' in lua and 'RotateTowards' in lua:
   spin=re.search(r'spin\s*=\s*([\d.]+)',lua)
   plans.append({'id':'support','label':'连锁技能','action':name,'behavior':'paired-homing','spin':float(spin[1]),'animation':'shoot','source':str(lua_path),'sourceSha256':hashlib.sha256(lua.encode()).hexdigest()})
  elif a.get('ProjectileName') and all(k in a for k in ('PrepareDuration','RefreshDuration','RefreshDistance','LimitGuide')):
   plans.append({'id':'cwp','label':'专武技能','action':name,'exclusive':True,'behavior':'redirect-projectile','source':'native ShootHelper / prepare-refresh action fields'})
  elif name.startswith('BasicSupport:') and a.get('EffectPresetNames'):
   plans.append({'id':'support','label':'连锁技能','action':name,'sourceArrays':True})
  elif name.startswith('Myth') and p:
   if lua and "instantiate_effect(self, 'explosion'" in lua and 'function local_class:on_start' in lua:
    plans.append({'id':'myth','label':'开花技能','action':name,'mythOnly':True,'animation':'cast','events':[{'key':'explosion','anchor':'feet','directed':False}], 'source':str(lua_path),'sourceSha256':hashlib.sha256(lua.encode()).hexdigest()});continue
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
 return [normalize_literal_effect_positions(plan,*source_by_action.get(plan.get('action'),('',None))) for plan in plans]

for index_path in args.index:
 if not index_path.exists() or index_path.stem not in catalog:
  if not args.create_hero or len(args.index)!=1:raise ValueError('Missing index: use --create-hero with one exact native hero')
  selected=next(h for h in heroes if h['Name']==args.create_hero and h.get('Playable'))
  resource=re.sub(r'_(?:\d+|myth|ascent)$','',selected['Name'])
  registry=json.loads((repo/'resources/registry.js').read_text(encoding='utf8').split('=',1)[1].strip().rstrip(';'))
  entity=registry['entities'].get(registry['aliases'].get(resource,resource),{})
  char_id=index_path.stem
  entry={'id':char_id,'key':resource,'name':entity.get('name',resource),'index':str(index_path.relative_to(args.output)).replace('\\','/'),'count':0,'available':0}
  portraits=read(repo/'resources/previews/portraits.json')['frames'];portrait=selected.get('PortraitAssetName')
  if portrait in portraits:entry.update(portraitKey=portrait,portrait=portraits[portrait])
  catalog[char_id]=entry;catalog_data['characters'].append(entry)
  manifest=read(index_path) if index_path.exists() else {'format':'gt-char-fx','version':1,'camera':read(args.output/'characters/common.json')['camera'],'character':char_id,'effects':[],'textures':{},'sprites':{},'meshes':{},'motionPatched':True}
 else:manifest=read(index_path)
 char_id=manifest['character'];entry=catalog[char_id];resource=entry['key']
 # Star-level keys select an origin; all forms of that origin share the import.
 resources=[re.sub(r'_\d+$','',name) for name in [resource,*entry.get('aliases',[])] if name]
 # Match declared source origins before form names; a bare prefix can also
 # match another hero, e.g. succubus_noble or succubus_researcher.
 group_file=repo/'gtfx/assets/character-groups.json'
 groups=read(group_file).get('characters',[]) if group_file.exists() else []
 family=next((g for g in groups if char_id==g.get('id') or char_id in g.get('members',[])),None)
 seeds=[h for h in heroes if any(h.get('Name')==r or re.fullmatch(re.escape(r)+r'_(?:\d+|ascent|myth)',h.get('Name','')) for r in resources)]
 exact_origin_ids={h['OriginId'] for h in seeds if h.get('Playable')}
 origin_ids=set(family['origins']) if family else exact_origin_ids
 if family and family.get('nativeAggregation')=='appearance-source':origin_ids &= exact_origin_ids
 if not origin_ids:raise ValueError('No exact playable source origin for '+char_id)
 source_identity={'method':'declared-group-or-exact-source-form','originIds':sorted(origin_ids)}
 hero_rows=[h for h in heroes if h.get('Playable') and h.get('OriginId') in origin_ids]
 token=compact(resources[0])
 weapon_form_variants=collect_weapon_hero_variants(hero_rows,hero_variant_rows,awakening_tree)
 classes={h.get('Class') for h in hero_rows if h.get('Class')}|{v['heroClass'] for rows in weapon_form_variants.values() for v in rows.values()}
 style_rows=[s for s in styles if s.get('Class') in classes and s.get('BattleActions')]
 action_names={name for s in style_rows for field in ('BattleActions','ManualBattleActions') for name in s.get(field) or []}
 character_plan_source=plan_source.get(char_id,[])
 action_names.update(p.get('action') or p.get('augmentAction') for p in character_plan_source)
 origins={h.get('OriginId') for h in hero_rows}
 eligible_origins=exclusive_origin_ids(origins)
 costumes,costume_source=collect_costume_overrides(config,source_items,origins)
 action_names.update(w.get('SuperBattleAction') for w in source_items if w.get('ExclusiveCharacterId') in eligible_origins)
 # Follow explicit prefab references for legacy action names. A class-name
 # substring is unsafe: "china" also occurs in unrelated chefs and monsters.
 tokens={compact(r) for r in resources}
 known_presets={e['preset'] for e in manifest['effects']}
 action_rows=[a for a in actions if a.get('Name') and (a['Name'] in action_names or
              compact(a['Name'].split(':')[-1]) in tokens or compact(a['Name']) in {prefix+t+suffix for t in tokens for prefix,suffix in [('myth',''),('','support')]})]
 # Managers and options reference actions whose suffix need not match the hero.
 # Follow registry membership recursively before collecting options/prefabs.
 action_map={a['Name']:a for a in actions if a.get('Name')}
 def action_closure(rows):
  result=list(rows);seen={a['Name'] for a in result}
  def referenced(value):
   if isinstance(value,str):
    if value in action_map:yield value
   elif isinstance(value,list):
    for item in value:yield from referenced(item)
   elif isinstance(value,dict):
    for key,item in value.items():
     if key!='Name':yield from referenced(item)
  for row in result:
   for name in referenced(row):
    if name not in seen:seen.add(name);result.append(action_map[name])
  return result
 action_rows=action_closure(action_rows)
 if not action_rows:raise SystemExit(f'{char_id}: no BattleAction source rows')
 option_ids={v for a in action_rows for k in a if k.endswith('OptionId') for v in (a[k] if isinstance(a[k],list) else [a[k]]) if isinstance(v,int)}
 option_ids.update(o['OptionId'] for h in hero_rows for o in h.get('Options',[]))
 option_ids.update(o for rows in weapon_form_variants.values() for v in rows.values() for o in v['optionIds'])
 awakening_by_hero={h['Name']:awakening_tree.for_hero(h) for h in hero_rows}
 awakening_rows=[o for state in awakening_by_hero.values() for o in state['options']]
 option_ids.update(o['OptionId'] for o in awakening_rows)
 option_names={p.get('option') for p in character_plan_source}
 option_rows=[o for o in options if o.get('Id') in option_ids or o.get('Name') in option_names or o.get('Name','').startswith(resource+'_')]
 # Follow string references against the actual projectile registry, including
 # scalar ProjectileName, option overrides and recursively referenced projectiles.
 def all_strings(value):
  if isinstance(value,str):yield value
  elif isinstance(value,list):
   for item in value:yield from all_strings(item)
  elif isinstance(value,dict):
   for item in value.values():yield from all_strings(item)
 option_map={o.get('Id'):o for o in options}
 while True:
  linked={v for row in option_rows for k,v in row.items() if k.endswith('OptionId') and isinstance(v,int)}-option_ids
  if not linked:break
  option_ids.update(linked);option_rows.extend(option_map[i] for i in sorted(linked) if i in option_map)
 # CustomBattleAction options can install actions absent from BattleStyle.
 action_map={a['Name']:a for a in actions if a.get('Name')}
 installed=set(all_strings(option_rows))&action_map.keys()-{a['Name'] for a in action_rows}
 action_rows.extend(action_map[n] for n in sorted(installed))
 action_rows=action_closure(action_rows)
 for a in action_rows:
  for k,v in a.items():
   if k.endswith('OptionId'):
    for i in v if isinstance(v,list) else [v]:
     if isinstance(i,int) and i not in option_ids and i in option_map:
      option_ids.add(i);option_rows.append(option_map[i])
 summon_rows,summon_pools,summon_source=collect_summonables(option_rows,costumes,source,config)
 summon_classes={r['Class'] for r in summon_rows}
 summon_styles=[s for s in styles if s.get('Class') in summon_classes and s.get('BattleActions')]
 summon_ai_path=source/'battleais.json'
 summon_ai_rows=read(summon_ai_path) if summon_ai_path.exists() else []
 summon_ai_names={s.get('Ai') for s in summon_styles}
 summon_ais={row['Name']:row for row in summon_ai_rows if row.get('Name') in summon_ai_names}
 summon_ai_source={'file':str(summon_ai_path),'sha256':hashlib.sha256(summon_ai_path.read_bytes()).hexdigest()} if summon_ai_path.exists() else None
 summon_actions={n for s in summon_styles for n in s.get('BattleActions',[])}
 action_rows.extend(a for a in actions if a['Name'] in summon_actions and a not in action_rows)
 graphs=import_graphs(action_rows+option_rows,config)
 equipment_rows=collect_weapon_rows(source_items,hero_rows,action_rows)
 # Source default ordinary equipment also owns an actual weapon skill.
 # Follow only the chosen defaults here, not every compatible shop item.
 if not any(w.get('ExclusiveCharacterId') in eligible_origins for w in equipment_rows):
  defaults=[]
  for typ in sorted({s.get('Weapon1') for s in style_rows if s.get('ManualBattleActions')}-{None,'none','custom'}):
   candidates=sorted((w for w in equipment_rows if w.get('WeaponType')==typ and not w.get('ExclusiveCharacterId') and w.get('SortingNumber',0)>=0),key=lambda w:(w.get('Rarity',0),w['Id']))
   selected=next((w for w in candidates if isinstance(w.get('SpriteName'),dict) and w['SpriteName'].get('default') in items),None)
   if selected and selected.get('SuperBattleAction') in action_map:defaults.append(action_map[selected['SuperBattleAction']])
  action_rows=action_closure(action_rows+[a for a in defaults if a not in action_rows])
 projectile_map={p['Name']:p for p in projectiles if p.get('Name')}
 projectile_names=set(all_strings([action_rows,option_rows,graphs,costumes,equipment_rows]))&projectile_map.keys()
 fixed_projectiles=native_firearm_projectile_names(action_rows)
 if fixed_projectiles-projectile_map.keys():raise ValueError('Missing native constructor projectile rows: '+str(sorted(fixed_projectiles-projectile_map.keys())))
 projectile_names.update(fixed_projectiles)
 while True:
  linked=set(all_strings([projectile_map[n] for n in projectile_names]))&projectile_map.keys()
  if linked<=projectile_names:break
  projectile_names.update(linked)
 projectile_rows=[p for p in projectiles if p.get('Name') in projectile_names]
 # Costume presets can start with beachball_/wedding_/etc.; use registry membership, not a name prefix.
 # Source-compiled recipes can contain native constructor pool constants.
 source_pool_directions={p['PresetName']:p['Direction'] for p in pools if p.get('Direction')}
 source_plan_resolution={'policy':'legacy-compatible'}
 if args.source_first:
  source_actions=set();compiled=plans_for(action_rows,source_pool_directions,option_rows,source_actions)
  legacy=plan_source.get(char_id) or [];legacy_actions={p.get('action') for p in legacy if p.get('action') and not p.get('augmentAction')}
  character_plans=[p for p in compiled if p.get('action') in source_actions or p.get('action') not in legacy_actions]
  character_plans.extend(p for p in legacy if p.get('augmentAction') or p.get('action') not in source_actions)
  source_plan_resolution={'policy':'source-first','compiledActions':sorted(source_actions),'legacyFallbackActions':sorted(str(p.get('action') or p.get('augmentAction')) for p in legacy if p.get('augmentAction') or p.get('action') not in source_actions)}
 else:
  character_plans=plan_source.get(char_id) or plans_for(action_rows,source_pool_directions,option_rows)
 pool_plan_rows=[{k:v for k,v in plan.items() if k!='throwWeapons'} for plan in character_plans]
 referenced_presets=set(all_strings([graphs,action_rows,option_rows,projectile_rows,costumes,summon_rows,pool_plan_rows]))
 wanted=referenced_presets|{e['preset'] for e in manifest['effects']}
 pool_rows=[p for p in pools if p.get('PresetName') in wanted]+summon_pools
 # Explicit source LoadPrefab actors are export carriers, never invented pool specs.
 for plan in character_plans:
  for request in plan.get('requiredSourceEntities',[]):
   action=next(a for a in action_rows if a['Name']==plan['action']);preset=request['preset'];bundle=action[request['bundleField']];asset=action[request['assetField']]
   if not all(isinstance(v,str) and v for v in [preset,bundle,asset]):raise ValueError('Invalid explicit source entity reference')
   if preset not in {p['PresetName'] for p in pool_rows}:pool_rows.append(dict(PresetName=preset,AssetBundleName=bundle,AssetName=asset,TimeLimit=1,DisposingType='Destroy',entity=True,nativeSourceEntity=dict(action=action['Name'],bundleField=request['bundleField'],assetField=request['assetField'],sourceSha256=plan.get('sourceSha256'))))
   referenced_presets.add(preset)
 for effect in manifest['effects']:
  if effect['preset'] not in {p['PresetName'] for p in pool_rows}:
   # Old extracted indexes may key an effect by AssetName instead of PresetName.
   # Reuse its actual pool bundle when unique; preserve unmatched historical
   # entries rather than refreshing them from unrelated loaded bundles.
   matches=[p for p in pools if p.get('AssetName')==effect['assetName']]
   bundles={p.get('AssetBundleName') for p in matches}
   if len(bundles)==1 and matches:
    pool_rows.append({**matches[0],'PresetName':effect['preset']})
 # Preserve the native pool timer separately from prefab particle duration.
 # TriggeredTimeLimit starts this timer only when DisposeViaType(false) is called.
 pool_time_limits={p['PresetName']:p.get('TimeLimit',0) for p in pool_rows}
 pool_transforms={p['PresetName']:{'poolOffset':p.get('Offset',[0,0,0]),'poolInitialScale':p.get('InitialScale',[1,1,1]),'poolType':p.get('Type','Default'),'poolDirection':p.get('Direction')} for p in pool_rows}
 for effect in manifest['effects']:
  if effect['preset'] in pool_time_limits:effect['poolTimeLimit']=pool_time_limits[effect['preset']];effect.update(pool_transforms[effect['preset']])
 order={e['preset']:i for i,e in enumerate(manifest['effects'])}
 refresh=[p['PresetName'] for p in pool_rows] if args.refresh_all else list(args.refresh_preset)
 if not args.metadata_only:
  # Material provenance is mandatory, including normal incremental imports.
  # Old YAML exports do not carry shader blend state, SpriteRenderer geometry
  # or complete postprocess bindings. Repair only action dependency consumers.
  refresh.extend(e['preset'] for e in manifest['effects'] if e['preset'] in referenced_presets and
                 not e.get('unavailable') and (not e.get('sourceBundle') or effect_render_issues(e,manifest) or any(material_issues(m,manifest) for m in effect_materials(e))))
 if any(p.get('behavior')=='native-weapon' or p.get('nativeManager',{}).get('operation')=='distanceMagazine' or {'FX_single_projectile','FX_normal_arrow'}&set(p.get('requiredPoolPresets',[])) for p in character_plans):
  refresh.extend(e['preset'] for e in manifest['effects'] if e['preset'] in ['FX_single_projectile','FX_normal_arrow'] and not any(s.get('customSpriteSource') for s in e.get('scripts',[])))
 converted=0 if args.metadata_only else convert_missing(manifest,pool_rows,args.output,config,refresh)
 for row in pool_rows:
  if row.get('nativeSourceEntity'):
   for effect in manifest['effects']:
    if effect['preset']==row['PresetName']:effect['nativeSourceEntity']=row['nativeSourceEntity']
 if any(p.get('behavior')=='native-weapon' or p.get('nativeManager',{}).get('operation')=='distanceMagazine' or {'FX_single_projectile','FX_normal_arrow'}&set(p.get('requiredPoolPresets',[])) for p in character_plans):
  for e in manifest['effects']:
   if e['preset'] in pool_transforms:e.update(pool_transforms[e['preset']]);e['poolTimeLimit']=pool_time_limits[e['preset']]
  projectile_rows=materialize_sprite_projectiles(manifest,projectile_rows,required=not args.metadata_only)
  referenced_presets.update(value for p in projectile_rows if p.get('nativeSpriteTemplate') for value in [p['PresetName'],p['nativeChargePreset']])
 manifest['effects'].sort(key=lambda e:order.get(e['preset'],len(order)))
 material_fixes=0
 # Never replace missing shader state by material-name heuristics.
 manifest['materialValidation']=validate_materials(manifest,referenced_presets)
 pool_directions={p['PresetName']:p['Direction'] for p in pool_rows if p.get('Direction')}
 for effect in manifest['effects']:
  if effect['preset'] in pool_directions:effect['direction']=pool_directions[effect['preset']]
 primary=sorted((s for s in style_rows if not s['Class'].endswith('_myth') and s.get('ManualBattleActions')),
                key=lambda s:(-len(s['ManualBattleActions']),s['Name']))
 if not primary:raise SystemExit(f'{char_id}: no manual BattleStyle')
 style=primary[0]
 from native_character_spine import collect_appearance
 source_appearance_resources={v.split('#',1)[0] for h in hero_rows if isinstance(h.get('SpineAssetName'),dict) for v in [h['SpineAssetName'].get('default')] if v and ':' not in v}
 source_form_resources={h.get('SpineAssetName',{}).get('default') for h in hero_rows if h['Name'].endswith(('_ascent','_myth')) and isinstance(h.get('SpineAssetName'),dict)}-{None,''}
 side_files=[p.stem[:-5] for p in args.characters_dir.glob('*_side.bytes')]
 for appearance in args.refresh_appearance:
  if appearance not in side_files and appearance not in source_appearance_resources:raise ValueError('Appearance does not belong to selected source Hero: '+appearance)
  collect_appearance(appearance,args.characters_dir,config,args.source_cache)
 if not args.metadata_only:
  for appearance in sorted(source_form_resources | (source_appearance_resources if args.create_hero else set())):
   if not all((args.characters_dir/(appearance+'_'+view+'.bytes')).exists() for view in ('side','front','back')):
    collect_appearance(appearance,args.characters_dir,config,args.source_cache)
 side_files=[p.stem[:-5] for p in args.characters_dir.glob('*_side.bytes')]
 pattern=re.compile(r'(^|_)(?:'+'|'.join(re.escape(r) for r in resources)+r')($|_)')
 appearances=sorted(n for n in side_files if pattern.search(n) or n in source_appearance_resources)
 hero_appearances=sorted((h['Name'] for h in hero_rows if h['Name'] in appearances),key=lambda n:(n.endswith('_myth'),n))
 appearances=hero_appearances+sorted((n for n in appearances if n not in hero_appearances),key=lambda n:(n not in source_appearance_resources,n))
 if not appearances:raise SystemExit(f'{char_id}: no Spine appearance source')
 default_skin=next((h['Name'] for h in sorted(hero_rows,key=lambda h:h['Name'],reverse=True) if re.search(r'_5$',h['Name'])),appearances[0])
 weapon_type=style.get('Weapon1') or 'none';base_weapon='cwp_'+compact(resource)
 weapon=base_weapon if base_weapon in items else next((k for k in items if k.startswith('cwp_') and compact(k[4:])==token),None)
 weapon_rows=equipment_rows
 exclusive_rows=[w for w in weapon_rows if w.get('ExclusiveCharacterId') in eligible_origins]
 if exclusive_rows:
  chosen=sorted(exclusive_rows,key=lambda w:(str(w.get('Name','')).endswith('_myth'),-w.get('Rarity',0),w['Id']))[0]
  sprite=chosen.get('SpriteName',{});weapon=sprite.get('default') if isinstance(sprite,dict) else sprite
 if not weapon:
  ordinary=sorted((w for w in weapon_rows if w.get('WeaponType')==weapon_type and not w.get('ExclusiveCharacterId') and w.get('SortingNumber',0)>=0),key=lambda w:(w.get('Rarity',0),w['Id']))
  weapon=next((w.get('SpriteName',{}).get('default') for w in ordinary if isinstance(w.get('SpriteName'),dict) and w['SpriteName'].get('default') in items),None)
 weapon_by={a:weapon+'_myth' for a in appearances if a.endswith('_myth') and weapon and weapon+'_myth' in items}
 profile={'appearances':appearances,'defaultSkin':default_skin,'weapon':weapon or '',
          'weaponType':weapon_type,'weaponSlots':{'gauntlet':[1,2],'claw':[1,2],'basket':[2]}.get(weapon_type,[1]),'nativeStyle':style['Name'],'idleAnimation':style.get('CustomIdle'),
          'preferredEffect':manifest['effects'][0]['preset']}
 from native_character_spine import collect_appearance
 appearance_sources={a:read(args.source_cache/'appearances'/(a+'.json')) for a in appearances if (args.source_cache/'appearances'/(a+'.json')).exists()}
 for appearance in args.refresh_appearance:
  if appearance not in appearances and appearance not in source_appearance_resources:raise ValueError('Appearance does not belong to selected character: '+appearance)
  appearance_sources[appearance]=collect_appearance(appearance,args.characters_dir,config,args.source_cache)
 if appearance_sources:profile['appearanceSources']=appearance_sources
 profile['compatibleWeapons']={h['Name']:(h.get('CompatibleWeapons') or {}).get('default',[]) for h in hero_rows}
 profile['forms']=[{'hero':default_skin,'label':'原版'}]+[{'hero':h['Name'],'label':'开花' if h['Name'].endswith('_myth') else '觉醒'} for h in hero_rows if h['Name'].endswith(('_myth','_ascent'))]
 if weapon_by:profile['weaponByAppearance']=weapon_by
 for plan in character_plans:
  if plan.get('basicVariantByAppearance'):profile['nativeVariantByAppearance']=plan['basicVariantByAppearance']
 prefab_refs={}
 for pool in pool_rows:
  asset=pool.get('AssetName');src=all_prefabs.get(asset)
  if not src:continue
  prefab_refs[pool['PresetName']]=asset_store.archive_prefab(char_id,src,src.relative_to(args.prefab_root))
 if preview_policies.get(char_id,{}).get('defaultWeapon'):profile['weapon']=preview_policies[char_id]['defaultWeapon']
 pack={'format':'gt-native-character','version':1,'sourceResource':resource,'frameRate':30,
       'sourceIdentity':source_identity,
       'previewPolicy':preview_policies.get(char_id,{}),
       'weaponFormVariants':weapon_form_variants,'weaponFormVariantSource':{'file':'heroes2.json','sha256':hashlib.sha256((source/'heroes2.json').read_bytes()).hexdigest(),'methods':'WeaponSpec.IsNeedSpecOverride 0x670ab2c / CharacterSpec.IsOverriddenSpec 0x60e24f4 / AwakeningNodeOptions.GetOption 0x6b92860'} if hero_variant_rows else None,
       'summonables':{str(r['Id']):r for r in summon_rows},'summonStyles':{s['Name']:s for s in summon_styles},'summonSource':summon_source,'summonAis':summon_ais,'summonAiSource':summon_ai_source,
       'sourcePlanResolution':source_plan_resolution,
       'profile':profile,'plans':character_plans,'graphs':graphs,'costumes':costumes,'costumeSource':costume_source,
       'heroOptionIds':{h['Name']:sorted({o['OptionId'] for o in h.get('Options',[]) if o.get('OptionId')}|set(awakening_by_hero[h['Name']]['optionIds'])) for h in hero_rows},
       'previewAwakening':awakening_tree.provenance['policy'],'awakeningByHero':awakening_by_hero,'awakeningSource':awakening_tree.provenance,
       # CharacterSpec .ctor 0x60e554c: 0x43480000 -> MaxStamina (field +0x1f4).
       'battleDefaults':{'maxStamina':200},
       'weapons':weapon_metadata(weapon_rows,origins),
       'styles':source_style_map(style_rows),'actions':{a['Name']:a for a in action_rows},
       'projectiles':{p['Name']:p for p in projectile_rows},
       'options':{o['Name']:o for o in option_rows if o.get('Name')},
       'buffs':buff_rows,'buffSource':buff_source,
       'heroClasses':{h['Name']:h['Class'] for h in hero_rows if h.get('Class')},
       'heroElements':{h['Name']:h['ElementalType'] for h in hero_rows if h.get('ElementalType')},
       'presetDirections':pool_directions,
       'nativeSource':manifest.get('nativeSource'),
       'staticDataHashes':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ['heroes.json','battlestyles.json','battleactions.json','projectiles.json','options.json','objectpoolspec.json','awakeningnodedata.json','charactertreeconfig.json','awakeningtreenodes.json']},
       }
 write_asset_json(args.source_cache/'characters'/(char_id+'.json'),{'sourcePrefabs':prefab_refs})
 target=args.output/'native-characters'/(char_id+'.json');target.parent.mkdir(parents=True,exist_ok=True)
 target.write_text(json.dumps(json_safe(pack),allow_nan=False,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 entry['count']=len(manifest['effects'])
 entry['available']=sum(not e.get('unavailable') for e in manifest['effects'])
 for effect in manifest['effects']:
  for system in effect.get('systems',[]):system.pop('nativeEmission',None)
 for effect in manifest['effects']:
  if effect['preset'] in pool_time_limits:effect['poolTimeLimit']=pool_time_limits[effect['preset']];effect.update(pool_transforms[effect['preset']])
 asset_store.optimize(manifest)
 index_path.write_text(json.dumps(json_safe(manifest),allow_nan=False,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
 print(f'{char_id}: {len(style_rows)} styles, {len(action_rows)} actions, {len(projectile_rows)} projectiles, '
       f'{len(option_rows)} options, {len(prefab_refs)} source prefabs, {converted} converted effects, {material_fixes} material corrections -> {target}')
# Merge selected entries into the latest catalog so independent character imports
# do not overwrite another worker's completed catalog updates.
catalog_path=args.output/'catalog.json'
latest=read(catalog_path);updates={read(p)['character']:catalog[read(p)['character']] for p in args.index}
latest['characters']=[updates.pop(e['id'],e) for e in latest['characters']]+list(updates.values())
catalog_path.write_text(json.dumps(latest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')

if not args.defer_cleanup:
 asset_store.migrate_prefabs()
 asset_store.clean()
print('Shared resources:',json.dumps(asset_store.stats))

# Keep the viewer's character/costume families in sync after every import.
from build_character_groups import build as build_character_groups
build_character_groups(args.output,args.catalog,args.source_data)

# All native equipment categories, not only the first deployed characters' types.
from build_weapon_types import build as build_weapon_types
build_weapon_types(args.output,args.source_data,args.items)
