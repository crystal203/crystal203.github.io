import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('compiler',Path(__file__).with_name('screenplay-compiler.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
stage={'map':'test','stageName':'test','actors':{'leader':{'handle':'leader','position':[0,0,0]}},'strings':{'line':'原生对白'}}
source={'setting':{'$player':{'find':'player'}},'test':[{'focus_camera':{'position':[1,0,2],'duration':3}},{'$player':{'jump':{'height':1,'duration':.2}}},{'$player':{'talk':{'code':'line'}}}]}
plan=module.ScreenplayCompiler(stage).compile(source,'test','test.json')
assert plan['commands'][-1]['at']==3+module.single(.2)
assert plan['commands'][-1]['typeSpeed']==module.single(.05)
parallel={'setting':{'$player':{'find':'player'}},'test':{'$player':{'jump':{'height':1,'duration':1},'talk':{'code':'line'}}}}
plan=module.ScreenplayCompiler(stage).compile(parallel,'test','test.json')
assert plan['commands'][0]['at']==plan['commands'][1]['at']==0,'native actor object operations run concurrently'
sequence={'setting':{'$player':{'find':'player'}},'test':{'$player sequence':{'jump':{'height':1,'duration':1},'talk':{'code':'line'}}}}
plan=module.ScreenplayCompiler(stage).compile(sequence,'test','test.json')
assert plan['commands'][1]['at']==1,'explicit sequence waits for its previous operation'
emotions={'setting':{'$player':{'find':'player'}},'test':{'$player sequence':[{'emotion':{'name':'surprise','repeat':'once'}},{'remove_emotion':None}]}}
plan=module.ScreenplayCompiler(stage).compile(emotions,'test','test.json')
assert plan['commands'][0]['expression']=='surprise' and plan['commands'][0]['expressionLoop'] is False
assert plan['commands'][1]['expression']=='idle'
plan=module.ScreenplayCompiler(stage).compile({'test':{'play_sfx':'01_hit_comic_01'}},'test','test.json')
assert plan['commands']==[{'at':0,'op':'sound','name':'01_hit_comic_01'}] and plan['duration']==0
try:module.ScreenplayCompiler(stage).compile({'test':{'focus_camera':{'position':[0,0,0],'duration':1,'unknown_option':True}}},'test','test.json')
except ValueError as e:assert 'unknown_option' in str(e)
else:raise AssertionError('Unsupported native parameters must not silently disappear')
try:module.ScreenplayCompiler(stage).compile({'test':{'unknown_native_operation':True}},'test','test.json')
except ValueError as e:assert 'unknown_native_operation' in str(e)
else:raise AssertionError('Unknown native operations must fail, never silently disappear')
print('PASS native default waits, float32 values, localized dialogue and rejection of unsupported operations.')
