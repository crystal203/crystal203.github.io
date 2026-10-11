"""Recover game speech panels and the localized font from existing local assets."""
import argparse,hashlib,json,sys,zipfile
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--apk',type=Path,required=True);ap.add_argument('--output',type=Path);ap.add_argument('--python-libs',type=Path,default=Path('E:/GTFiles/GTMap/GTMapWeb/tools/python-libs'));a=ap.parse_args();sys.path.insert(0,str(a.python_libs));import UnityPy;from PIL import Image
    output=a.output or a.root/'gtmap/assets/dialogue';output.mkdir(parents=True,exist_ok=True);bundle_path='assets/AssetBundles/Android/fonts/zh-hans';bundle=zipfile.ZipFile(a.apk).read(bundle_path);font=next(o.read_typetree() for o in UnityPy.load(bundle).objects if o.type.name=='Font');data=bytes(font['m_FontData']);(output/'game-zh.ttf').write_bytes(data)
    atlas=a.root/'gtatlas/assets';frames=json.loads((atlas/'battle.json').read_text('utf8'))['frames'];image=Image.open(atlas/'battle.png');names=['bubble.png','bubble_arrow_c_f.png','bubble_arrow_c_b.png','bubble_shout.png','bubble_think.png','bubble_think_arrow_bottom_01.png']
    for name in names:
        r=frames[name]['frame'];crop=image.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h']));crop.save(output/name)
    provenance={'font':{'name':font['m_Name'],'source':a.apk.name,'bundle':bundle_path,'bundleSha256':hashlib.sha256(bundle).hexdigest(),'fontSha256':hashlib.sha256(data).hexdigest()},'panel':{'prefab':'ui/stage/speech_bubble_new.prefab','atlas':'gtatlas/assets/battle','sliceRect':[9,16,9,9],'webBorderImageSlice':[9,9,16,9],'sliceCoordinates':'trimmed atlas frame; sourceSize padding is not part of the nine-slice','color':[.19215687,.14509805,.14509805,1],'fontSize':29,'webScale':.62},'sprites':{name:frames[name] for name in names}};(output/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n','utf8');print(font['m_Name'],len(data),'bytes;',len(names),'native sprites')

if __name__=='__main__':main()
