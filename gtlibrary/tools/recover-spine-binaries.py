"""Repair earlier lossy UTF-8 exports using byte-exact source TextAssets."""
from pathlib import Path
import sys,json,hashlib
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs');import UnityPy
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path('E:/GTFiles/files/AssetBundles/Android');OUT=ROOT/'resources/spine-recovered';OUT.mkdir(exist_ok=True)
rows=[];aliases={}
for rel,folder in [('illusts/twins_android','illust'),('characters/part2/maam_magicgunner','character')]:
 bundle=SOURCE/rel
 for o in UnityPy.load(str(bundle)).objects:
  if o.type.name!='TextAsset':continue
  d=o.read()
  if not d.m_Name.endswith(('.skel','.atlas')):continue
  file=d.m_Name[:-5]+'.bytes' if d.m_Name.endswith('.skel') else d.m_Name;raw=d.m_Script.encode('utf-8','surrogateescape');(OUT/file).write_bytes(raw);aliases['resources/spine/'+folder+'/'+file]='resources/spine-recovered/'+file
  rows.append({'bundle':str(bundle),'file':file,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
p=ROOT/'core/resources.js';s=p.read_text(encoding='utf-8');start=s.index('aliases=')+8;end=s.index(',domains=',start);a=json.loads(s[start:end]);a.update(aliases);s=s[:start]+json.dumps(a,separators=(',',':'))+s[end:];p.write_text(s,encoding='utf-8')
(ROOT/'tools/spine-recovery-audit.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');print('Recovered',len(rows),'source binaries')
