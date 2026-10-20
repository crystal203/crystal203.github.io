"""Validate every imported translation against the original local strings."""
import argparse
import json
import re
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def verify(repo, source):
    langs = ('zhCN', 'enUS', 'jaJP')
    tables = {lang: read(source / f'strings-{lang}.json') for lang in langs}
    catalog = read(repo / 'gtwiki/data/catalog.json')
    heroes = {}
    keys_seen = set()
    total = 0
    for summary in catalog['heroes']:
        h = read(repo / 'gtwiki/data' / summary['file'])
        heroes[h['id']] = h
        groups = h['voiceLines']
        assert groups, f"No voice text: {h['id']}"
        assert len({g['id'] for g in groups}) == len(groups)
        for group in groups:
            assert group['id'] == h['id'] or group['id'].startswith(h['id'] + '_'), group['id']
            assert len({r['type'] for r in group['lines']}) == len(group['lines'])
            for row in group['lines']:
                total += 1
                assert row['label'] and row['keys']
                for key in row['keys']:
                    assert re.fullmatch(r'(Voice|cv)_.+_' + row['type'], key), key
                    assert key not in keys_seen, f'Duplicate source key: {key}'
                    keys_seen.add(key)
                for lang in langs:
                    actual = row['texts'][lang]
                    expected = {tables[lang][k] for k in row['keys']
                                if isinstance(tables[lang].get(k), str) and tables[lang][k].strip()}
                    assert len(actual) == len(set(actual)), (h['id'], lang, row['type'])
                    assert set(actual) == expected, (h['id'], lang, row['type'])
    noxia = heroes['necromancer']['voiceLines'][0]
    chocolate = next(r for r in noxia['lines'] if r['type'] == 'TouchReactionGood2')
    assert chocolate['texts']['zhCN'] == ['是巧克力耶…诺克希娅可以吃一个吗…']
    assert all(chocolate['texts'][lang] for lang in langs)
    assert set(chocolate['keys']) == {'Voice_necromancer_1_TouchReactionGood2', 'cv_necromancer_TouchReactionGood2'}
    assert len(noxia['lines']) == 39
    # These cases catch mistaken resource IDs, typo fixes and cross-hero prefix matches.
    assert heroes['teatan_zaco']['voiceLines'][0]['lines']
    assert heroes['teatan_robot_marty_junior']['voiceLines'][0]['lines']
    assert any(g['id'] == 'kamael_myth' for g in heroes['kamael']['voiceLines'])
    assert heroes['knight_female']['voiceLines'][0]['label'] == '冷静'
    assert all(g['id'].startswith('knight_female') for g in heroes['knight_female']['voiceLines'])
    assert any(g['id'] == 'sunyeo_firepower' and g['label'] == '火力全开妲彬' for g in heroes['sunyeo']['voiceLines'])
    bridge = next(g for g in heroes['bridge_driver']['voiceLines'] if g['id'] == 'bridge_driver_myth')
    assert any('cv_bridge__driver_myth_Damaged2' in r['keys'] for r in bridge['lines'])
    print(f'PASS {len(heroes)} heroes, {total} voice types/versions, {len(keys_seen)} original keys; all translations match source')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--source', type=Path, default=Path('E:/GTFiles/static_data_dec'))
    args = parser.parse_args()
    verify(args.repo, args.source)
