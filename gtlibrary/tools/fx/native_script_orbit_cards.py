"""Native aimed twin-shot, single ground cast, and staged orbit-launch contracts."""
import hashlib
import json
from functools import lru_cache
from native_costumes import parse_literal_table
from pathlib import Path

@lru_cache(maxsize=1)
def costume_table():
    config=json.loads((Path(__file__).parent/'import-config.json').read_bytes())
    path=Path(config['costumeOverrideSource'])
    raw=path.read_text(encoding='utf-8-sig')
    return parse_literal_table(raw),hashlib.sha256(raw.encode()).hexdigest()

def compile_orbit_cards_plan(a, lua, path):
    if not lua:
        return None
    if ('obj.twin_atk = (combo_index == 2)' in lua and 'function action_state_class:get_avail_angle(target_pos, spec)' in lua):
        category, pattern = 'basic', 'aimed-twin-shot'
    elif ("battle_util.instantiate_effect(self, 'cast', self.target_pos)" in lua and 'self.hit_timing' in lua and 'HitAreaTimings' in a):
        category, pattern = 'support', 'single-ground-cast'
    elif ('local first_index = #self.shoot_timing - #self.card_fx_table + 1' in lua and 'card_fx.transform.localScale = 0.6' in lua):
        category, pattern = 'cwp', 'staged-orbit-launch'
    else:
        return None
    plan = dict(behavior='source-orbit-cards', category=category, pattern=pattern, id=category,
                label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能'}[category], action=a['Name'],
                exclusive=category=='cwp', end=a.get('ActionDuration',a.get('Duration',1)),
                mythPresetSource='action',mythProjectileSource='action',source=str(path),
                sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if pattern=='aimed-twin-shot':
        plan.update(twinComboIndex=2, maximumAngle=60, muzzleOffset=.5, backOffset=.5)
    elif pattern=='staged-orbit-launch':
        # Reject source variants; these constants belong to the native operation.
        required=['local offset = 0.75','local init_term = 0.1','if 0.5 < time_passed then',
                  'bounds_util.get_center(self.owner) + 0.7 * self.dir_vector',
                  'character_util.jump(self.owner, 0.5, 0.5, 0, false)']
        if not all(s in lua for s in required): return None
        plan.update(radius=.75,initTerm=.1,orbitStart=.5,prelaunchScale=.6,shootOffset=.7,
                    jump=dict(height=.5,duration=.5),mythOptionListField='MythOptionIdList')
    source=Path(__file__).parents[2]/'gtfx/assets/native-source'
    def strings(value):
        if isinstance(value,str):return {value}
        if isinstance(value,dict):return set().union(set(),*(strings(v) for v in value.values()))
        if isinstance(value,list):return set().union(set(),*(strings(v) for v in value))
        return set()
    wanted=strings(a)
    costumes,costume_hash=costume_table()
    costume_rows=[r for r in costumes.values() if isinstance(r,dict)]
    for row in costume_rows:
        patch=row.get('battleactions',{}).get(a['Name'])
        if patch:wanted|=strings(patch)
    plan['costumePoolSourceSha256']=costume_hash
    projs={p['Name']:p for p in json.loads((source/'projectiles.json').read_bytes())}
    previous=set()
    while previous!=wanted:
        previous=wanted.copy()
        for key in previous:
            if key in projs:wanted|=strings(projs[key])
            for row in costume_rows:
                patch=row.get('projectiles',{}).get(key)
                if patch:wanted|=strings(patch)
    pool_bytes=(source/'objectpoolspec.json').read_bytes()
    plan['poolRules']={p['PresetName']:dict(dispose=p.get('DisposingType','None'),timeLimit=p.get('TimeLimit',0))
                       for p in json.loads(pool_bytes) if p.get('PresetName') in wanted}
    plan['poolSourceSha256']=hashlib.sha256(pool_bytes).hexdigest()
    return plan
