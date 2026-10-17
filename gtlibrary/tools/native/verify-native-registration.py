import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_controller',Path(__file__).with_name('native-controller-image.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
image=module.RegisteredImage(Path('E:/GTFiles/native-workbench/11ad39a67bb2a7ba/profile.json'))
try:
    assert image.usage(0x2001897b)['name']=='Oak.TreasureOpenedEvent'
    assert image.usage(0x200186b1)['name']=='Oak.TouchControlModeChangeEvent'
    assert image.usage(0x2001a4b9)['name']=='Oak.ZoneEnterEvent'
    assert image.usage(0xc0069323)['name']=='Oak.StageProgress.GetCustomData'
    sfx=image.describe('Oak.SfxInfo')
    assert sfx['byvalType']['kind']==17
    assert next(f for f in sfx['fields'] if f['name']=='fadeInTime')['offset']-16==0x58
    chest=image.describe('Oak.TreasureBehaviour')
    assert next(f for f in chest['fields'] if f['name']=='<DontFinish>k__BackingField')['offset']==0xa8
    spine=image.describe('Oak.SpineController')
    damage=next(m for m in spine['methods'] if m['address']=='0x6ccb29c')
    assert [(p['name'],p['type']['name']) for p in damage['parameters']][:3]==[('broad','System.Single'),('narrow','System.Single'),('frequency','System.Int32')]
    external=image.describe('Foundations.WaitAll')
    assert all(m.get('address') is None for m in external['methods']),'Never map another assembly through Scripts.dll RID addresses'
    print('PASS native registration method anchors, recovered event identities, StageProgress persistence, unboxed SfxInfo fade-in offset, DontFinish offset and exact DamageSquish signature.')
finally:image.close()
