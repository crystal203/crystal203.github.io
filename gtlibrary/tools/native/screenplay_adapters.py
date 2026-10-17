"""Explicit local stage adapters; raw native scripts never execute Python."""
import importlib.util,re
from pathlib import Path

def load_stage_module(name):
    if not re.fullmatch('[a-z][a-z0-9-]{0,63}',name):raise ValueError('Invalid stage adapter name')
    path=Path(__file__).with_name('stages')/(name+'.py')
    if not path.is_file():raise ValueError('Stage adapter is not registered: '+name)
    spec=importlib.util.spec_from_file_location('stage_adapter_'+name.replace('-','_'),path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def load_bindings(name,stage):return load_stage_module(name).bindings(stage) if name else ({},{})

def build_declared_screenplays(stage,name):
    adapter=load_stage_module(name)
    spec=importlib.util.spec_from_file_location('screenplay_ir_pipeline',Path(__file__).with_name('screenplay-ir.py'))
    ir=importlib.util.module_from_spec(spec);spec.loader.exec_module(ir)
    plans={}
    for key,declaration in adapter.SCREENPLAYS.items():
        resource=declaration['resource'];event=stage['nativeEvents'][resource]
        document=ir.ScreenplayIR().document(event['data'],'files/events/'+resource+'.json',event['sha256'])
        plan=ir.lower(document,stage,declaration['section'],name)
        plan['nativeEvidence']=declaration['evidence'];plans[key]=plan
    return plans
