"""Audit declared linked-action FX consumers without rendering or changing assets.

The report separates incomplete legacy-export provenance from confirmed field
contradictions. It enumerates imported dependency data, not appearance/facing
combinations, pixels, or visual acceptance.
"""
import argparse, collections, datetime, hashlib, json, pathlib, re, subprocess, sys
from native_material_contract import effect_render_issues, material_issues

ROOT=pathlib.Path(__file__).resolve().parents[2] if len(pathlib.Path(__file__).resolve().parents)>2 else pathlib.Path.cwd()
DEPENDENCY_SECTIONS=('actions','plans','graphs','projectiles','options','costumes','summonables','summonStyles')
FOUR_GAIN_SHADERS={
 'Effect/Mask_Additive_Tint_2Tex','Effect/Mask_Additive_Tint_2Tex_Top',
 'Effect/Mask_Additive_Blend_2Tex','Effect/Mask_Additive_Blend_2Tex_Top',
}
SCREEN_SHADERS={'Effect/Screen/PP_CABWDB','Effect/Screen/CA_BW_Distort'}
EXTERNAL_OWNER={'legendaryhero':'external-user-agent'}

def walk_strings(value,path):
 if isinstance(value,str):yield value,path
 elif isinstance(value,list):
  for i,part in enumerate(value):yield from walk_strings(part,f'{path}[{i}]')
 elif isinstance(value,dict):
  for key,part in value.items():yield from walk_strings(part,f'{path}.{key}')

def materials(effect):
 for kind in ('systems','statics'):
  for i,part in enumerate(effect.get(kind,[])):
   # Match createMesh: a material array replaces the single-material fallback.
   defs=part.get('materials') or [part.get('material')]
   if not (kind=='systems' and (part.get('emitterOnly') or part.get('renderer',{}).get('mode')==5)):
    for slot,mat in enumerate(defs):
     if mat:yield mat,{'kind':kind,'index':i,'name':part.get('name'),'node':part.get('node'),'slot':slot}
   if kind=='systems' and part.get('modules',{}).get('TrailModule') and part.get('trailMaterial'):
    yield part['trailMaterial'],{'kind':'trails','index':i,'name':part.get('name'),'node':part.get('node'),'slot':0}

def repair_known_gains(report,root,history_path):
 """Repair only source-proven shader constants on declared effect consumers."""
 targets=collections.defaultdict(lambda:collections.defaultdict(set));external=[]
 for consumer in report['fourGainConsumers']:
  if consumer['colorGain']==4:continue
  if consumer['character'] in EXTERNAL_OWNER or consumer['indexCharacter'] in EXTERNAL_OWNER:
   external.append(consumer);continue
  targets[consumer['indexCharacter']][consumer['preset']].add(consumer['character'])
 changes=[]
 for member,presets in sorted(targets.items()):
  path=root/'gtfx/assets/characters'/(member+'.json');raw=path.read_bytes();before_hash=hashlib.sha256(raw).hexdigest();relative=path.relative_to(root).as_posix()
  if before_hash!=report['inputHashes'][relative]:raise RuntimeError('Input changed after audit; rerun before repair: '+relative)
  manifest=json.loads(raw.decode('utf-8-sig'));rows=[]
  for effect in manifest.get('effects',[]):
   if effect['preset'] not in presets:continue
   for kind in ('systems','statics'):
    for i,part in enumerate(effect.get(kind,[])):
     definitions=[]
     if part.get('material'):definitions.append(('material',part['material']))
     definitions.extend((f'materials[{j}]',mat) for j,mat in enumerate(part.get('materials',[])))
     if part.get('trailMaterial'):definitions.append(('trailMaterial',part['trailMaterial']))
     for slot,mat in definitions:
      if mat.get('shader') not in FOUR_GAIN_SHADERS or mat.get('colorGain')==4:continue
      rows.append({'preset':effect['preset'],'consumingCharacters':sorted(presets[effect['preset']]),'location':f'{kind}[{i}].{slot}',
                   'material':mat.get('name'),'shader':mat['shader'],'beforeGain':mat.get('colorGain'),'beforeGainPresent':'colorGain' in mat,'afterGain':4})
      mat['colorGain']=4
  if not rows:continue
  after=(json.dumps(manifest,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n').encode('utf8')
  path.write_bytes(after);changes.append({'path':relative,'beforeSha256':before_hash,'afterSha256':hashlib.sha256(after).hexdigest(),'changes':rows})
 history={'format':'gtfx-known-material-gain-repair','version':1,'repairedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'rule':'APK GLES for the listed shader variants outputs COLOR * Tint * MainTex2 * Mask * MainTex * 4 in RGBA.',
          'shaderVariants':sorted(FOUR_GAIN_SHADERS),'scope':'Declared imported action dependency consumers; external-owned character data is read-only.',
          'beforeAuditSummary':report['summary'],'files':changes,'skippedExternalConsumers':external,
          'changedFiles':len(changes),'changedMaterialRecords':sum(len(f['changes']) for f in changes)}
 if history_path.is_file():
  previous=json.loads(history_path.read_text(encoding='utf-8-sig'))
  # An idempotent retry must not erase the original before/after evidence.
  if not changes:return history
  history['previousRuns']=[*previous.get('previousRuns',[]),{k:v for k,v in previous.items() if k!='previousRuns'}]
 history_path.parent.mkdir(parents=True,exist_ok=True);history_path.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 return history

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--repo',type=pathlib.Path,default=ROOT)
 parser.add_argument('--repair-known-gains',action='store_true',help='Explicitly repair the source-proven four-gain shader variants, then rerun the read-only audit')
 parser.add_argument('--repair-history',type=pathlib.Path,help='Repair history JSON; defaults to docs/fx-material-gain-repair.json')
 parser.add_argument('--output',type=pathlib.Path,help='Write a report; otherwise print summary only')
 parser.add_argument('--source-probes',type=pathlib.Path,help='Optional native-source numeric probes; fresh index SHA is required to classify their findings')
 args=parser.parse_args();root=args.repo.resolve();assets=root/'gtfx/assets';snapshots={}
 def load(path):
  path=path.resolve();raw=path.read_bytes();snapshots[path.relative_to(root).as_posix()]=hashlib.sha256(raw).hexdigest()
  return json.loads(raw.decode('utf-8-sig'))
 catalog=load(assets/'catalog.json')['characters'];entries={e['id']:e for e in catalog}
 family_data=load(assets/'character-groups.json');families={g['id']:g for g in family_data['characters']}
 pool_rows=load(assets/'native-source/objectpoolspec.json');pool_names={row['PresetName'] for row in pool_rows};pool_by_name={row['PresetName']:row for row in pool_rows}
 source_hashes={}
 for path in [root/p for p in ['gtfx/core.js','gtfx/native-screen-material.js','gtfx/material-blend.js','gtfx/action-player.js','gtfx/native-stage-shadow.js','gtfx/script-actions.js','gtfx/native-melee-operations.js','tools/fx/native_prefab_converter.py','tools/fx/native_material_contract.py','tools/fx/import-character-native.py']]:
  if path.exists():source_hashes[path.relative_to(root).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
 core=(root/'gtfx/core.js').read_text(encoding='utf8');helper_path=root/'gtfx/native-screen-material.js'
 helper=helper_path.read_text(encoding='utf8') if helper_path.exists() else ''
 helper_integrated=bool(re.search(r'fragment\s*=\s*nativeScreenFragment\s*\(\s*mat\s*\)',core))
 helper_input_decode='sampleColor.rgb/sampleColor.a' in helper
 helper_output_encode='gl_FragColor.rgb*=gl_FragColor.a' in helper
 helper_framebuffer_coverage='nativeScreenPos.xy/nativeScreenPos.w' in helper
 source_probes=[]
 if args.source_probes:
  source_probes=json.loads(args.source_probes.read_text(encoding='utf-8-sig'))
 for probe in source_probes:
  index=assets/'characters'/(probe['character']+'.json')
  probe['freshIndexSnapshot']=index.is_file() and hashlib.sha256(index.read_bytes()).hexdigest()==probe.get('indexSha256')
  probe['snapshotStatus']='current' if probe['freshIndexSnapshot'] else 'historical-not-counted-as-current-defect'
 probe_by_effect={(p['character'],p['preset']):p for p in source_probes if p.get('freshIndexSnapshot')}
 manifest_cache={};characters=[];all_records=[];issue_summary=collections.defaultdict(lambda:{'characterIds':set(),'effectKeys':set(),'instances':0,'confidence':None})
 raw_consumers=[];four_gain_consumers=[];sprite_consumers=[];simulation_counts=collections.Counter()
 contract_counts=collections.Counter();pool_metadata_candidates=[]
 for pack_path in sorted((assets/'native-characters').glob('*.json')):
  cid=pack_path.stem;pack=load(pack_path);family=families.get(cid)
  # Use the same first-preset-wins merge order as character-catalog.js.
  members=(family or {}).get('members',[cid]);effect_by_preset={};effect_by_asset={}
  for member in members:
   entry=entries.get(member)
   if not entry:continue
   if member not in manifest_cache:manifest_cache[member]=load(assets/entry['index'])
   manifest=manifest_cache[member]
   for effect in manifest.get('effects',[]):
    if effect['preset'] in effect_by_preset:continue
    effect_by_preset[effect['preset']]=(effect,member,manifest)
    effect_by_asset.setdefault(effect.get('assetName'),(effect,member,manifest))
  references=collections.defaultdict(list)
  for section in DEPENDENCY_SECTIONS:
   for value,path in walk_strings(pack.get(section),section):
    if (value in pool_names or value in effect_by_preset or value in effect_by_asset) and not re.search(r'\.(?:key|action|augmentAction|category|id|label)$',path):references[value].append(path)
  selected={};missing=[]
  for name,paths in references.items():
   match=effect_by_preset.get(name) or effect_by_asset.get(name)
   if not match:
    missing.append({'reference':name,'referencePaths':paths[:6],'referencePathCount':len(paths)});continue
   effect,member,manifest=match
   record=selected.setdefault(effect['preset'],{'effect':effect,'indexCharacter':member,'manifest':manifest,'referenceNames':[],'referencePaths':[]})
   record['referenceNames'].append(name);record['referencePaths'].extend(paths)
  char_summary={'id':cid,'name':(family or entries.get(cid) or {}).get('name',cid),'owner':EXTERNAL_OWNER.get(cid,'this-workstream'),
   'indexMembers':members,'declaredReferences':len(references),'resolvedEffectConsumers':len(selected),'unavailableEffects':[],
   'unresolvedReferences':missing,'issues':{}}
  char_issue_effects=collections.defaultdict(set)
  for preset,selected_row in sorted(selected.items()):
   effect=selected_row['effect'];member=selected_row['indexCharacter'];manifest=selected_row['manifest']
   if effect.get('unavailable'):
    char_summary['unavailableEffects'].append(preset);continue
   legacy=not bool(effect.get('sourceBundle'));findings=[]
   def issue(code,confidence,detail):
    findings.append({'code':code,'confidence':confidence,'detail':detail});char_issue_effects[code].add(preset)
    total=issue_summary[code];total['characterIds'].add(cid);total['effectKeys'].add((cid,preset));total['instances']+=1;total['confidence']=confidence
   for script in effect.get('scripts',[]):
    if script.get('fields',{}).get('m_Enabled',1) and script.get('type') in ('CustomSprite','StageShadowSetter'):contract_counts['enabled'+script['type']]+=1
   pool=pool_by_name.get(preset)
   if pool:
    contract_counts['sourcePoolMatchedEffects']+=1
    for field,source_field in [('dispose','DisposingType'),('poolTimeLimit','TimeLimit')]:
     if field not in effect:
      if field=='poolTimeLimit':pool_metadata_candidates.append({'character':cid,'preset':preset,'indexCharacter':member,'dispose':effect.get('dispose'),'sourceTimeLimit':pool.get(source_field,0),'status':'missing_metadata_requires_consumer_source_check_not_visual_failure'})
     elif effect[field]!=pool.get(source_field,0):issue('pool_metadata_differs_source','confirmed-data-mismatch',{'field':field,'actual':effect[field],'expected':pool.get(source_field,0)})
     else:contract_counts[field+'SourceMatches']+=1
   render_issues=effect_render_issues(effect,manifest)
   if render_issues:issue('native_renderer_contract_incomplete','confirmed-data-mismatch',render_issues)
   if legacy:issue('legacy_effect_without_native_source','risk','No per-effect sourceBundle; this is a legacy-conversion indicator, not proof of a visual defect.')
   missing_shader=[];missing_blend=[];gain_mismatch=[];screen_missing=[]
   material_count=0
   for mat,location in materials(effect):
    material_count+=1;contract_counts['materialInstances']+=1;description={**location,'material':mat.get('name')}
    if mat.get('name')!='white':
     if not mat.get('shader'):missing_shader.append(description)
     if not isinstance(mat.get('nativeBlend'),list) or len(mat['nativeBlend'])!=2:missing_blend.append(description)
    contract_issues=[error for error in material_issues(mat,manifest) if error not in ('missing native shader','missing native blend factors','native two-texture RGBA multiplier must be 4','missing native screen fragment')]
    if contract_issues:issue('native_material_contract_incomplete','confirmed-data-mismatch',{**description,'errors':contract_issues})
    shader=mat.get('shader','')
    if shader in FOUR_GAIN_SHADERS:
     row={'character':cid,'preset':preset,'indexCharacter':member,**description,'shader':shader,'colorGain':mat.get('colorGain'),'expected':4}
     four_gain_consumers.append(row)
     if mat.get('colorGain')!=4:gain_mismatch.append(row)
    if shader in SCREEN_SHADERS or mat.get('surface')=='screenDistortion':
     native_exported=mat.get('surface')=='screenDistortion' and bool(mat.get('fragmentSource'))
     covered=native_exported and helper_integrated and helper_input_decode and helper_output_encode and (shader!='Effect/Screen/PP_CABWDB' or helper_framebuffer_coverage)
     raw_consumers.append({'character':cid,'preset':preset,'indexCharacter':member,**description,'shader':shader,'nativeFragmentExported':native_exported,'helperCovered':covered,'nativeBlend':mat.get('nativeBlend')})
     if mat.get('surface')!='screenDistortion' or not mat.get('fragmentSource'):screen_missing.append(description)
     elif not covered:issue('raw_screen_composition_unprotected','confirmed-runtime-gap',description)
   if missing_shader:issue('material_missing_native_shader','risk',missing_shader)
   if missing_blend:issue('material_missing_native_blend','risk',missing_blend)
   if gain_mismatch:issue('two_texture_gain_not_native','confirmed-data-mismatch',gain_mismatch)
   if screen_missing:issue('screen_shader_not_exported','confirmed-data-mismatch',screen_missing)
   sprite_risks=[]
   for i,part in enumerate(effect.get('statics',[])):
    if not part.get('sprite') or part.get('customSprite'):continue
    sprite=manifest.get('sprites',{}).get(part['sprite'],{});sr=part.get('spriteRenderer')
    evidence={'character':cid,'preset':preset,'indexCharacter':member,'node':part.get('node'),'name':part.get('name'),
      'size':part.get('size'),'spritePixels':sprite.get('size'),'pixelsToUnits':sprite.get('pixelsToUnits'),'spriteRendererRecorded':bool(sr),'pivotRecorded':'pivot' in part}
    sprite_consumers.append(evidence)
    if not sr and not effect.get('skeletons'):
     # A legacy 1x1 record can be legitimate. It is never auto-resized by audit.
     if part.get('size')==[1,1]:sprite_risks.append(evidence)
   if sprite_risks:issue('legacy_sprite_size_unverified','risk',sprite_risks)
   probe=probe_by_effect.get((cid,preset),{})
   proven_sprite=[p for p in probe.get('sourceChecks',[]) if p.get('kind')=='sprite-renderer-size' and p.get('mismatch')]
   proven_space=[p for p in probe.get('sourceChecks',[]) if p.get('kind')=='particle-space' and p.get('mismatch')]
   if proven_sprite:issue('sprite_size_differs_native_source','confirmed-source-mismatch',proven_sprite)
   if proven_space:issue('simulation_space_differs_native_source','confirmed-source-mismatch',proven_space)
   conflicts=[];missing_space=[]
   for i,system in enumerate(effect.get('systems',[])):
    space=system.get('simulationSpace');local=system.get('local');simulation_counts['systems']+=1
    if space is None:
     simulation_counts['missingSpace']+=1;missing_space.append({'index':i,'name':system.get('name'),'node':system.get('node'),'local':local})
    else:
     simulation_counts['space'+str(space)]+=1
     if space in (0,1,2) and isinstance(local,bool) and local!=(space==0):
      conflicts.append({'index':i,'name':system.get('name'),'node':system.get('node'),'simulationSpace':space,'local':local,'expectedLocal':space==0})
   if conflicts:issue('simulation_space_conflicts_local_flag','confirmed-data-mismatch',conflicts)
   if missing_space:issue('simulation_space_not_recorded','risk',missing_space)
   if findings:
    record={'character':cid,'preset':preset,'indexCharacter':member,'owner':char_summary['owner'],'sourceBundle':effect.get('sourceBundle'),
      'referenceNames':sorted(set(selected_row['referenceNames'])),'referencePathCount':len(selected_row['referencePaths']),
      'referencePaths':selected_row['referencePaths'][:6],'materialInstances':material_count,'findings':findings}
    all_records.append(record)
  char_summary['issues']={code:len(presets) for code,presets in sorted(char_issue_effects.items())};characters.append(char_summary)
 changed=[path for path,digest in snapshots.items() if hashlib.sha256((root/path).read_bytes()).hexdigest()!=digest]
 summary={'charactersAudited':len(characters),'resolvedEffectConsumers':sum(c['resolvedEffectConsumers'] for c in characters),
  'charactersWithFindings':sum(bool(c['issues']) for c in characters),'unresolvedDeclaredReferences':sum(len(c['unresolvedReferences']) for c in characters),
  'sourceFilesChangedDuringAudit':changed,
  'issues':{code:{'confidence':row['confidence'],'characters':len(row['characterIds']),'effects':len(row['effectKeys']),'instances':row['instances'],'characterIds':sorted(row['characterIds'])} for code,row in sorted(issue_summary.items())},
  'rawScreenMaterialInstances':len(raw_consumers),'rawScreenProtectedInstances':sum(r['helperCovered'] for r in raw_consumers),
  'contractCoverage':dict(contract_counts),'missingPoolTimeLimitCandidates':len(pool_metadata_candidates),
  'fourGainMaterialInstances':len(four_gain_consumers),'spriteStaticInstances':len(sprite_consumers),'simulationSpace':dict(simulation_counts)}
 report={'format':'gtfx-linked-material-audit','version':1,'generatedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
  'scope':'All existing native character packages, using declared imported action dependency references and viewer index merge order.',
  'auditScriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
  'limits':['No rendering, screenshots, pixels, appearance/facing enumeration, or visual acceptance.','Legacy provenance and omitted fields are risks requiring source checks; they are not automatically visual failures.','Optional graph branches are included as declared consumers, without claiming every branch executes in one preview.','legendaryhero is read-only and owned by an external user agent.'],
  'poolMetadataCandidates':pool_metadata_candidates,
  'runtimeProtection':{'helperIntegrated':helper_integrated,'grabInputUnpremultiply':helper_input_decode,'screenOutputPremultiply':helper_output_encode,'fixedNativeAlphaUsesFramebufferCoverage':helper_framebuffer_coverage},
  'summary':summary,'characters':characters,'effectFindings':all_records,'rawScreenConsumers':raw_consumers,
  'fourGainConsumers':four_gain_consumers,'spriteConsumers':sprite_consumers,'sourceProbes':source_probes,'inputHashes':snapshots,'runtimeSourceHashes':source_hashes}
 history_path=args.repair_history or root/'docs/fx-material-gain-repair.json'
 if not history_path.is_absolute():history_path=root/history_path
 if args.repair_known_gains:
  if changed:raise RuntimeError('Inputs changed during audit; rerun before repair')
  history=repair_known_gains(report,root,history_path)
  print(json.dumps({'repairApplied':True,'changedFiles':history['changedFiles'],'changedMaterialRecords':history['changedMaterialRecords'],'externalOwnedConsumersSkipped':len(history['skippedExternalConsumers'])},ensure_ascii=False),flush=True)
  command=[sys.executable,str(pathlib.Path(__file__).resolve()),'--repo',str(root),'--repair-history',str(history_path)]
  if args.output:command.extend(['--output',str(args.output)])
  if args.source_probes:command.extend(['--source-probes',str(args.source_probes)])
  raise SystemExit(subprocess.call(command))
 if history_path.is_file():report['knownGainRepairHistory']=json.loads(history_path.read_text(encoding='utf-8-sig'))
 if args.output:
  output=args.output if args.output.is_absolute() else root/args.output;output.parent.mkdir(parents=True,exist_ok=True)
  output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()

