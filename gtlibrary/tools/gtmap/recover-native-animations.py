"""Recover serialized CustomAnimator states on cooperative damage floor meshes."""
from pathlib import Path
import sys,json,hashlib
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs');import UnityPy
ROOT=Path(__file__).resolve().parents[2];SOURCE=Path('E:/GTFiles/files/AssetBundles/Android');result={};audit=[]
for rel,tileset in [('ondemand/coop_expedition/tilesets','coop_expedition.tileset'),('ondemand/coop_expedition/s2/tilesets','coop_expedition_s2.tileset'),('ondemand/coop_expedition/s3/tilesets','coop_expedition_s3.tileset')]:
 bundle=SOURCE/rel
 if not bundle.exists():continue
 env=UnityPy.load(str(bundle));key=rel+':'+tileset;result[key]={}
 for obj in env.objects:
  if obj.type.name!='GameObject':continue
  go=obj.read()
  if not go.m_Name.startswith('[gimmick]dot_tile_'):continue
  nodes={}
  def visit(go):
   components=[c.component for c in go.m_Component]
   if any(c.type.name=='MeshRenderer' for c in components):
    for c in components:
     if c.type.name=='MonoBehaviour' and c.read().m_Script.read().m_ClassName=='CustomAnimator':
      data=c.read_typetree();nodes[go.m_Name]={k:data[k] for k in ['EnableUpdate','StartState','States']}
   for c in components:
    if c.type.name=='Transform':
     for child in c.read().m_Children:visit(child.read().m_GameObject.read())
  visit(go)
  if nodes:result[key][go.m_Name]=nodes
 audit.append({'source':str(bundle),'sourceSha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'tiles':list(result[key])})
(ROOT/'gtmap/assets/native-animations.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
(ROOT/'tools/gtmap/evidence/native-animation-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8');print('Native animated floor templates',sum(len(v) for v in result.values()))
