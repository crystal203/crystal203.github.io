import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('ir',Path(__file__).with_name('screenplay-ir.py'))
ir=importlib.util.module_from_spec(spec);spec.loader.exec_module(ir)
source=ir.native_json('{"setting":{"$hero":{"find":"player"}},"play":[{"$hero sequence":[{"talk":{"code":"line","en_us":"comma, } stays"}},{"call":{"name":"StageCallback","args":[1,2]}}]},{"unknown":{"opaque":[1,2,3]}},],}')
doc=ir.ScreenplayIR().document(source,'fixture.json','test')
assert {k:ir.native_value(v) for k,v in doc['sections'].items()}==source
assert doc['stageCallbacks']==['StageCallback'];assert doc['requiredOperationAdapters']==['unknown']
assert doc['runtimeReady'] is False
actor=doc['sections']['play']['children'][0]['children'][0]
assert actor['kind']=='actor' and actor['mode']=='sequence'
assert doc['sections']['setting']['kind']=='parallel'
try:ir.native_json('{"talk":1,"talk":2}')
except ValueError as e:assert 'Duplicate' in str(e)
else:raise AssertionError('Duplicate operations must never silently disappear')
print('PASS lossless IR round-trip, parallel/sequence/actor scopes, callback arguments, unknown-operation blockers, native trailing commas and duplicate-key rejection.')
