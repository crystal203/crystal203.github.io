"""Curated, source-backed FireWorld preview fragments; does not evaluate Lua."""
import argparse,hashlib,json
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'gtmap/assets/event-scenes.json');a=ap.parse_args()
text=json.loads((a.source/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'))
def command(op,target=None,at=0,**kw):return dict(at=at,op=op,**({'target':target} if target else {}),**kw)
def evidence(paths):return [{'path':p,'sha256':hashlib.sha256((a.source/p).read_bytes()).hexdigest()} for p in paths]
actors=[{'handle':'preview_leader','resource':'knight_male_2','name':'预览队长（男骑士）','position':[8.5,1,4.5]},{'handle':'princess'},{'handle':'dragon_boy'},{'handle':'balloon'},{'handle':'preview_pilot','resource':'dragon_boy_2','name':'飞船驾驶员','position':[2.4,1,.2],'direction':'left'}]
starts={'preview_leader':[8.5,1,4.5],'princess':[8.5,1,5.5],'dragon_boy':[9.5,1,4],'balloon':[11.5,1,11]}
commands=[command('camera',at=0,position=[-1.5,0,0],span=9)]
for handle,p in starts.items():commands += [command('teleport',handle,position=p),command('visible',handle,value=True),command('move',handle,points=[[-5,0,-5]],relative=True,duration=3,direction='left',animation='idle',endAnimation='idle')]
for h,p in {'preview_leader':[-2,0,0],'princess':[-1,0,.5],'dragon_boy':[-1,0,-.5]}.items():commands += [command('move',h,at=4.3,points=[p],duration=1,animation='get',direction='left',lastDirection='right'),command('jump',h,at=4.3,height=2.5,duration=1)]
commands += [command('visible','preview_pilot',at=5.3,value=True)]
for i,key in enumerate(['fw_main_s1_53','fw_main_s1_54','fw_main_s1_55','fw_main_s1_56']):commands.append(command('dialogue',at=5.3+i*4,duration=4,text=('公主：' if i==3 else '驾驶员：')+text.get(key,key)))
commands.append(command('pose','princess',at=17.3,expression='smile',direction='right'))
landing={'id':'fireworld-landing','version':1,'map':'fireworld_1','title':'火世界 · 飞船着陆片段','duration':21.3,'actors':actors,'commands':commands,'source':'Quest/Main/FireWorld/Main/Section1.lua · CharacterPlacer/Main/Section1.lua','notes':'走位坐标、3 秒平移、1.3 秒等待和 1 秒着陆来自原脚本；跳跃曲线采用高度 2.5 的抛物线近似。队长以可替换的男骑士预览；对白取中文静态表，每句暂用 4 秒。音效、屏幕淡入和震屏未接入。','evidence':evidence(['decrypted/Quest/Main/FireWorld/Main/Section1.lua','decrypted/Quest/Main/FireWorld/CharacterPlacer/Main/Section1.lua','Tilemaps_decoded/fireworld_1.tilemap','static_data_dec/strings-zhCN.json'])}
actors=[{'handle':'preview_leader','resource':'knight_male_2','name':'预览队长（男骑士）','position':[7.5,0,177]},{'handle':'princess'},{'handle':'dragon_boy'},{'handle':'fire_bishop'}]
commands=[command('camera',position=[7.5,0,180],span=9)]
for handle,p,target in [('preview_leader',[7.5,0,177],[7.5,0,180]),('princess',[6.5,0,177],[6.5,0,180]),('dragon_boy',[7.5,0,178],[7.5,0,181]),('fire_bishop',[8.5,0,177],[8.5,0,180])]:commands += [command('teleport',handle,position=p),command('visible',handle,value=True),command('move',handle,points=[target],duration=1,direction='back')]
commands += [command('camera',at=1,position=[7.5,0,182.5],duration=1),command('gimmick','s23_gate_1',at=7.5,state='open'),command('camera',at=10,position=[7.5,0,180],duration=1)]
gate={'id':'fireworld-barrier','version':1,'map':'fireworld_5','title':'火世界 · 封印大门开启片段','duration':12,'actors':actors,'commands':commands,'trigger':{'kind':'interact','target':'s23_gate_1','radius':2},'source':'Quest/Main/FireWorld/Main/Section23.lua · stageeventcontrollers/FireWorld/Stage5.lua:gate_open','notes':'对齐目标、时长、等待顺序与 open 动画调用来自原脚本。人物入场起点是预览布置；徽章特效、音效、震屏、任务条件与存档未执行。可设置交互触发后手动触发。','evidence':evidence(['decrypted/Quest/Main/FireWorld/Main/Section23.lua','decrypted/stageeventcontrollers/FireWorld/Stage5.lua','Tilemaps_decoded/fireworld_5.tilemap'])}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps({'version':1,'scenes':[landing,gate]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('Wrote',a.output)
