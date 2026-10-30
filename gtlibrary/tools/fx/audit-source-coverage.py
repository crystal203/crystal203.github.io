"""Read-only Lua recipe feature/dispatch audit. Never executes Lua or renders images.

All source branches are inventory, not an assertion that every branch must play.
Independent idiom compilers are probed with the *same* action to expose shadowing.
This is deliberately a bounded call scanner, not an incomplete Lua interpreter.
"""
import argparse, collections, hashlib, importlib.util, json, re, sys
from pathlib import Path

REPOSITORY_ROOT=Path(__file__).resolve().parents[2]

def sha(data): return hashlib.sha256(data).hexdigest()

def plan_source_kind(plan):
    source=plan.get('source','')
    if source.startswith('native ARM64') or plan.get('behavior')=='native-soundwave':return 'native-CSharp'
    return 'Lua' if Path(source).suffix.lower()=='.lua' else 'unclassified-reference'

def load_module(path, name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

def mask_comments(text):
    # Preserve offsets/newlines and quoted strings. Long bracket comments included.
    out=list(text); i=0
    while i<len(text):
        if text[i] in "'\"":
            quote=text[i]; i+=1
            while i<len(text):
                if text[i]=='\\': i+=2; continue
                if text[i]==quote: i+=1; break
                i+=1
        elif text.startswith('--',i):
            m=re.match(r'--\[(=*)\[',text[i:])
            if m:
                close=']'+m.group(1)+']'; end=text.find(close,i+len(m.group(0))); end=len(text) if end<0 else end+len(close)
            else:
                end=text.find('\n',i); end=len(text) if end<0 else end
            for n in range(i,end):
                if out[n]!='\n': out[n]=' '
            i=end
        else:i+=1
    return ''.join(out)

FEATURES={
    'move':r'\b(?:CS\.Oak\.MoveOneFrameStageLogic\.ExecuteMove|battle_util\.melee_short_dash|character_util\.(?:melee_short_dash|move_one_frame)|self\.owner:(?:Move|SetPosition))\s*\(',
    'jump':r'\b(?:character_util\.jump|self\.owner:Jump)\s*\(',
    'spine':r'\b(?:spine_util\.(?:set_[\w]+)|character_util\.spine_[\w]+|[\w.]+:(?:SetAnimation|AddAnimation|Rotate|RotateTo|MoveTo|ScaleTo|SetAlphaFade|SetSkin))\s*\(',
    'routine':r'\b(?:[\w.]+:(?:StartRoutine|StartIndependentRoutine|StartCoroutine)|routine_util\.[\w]+)\s*\(',
    'projectile':r'\b(?:shoot_helper_util\.(?:shoot[\w]*|create)|projectile_util\.[\w]+)\s*\(',
    'recoil':r'\bcharacter_util\.recoil[\w]*\s*\(',
    'option':r'\bbattle_util\.(?:parse_option_param|parse_option_data|parse_myth_option_data|parse_myth_option|parse_cwp_option|parse_special_option)[\w]*\s*\(',
}

def source_inventory(raw, arguments, effect_calls):
    text=mask_comments(raw); funcs=list(re.finditer(r'\bfunction\s+([\w.:]+)\s*\(',text))
    def context(pos):
        prev=next((m for m in reversed(funcs) if m.start()<pos),None)
        return prev.group(1) if prev else '<module>'
    features={}
    for key,pattern in FEATURES.items():
        rows=[]
        for m in re.finditer(pattern,text):
            args,end=arguments(text,m.end())
            rows.append(dict(line=text.count('\n',0,m.start())+1,function=context(m.start()),call=text[m.start():m.end()-1].strip(),arguments=args))
        features[key]=rows
    effects=effect_calls(text)
    effect_args=[]
    for m in re.finditer(r'\bbattle_util\.(instantiate_effect|instantiate_screen_effect)\s*\(',text):
        args,end=arguments(text,m.end());effect_args.append(args)
    for row,args in zip(effects,effect_args):
        pos=args[2].strip() if 'screen' not in row['function'] and len(args)>2 else ''
        row['positionExpression']=pos
        row['positionClass']=next((label for label,expressions in {
            'ownerFeet':['character_util.get_position(self.owner)','self.owner.Position','battle_util.get_ground_pos(character_util.get_position(self.owner))'],
            'ownerCenter':['bounds_util.get_center(self.owner)'],
            'targetGround':['character_util.get_position(self.target)','self.target.Position','battle_util.get_ground_pos(character_util.get_position(self.target))'],
            'target':['bounds_util.get_center(self.target)'],
        }.items() if pos in expressions), 'screen' if 'screen' in row['function'] else 'expression-binding-unknown')
    for row in effects:
        pos=sum(len(s)+1 for s in text.split('\n')[:row['line']-1]); row['ownerFunction']=context(pos)
    # Explicit coroutine method definitions and calls are evidence even when the
    # engine's registration API is supplied indirectly by a state helper.
    routines=[dict(function=m.group(1),line=text.count('\n',0,m.start())+1) for m in funcs if 'routine' in m.group(1).lower()]
    option_fields=[]
    for m in re.finditer(r"cs_util\.(?:get_\w+_from_dictionary|get_\w+_array_from_dictionary)\s*\(",text):
        args,end=arguments(text,m.end())
        if len(args)>1 and ('option' in args[0] or 'myth_param' in args[0]):
            option_fields.append(dict(line=text.count('\n',0,m.start())+1,parameter=args[0],field=args[1]))
    return dict(effects=effects,features=features,routineDefinitions=routines,optionFields=option_fields)

def values(value):
    if isinstance(value,dict):
        for v in value.values():yield from values(v)
    elif isinstance(value,list):
        for v in value:yield from values(v)
    elif isinstance(value,str):yield value

# Hash-pinned, operation-specific output contracts live beside this tool in
# source-coverage-output-schemas.json. Never infer a whole file's effect keys.
def helper_output_inventory(plan, action=None, source=None, options=None):
    # A reviewed schema is specific to an operation and pins every consumer it
    # relies on. A changed runtime/compiler invalidates evidence automatically.
    manifest=REPOSITORY_ROOT/'tools/fx/source-coverage-output-schemas.json'
    descriptors=json.loads(manifest.read_bytes())['contracts'] if manifest.is_file() else []
    for descriptor in descriptors:
        if not all(plan.get(k)==v for k,v in descriptor['selector'].items()):continue
        checks=[]
        for relative,expected in descriptor['dependencies'].items():
            path=REPOSITORY_ROOT/relative
            actual=sha(path.read_bytes()) if path.is_file() else None
            checks.append(dict(path=relative,expectedSha256=expected,sha256=actual,valid=actual==expected))
        failures=[c['path'] for c in checks if not c['valid']]
        failures += ['plan.'+k for k in descriptor.get('requiredPlanFields',[]) if k not in plan]
        failures += ['action.'+k for k in descriptor.get('requiredActionFields',[]) if k not in (action or {})]
        bound_keys=[]
        for field in descriptor.get('effectKeyPlanFields',[]):
            value=plan
            for component in field.split('.'):value=value.get(component) if isinstance(value,dict) else None
            if not isinstance(value,str):failures.append('effect key field plan.'+field)
            else:bound_keys.append(value)
        if source is not None:
            failures += ['source guard: '+s for s in descriptor.get('sourceGuardAll',[]) if s not in mask_comments(source)]
            if plan.get('sourceSha256')!=sha(source.encode()):failures.append('compiled source hash')
        elif descriptor.get('sourceGuardAll'):failures.append('Lua source unavailable')
        evidence={**descriptor,'schemaSha256':sha(json.dumps(descriptor,sort_keys=True,separators=(',',':')).encode()),
            'dependencyChecks':checks,'valid':not failures,'invalidReasons':failures,'effectKeys':[]}
        if failures:return evidence
        keys=set(descriptor.get('effectKeys',[]))|set(bound_keys)
        if descriptor.get('effectKeyGenerator')=='charge-variants':
            rule=plan['nativeCharge'];times=action[rule['levelTimesField']]
            suffixes=['']
            by_id={o.get('Id'):o for o in (options or {}).values()}
            ids=action.get('MythOptionId',[]);ids=ids if isinstance(ids,list) else [ids]
            if any(i in by_id and not by_id[i].get('IsCwpOption') for i in ids):suffixes.append('_myth')
            for suffix in suffixes:
                keys.update(k+suffix for k in rule['slashKeys'])
                if len(times)>1:keys.add('charge'+suffix)
                keys.update('lv'+str(i+1)+suffix for i,t in enumerate(times) if i+1<len(times) or action[rule['maximumField']]>t)
        evidence['effectKeys']=sorted(keys)
        return evidence
    return None


def recipe_inventory(plan, action=None, source=None, options=None):
    strings=set(values({k:v for k,v in plan.items() if k not in ['source','sourceSha256','poolRules','poolSourceSha256','buffRules']}))
    support={
      'move':bool(plan.get('moves') or plan.get('sourceMoves') or plan.get('roleJump')),
      'jump':bool(plan.get('spine') or plan.get('roleJump')),
      'spine':bool(plan.get('spine') or any(x in strings for x in ['skeletonClips','skeletonAnimation']) or any(k in json.dumps(plan) for k in ['skeletonAnimation','skeletonClips','skeletonAlpha','skeletonOffsetPath','skeletonSkin'])),
      'recoil':any(plan.get(k) for k in ['nativeRecoil','nativeRecoils','recoils','recoilByFacing']),
      'projectile':bool(plan.get('shots') or plan.get('breakShots') or any('projectile' in e.get('op','') for e in plan.get('events',[]))),
      'routine':False,
      # Parsing or merging an option does not prove all its effect/buff branches.
      'option':False,
    }
    helper_output=helper_output_inventory(plan,action,source,options)
    if helper_output and helper_output.get('valid'):
        support.update(helper_output['features'])
        strings.update(helper_output['effectKeys'])
    # These helpers generate operations internally. Mark uncertainty explicitly;
    # do not infer absence from an empty events/moves array.
    helper=bool(plan.get('pattern') not in [None,'effect-at-start','scheduled-projectiles','direct-projectile'] or plan.get('behavior') not in ['timeline','source-projectile-pattern'])
    return dict(strings=sorted(strings),features=support,helperGenerated=helper,helperOutput=helper_output)


def declarative_consumer_evidence(plan):
    if not plan.get('meleeTimeline'):return None
    files=['gtfx/script-actions.js','gtfx/melee-timeline.js']
    dependencies=[dict(path=p,sha256=sha((REPOSITORY_ROOT/p).read_bytes())) for p in files]
    contract=dict(schema='gt-fx-declarative-consumer-v1',selector=dict(meleeTimeline=True),
        consumer='scriptActionModules -> buildMeleeTimeline',dependencies=dependencies,
        bindings=dict(moves='moves/breakMoves -> actor.graphPath with exact at/end boundaries',
            jump='spine[].at/duration/height/aerialDuration/allowAdd -> actor.spinePath; cancelJumpAtEnd',
            skin='skinPath[].at/end/skinField -> actor.skinPath',clips='clips/breakClips -> actor.clips'),
        emittedFields=[k for k in ['moves','breakMoves','spine','skinPath','clips','breakClips'] if plan.get(k)],
        limitation='Animation clips and vertical spinePath do not prove aim-point IK, alpha, or independent entity Spine calls.')
    return {**contract,'schemaSha256':sha(json.dumps(contract,sort_keys=True,separators=(',',':')).encode())}

COMPILERS=[('persistent-area','native_script_persistent_area','compile_persistent_area_plan'),('party-heal','native_source_event_contracts','compile_party_heal_support_plan'),('sky-barrage','native_script_sky_barrage','compile_sky_barrage_plan'),('fixed-clock','native_source_event_contracts','compile_fixed_clock_myth_plan'),('charge','native_script_charge','compile_charge_plan'),('weapon','native_script_weapon_actions','compile_weapon_action_plan'),('orbit','native_script_orbit_cards','compile_orbit_cards_plan'),('projectile','native_script_projectiles','compile_projectile_pattern'),('managed-melee','native_script_managed_melee','compile_managed_melee_plan'),('martial','native_martial_plans','compile_martial_plan'),('melee','native_script_melee','compile_melee_plan'),('complex','native_complex_plans','compile_complex_plan')]

def dispatch_candidates(action,lua,path):
    rows=[];errors=[]
    for label,module,fn in COMPILERS:
        try:
            plan=getattr(__import__(module),fn)(action,lua,path)
            if plan:
                inv=recipe_inventory(plan,action,lua)
                rows.append(dict(compiler=label,behavior=plan.get('behavior'),pattern=plan.get('pattern'),features=inv['features'],literalKeys=sorted(set(c.get('key') for c in plan.get('events',[]) if c.get('key'))|set((inv.get('helperOutput') or {}).get('effectKeys',[])))))
        except Exception as error:errors.append(dict(compiler=label,error=type(error).__name__+': '+str(error)))
    return rows,errors


def action_reachability(raw, action, inventory):
    """Prove only the bounded enum-dispatch idiom; leave every other row live.

    This is not a Lua interpreter. In particular, source literals are never
    deleted and unknown conditions/indirect references disable the exclusion.
    """
    text=mask_comments(raw);selected=action.get('AttackType')
    result=dict(effects=list(inventory['effects']),features={k:list(v) for k,v in inventory['features'].items()},
        excludedEffects=[],excludedFeatures=[],evidence=[])
    assignment=re.search(r"local\s+(\w+)\s*=\s*cs_util\.get_string_from_dictionary\(\s*param\s*,\s*['\"]AttackType['\"]\s*\)\s*self\.attack_type\s*=\s*self\.action_type\[\1\]",text)
    table=re.search(r'self\.action_type\s*=\s*\{([^}]+)\}',text)
    if not assignment or not table or not isinstance(selected,str):return result
    enum=set(re.findall(r'\b(\w+)\s*=\s*\d+',table[1]))
    if selected not in enum or len(re.findall(r'\bself\.attack_type\s*=(?!=)',text))!=1:return result
    if re.search(r'\bself\s*\[',text):return result
    funcs=list(re.finditer(r'\bfunction\s+([\w.:]+)\s*\(',text))
    def owner(pos):
        return next((m.group(1) for m in reversed(funcs) if m.start()<pos),None)
    def condition_values(condition):
        clauses=re.split(r'\s+or\s+',condition.strip());values=[]
        for clause in clauses:
            m=re.fullmatch(r'self\.attack_type\s*==\s*self\.action_type\.(\w+)',clause.strip())
            if not m or m[1] not in enum:return None
            values.append(m[1])
        return values
    dispatch={}
    for m in re.finditer(r'\b(?:if|elseif)\s+([^\n]+?)\s+then\s*self:(\w+)\s*\(',text):
        allowed=condition_values(m[1]);caller=owner(m.start())
        if allowed is None or not caller:continue
        function=caller.rsplit(':',1)[0]+':'+m[2]
        dispatch.setdefault(function,[]).append((m,allowed))
    excluded={}
    for function,guards in dispatch.items():
        method=function.rsplit(':',1)[1]
        calls=list(re.finditer(r'\bself:'+re.escape(method)+r'\s*\(',text))
        definitions=[m for m in funcs if m[1]==function]
        # Any unguarded call, duplicate definition or function-value reference
        # makes this proof unavailable rather than guessing at a call graph.
        references=list(re.finditer(r'\b'+re.escape(method)+r'\b',text))
        if len(calls)!=len(guards) or len(definitions)!=1 or len(references)!=len(calls)+1:continue
        if any(selected in allowed for _,allowed in guards):continue
        evidence=dict(kind='source-enum-dispatch',field='AttackType',value=selected,function=function,
            sourceAssignmentLine=text.count('\n',0,assignment.start())+1,
            guardLines=[text.count('\n',0,m.start())+1 for m,_ in guards],
            allowedValues=sorted({v for _,allowed in guards for v in allowed}))
        excluded[function]=evidence;result['evidence'].append(evidence)
    for row in inventory['effects']:
        if row.get('ownerFunction') in excluded:
            result['effects'].remove(row);result['excludedEffects'].append(dict(row,evidence=excluded[row['ownerFunction']]))
    for feature,rows in inventory['features'].items():
        for row in rows:
            evidence=excluded.get(row['function'])
            # A single-call jump guard is also provable inside a shared update.
            if not evidence and feature=='jump':
                for m in re.finditer(r'\bif\s+([^\n]+?)\s+then\s*(character_util\.jump\([^\n]+\))\s*end\b',text):
                    allowed=condition_values(m[1])
                    if allowed is not None and selected not in allowed and text.count('\n',0,m.start(2))+1==row['line']:
                        evidence=dict(kind='source-single-call-guard',field='AttackType',value=selected,
                            guardLine=text.count('\n',0,m.start())+1,allowedValues=allowed)
                        result['evidence'].append(evidence);break
            if evidence:
                result['features'][feature].remove(row);result['excludedFeatures'].append(dict(row,feature=feature,evidence=evidence))
    return result

def audit(root):
    global REPOSITORY_ROOT
    REPOSITORY_ROOT=root
    sys.path.insert(0,str(root/'tools/fx'))
    direction=load_module(root/'tools/fx/audit-direction-contracts.py','coverage_direction')
    progress=json.loads((root/'docs/fx-restoration-progress.json').read_text(encoding='utf-8'))
    reviewed_path=root/'tools/fx/source-coverage-reviewed-contracts.json'
    reviewed=json.loads(reviewed_path.read_text(encoding='utf-8'))['contracts'] if reviewed_path.is_file() else []
    heroes={x['characterId']:x for x in progress['heroes']}
    rows=[];snapshots=[];sources={};certain=[];conflicts=[];helper_unknown=[];gaps=[];probe_errors=[];hero_rows=[];native_rows=[]
    for path in sorted((root/'gtfx/assets/native-characters').glob('*.json')):
        raw=path.read_bytes();pack=json.loads(raw);snapshots.append(dict(path=str(path),sha256=sha(raw))); character=path.stem
        info=heroes.get(character,{}); totals=collections.Counter(); options=pack.get('options',{}); options_by_id={o.get('Id'):o for o in options.values()}
        for plan in pack.get('plans',[]):
            source_path=Path(plan.get('source','')); base=dict(character=character,action=plan.get('action'),behavior=plan.get('behavior'),pattern=plan.get('pattern'))
            action=pack.get('actions',{}).get(plan.get('action'),{})
            if plan_source_kind(plan)!='Lua' or not source_path.is_file():
                if plan_source_kind(plan)=='native-CSharp':
                    native_rows.append({**base,'sourceKind':'native-CSharp','source':plan['source'],
                        'sourceSha256':plan.get('sourceSha256'),'helperOutput':helper_output_inventory(plan,action,options=options),
                        'coverage':'registered native contract inventory; excluded from Lua compiler probing and Lua source counts'})
                continue
            text=source_path.read_text(encoding='utf-8-sig');data=source_path.read_bytes();key=str(source_path)
            if key not in sources:sources[key]=dict(sha256=sha(data),inventory=source_inventory(text,direction.arguments,direction.calls))
            inv=sources[key]['inventory']; recipe=recipe_inventory(plan,action,text,options)
            reachable=action_reachability(text,action,inv)
            candidates,errors=dispatch_candidates(action,text,source_path)
            row={**base,'sourceKind':'Lua','source':key,'sourceSha256':sha(data),'compiledSourceSha256':plan.get('sourceSha256'),'sourceFeatures':{k:len(v) for k,v in inv['features'].items()},'routineDefinitions':inv['routineDefinitions'],'optionFields':inv['optionFields'],'recipeFeatures':recipe['features'],'helperGenerated':recipe['helperGenerated'],'helperOutput':recipe['helperOutput'],'candidates':candidates}
            missing_keys=sorted({c['key'] for c in reachable['effects'] if c.get('key') and c['key'] not in recipe['strings']})
            absent=[k for k,v in reachable['features'].items() if v and not recipe['features'].get(k)]
            # Vertical spine motion is not a binding for source aim-point IK.
            # Keep that call unproven even when another Spine operation exists.
            unproven_calls=[v for v in reachable['features']['spine'] if v['call']=='spine_util.set_aim_point']
            if unproven_calls and 'spine' not in absent:absent.append('spine')
            row['featureCallsRequiringSeparateBinding']=unproven_calls
            row['sourceReachability']={k:v for k,v in reachable.items() if k not in ['effects','features']}
            row['allSourceLiteralKeys']=sorted({c['key'] for c in inv['effects'] if c.get('key')})
            row['reachableSourceLiteralKeys']=sorted({c['key'] for c in reachable['effects'] if c.get('key')})
            row['reachableSourceFeatures']={k:len(v) for k,v in reachable['features'].items()}
            row['recipeConsumerEvidence']=declarative_consumer_evidence(plan)
            row.update(unboundLiteralKeys=missing_keys,featureBindingsUnproven=absent)
            rows.append(row); totals['sourcePlans']+=1
            for field in ['events','breakEvents']:
                for index,event in enumerate(plan.get(field,[])):
                    if event.get('op','effect')!='effect' or event.get('screen') or any(k in event for k in ['height','heightByFacing','positionRule','bone','link','followSpine']):continue
                    calls=[c for c in inv['effects'] if c.get('key')==event.get('key')]
                    classes={c['positionClass'] for c in calls}
                    anchor=event.get('anchor','center');actual={'feet':'ownerFeet','center':'ownerCenter','target':'target','targetGround':'targetGround'}.get(anchor)
                    if len(classes)==1 and 'expression-binding-unknown' not in classes and 'screen' not in classes and actual and actual not in classes:
                        certain.append({**base,'source':key,'error':'Unambiguous source position disagrees with declarative event anchor','key':event.get('key'),'eventField':field,'eventIndex':index,'sourcePositionClass':next(iter(classes)),'compiledPositionClass':actual,'sourceLines':[c['line'] for c in calls]});totals['certain']+=1
            if errors:probe_errors.append({**base,'errors':errors})
            if len(candidates)>1:
                conflict={**base,'source':key,'candidates':candidates}; conflicts.append(conflict);totals['dispatchConflicts']+=1
                # A current shallow declarative recipe demonstrably lacks a
                # same-input, source-specific compiler's emitted operations.
                lost=[k for k in ['move','jump'] if not recipe['features'][k] and any(c['features'][k] for c in candidates)]
                if lost and plan.get('pattern')=='effect-at-start':
                    certain.append({**conflict,'error':'Shallow effect-at-start shadows same-action source-specific movement/jump recipe','missingFeatures':lost});totals['certain']+=1
            for contract in reviewed:
                if contract['character']!=character or contract['action']!=plan.get('action'):continue
                if contract['sourceSha256']!=sha(data):
                    gaps.append({**base,'reason':'Reviewed evidence invalidated by source hash change','contract':contract});continue
                missing=[]
                if contract['kind']=='fixed-events':
                    for e in contract['events']:
                        matches=[v for v in plan.get('events',[]) if v.get('key')==e['key']]
                        if not any(v.get('at',0)==e['at'] for v in matches):missing.append(e)
                else:
                    missing += [dict(feature=k) for k in contract['features'] if not recipe['features'][k]]
                    missing += [dict(key=k) for k in contract['effectKeys'] if k not in recipe['strings']]
                if missing and not recipe['helperGenerated']:
                    certain.append({**base,'source':key,'error':'Reviewed source contract is absent or mistimed in declarative recipe','missing':missing,'contract':contract});totals['certain']+=1
                row['reviewedContract']=dict(kind=contract['kind'],missing=missing,resolution=contract['resolution'])
            stale=recipe['helperOutput'] and not recipe['helperOutput'].get('valid')
            if missing_keys or absent or stale:
                target=helper_unknown if recipe['helperGenerated'] else gaps
                target.append({**base,'source':key,'unboundLiteralKeys':missing_keys,'featureBindingsUnproven':absent,
                    'schemaInvalidReasons':recipe['helperOutput'].get('invalidReasons',[]) if stale else [],
                    'classification':'helper-binding-unknown' if recipe['helperGenerated'] else 'candidate',
                    'reason':'Missing binding is not automatically a bug. All unexcluded source branches remain possible; option parsing and unrelated Spine output do not certify branch behavior.'});totals['reviewRows']+=1
        manager_signals=[]
        for name,a in pack.get('actions',{}).items():
            if not isinstance(a,dict):continue
            fields={k:a[k] for k in ['ComboAction','ExtraAction','OptionId','MythOptionId','ShootDist','ProjName','MythProjName','ReloadDuration','Columns','ShootTerm','BuffName','TriggerStack','ChargeLevel','ChargeDuration','StaminaPerAction'] if k in a}
            ids=a.get('OptionId',[]);ids=ids if isinstance(ids,list) else [ids]
            option_signals=[]
            for oid in ids:
                o=options_by_id.get(oid,{})
                visual={k:v for k,v in o.items() if re.search('Shoot|Proj|Reload|Column|Dash|Jump|Preset|Animation|ExtraAction|ComboAction|Summon|MaxTarget|BuffName',k)}
                if visual:option_signals.append(dict(id=oid,name=o.get('Name'),className=o.get('Class'),fields=visual))
            if fields or option_signals:manager_signals.append(dict(action=name,fields=fields,optionSignals=option_signals,sourceKind='Lua' if a.get('UseScript') else 'graph' if name.startswith('Graph') else 'native-CSharp-or-data',coverage='signal inventory only; no native branch verdict'))
        option_inventory=[]
        for o in options.values():
            if o.get('Class') in ['Lua','Graph'] or any(k in o for k in ['EnhanceActionName','TargetEffectPreset','ShootDist','ReloadDuration','ExtraAction']):
                fields={k:v for k,v in o.items() if re.search('Shoot|Proj|Reload|Column|Dash|Jump|Preset|Animation|ExtraAction|ComboAction|EnhanceAction|TargetEffect|GraphName|ScriptName|BuffName',k)}
                option_inventory.append(dict(id=o.get('Id'),name=o.get('Name'),className=o.get('Class'),fields=fields,classification='option-entry-point-review-pending'))
        if character in heroes:hero_rows.append(dict(character=character,name=info['name'],status=info['status'],counts=dict(totals),graphs=len(pack.get('graphs',{})),nativeManagerOptionSignals=manager_signals,optionEntryPoints=option_inventory))
    present={h['character'] for h in hero_rows}
    for character,info in heroes.items():
        if character not in present:hero_rows.append(dict(character=character,name=info['name'],status=info['status'],counts={},graphs=0,nativeManagerOptionSignals=[],optionEntryPoints=[],packAbsent=True))
    tool_paths=[root/'tools/fx'/f'{module}.py' for _,module,_ in COMPILERS]+[root/'tools/fx/native_script_plans.py',root/'gtfx/script-actions.js',root/'gtfx/script-projectile-patterns.js',root/'gtfx/native-sky-barrage.js',root/'docs/fx-restoration-progress.json',Path(__file__),reviewed_path,root/'tools/fx/source-coverage-output-schemas.json',root/'gtfx/melee-timeline.js']
    tool_snapshots=[dict(path=str(p),sha256=sha(p.read_bytes())) for p in tool_paths if p.is_file()]
    return dict(schema=2,scope='All existing native-character Lua-referenced plans, with native CSharp contracts inventoried separately; current progress hero summaries. Static only. Legendaryhero read-only inventory.',rules={'certainty':'Same-action compiler shadow with absent movement/jump; unambiguous direct source-position versus declarative anchor; or source-hash-pinned manually reviewed timing/feature contract. Other missing literals/features are candidates or helper-binding unknown.','branches':'Full source inventory is retained. Only exact source-enum dispatch and single-call guards may exclude a row for the action AttackType; all other branches remain possible. No claim that every effect plays on one path.','graphs':'Graph presence is counted, graph semantic completeness is not certified.','native':'Native C# option fields are signals; native ARM64 recipes are inventoried separately, never assigned a Lua source or sent through Lua compiler probes.', 'options':'Option parsing/metadata alone never closes option branches. Hash-pinned helper schemas bind only explicitly reviewed operations; remaining option fields stay unknown.','guard':'Require candidate compiler uniqueness or explicit reviewed precedence; shallow effect-only compilers should reject move/jump/spine/routine operations they cannot bind.'},counts=dict(packs=len(snapshots),sourcePlans=len(rows),nativeContractPlans=len(native_rows),uniqueLuaSources=len(sources),certainErrors=len(certain),dispatchConflicts=len(conflicts),candidates=len(gaps),helperBindingUnknown=len(helper_unknown),compilerProbeErrors=len(probe_errors),outputSchemaInvalid=sum(bool(p.get('helperOutput') and not p['helperOutput'].get('valid')) for p in rows+native_rows),reviewedLuaOutputPlans=sum(bool(p.get('helperOutput') and p['helperOutput'].get('valid')) for p in rows)),inputSnapshots=snapshots,toolSnapshots=tool_snapshots,sourceSnapshots=sources,plans=rows,nativeContractPlans=native_rows,certainErrors=certain,dispatchConflicts=conflicts,candidates=gaps,helperBindingUnknown=helper_unknown,compilerProbeErrors=probe_errors,heroes=hero_rows)

def markdown(report):
    out=['# Source recipe coverage audit','', 'Static inventory only: build/menu presence does not prove mechanism completeness. Source branches are listed without claiming they all execute on one path.','', 'Counts: `'+json.dumps(report['counts'],ensure_ascii=False)+'`','', '| Hero | State | Lua plans | Conflicts | Review rows | Graphs |','|---|---|---:|---:|---:|---:|']
    for h in report['heroes']:
        c=h['counts'];out.append('| '+h['name']+' (`'+h['character']+'`) | '+h['status']+' | '+str(c.get('sourcePlans',0))+' | '+str(c.get('dispatchConflicts',0))+' | '+str(c.get('reviewRows',0))+' | '+str(h['graphs'])+' |')
    out+=['','## Certain compiler losses','']
    for r in report['certainErrors']:out.append('- `'+r['character']+' / '+r['action']+'`: '+r['error']+'; '+(r['sourcePositionClass']+' -> '+r['compiledPositionClass'] if 'sourcePositionClass' in r else str(r.get('missingFeatures',r.get('missing')))))
    out+=['','## Source coverage review details','']
    for h in report['heroes']:
        if h['status']!='source-coverage-review-pending':continue
        out+=['### '+h['name']+' (`'+h['character']+'`)','']
        relevant=[r for r in report['plans'] if r['character']==h['character']]
        if not relevant:out.append('No source-referenced Lua recipe. Graph/native branch verification remains separate; this audit cannot certify completeness.')
        for r in relevant:
            out.append('- `'+r['action']+'`: '+('helper binding unknown; ' if r['helperGenerated'] else 'declarative; ')+'unbound source literal keys='+str(r['unboundLiteralKeys'])+'; features requiring binding='+str(r['featureBindingsUnproven'])+'.')
        sig=[s for s in h['nativeManagerOptionSignals'] if s['optionSignals']]
        for s in sig:
            out.append('- Option signals for `'+s['action']+'`: '+ '; '.join(str(o['id'])+' '+str(o['name'])+' '+','.join(o['fields']) for o in s['optionSignals'])+'. Branch execution is unproven by this inventory.')
        for o in h['optionEntryPoints']:
            out.append('- Option entry point `'+str(o['name'])+'` ('+str(o['className'])+'): '+','.join(o['fields'])+'. Source trigger/helper binding needs review.')
        out.append('')
    out+=['## Reviewed output and reachability evidence','','Helper output schemas pin operation selectors, required fields, source guards and consumer/compiler SHA-256. A changed dependency invalidates that schema. All source literals remain in sourceSnapshots and allSourceLiteralKeys, including unreachable-per-action and still-unbound keys. Native ARM64 plans have a separate nativeContractPlans inventory. Option parsing never implies all option branches are implemented.','', '## Follow-up contract guard','','Use independent candidate probing as a CI static check. Resolve overlapping matches with explicit reviewed precedence. Reject shallow effect-only matching when source contains unbound actor move/jump operations. For dynamic key/helper/routine output, add an explicit source-feature binding manifest rather than treating source literals as required simultaneous effects.','', 'No pixel/screenshot/facing sweep performed. No package/hero data modified.']
    return '\n'.join(out)+'\n'

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=Path.cwd());ap.add_argument('--output',type=Path,required=True);ap.add_argument('--markdown',type=Path);ap.add_argument('--fail-on-certain',action='store_true');ap.add_argument('--fail-on-stale-evidence',action='store_true');args=ap.parse_args()
    report=audit(args.root);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.markdown:args.markdown.write_text(markdown(report),encoding='utf-8')
    print(json.dumps(report['counts'],ensure_ascii=False));return 1 if (args.fail_on_certain and report['certainErrors']) or (args.fail_on_stale_evidence and report['counts']['outputSchemaInvalid']) else 0
if __name__=='__main__':sys.exit(main())

