"""Bounded regression checks for literal nil-rotation compilation; no rendering."""
import copy
import json
from pathlib import Path
from native_source_event_contracts import normalize_literal_effect_positions

root = Path(__file__).parents[2]
base = {'behavior': 'timeline', 'events': [{'op': 'effect', 'key': 'cast', 'height': 2}]}

def event(source, plan=base):
    return normalize_literal_effect_positions(plan, source)['events'][0]

for rotation in ['', ', nil']:
    assert event("battle_util.instantiate_effect(self, 'cast', pos" + rotation + ")")['directed'] is False
for source in [
    "local fx = battle_util.instantiate_effect(self, 'cast', pos)\nfx.transform.rotation = rot",
    "self.fx = battle_util.instantiate_effect(self, 'cast', pos)\neffect_util.update_object(self.fx, pos, dir)",
    "battle_util.instantiate_effect(self, 'cast', pos, self.dir)",
    "battle_util.instantiate_effect(self, 'cast', pos)\nbattle_util.instantiate_effect(self, 'cast', pos, self.dir)",
    "battle_util.instantiate_effect(self, key, pos)\nbattle_util.instantiate_effect(self, 'cast', pos)",
]:
    assert 'directed' not in event(source), source
for field in ['euler', 'negativeEuler', 'rotationType', 'directionVector', 'link', 'bone', 'directionKeys']:
    plan = copy.deepcopy(base)
    plan['events'][0][field] = {}
    assert 'directed' not in event("battle_util.instantiate_effect(self, 'cast', pos)", plan), field
assert base['events'][0] == {'op': 'effect', 'key': 'cast', 'height': 2}

pack = json.loads((root / 'gtfx/assets/native-characters/invaderknight.json').read_text(encoding='utf8'))
plan = next(p for p in pack['plans'] if p.get('action') == 'RoleInvaderKnightMyth')
cast, projectile, explosion = plan['events']
assert cast['directed'] is False and cast['height'] == 2
assert cast['sourceDirectionContract']['lines'] == [251]
assert projectile['op'] == 'moving-effect' and 'sourceDirectionContract' not in projectile
assert explosion['directed'] is False
print('PASS: nil/omitted source rotations, retained-handle and explicit-transform guards, imported cast identity and projectile separation')
