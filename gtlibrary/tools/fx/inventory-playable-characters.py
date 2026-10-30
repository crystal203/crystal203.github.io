"""Rebuild the formal Hero roster, source-mechanism candidates and durable FX ledger.

Read-only for source/assets/runtime. Writes only the requested JSON/Markdown ledger.
Package presence, production state, source coverage and visual acceptance are independent.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
import re
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIRST_THREE = ['pirate', 'sniper', 'eighttail']
EXISTING_NONMYTH = {'hana', 'milkywaygirl', 'peimei', 'necromancer'}
PRODUCTION_STATES = {'pending', 'in-progress', 'ready-for-user-review', 'delivered', 'blocked', 'existing-native'}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key != 'Name':
                yield from strings(item)


def compact(value):
    return re.sub('[^a-z0-9]', '', value.lower())


def native_types(root, profile_path):
    """Inspect exact metadata type names, without using old address/symbol guesses."""
    if not profile_path.is_file():
        return {}, {'status': 'not-available', 'profile': str(profile_path)}
    profile = read(profile_path)
    path = Path(profile['metadata'])
    data = bytearray(path.read_bytes())
    for i in range(8, 4096, 4):
        struct.pack_into('<I', data, i, struct.unpack_from('<I', data, i)[0] ^ 0x66666666)
    source = root / 'tools/native/inspect-controller-metadata.py'
    spec = importlib.util.spec_from_file_location('fx_roster_metadata', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    metadata = module.ControllerMetadata(data)
    result = {}
    for row in metadata.types:
        if row['namespace'] != 'Oak' or not row['name'].endswith('BattleAction'):
            continue
        methods = []
        for index in range(row['methodStart'], row['methodStart'] + min(row['methodCount'], 256)):
            raw = metadata.row('methods', '<7I4H', index)
            if raw[1] == row['index'] and raw[6] & 0xff000000 == 0x06000000:
                methods.append(metadata.string(raw[0]))
        fields = []
        for index in range(row['fieldStart'], row['fieldStart'] + min(row['fieldCount'], 256)):
            raw = metadata.row('fields', '<3I', index)
            if raw[2] & 0xff000000 == 0x04000000:
                fields.append(metadata.string(raw[0]))
        result[row['name']] = {
            'fullName': row['fullName'], 'definitionIndex': row['index'], 'token': row['token'],
            'methods': methods, 'fields': fields,
        }
    return result, {'status': 'metadata-type-names-inspected', 'profile': str(profile_path),
                    'profileSha256': digest(profile_path), 'metadata': str(path),
                    'metadataSha256': digest(path), 'elfSha256': profile.get('elfSha256'),
                    'limitation': 'Exact type/member identity only. No inheritance/interface or native consumption behavior is inferred.'}


def build(args, previous):
    root = args.root.resolve()
    assets = root / 'gtfx/assets'
    source = assets / 'native-source'
    source_names = ['heroes.json', 'battlestyles.json', 'battleactions.json', 'items.json', 'options.json']
    tables = {name: read(source / name) for name in source_names}
    heroes = tables['heroes.json']
    playable = [h for h in heroes if h.get('Playable')]
    formal = [h for h in playable if h.get('SummonCategory') not in (None, 'None') and h.get('BattleClass')]
    formal_origins = {h['OriginId'] for h in formal}
    by_name = {h['Name']: h for h in playable}
    groups = read(assets / 'character-groups.json')['characters']
    catalog = {c['id']: c for c in read(assets / 'catalog.json')['characters']}
    styles = tables['battlestyles.json']['BattleStyles']
    action_map = {a['Name']: a for a in tables['battleactions.json']}
    options = {o['Id']: o for o in tables['options.json']}
    config = read(root / 'tools/fx/import-config.json')
    script_root = Path(config['scriptRoot']) / 'Battle/BattleAction'
    registry = json.loads((root / 'resources/registry.js').read_text('utf8').split('=', 1)[1].strip().rstrip(';'))

    def title(hero):
        keys = [hero['Name'], hero.get('PortraitAssetName'), re.sub(r'_(?:\d+|ascent|myth)$', '', hero['Name'])]
        for key in filter(None, keys):
            entry = registry['entities'].get(registry['aliases'].get(key, key), {})
            if entry.get('name'):
                return entry['name']
        return hero['Name']

    packages = {}
    for path in sorted((assets / 'native-characters').glob('*.json')):
        package = read(path)
        origins = sorted({by_name[name]['OriginId'] for name in package.get('heroClasses', {}) if name in by_name})
        packages[path.stem] = {'id': path.stem, 'path': path.relative_to(root).as_posix(), 'sha256': digest(path),
                               'origins': origins, 'heroNames': sorted(package.get('heroClasses', {})),
                               'actions': len(package.get('actions', {})), 'graphs': len(package.get('graphs', {}))}

    # The batch started from 44 files. Excluding ONLY its three new targets reconstructs
    # this baseline on the initial run; later runs always retain the saved snapshot.
    baseline = previous.get('baseline')
    if baseline is None:
        base_packages = {k: v for k, v in packages.items() if k not in FIRST_THREE}
        baseline = {'date': '2026-10-30', 'nativePackages': base_packages,
                    'selectionEvidence': 'Task-start baseline: 44 native files. First three targets pirate/sniper/eighttail were not present; their concurrently generated files are excluded only when initializing this snapshot.',
                    'userAcceptanceEvidence': '2026-10-30 current user instruction confirms all flowering characters completed/accepted; this supersedes historical progress snapshots.',
                    'sourceSha256': digest(source / 'heroes.json')}
        if len(base_packages) != 44:
            raise ValueError('Cannot initialize the authorized 44-file baseline; supply the preserved prior ledger. Found ' + str(len(base_packages)))
    baseline_origins = {o for p in baseline['nativePackages'].values() for o in p['origins']}
    baseline_ids = set(baseline['nativePackages'])
    baseline.setdefault('fxGroups', {g['id']: {'origins': g['origins'], 'members': g['members']} for g in groups})
    baseline_group_origins = {o for g in baseline['fxGroups'].values() for o in g['origins']}
    preserved = {row['id']: row.get('workflow', {}) for row in previous.get('characters', [])}
    stable_ids = {tuple(sorted(row['origins'])):row['id'] for row in previous.get('characters', [])}
    types, type_provenance = native_types(root, args.native_profile)
    sys.path.insert(0, str(root / 'tools/fx'))
    from native_script_plans import compile_script_plan
    probes = {}

    def probe(name):
        if name in probes:
            return
        action = action_map[name]
        typ = name.split(':')[0]
        path = script_root / (typ + 'BattleAction.lua')
        if name.startswith('BasicSupport:'):
            path = script_root / 'Support' / ((action.get('LuaAddOn') or name.removeprefix('Myth')) + 'SupportBattleAction.lua')
        lua = path.read_text('utf8') if path.is_file() else ''
        exact_type = types.get(typ + 'BattleAction')
        result = {'action': name, 'actionType': typ, 'useScript': action.get('UseScript'),
                  'graphName': action.get('GraphName'), 'lua': {'path': str(path), 'exists': path.is_file()},
                  'nativeType': exact_type['fullName'] if exact_type else None,
                  'sourceFields': sorted(action), 'compiler': {'status': 'not-probed'}}
        if lua:
            result['lua']['sha256'] = digest(path)
        try:
            plan = compile_script_plan(action, lua, path)
            result['compiler'] = ({'status': 'matched-candidate', 'behavior': plan.get('behavior'),
                                   'category': plan.get('category'), 'source': plan.get('source'),
                                   'sourceSha256': plan.get('sourceSha256')}
                                  if plan else {'status': 'unmatched'})
        except Exception as error:
            result['compiler'] = {'status': 'probe-error', 'error': type(error).__name__ + ': ' + str(error)}
        evidence = []
        for key in sorted(action):
            if re.search('stamina|ammo|magazine|reload|comboaction|extraaction', key, re.I):
                evidence.append({'kind': 'source-field-candidate', 'field': key, 'value': action[key]})
        if lua:
            for line_no, line in enumerate(lua.splitlines(), 1):
                if re.search(r'stamina|ammo|magazine|consume|can_trigger|is_last', line, re.I):
                    evidence.append({'kind': 'lua-source-line-candidate', 'line': line_no, 'text': line.strip()[:250]})
        if exact_type:
            for kind in ('fields', 'methods'):
                for member in exact_type[kind]:
                    if re.search('stamina|ammo|magazine|reload|combo', member, re.I):
                        evidence.append({'kind': 'exact-native-member-candidate', 'memberKind': kind, 'member': member})
        result['consumptionCandidates'] = evidence
        result['mechanismFamilies'] = sorted(set(
            (['graph:' + typ] if action.get('GraphName') else []) +
            (['compiler:' + result['compiler']['behavior']] if result['compiler'].get('behavior') else []) +
            (['lua:' + typ] if lua else []) + (['native-type:' + typ] if exact_type else []) +
            (['source-array'] if action.get('EffectPresetNames') else [])))
        probes[name] = result

    rows = []
    represented = set()
    identities = []
    for group in groups:
        origins = set(group['origins']) & formal_origins
        if origins:
            identities.append((group['id'], sorted(origins), group))
            represented.update(origins)
    for origin in sorted(formal_origins - represented):
        identities.append(('origin-' + str(origin), [origin], None))
    for identifier, origins, group in identities:
        identifier = stable_ids.get(tuple(origins), identifier)
        hs = sorted([h for h in formal if h['OriginId'] in origins], key=lambda h: (h['OriginId'], h['Rank'], h['Id']))
        classes = {h['Class'] for h in hs if h.get('Class')}
        hero_ids = {h['Id'] for h in hs}
        own_styles = [s for s in styles if s.get('Class') in classes]
        direct = collections.defaultdict(list)
        for style in own_styles:
            for field in ('BattleActions', 'ManualBattleActions', 'ClassBattleActions'):
                for name in style.get(field) or []:
                    direct[name].append('BattleStyle.' + style['Name'] + '.' + field)
        for weapon in tables['items.json']:
            if weapon.get('ExclusiveCharacterId') in set(origins) | hero_ids and weapon.get('SuperBattleAction'):
                direct[weapon['SuperBattleAction']].append('WeaponSpec.' + str(weapon['Id']) + '.SuperBattleAction')
        option_ids = {o['OptionId'] for h in hs for o in h.get('Options', [])}
        for option_id in option_ids:
            for value in strings(options.get(option_id, {})):
                if value in action_map:
                    direct[value].append('Hero.OptionId.' + str(option_id))
        # Match the importer's narrow action discovery, while marking token matches as
        # discovery candidates rather than asserting an installed role/weapon branch.
        tokens = {compact(c.removesuffix('_myth').removesuffix('_ascent')) for c in classes}
        for action in action_map.values():
            name = action['Name']
            if compact(name.split(':')[-1]) in tokens or compact(name) in {p+t+s for t in tokens for p,s in [('myth',''),('','support')]}:
                direct[name].append('importer-token-discovery-candidate')
        names = set(direct) & action_map.keys()
        queue = list(names)
        for name in queue:
            for value in strings(action_map[name]):
                if value in action_map and value not in names:
                    names.add(value)
                    queue.append(value)
                    direct[value].append('recursive-action-reference:' + name)
        for name in sorted(names):
            probe(name)
        current = [p for p in packages.values() if set(p['origins']) & set(origins)]
        old = [p for p in baseline['nativePackages'].values() if set(p['origins']) & set(origins)]
        base_present = bool(old)
        has_myth = any(h['Name'].endswith('_myth') for h in hs)
        default_state = {'production': 'existing-native' if base_present else 'pending',
                         'sourceCoverage': 'not-recertified-by-inventory',
                         'acceptance': 'user-accepted' if base_present and has_myth else 'not-recorded',
                         'evidence': baseline['userAcceptanceEvidence'] if base_present and has_myth else None}
        if identifier in FIRST_THREE:
            default_state.update(production='in-progress', batch='nonmyth-001', evidence='Current user authorized first batch; packages and source probes do not prove completion.')
        workflow = preserved.get(identifier) or default_state
        row = {'id': identifier, 'name': group['name'] if group else title(hs[0]), 'origins': origins,
               'sourceNames': [h['Name'] for h in hs], 'sourceMinimumRank': min(h['Rank'] for h in hs),
               'summonCategories': sorted({h['SummonCategory'] for h in hs}),
               'sourceHeroes': [{k: h.get(k) for k in ('Id', 'Name', 'OriginId', 'Rank', 'SummonCategory', 'Class', 'BattleClass', 'SpineAssetName')} for h in hs],
               'forms': {kind: [h['Name'] for h in hs if ('myth' if h['Name'].endswith('_myth') else 'ascent' if h['Name'].endswith('_ascent') else 'original') == kind] for kind in ('original', 'ascent', 'myth')},
               'fxGroup': {'exists': bool(group), 'baselineExists': bool(set(origins) & baseline_group_origins),
                           'id': group['id'] if group else None, 'members': group['members'] if group else [],
                           'indexes': [{'id': member, 'path': catalog[member]['index'] if member in catalog else None,
                                        'exists': bool(member in catalog and (assets / catalog[member]['index']).is_file())}
                                       for member in (group['members'] if group else [])]},
               'native': {'baselinePresent': base_present, 'baselinePackageIds': [p['id'] for p in old],
                          'currentPresent': bool(current), 'currentPackageIds': [p['id'] for p in current],
                          'missingSourceForms': [h['Name'] for h in hs if not any(h['Name'] in p['heroNames'] for p in current)]},
               'workflow': workflow, 'sourceStyles': [s['Name'] for s in own_styles],
               'actionRefs': [{'action': name, 'association': direct[name]} for name in sorted(names)],
               'mechanismFamilies': sorted({family for name in names for family in probes[name]['mechanismFamilies']})}
        rows.append(row)
    states = dict(args.set_production)
    for identifier, value in states.items():
        if identifier not in {r['id'] for r in rows} or value not in PRODUCTION_STATES:
            raise ValueError('Unknown character or production state: ' + identifier + '=' + value)
        if not args.evidence:
            raise ValueError('--set-production requires --evidence; package presence never changes workflow automatically')
    for row in rows:
        if row['id'] in states:
            row['workflow'].update(production=states[row['id']], evidence=args.evidence)
    rows.sort(key=lambda row: row['id'])
    missing = [r for r in rows if not r['native']['baselinePresent']]
    baseline['counts'] = {'nativeFiles': len(baseline_ids), 'characterGroups': sum(r['native']['baselinePresent'] for r in rows),
                          'mythGroupsUserAccepted': sum(r['native']['baselinePresent'] and bool(r['forms']['myth']) for r in rows),
                          'existingNonmythGroupsAcceptanceNotRecorded': sum(r['native']['baselinePresent'] and not r['forms']['myth'] for r in rows)}
    batches = previous.get('batches') or [{'id': 'nonmyth-001', 'targetCount': 10, 'members': FIRST_THREE,
        'unselectedSlots': 7, 'selectionStatus': 'three-selected-seven-pending-root-selection',
        'selectionEvidence': 'First three chosen explicitly: pirate/sniper/eighttail. Expansion to ten authorized by current user.',
        'reason': 'Reuse source mechanism families; every target still needs its own source rows, dependency closure and actual action checks.'}]
    if args.batch_members:
        members = args.batch_members.split(',')
        if len(members) != len(set(members)) or any(m not in {r['id'] for r in rows} for m in members):
            raise ValueError('Batch members must be distinct real roster IDs')
        batches[0].update(members=members, unselectedSlots=max(0, 10-len(members)), selectionStatus='selected' if len(members)==10 else 'partially-selected')
        for row in rows:
            if row['id'] in members:
                row['workflow']['batch'] = 'nonmyth-001'
    excluded = []
    for origin in sorted({h['OriginId'] for h in playable} - formal_origins):
        excluded.append({'originId': origin, 'heroes': [{k: h.get(k) for k in ('Id', 'Name', 'Playable', 'SummonCategory', 'BattleClass')} for h in playable if h['OriginId']==origin],
                         'reason': 'Playable flag alone is insufficient: SummonCategory is None/missing or BattleClass is absent; temporary story object excluded from formal obtainable roster.'})
    return {'format': 'gtfx-playable-character-backlog', 'version': 1,
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'scope': 'Formal obtainable source heroes, grouped only by existing character-groups origins. No accepted character assets/runtime/browser changes.',
            'rules': {'formalHero': 'Playable == true AND SummonCategory not null/None AND nonempty BattleClass',
                      'identity': 'Use native OriginId. Only existing source-backed group.origins merge identities; knight[1,2], peimei[52,53]. Never merge by full display name.',
                      'nativePresence': 'Recover OriginId by exact heroClasses keys joined to Hero.Name; heroOrigins is not part of these native packages.',
                      'rank': 'sourceMinimumRank preserves native zero-based Hero.Rank (0 is normal starting rank); not an inferred rarity label.',
                      'completion': 'Presence, compiler match, source mechanism coverage, production state and user acceptance are independent. None is automatically promoted.',
                      'probe': 'Compiler matches and source/member/consumption candidates are planning evidence only. Native type members do not prove IStamina or consumption; MagazineSize alone does not create a magazine.',
                      'baseline': '128 is the fixed new-production backlog relative to 44-package/43-group batch-start snapshot. New files never silently reduce it.'},
            'inputHashes': {**{('gtfx/assets/native-source/'+name): digest(source/name) for name in source_names},
                            **{path: digest(root/path) for path in ['gtfx/assets/character-groups.json', 'gtfx/assets/catalog.json', 'resources/registry.js']}},
            'compilerInputHashes': {p.relative_to(root).as_posix(): digest(p) for p in sorted((root/'tools/fx').glob('native_*.py'))},
            'baseline': baseline, 'currentNativePackages': packages, 'nativeTypeProvenance': type_provenance,
            'counts': {'playableRows': len(playable), 'playableOrigins': len({h['OriginId'] for h in playable}),
                       'formalRows': len(formal), 'formalOrigins': len(formal_origins), 'formalCharacters': len(rows),
                       'fxGroups': len(groups), 'groupCoveredFormalOrigins': len(represented),
                       'baselineNativeFiles': len(baseline_ids), 'baselineNativeGroups': sum(r['native']['baselinePresent'] for r in rows),
                       'newProductionBacklog': len(missing), 'backlogWithExistingGroup': sum(r['fxGroup']['baselineExists'] for r in missing),
                       'backlogWithoutIndependentGroup': sum(not r['fxGroup']['baselineExists'] for r in missing),
                       'ungroupedBySummonCategory': dict(collections.Counter(c for r in missing if not r['fxGroup']['baselineExists'] for c in r['summonCategories'])),
                       'excludedTemporaryOrigins': len(excluded), 'currentNativeFiles': len(packages),
                       'newFilesSinceBaseline': len(set(packages)-baseline_ids),
                       'productionStates': dict(collections.Counter(r['workflow']['production'] for r in missing)),
                       'sourceActionProbes': len(probes), 'compilerMatches': sum(p['compiler']['status']=='matched-candidate' for p in probes.values()),
                       'compilerProbeErrors': sum(p['compiler']['status']=='probe-error' for p in probes.values())},
            'batches': batches,
            'createHeroReadOnlyFinding': {'supported': True, 'source': 'tools/fx/import-character-native.py --create-hero branch and final build_character_groups call',
                'flow': 'A missing exact --index plus --create-hero Hero.Name creates the catalog entry in memory, derives resource from exact source Hero.Name, imports all same-OriginId forms and dependency closure, writes a real index/native package, merges latest catalog and rebuilds character-groups.',
                'limitation': 'The 28 ungrouped characters still require a real source import and actual action coverage. Inventory creates no empty indexes or groups; generic/shared source classes may require new native mechanism support.',
                'commandTemplate': '& E:/GTFiles/GTOfflineServer/core/runtime/python/python.exe tools/fx/import-character-native.py --index gtfx/assets/characters/<chosen-id>.json --create-hero <exact-source-Hero.Name> --defer-cleanup'},
            'sourceActionProbes': probes, 'nativeTypes': {p['nativeType']: types[p['actionType']+'BattleAction'] for p in probes.values() if p['nativeType']},
            'excludedTemporaryObjects': excluded, 'characters': rows}


def markdown(report):
    c = report['counts']
    lines = ['# 正式可获得角色：特效剩余账本', '',
        f"生成：{report['generatedAt']}。原始 Hero：{c['playableRows']} 条 Playable / {c['playableOrigins']} OriginId；正式筛选后 {c['formalRows']} 条 / {c['formalOrigins']} OriginId。",
        f"按现有分组关系合并骑士[1,2]与佩儿/梅儿[52,53]后，正式角色 **{c['formalCharacters']}**。没有按显示名猜合并。", '',
        f"固定批次起点：**{c['baselineNativeFiles']} 个 native 文件 / {c['baselineNativeGroups']} 角色组**；其中39开花组本轮用户确认通过，4既有非开花组（hana、milkywaygirl、peimei、necromancer）仅记录已有联动，完整分支/视觉验收另计。",
        f"待新制作 **{c['newProductionBacklog']}**：已有FX组但起点无native **{c['backlogWithExistingGroup']}**；无独立FX组 **{c['backlogWithoutIndependentGroup']}**（Story6、Normal22），全部保留。另8临时剧情对象单列排除。",
        f"本次读到 {c['currentNativeFiles']} 个 native 文件，比固定起点新增 {c['newFilesSinceBaseline']}；新增文件不自动表示制作完成、源分支完整或用户验收。", '',
        '重跑：`python tools/fx/inventory-playable-characters.py`。保留既有JSON中的baseline、workflow和batches。状态修改需 `--set-production id=状态 --evidence "实际证据"`；批次选角用 `--batch-members id1,id2,...`。', '',
        '## 首批', '']
    for batch in report['batches']:
        lines += [f"- {batch['id']}：目标{batch['targetCount']}个，已选 {', '.join(batch['members'])}；待选{batch['unselectedSlots']}。", f"- {batch['reason']}"]
    lines += ['', '| 首批ID | 制作状态 | 源动作 | compiler命中 | GraphName | 精确native类型 |', '|---|---|---|---|---|---|']
    selected = {member for batch in report['batches'] for member in batch['members']}
    for row in report['characters']:
        if row['id'] not in selected:
            continue
        probes = [report['sourceActionProbes'][a['action']] for a in row['actionRefs']]
        lines.append(f"| {row['id']} | {row['workflow']['production']} | {len(probes)} | {sum(p['compiler']['status']=='matched-candidate' for p in probes)} | {sum(bool(p['graphName']) for p in probes)} | {sum(bool(p['nativeType']) for p in probes)} |")
    lines += ['', '候选探针读取真实动作行、Lua文件/哈希、GraphName、原生metadata精确类型及当前compiler。compiler命中、source-array或原生同类型只用于选批，不是完成证明；弹药/耐力字段、Lua行和native成员均保留为candidate，不能据MagazineSize制造整弹匣。', '',
              f"本次 {c['sourceActionProbes']} 个去重动作探针，compiler命中{c['compilerMatches']}，probe异常{c['compilerProbeErrors']}。JSON保留逐动作结果、未命中、异常与身份来源；没有打开浏览器。", '',
              '## 起点未制作清单', '', '| ID / 名称 | 原始OriginId / 最低Rank / 类别 | FX组·索引 | 原版/觉醒/开花条数 | 当前native | 制作状态 |', '|---|---|---|---|---|---|']
    for row in report['characters']:
        if row['native']['baselinePresent']:
            continue
        group = '有/' + str(sum(i['exists'] for i in row['fxGroup']['indexes'])) if row['fxGroup']['exists'] else '无/0'
        forms = '/'.join(str(len(row['forms'][kind])) for kind in ('original', 'ascent', 'myth'))
        lines.append(f"| {row['id']} / {row['name']} | {','.join(map(str,row['origins']))} / {row['sourceMinimumRank']} / {','.join(row['summonCategories'])} | {group} | {forms} | {','.join(row['native']['currentPackageIds']) or '无'} | {row['workflow']['production']} |")
    lines += ['', '## 起点已有包（存在性与验收分开）', '', '| 角色组 | native文件 | 开花 | 验收 | 源分支覆盖 |', '|---|---|---|---|---|']
    for row in report['characters']:
        if row['native']['baselinePresent']:
            lines.append(f"| {row['id']} / {row['name']} | {','.join(row['native']['baselinePackageIds'])} | {'有' if row['forms']['myth'] else '无'} | {row['workflow']['acceptance']} | {row['workflow']['sourceCoverage']} |")
    lines += ['', '## 8个临时剧情对象（排除）', '']
    for item in report['excludedTemporaryObjects']:
        lines.append(f"- {item['originId']}：{', '.join(h['Name'] for h in item['heroes'])}；SummonCategory=None/无BattleClass。")
    lines += ['', '## 无独立FX组的create-hero路径', '', report['createHeroReadOnlyFinding']['flow'], '',
              report['createHeroReadOnlyFinding']['limitation'], '',
              '身份、全部形态、每个group member对应索引、heroClasses回查native归属、输入SHA256和当前文件SHA256均在同名JSON。Hero.Rank保留源零起始值，表中原版条数含各星级源行，不代表独立角色数。', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--markdown', type=Path)
    parser.add_argument('--native-profile', type=Path, default=Path('E:/GTFiles/native-workbench/11ad39a67bb2a7ba/profile.json'))
    parser.add_argument('--set-production', action='append', default=[], type=lambda text: text.split('=', 1))
    parser.add_argument('--evidence')
    parser.add_argument('--batch-members')
    args = parser.parse_args()
    output = args.output or args.root / 'docs/fx-character-backlog.json'
    md = args.markdown or args.root / 'docs/fx-character-backlog.md'
    previous = read(output) if output.is_file() else {}
    result = build(args, previous)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf8')
    md.write_text(markdown(result), encoding='utf8')
    print(json.dumps(result['counts'], ensure_ascii=False))
