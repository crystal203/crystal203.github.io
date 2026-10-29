"""Package the original battle/style/projectile rows for browser-side FX plans.

Run with --source-dir pointing at a decoded StaticData directory. The output is
lossless for action timing and projectile kinematics; no preview timings are
invented here.
"""
import argparse,json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--source-dir',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
def read(name):return json.loads((args.source_dir/name).read_text(encoding='utf8'))
styles=read('battlestyles.json')['BattleStyles']
actions=read('battleactions.json')
projectiles=read('projectiles.json')
heroes=read('heroes.json')
options=read('options.json')
pool_specs=read('objectpoolspec.json')
data={
 'source':'StaticData/battlestyles.json + battleactions.json + projectiles.json + heroes.json + options.json + objectpoolspec.json',
 'styles':{s['Name']:s for s in styles if s.get('BattleActions')},
 'actions':{a['Name']:a for a in actions if a.get('Name')},
 'projectiles':{p['Name']:p for p in projectiles if p.get('Name')},
 'heroClasses':{h['Name']:h['Class'] for h in heroes if h.get('Name') and h.get('Class')},
 'options':{o['Name']:o for o in options if o.get('Name') and o.get('PresetInfo')},
 'presetDirections':{p['PresetName']:p['Direction'] for p in pool_specs if p.get('PresetName') and p.get('Direction')},
}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print(f"Packaged {len(data['actions'])} actions, {len(data['projectiles'])} projectiles, {len(data['styles'])} styles")
