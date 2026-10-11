"""Crop original game HUD frames without replacing them with drawn icons."""
import argparse,hashlib,json,sys
from pathlib import Path
sys.path.insert(0,'E:/GTFiles/GTMap/GTMapWeb/tools/python-libs')
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path('D:/github/gtlibrary'));ap.add_argument('--output',type=Path,default=Path('E:/GTFiles/online-hud'));a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True)
groups={'battle':{'dpad-off':'dpad_off.png','dpad-on':'dpad_on.png','action-circle':'actbtn_circle_174px.png','action-line':'actbtn_circleline_174px.png','attack':'actbtn_ic_normal_atk.png','dash':'actbtn_ic_act_dash.png','jump':'actbtn_ic_act_jump.png','talk':'actbtn_ic_act_talk.png','throw':'actbtn_ic_act_throw.png','push':'actbtn_ic_act_push.png','drill':'actbtn_ic_act_drill.png','hold':'actbtn_ic_object.png','exit':'actbtn_ic_act_exit.png','hp-frame':'hp_box.png','hp-fill':'hp_bar_hp.png','star':'[ICON]resource1_starpiece.png','quest-arrow':'arrow_quest_main.png'},'MainUiS3':{'pause':'ic_pause_00','settings':'ic_building_setting_00','chest':'ic_empty_treasurebox_00','coin':'ic_shop_purplecoin_00','button-pause':'btn_pause_00'},'characters':{'knight':'knight_male_2'},'items':{'coin':'purple_coin_1'}}
audit={};previews=[]
for atlas,images in groups.items():
 sheet=json.loads((a.root/'gtatlas/assets'/f'{atlas}.json').read_text('utf8'));image=Image.open(a.root/'gtatlas/assets'/f'{atlas}.png').convert('RGBA')
 for out,name in images.items():
  if name not in sheet['frames']:print('missing',atlas,name);continue
  f=sheet['frames'][name];r=f['frame'];w,h=(r['h'],r['w']) if f.get('rotated') else (r['w'],r['h']);crop=image.crop((r['x'],r['y'],r['x']+w,r['y']+h))
  if f.get('rotated'):crop=crop.transpose(Image.Transpose.ROTATE_90)
  size=f.get('sourceSize',{'w':crop.width,'h':crop.height});trim=f.get('spriteSourceSize',{'x':0,'y':0});frame=Image.new('RGBA',(size['w'],size['h']));frame.paste(crop,(trim['x'],trim['y']));frame.save(a.output/(out+'.png'));audit[out]={'atlas':atlas,'frame':name,'source':f,'sha256':hashlib.sha256((a.output/(out+'.png')).read_bytes()).hexdigest()};previews.append((out,frame))
(a.output/'source.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n','utf8')
preview=Image.new('RGB',(800,((len(previews)+5)//6)*145),'#645b49');draw=ImageDraw.Draw(preview)
for i,(name,im) in enumerate(previews):
 x=(i%6)*133;y=(i//6)*145;im.thumbnail((112,112));preview.paste(im,(x+(133-im.width)//2,y),im);draw.text((x+4,y+118),name,fill='white')
preview.save('E:/GTFiles/online-hud-preview.png');print('Original HUD sprites:',len(audit))
