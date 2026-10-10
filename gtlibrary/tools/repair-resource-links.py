"""Unify exact resource identities while preserving all public aliases and routes."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1] if 'gtlibrary' in str(Path(__file__)) else Path('D:/github/gtlibrary')
p=ROOT/'resources/registry.js';text=p.read_text(encoding='utf8');registry=json.loads(text[text.index('{'):].rstrip(';\n\r '));entities=registry['entities'];aliases=registry['aliases'];audit_path=ROOT/'tools/resource-link-repairs.json';audit=json.loads(audit_path.read_text(encoding='utf8')) if audit_path.exists() else []
def merge(old,new,reason):
 if old not in entities or new not in entities:return
 source=entities.pop(old);target=entities[new]
 for key in ['spine','illust','atlas','fx','effectCount']:
  if key in source and key not in target:target[key]=source[key]
 if target['name']==new and source['name']!=old:target['name']=source['name']
 target['aliases']=list(dict.fromkeys(target['aliases']+source['aliases']+[old,new]))
 for alias,identity in list(aliases.items()):
  if identity==old:aliases[alias]=new
 aliases[old]=new;aliases[new]=new;audit.append({'alias':old,'canonical':new,'name':target['name'],'reason':reason})
for old,new in [('demonengineer_bunnyandroid','demon_engineer_bunny_android'),('sunyeo_firepower','sunyeo_fire_power')]:merge(old,new,'Unique separator-only FX identity match')
for identity,entity in list(entities.items()):
 if not identity.startswith('spine_character_'):continue
 name=entity.get('spine',{}).get('name');target=entities.get(name)
 if target and 'spine' not in target:merge(identity,name,'Exact Spine resource name matches existing atlas identity')
p.write_text('window.GTLibraryRegistry = '+json.dumps(registry,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8');audit_path.write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print('Identity repairs recorded:',len(audit))
