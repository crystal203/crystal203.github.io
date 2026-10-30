"""Static material acceptance for supplied character indexes (no rendering)."""
import argparse,json
from pathlib import Path
from native_material_contract import validate_materials

def strings(value):
    if isinstance(value,str):yield value
    elif isinstance(value,list):
        for item in value:yield from strings(item)
    elif isinstance(value,dict):
        for item in value.values():yield from strings(item)

parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--index',type=Path,nargs='+',required=True);args=parser.parse_args()
counts={'characters':0,'effects':0,'materials':0}
for index in args.index:
    native=index.parent.parent/'native-characters'/index.name
    pack=json.loads(native.read_text(encoding='utf8'));data=json.loads(index.read_text(encoding='utf8'))
    refs=set(strings([pack.get(key) for key in ('actions','projectiles','options','graphs','costumes','summonables','plans')]))
    result=validate_materials(data,refs);counts['characters']+=1
    for key in ('effects','materials'):counts[key]+=result[key]
print(json.dumps({'passed':True,**counts,'imageTests':0}))
