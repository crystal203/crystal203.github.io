"""One source fixture for rank-gated special nodes and missing atlas rendering."""
import copy
import json
from pathlib import Path
from native_awakening import SourceAwakening
from native_material_contract import effect_render_issues

repo=Path(__file__).resolve().parents[2]
source=repo/'gtfx/assets/native-source'
heroes={h['Name']:h for h in json.loads((source/'heroes.json').read_text(encoding='utf8'))}
tree=SourceAwakening(source)
base=tree.for_hero(heroes['mad_scientist_5'])
ascent=tree.for_hero(heroes['mad_scientist_ascent'])
upgrades={10300031,10310031,10320031,10340031}
assert not upgrades&set(base['optionIds'])
assert upgrades<=set(ascent['optionIds'])
assert all(r['requiredRank']==5 and r['requiredLimitBreak']==0 for r in ascent['options'] if r.get('OptionId') in upgrades)
index=json.loads((repo/'gtfx/assets/characters/madscientist.json').read_text(encoding='utf8'))
effect=next(e for e in index['effects'] if e['preset']=='fx_m_dark_flask')
assert not effect_render_issues(effect,index)
old=copy.deepcopy(effect);old['statics']=[]
assert len(effect_render_issues(old,index))==2
assert not effect_render_issues({'scripts':[{'node':'x','type':'Controller','fields':{'m_Enabled':1}}]},index)
print(json.dumps({'passed':True,'baseRank':base['rank'],'ascentRank':ascent['rank'],'rank5Options':sorted(upgrades),'missingCustomSpriteBlocked':True,'imageTests':0}))
