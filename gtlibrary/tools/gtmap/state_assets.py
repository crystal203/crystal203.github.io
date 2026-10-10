"""Keep only art referenced by interactive templates in each state sidecar."""
from pathlib import Path
import json,gzip

def trim(data):
 templates=list(data['templates'].values());meshes={p['mesh'] for t in templates for p in t['parts']}|{s['renderer']['mesh'] for t in templates for s in t['systems'] if s['renderer'].get('mesh')};materials={m for t in templates for p in t['parts'] for m in p['materials']}|{m for t in templates for s in t['systems'] for m in s.get('materialKeys',[s['materialKey']])}|{m for t in templates for s in t['sprites'] for m in s['materials']};sprites={s['sprite'] for t in templates for s in t['sprites']}|{id for t in templates for s in t['systems'] for id in s['modules'].get('UVModule',{}).get('sprites',[])}
 data['meshes']={k:v for k,v in data['meshes'].items() if k in meshes};data['materials']={k:v for k,v in data['materials'].items() if k in materials};data['sprites']={k:v for k,v in data['sprites'].items() if k in sprites};textures={e['texture'] for m in data['materials'].values() for e in m['texenvs'].values() if e.get('texture')}|{s['texture'] for s in data['sprites'].values()};data['textures']={k:v for k,v in data['textures'].items() if k in textures};return data

if __name__=='__main__':
 root=Path(__file__).resolve().parents[2]/'gtmap/assets';manifest=json.loads((root/'native-states.json').read_text(encoding='utf8'));before=after=0;needed=set()
 for path in manifest['sets'].values():
  file=root/path;before+=file.stat().st_size;data=trim(json.loads(gzip.decompress(file.read_bytes())));file.write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0));after+=file.stat().st_size;needed.update(t['url'] for t in data['textures'].values())
 print('State sidecars bytes:',before,'->',after)
