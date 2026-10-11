"""Native CharacterPlaceholder.Deserialize 0x76386911fa74, versions 1–11."""
import json
from strict_kong import Reader
def read_character(data):
 r=Reader(data);v=r.unpack('i');out={'version':v}
 if not 1<=v<=11:raise ValueError('unknown CharacterPlaceholder version')
 out['characterId']=r.string();k=out['kind']=r.unpack('B')
 out['field3c']=r.unpack('i');out['fieldf0']=r.string()
 if v>=8:out['fieldf8']=r.unpack('i')
 if v>=9:out['fieldfc']=r.unpack('i')
 out['tags']=[{'tag':r.unpack('B'),'value':r.string()} for _ in range(r.count())] if v>=6 else []
 out['field38']=r.unpack('i');out['field40']=r.boolean() if v>=4 else False
 if k in (1,2):
  for field in ('60','68','70','78','80'):out['field'+field]=r.string()
  out['fielda8']=r.boolean();out['fielda9']=r.boolean()
  if v>=4:
   out['field44']=r.unpack('i');out['field48']=r.boolean();out['field4c']=r.unpack('i');out['field41']=r.boolean()
  if v>=5:
   mode=out['field50']=r.unpack('i')
   if mode==1:out['field54']=r.unpack('i')
   if mode in (1,2):out['field58']=r.string()
  out['hasAppearanceOverride']=r.boolean() if v>=7 else False
  if out['hasAppearanceOverride']:
   out['appearanceName']=r.string();out['color32']=r.unpack('4B');out['appearanceValue']=r.unpack('f')
 if k==3 and v==2:out['fieldb0']=r.string();out['fieldb8']=r.string()
 if k!=1:
  if v!=2:out['fieldb0']=r.string();out['fieldb8']=r.string()
  out['fieldc0']=r.unpack('i')
  if v>=10:out['fieldc4']=r.unpack('f')
  out['fieldc8']=r.unpack('B')
  if v>=11:out['fieldd8']=r.boolean()
  out['fieldd0']=[r.unpack('iiif') for _ in range(r.count())]
 spec=r.string();out['overrides']=json.loads(spec) if spec else None
 if r.pos!=len(data):raise ValueError(str(len(data)-r.pos)+' unexplained bytes')
 return out
