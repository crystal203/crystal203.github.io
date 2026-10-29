"""Compare packaged FX blend modes with original Unity material properties.

Usage: python tools/fx/audit-material-blends.py --source D:/GTAsset/FullExtract/ExportedProject/Assets
Only materials with unambiguous _BlendA/_BlendB source properties are checked.
"""
from pathlib import Path
import argparse, collections, json, re, sys

repo=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True,help='Original ExportedProject/Assets directory')
parser.add_argument('--repo',type=Path,default=repo)
args=parser.parse_args()

source_modes=collections.defaultdict(set)
for file in args.source.rglob('*.mat'):
 try:
  data=file.read_text('utf8',errors='ignore')
 except OSError:continue
 a=re.search(r'(?m)^\s*_BlendA:\s*(\d+)',data)
 b=re.search(r'(?m)^\s*_BlendB:\s*(\d+)',data)
 if a and b:source_modes[file.stem].add((int(a[1]),int(b[1])))

actual=collections.defaultdict(lambda:collections.defaultdict(set))
for file in (args.repo/'gtfx/assets/characters').glob('*.json'):
 data=json.loads(file.read_text('utf8'))
 for effect in data['effects']:
  for system in effect.get('systems',[])+effect.get('statics',[]):
   for mat in system.get('materials') or [system.get('material')]:
    if mat and mat.get('name'):actual[mat['name']][mat['blend']].add(file.name)

expected_modes={(5,1):'add',(5,10):'alpha',(1,0):'opaque'}
checked=0;mismatches=[]
for name,modes in sorted(source_modes.items()):
 if len(modes)!=1 or name not in actual:continue
 expected=expected_modes.get(next(iter(modes)))
 if not expected:continue
 checked+=1
 for mode,files in actual[name].items():
  if mode!=expected:mismatches.append((name,expected,mode,sorted(files)))
print(f'Checked {checked} uniquely matched source materials; {len(mismatches)} blend mismatches')
for name,expected,mode,files in mismatches:print(f'{name}: source={expected}, packaged={mode}, files={", ".join(files)}')
sys.exit(bool(mismatches))
