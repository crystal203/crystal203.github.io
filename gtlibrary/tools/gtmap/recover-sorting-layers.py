from pathlib import Path
import json,sys,zipfile,hashlib
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs')
import UnityPy
root=Path('D:/github/gtlibrary')
apk=zipfile.ZipFile('E:/GTFiles/_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
raw=apk.read('assets/bin/Data/globalgamemanagers')
env=UnityPy.load(raw)
for o in env.objects:
 if o.type.name=='TagManager':
  layers=o.read_typetree()['m_SortingLayers']; print(layers)
  data={'source':'assets/bin/Data/globalgamemanagers','sha256':hashlib.sha256(raw).hexdigest(),'layers':layers}
  (root/'gtmap/assets/sorting-layers.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
