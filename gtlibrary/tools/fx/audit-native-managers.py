"""Inventory source manager references separately from imported consumers.
Static coverage only: metadata/constructor evidence is recorded, never treated as
visual acceptance or as proof every native type hides no additional state.
"""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
repo=args.repo;source=repo/'gtfx/assets/native-source/battleactions.json';actions=json.loads(source.read_text(encoding='utf8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
packfiles=sorted((repo/'gtfx/assets/native-characters').glob('*.json'));packs={p.stem:json.loads(p.read_text(encoding='utf8')) for p in packfiles}
myth=json.loads((repo/'docs/fx-myth-inventory.json').read_text(encoding='utf8'));mythIds={h['characterId'] for h in myth['heroes']}
entries=[]
for a in actions:
 if not(a.get('ComboAction') or a.get('ExtraAction') or 'manager' in a['Name'].lower()):continue
 consumers=[k for k,n in packs.items() if a['Name'] in n.get('actions',{})]
 typ=a['Name'].split(':')[0]
 if typ=='ManualMotorcycleStunt':status='distanceMagazine recipe';evidence='0x8aec09c equipped option parameters, 0x8aedc28 distance > ShootDist, 0x8aeed9c single shot/count, 0x8aef47c reload'
 elif typ=='ManualBranchComboManager':status='generic whole-group buff branch';evidence='0x88f7de0 IsConditionMatch; existing managed-actions.js'
 elif typ=='CwpMsChromeManager':status='source-only confirmed non-Combo manager';evidence='0x88f3050 CreateBattleAction reads CwpActionName then BattleActionFactory.Create; absent current imported packs'
 else:status='source-only field candidate';evidence='ExtraAction exists in table; ManualHeadButt/ManualSpineEventBase constructors inspected without a read of this field; executable branch not established'
 entries.append(dict(action=a['Name'],sourceFields=sorted(a),references={k:a[k] for k in ['ComboAction','ExtraAction','CwpActionName'] if k in a},importedConsumers=consumers,myth40Consumers=sorted(set(consumers)&mythIds),classification=status,evidence=evidence))
report=dict(schema=1,scope='All source rows selected by ComboAction/ExtraAction or manager type name; imported pack membership is a separate snapshot. No rendering or visual acceptance.',source=dict(file=str(source),sha256=sha(source),rows=len(actions)),snapshot=dict(nativePacks=len(packs),mythInventoryHeroes=len(myth['heroes']),importedHashes={p.stem:sha(p) for p in packfiles}),entries=entries,boundaries=['No whole-library proof for action classes with opaque native state and no selected manager field/name.','CwpMsChrome and ManualHeadButt are not current imported consumers; retained as source-only evidence.','legendaryhero ownership unchanged; no character or renderer data modified by this audit.'])
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(dict(sourceRows=len(actions),nativePacks=len(packs),candidates=len(entries),imported=[dict(action=e['action'],consumers=e['importedConsumers'])for e in entries if e['importedConsumers']],output=str(args.output))))
