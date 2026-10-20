"""Import hero voice text from local strings; run again after build_wiki.py.

python tools/wiki/build-voice-lines.py --source E:/GTFiles/static_data_dec
Use --output DIR to prepare changed files outside the repository.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

LANGUAGES = ('zhCN', 'enUS', 'jaJP')
# Chinese type names follow BWIKI's hero voice section. Text comes only from
# the local string tables, never from BWIKI.
TYPE_SOURCE = 'https://wiki.biligame.com/gt/诺克希娅#语音一览'
LABELS = {
    'NormalBattleWin': '胜利-普通战斗', 'BossBattleWin': '胜利-首领战斗',
    'Die': '阵亡', 'GetExp': '获得经验结晶', 'LevelUp': '升级',
    'EquipWeapon': '佩戴装备', 'EquipCostume': '穿戴时装', 'Evolve': '进化',
    'PlayerChooseBright': '人物友善值选项', 'PlayerChooseDark': '人物邪恶值选项',
    'WeakEnemyBattleStart': '与弱小敌人战斗', 'NormalEnemyBattleStart': '与普通敌人战斗',
    'StrongEnemyBattleStart': '与强大敌人战斗', 'BossBattleStart': '与首领战斗',
    'JoinParty': '首次加入队伍', 'CoopAttack': '战斗-攻击', 'CoopHeal': '战斗-请求治疗',
    'CoopRun': '战斗-注意', 'CoopWin': '战斗-胜利', 'CoopMVP': '战斗-最佳队员',
    'CoopHi': '战斗-问候', 'CoopHurryUp': '战斗-急迫', 'CoopBelieve': '战斗-信任',
    'NoticeMail': '邮件提示', 'NoticeEvent': '活动提示', 'LeaderSkill': '队长技能',
}
for prefix, label, count in [('Attack', '攻击', 3), ('Skill', '技能', 2),
                             ('Damaged', '受到攻击', 2),
                             ('TouchReactionGood', '触碰反应-积极', 9),
                             ('TouchReactionBad', '触碰反应-消极', 9),
                             ('SummonSpeech', '召唤-台词', 3), ('Special', '特殊剧情', 8)]:
    LABELS.update({prefix + str(n): label + str(n) for n in range(1, count + 1)})
ORDER = ['NormalBattleWin', 'BossBattleWin', 'Die', 'GetExp', 'LevelUp',
         'EquipWeapon', 'EquipCostume', 'Evolve', 'Attack1', 'Attack2', 'Attack3',
         'Skill1', 'Skill2', 'LeaderSkill', 'Damaged1', 'Damaged2',
         'PlayerChooseBright', 'PlayerChooseDark', 'WeakEnemyBattleStart',
         'NormalEnemyBattleStart', 'StrongEnemyBattleStart', 'BossBattleStart',
         'JoinParty', 'CoopAttack', 'CoopHeal', 'CoopRun', 'CoopWin', 'CoopMVP',
         'CoopHi', 'CoopHurryUp', 'CoopBelieve', 'TouchReactionGood1',
         'TouchReactionGood2', 'TouchReactionBad1', 'TouchReactionBad2',
         'NoticeMail', 'NoticeEvent', 'SummonSpeech1', 'SummonSpeech2', 'SummonSpeech3']
PERSONALITIES = {'cool': '冷静', 'mukuchi': '寡言', 'youki': '开朗',
                 'kougekiteki': '好战', 'teinei': '礼貌', 'nekketsu': '热血'}
# Exact spelling mistakes in the source tables; do not fuzzy-match hero names.
STEM_FIXES = {'bridge__driver_myth': 'bridge_driver_myth',
              'bridge_driverr_myth': 'bridge_driver_myth',
              'knight_male_bukubu_kougekitek': 'knight_male_bukubu_kougekiteki',
              'marty_junior_robot': 'teatan_robot_marty_junior',
              'teatan_private': 'teatan_zaco'}  # heroes.json Name vs PortraitAssetName


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n',
                    encoding='utf-8', newline='\n')


def build(repo, source, output):
    strings = {lang: read(source / f'strings-{lang}.json') for lang in LANGUAGES}
    catalog = read(repo / 'gtwiki/data/catalog.json')
    heroes = {h['id']: h for h in catalog['heroes']}
    ids = sorted(heroes, key=lambda x: (-len(x), x))
    grouped = collections.defaultdict(lambda: collections.defaultdict(dict))
    unresolved = []
    all_keys = sorted(set().union(*(d.keys() for d in strings.values())))
    candidates = []
    for key in all_keys:
        match = re.fullmatch(r'(Voice|cv)_(.+)_([A-Z][A-Za-z0-9]*)', key)
        if not match:
            continue  # Excludes voice settings and actor credits.
        prefix, stem, event = match.groups()
        candidates.append(key)
        if prefix == 'Voice':
            stem = re.sub(r'_1(?=_|$)', '', stem)
        stem = STEM_FIXES.get(stem, stem)
        # Shared Bukubu text belongs to the existing costume's owner.
        if stem in ('knight_bukubu', 'knight_bukubu_myth'):
            stem = stem.replace('knight_', 'knight_female_', 1)
        owner = next((h for h in ids if stem == h or stem.startswith(h + '_')), None)
        if owner is None:
            unresolved.append({'key': key, 'stem': stem, 'type': event})
            continue
        row = grouped[owner][stem].setdefault(event, {
            'type': event, 'label': LABELS.get(event, event),
            'texts': {lang: [] for lang in LANGUAGES}, 'keys': []})
        row['keys'].append(key)
        for lang, table in strings.items():
            text = table.get(key)
            if isinstance(text, str) and text.strip() and text not in row['texts'][lang]:
                row['texts'][lang].append(text)

    def group_label(owner, stem):
        suffix = stem[len(owner):].strip('_')
        if not suffix:
            return '普通'
        personality = next((p for p in PERSONALITIES if suffix.endswith(p)), None)
        parts = []
        if 'myth' in suffix.split('_'):
            parts.append('开花')
        elif 'ascent' in suffix.split('_'):
            parts.append('晋升')
        variant = re.sub(r'_(?:myth|ascent)(?=_|$)', '', stem)
        if personality:
            variant = variant.removesuffix('_' + personality)
        # Knight costume codes omit the gender in items.json.
        lookup = variant.replace('knight_female_bukubu', 'knight_bukubu').replace(
            'knight_male_bukubu', 'knight_bukubu')
        lookup = {'sunyeo_firepower': 'sunyeo_fire_power'}.get(lookup, lookup)
        if variant != owner:
            parts.insert(0, strings['zhCN'].get(lookup) or lookup[len(owner):].strip('_') or lookup)
        if personality:
            parts.append(PERSONALITIES[personality])
        return ' · '.join(parts) or suffix

    stats = {'heroes': len(heroes), 'heroesWithLines': 0, 'groups': 0, 'lines': 0,
             'texts': {lang: 0 for lang in LANGUAGES}, 'multipleTexts': 0,
             'sourceKeys': len(candidates), 'unresolvedKeys': len(unresolved)}
    missing = []
    for owner, summary in heroes.items():
        data = read(repo / 'gtwiki/data' / summary['file'])
        groups = []
        def group_order(entry):
            stem = entry[0]
            suffix = stem[len(owner):].strip('_')
            normal = not suffix or suffix in PERSONALITIES
            stage = suffix in ('myth', 'ascent') or any(suffix == s + '_' + p
                for s in ('myth', 'ascent') for p in PERSONALITIES)
            return (0 if normal else 1 if stage else 2, stem)
        for stem, events in sorted(grouped[owner].items(), key=group_order):
            lines = sorted((r for r in events.values() if any(r['texts'].values())),
                           key=lambda r: (ORDER.index(r['type']) if r['type'] in ORDER else len(ORDER), r['type']))
            if not lines:
                continue
            groups.append({'id': stem, 'label': group_label(owner, stem), 'lines': lines})
            stats['lines'] += len(lines)
            for row in lines:
                for lang in LANGUAGES:
                    stats['texts'][lang] += len(row['texts'][lang])
                    stats['multipleTexts'] += int(len(row['texts'][lang]) > 1)
        data['voiceLines'] = groups
        data.setdefault('sources', {})['voiceLines'] = [f'strings-{l}.json / Voice_*, cv_*' for l in LANGUAGES]
        write(output / 'gtwiki/data' / summary['file'], data)
        stats['groups'] += len(groups)
        if groups:
            stats['heroesWithLines'] += 1
        else:
            missing.append({'id': owner, 'name': summary['name']})
    report = {'summary': stats, 'typeNamesSource': TYPE_SOURCE,
              'sourceHashes': {lang: hashlib.sha256((source / f'strings-{lang}.json').read_bytes()).hexdigest()
                               for lang in LANGUAGES},
              'heroesWithoutLines': missing, 'unresolved': unresolved}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--source', type=Path, default=Path('E:/GTFiles/static_data_dec'))
    parser.add_argument('--output', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = build(args.repo, args.source, args.output or args.repo)
    if args.report:
        write(args.report, report)
    print(json.dumps(report['summary'], ensure_ascii=False))
