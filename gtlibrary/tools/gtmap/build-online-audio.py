"""Extract the original 1-1 music/interaction clips, then encode web audio."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--unitypy',type=Path,default=Path('E:/GTFiles/GTMap/GTMapWeb/tools/python-libs'));ap.add_argument('--ffmpeg',default='ffmpeg');a=ap.parse_args();sys.path.insert(0,str(a.unitypy));import UnityPy
out=Path(__file__).resolve().parents[2]/'gtonline/assets/audio';out.mkdir(parents=True,exist_ok=True);sources=[]
wanted={'bgm_forest_bright','bgm_forest_event','bgm_forest_dark','03_get_purplecoin_01','03_get_starpiece_01','02_sword_attack_01','01_gate_show_01'}
files=[a.source/'files/AssetBundles/Android/audio/bgms'/n for n in sorted(wanted) if n.startswith('bgm_')]+[a.source/'files/AssetBundles/Android/audio/sfx/sfxs1']
for p in files:
 env=UnityPy.load(str(p))
 for obj in env.objects:
  if obj.type.name!='AudioClip':continue
  d=obj.read()
  if d.m_Name not in wanted:continue
  samples=d.samples
  if not samples:raise RuntimeError('Audio decode failed: '+d.m_Name)
  wave=next(iter(samples.values()));dest=out/(d.m_Name+'.ogg');subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-i','pipe:0','-c:a','libvorbis','-q:a','4',str(dest)],input=wave,check=True)
  sources.append({'name':d.m_Name,'bundle':str(p.relative_to(a.source)).replace('\\','/'),'bundleSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'file':dest.name,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()});wanted.remove(d.m_Name)
assert not wanted,wanted
(out/'source.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n','utf8');print('Extracted',len(sources),'original audio clips')
