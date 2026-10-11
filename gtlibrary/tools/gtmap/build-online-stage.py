"""Build the playable 1-1 definition from native KONG, metadata and event JSON.
No game source is executed in the browser. Timelines use the shared MapEventPlayer.
"""
import argparse,copy,gzip,hashlib,json,math,re,sys,zipfile
from pathlib import Path
from strict_kong import parse

def merge(a,b):
 out=copy.deepcopy(a)
 for k,v in (b or {}).items():out[k]=merge(out.get(k,{}) if isinstance(out.get(k),dict) else {},v) if isinstance(v,dict) else copy.deepcopy(v)
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);a=ap.parse_args();src=a.source;root=a.root;out=root/'gtonline/assets';out.mkdir(parents=True,exist_ok=True)
 strings=json.loads((src/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'));stages=json.loads((src/'static_data_dec/stages.json').read_text('utf-8-sig'));stage=next(s for s in stages if s['Name']=='easy_forest_1_1');mapname=stage['Tilemap']['Default'];assert mapname=='alt_forest_1_1_2_2'
 doc=parse((src/'Tilemaps_decoded'/f'{mapname}.tilemap').read_bytes());items=json.loads(gzip.decompress((root/'gtmap/assets/item-metadata.json.gz').read_bytes()));meta=json.loads(gzip.decompress((root/'gtmap/assets/character-metadata.json.gz').read_bytes()));native=json.loads((src/'files/events/ForestMainNew.json').read_text('utf-8-sig'))
 actors={};markers={};regions={};objects=[]
 # Native colliders are centered on tile transforms, not guessed from rendered bounds.
 sys.path.insert(0,str(src/'GTMap/GTMapWeb/tools/python-libs'))
 import UnityPy
 collider_templates={};collider_sources={}
 apk=zipfile.ZipFile(src/'_fromTry/ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk')
 for tileset in doc['tilesets']:
  bundle=src/'files/AssetBundles/Android/tilesets'/tileset['name']
  try:raw=bundle.read_bytes() if bundle.is_file() else apk.read('assets/AssetBundles/Android/tilesets/'+tileset['name'])
  except KeyError:continue
  env=UnityPy.load(raw);byid={o.path_id:o for o in env.objects};templates={}
  for obj in env.objects:
   if obj.type.name!='GameObject':continue
   go=obj.read_typetree();components=[byid.get(c['component']['m_PathID']) for c in go['m_Component']]
   if not any(c and c.type.name=='MonoBehaviour' and c.read_typetree().get('tilesetId') for c in components):continue
   for c in components:
    if not c or c.type.name!='BoxCollider':continue
    box=c.read_typetree()
    if box.get('m_IsTrigger') or not box.get('m_Enabled',True):continue
    templates[go['m_Name']]={'center':[box['m_Center'][axis] for axis in ['x','z']],'size':[box['m_Size'][axis] for axis in ['x','z']]}
  collider_templates[tileset['name']]=templates;collider_sources[tileset['name']]=hashlib.sha256(raw).hexdigest()

 def actor(handle,key,position,visible=False):
  row=meta['rows'].get(key,{});ref=row.get('spine') or key
  if isinstance(ref,dict):ref=ref.get('default') or next(iter(ref.values()))
  base,_,skin=ref.partition('#');parts=base.split(':');resource=parts[-1].split('/')[-1] if '/' in base or len(parts)==1 else parts[0];skin=skin or (parts[1] if len(parts)==2 and '/' not in base else '')
  resource=meta['aliases'].get(resource,resource);assert resource in meta['assets'],(handle,key,resource)
  return {'handle':handle,'npc':key,'resource':resource,'skin':skin,'position':list(position),'direction':'front','visible':visible}
 for l in doc['layers']:
  for i,e in enumerate(l.get('events',[])):
   props=[p for p in l.get('properties',[]) if p['index']==i];markers.setdefault(e['name'],list(e['position']))
   for p in props:
    v=p['payload'].get('value',{})
    if p['component']=='Tilemaps.CharacterPlaceholder':
     pos=e['position'];pos=pos if max(abs(pos[0]),abs(pos[2]))<900 else markers.get('default_start',[.5,0,0]);actors[e['name']]=actor(e['name'],v['characterId'],pos,False);actors[e['name']]['monster']=l['name']=='monsters'
    if p['component']=='Tilemaps.Region':
     c=v['centerCandidate'];size=v['sizeCandidate'];pos=e['position'];regions[e['name']]={'center':[pos[0]+c[0],pos[1]+c[1],pos[2]+c[2]],'size':list(size)}
  for pi,part in enumerate(l.get('partitions',[])):
   for ti,t in enumerate(part['tiles']):
    props=[p for p in part.get('properties',[]) if p['index']==ti and p['component']=='Tilemaps.TileProp'];v=props[0]['payload'].get('value',{}) if props else {};spec=merge(items['defaults'].get(doc['tilesets'][t['ts']-1]['name'],{}).get(t['name'],{}),v.get('overriddenComponentSpec'));name=t['name'].lower();kind=''
    if spec.get('Pushable',{}).get('__class__')=='Oak.UnitPushable':kind='push';cat=1
    elif spec.get('CrashBehaviour',{}).get('__class__')=='Oak.SpikeCrashBehaviour':kind='spike';cat=1
    elif 'purple_coin' in name:kind='coin';cat=2
    elif 'star_piece' in name:kind='star';cat=3
    elif 'floating_item' in name:kind='item';cat=4
    elif 'chest' in name:kind='chest';cat=5
    elif 'battlegate' in name:kind='gate';cat=1
    elif 'door_forest' in name:kind='door';cat=1
    elif 'brazier' in name:kind='brazier';cat=1
    elif 'switch' in name:kind='switch';cat=1
    elif 'rock' in name or l['name']=='breakable':kind='breakable';cat=1
    elif spec.get('Interactable',{}).get('MoveStage'):kind='portal';cat=7
    elif 'signboard' in name:kind='sign';cat=1
    elif 'substage_map' in name:kind='map';cat=1
    if not kind:continue
    idx=v.get('keyIndex',0);handles=doc['handleNames'].get(cat,[]);handle=handles[idx] if idx<len(handles) and idx else ''
    position=[t['x'],t['y']/2,t['z']];obj={'id':f"{doc['layers'].index(l)}:{sum(len(p['tiles']) for p in l['partitions'][:pi])+ti}",'kind':kind,'name':t['name'],'handle':handle,'position':position,'rotation':t['rotation'],'spec':spec,'hidden':v.get('deactivateOnStart',False)}
    # IDs are corrected against the public JS decoder's layer-local tile numbering at load time.
    obj['tileIndex']=sum(len(p['tiles']) for p in l['partitions'][:pi])+ti;obj['layer']=l['name']
    box=collider_templates.get(doc['tilesets'][t['ts']-1]['name'],{}).get(t['name'])
    if box:
     cx,cz=box['center'];wx,wz=box['size'];angle=t['rotation']*math.pi/2;co,si=math.cos(angle),math.sin(angle);x,z=cx*co+cz*si,cz*co-cx*si;ex,ez=(abs(co)*wx+abs(si)*wz)/2,(abs(si)*wx+abs(co)*wz)/2
     obj['collider']=[round(x-ex,6),round(z-ez,6),round(x+ex,6),round(z+ez,6)]
    objects.append(obj)
 actors['leader']=actor('leader','knight_male_2',markers['default_start'],True)
 for h in ['first_goblin_1','first_goblin_2']:actors[h]['position']=markers[h]
 actor_positions={'princess':[.5,0,-27.5],'trio_boss':[2,0,-18],'trio_man':[3,0,-17],'trio_panda':[4,0,-18],'maiden':markers['maiden_1']}
 for h,pos in actor_positions.items():actors[h]['position']=pos
 unknown=[]
 class Compiler:
  def __init__(self,key,offset=(0,0,0)):
   self.key=key;self.offset=offset;self.commands=[];self.hooks=[];self.used={'leader'};self.positions={h:s['position'][:] for h,s in actors.items()}
   if key=='section_4_1':
    for h in ['trio_boss','trio_man','trio_panda']:self.positions[h][2]-=9.5
   if key=='section_4_2':self.positions['maiden']=[17,0,-8]
   self.starts=copy.deepcopy(self.positions)
  def emit(self,t,op,target=None,**kwargs):
   self.commands.append({'at':round(t,6),'op':op,**({'target':target} if target else {}),**kwargs})
   if target:self.used.add(target)
  def point(self,p):return [round(p[i]+self.offset[i],6) for i in range(3)]
  def node(self,node,t,owner=None):
   if isinstance(node,list):
    for n in node:t=self.node(n,t,owner)
    return t
   end=t
   for name,value in node.items():
    end=max(end,self.op(name,value,t,owner))
   return end
  def op(self,name,value,t,owner):
   if name=='do':return self.node(value,t,owner)
   if name.startswith('$'):
    h=name.split()[0][1:];h='leader' if h in ['player','players'] else h
    if h not in actors:unknown.append([self.key,'unknown actor '+h]);return t
    self.used.add(h);return self.node(value,t,h)
   if name in ['sequence']:return self.node(value,t,owner)
   if name=='find':return t
   if name=='wait':return t+float(value)
   if name in ['call','await']:
    self.hooks.append({'at':t,'name':value});return t
   if name=='focus_camera':
    if value=='unlock':return t
    p=value.get('position');duration=value.get('duration',.5)
    if isinstance(p,str):self.emit(t,'camera',position=self.positions['leader'],follow='leader',duration=duration,span=10)
    else:self.emit(t,'camera',position=self.point(p),duration=duration,span=10)
    return t if value.get('wait') is False else t+duration
   if not owner:return t
   if name=='talk':
    v=value if isinstance(value,dict) else {'code':value};text=strings.get(v.get('code'),'');
    if not text:unknown.append([self.key,'missing Chinese text: '+str(v.get('code'))]);return t
    duration=max(1.5,len(re.sub('<[^>]*>','',text))*.055+.8);self.emit(t,'dialogue',owner,text=text,duration=duration,typeSpeed=.03,bubbleType={'thought':'thought','shout':'shout'}.get(v.get('bubble_type'),'talk'));return t if v.get('no_wait') else t+duration
   if name=='move':
    pts=value.get('to');pts=[pts] if isinstance(pts,list) and pts and isinstance(pts[0],(float,int)) else pts
    if not pts:unknown.append([self.key,'move '+str(value)]);return t
    pts=[self.point(p) for p in pts];path=[self.positions[owner]]+pts;duration=sum(math.dist(x,y) for x,y in zip(path,path[1:]))/value.get('speed',3);duration=max(duration,.01);direction={'up':'back','down':'front'}.get(value.get('direction'),value.get('direction'));kw={'points':pts,'duration':duration,'run':value.get('speed',3)>4}
    if direction:kw['direction']=direction
    self.emit(t,'move',owner,**kw);self.positions[owner]=pts[-1];return t if value.get('wait') is False else t+duration
   if name in ['animation','emotion','direction','remove_animation','remove_emotion']:
    if name=='animation':v=value if isinstance(value,dict) else {'name':value};self.emit(t,'pose',owner,animation=v.get('name','idle'),loop=v.get('repeat')!='once',**({'duration':1,'keep':True} if v.get('repeat')=='once' else {}))
    elif name=='emotion':self.emit(t,'pose',owner,expression=value if isinstance(value,str) else value.get('name','idle'))
    elif name=='direction':
     if isinstance(value,str) and value.startswith('$'):value='front'
     self.emit(t,'pose',owner,direction={'up':'back','down':'front'}.get(value,value))
    else:self.emit(t,'pose',owner,**({'animation':'idle'} if name=='remove_animation' else {'expression':'idle'}))
    return t
   if name=='jump':self.emit(t,'jump',owner,height=value.get('height',.3),duration=value.get('duration',.3));return t+value.get('duration',.3)
   if name in ['play_sfx','custom_action','stop','active_state']:unknown.append([self.key,name]);return t
   unknown.append([self.key,name]);return t
  def plan(self,duration):
   initial=[]
   for h in sorted(self.used):initial.extend([{'at':0,'op':'visible','target':h,'value':True},{'at':0,'op':'pose','target':h,'animation':'idle','loop':True}])
   return {'id':'forest-1-1:'+self.key,'family':'forest-1-1:'+self.key,'version':1,'map':mapname,'title':'1-1 · '+self.key,'duration':round(duration+.5,6),'actors':[{**copy.deepcopy(actors[h]),'position':self.starts[h]} for h in sorted(self.used)],'commands':initial+self.commands,'gameActions':self.hooks,'source':'files/events/ForestMainNew.json:'+self.key,'notes':'原始事件 JSON 转换；对白停留与动画时长按资源补全。'}
 scenes={}
 for key,off in [('section_2',(0,0,0)),('section_3',(0,0,0)),('section_4_1',(0,0,-9.5)),('section_4_2',(17.5,0,6)),('section_5',(1,0,-21)),('section_5_ignore',(1,0,-21))]:
  c=Compiler(key,off);duration=c.node(native[key],0);scenes[key]=c.plan(duration)
 # Region 1 is a background pursuit. Its exact controller path/timing is still being reconstructed.
 chase=Compiler('section_2');chase.used={'princess','start_goblin1','start_goblin2','start_goblin3'}
 starts={'princess':[.52,0,-10.5],'start_goblin1':[-.1,0,-7.8],'start_goblin2':[.85,0,-7.4],'start_goblin3':[1.4,0,-7.9]}
 for h,p in starts.items():
  chase.starts[h]=p
  chase.emit(0,'move',h,points=[[p[0],0,-12],[.52+(p[0]-.52)*.5,0,-18],[.5,0,-26]],duration=3.2 if h=='princess' else 3.7,run=True)
  chase.emit(3.3 if h=='princess' else 3.8,'visible',h,value=False)
 scenes['section_2']=chase.plan(3.9);scenes['section_2']['actors']=[s for s in scenes['section_2']['actors'] if s['handle']!='leader'];scenes['section_2']['blocking']=False
 scenes['section_2']['source']='Native goblin_event_1 region + opening pursuit actors; pursuit path reconstructed from user gameplay reference.'
 scenes['section_2']['notes']='非阻断追逐；玩家可继续移动和攻击。路径和时序仍待原生控制器核对。'
 for scene in scenes.values():
  for command in scene['commands']:
   if command['op']=='camera':command['span']=8
 # The opening is a transcription of the source coroutine, including the unseen prologue.
 c=Compiler('opening');c.used.update(['princess','start_goblin1','start_goblin2','start_goblin3']);t=0
 c.emit(0,'camera',position=[.5,0,0],span=6);c.emit(0,'screen',value=1);c.emit(0,'pose','leader',animation='prostrate',expression='sleep_deep',direction='left')
 for i in range(1,5):
  text=strings.get('forest_main_new_s1_'+str(i),'');d=max(2,len(text)*.055+.8);c.emit(t,'dialogue',text=text,duration=d,viewportPosition=[.5,.55],typeSpeed=.03);t+=d+1
 c.emit(t,'screen',value=0,duration=1.5);c.emit(t,'teleport','leader',position=[-1.5,0,.8]);c.emit(t,'teleport','princess',position=[-1.05,0,.7]);c.emit(t,'pose','princess',animation='push',direction='left')
 c.emit(t,'move','leader',points=[[0,0,.8]],duration=2,animation='prostrate',endAnimation='prostrate',direction='left');c.emit(t,'move','princess',points=[[.45,0,.7]],duration=2,animation='push',direction='left');t+=2
 def talk(h,i):
  nonlocal t
  text=strings.get('forest_main_new_s1_'+str(i),'');d=max(1.5,len(text)*.055+.8);c.emit(t,'dialogue',h,text=text,duration=d,typeSpeed=.03);t+=d
 talk('princess',5);c.emit(t,'move','leader',points=[[2,0,.8]],duration=3,animation='prostrate',endAnimation='prostrate',direction='left');c.emit(t,'move','princess',points=[[2.45,0,.7]],duration=3,animation='push',direction='left');t+=3;talk('princess',6)
 for h,p in [('start_goblin1',[-8,0,.05]),('start_goblin2',[-7.5,0,.8]),('start_goblin3',[-8,0,1.55])]:c.emit(t,'teleport',h,position=p);c.emit(t,'move',h,points=[[p[0]+6,0,p[2]]],duration=1,run=True)
 t+=1;c.emit(t,'pose','princess',animation='embarrassed',expression='cry');c.emit(t,'jump','princess',height=.3,duration=.3);talk('start_goblin2',7);talk('start_goblin1',8);t+=2;talk('start_goblin2',9);c.emit(t,'pose','start_goblin2',animation='release');talk('start_goblin2',10)
 for h,x,z in [('start_goblin1',-1.4,.05),('start_goblin2',-.9,.8),('start_goblin3',-1.4,1.55)]:c.emit(t,'move',h,points=[[x,0,z]],duration=1.1)
 t+=1.1;talk('princess',11);talk('princess',12);c.emit(t,'camera',position=[.5,0,.3],duration=2,span=8);route=[[3.25,0,-1.2],[.5,0,-1.2]];move_time=sum(math.dist(a,b) for a,b in zip([[2.45,0,.7]]+route,route))/4.5;c.emit(t,'move','princess',points=route,duration=move_time,run=True,lastDirection='back');t+=move_time
 c.emit(t,'sound',name='01_throw_01');c.emit(t,'pose','princess',animation='throw',direction='back',duration=.3,loop=False)
 c.emit(t,'item','princess',item=20019,toTarget='start_goblin2',offset=[0,.5,0],duration=.6)
 c.emit(t+.6,'effect','start_goblin2',name='FX_hit',offset=[0,.5,0],duration=.5)
 for sound in ['01_hit_comic_01','02_hit_projectile_01','02_goblin_hit_01']:c.emit(t+.6,'sound',name=sound)
 c.emit(t+.6,'pose','start_goblin2',animation='damaged',duration=.3,loop=False);t+=.3;c.emit(t,'jump','princess',height=.3,duration=.3);talk('princess',13)
 c.emit(t,'move','princess',points=[[.5,0,-10]],duration=1.5,run=True);talk('start_goblin2',14)
 for h,z in [('start_goblin1',.05),('start_goblin2',.8),('start_goblin3',1.55)]:c.emit(t,'move',h,points=[[-.4,0,z],[.5,0,-10.75]],duration=2,run=True)
 t+=3;c.emit(t,'pose','leader',animation='idle',expression='idle');c.emit(t,'jump','leader',height=.6,duration=.6);t+=.6
 for d in ['back','right','front','left']:c.emit(t,'pose','leader',direction=d);t+=.5
 c.emit(t,'teleport','leader',position=markers['default_start']);c.emit(t,'pose','leader',animation='victory_get',duration=1,loop=False);t+=1
 for h in ['princess','start_goblin1','start_goblin2','start_goblin3']:c.emit(t,'visible',h,value=False)
 scenes['opening']=c.plan(t);scenes['opening']['source']='decrypted/sections/ForestMainNew/ForestMainNewSection1.lua:59'
 for scene in scenes.values():
  for spec in scene['actors']:
   if spec['handle'].startswith('start_goblin') and scene['id'].endswith('opening'):spec['position']=[-8,0,0]
   if spec['handle']=='princess' and scene['id'].endswith('opening'):spec['position']=[-1.05,0,.7]
  assert all(cmd['at']>=0 for cmd in scene['commands']);assert scene['duration']<3600
 floors=doc['arrays']['floors']['records'];walls=[]
 for name in ['mergedWalls','nonUnitSizedWalls']:
  for x,z,y,types,direction,w,h in doc['arrays'][name]['records']:
   if y==0:walls.append([x-.5,z-.5,x+w-.5,z+h-.5,types,direction,y])
 pools=json.loads((src/'static_data_dec/objectpoolspec.json').read_text('utf-8-sig'));effect_names={'break_leaf','break_house_box','FX_Env_SmallRock_lv1_destroy','FX_hit'};effect_limits={p['AssetName']:p['TimeLimit'] for p in pools if p['AssetName'] in effect_names and 'TimeLimit' in p}
 data={'nativeMechanics':{'burn':json.loads((out/'native-gameplay.json').read_text('utf8'))['burn'],'effectTimeLimits':effect_limits,'spikeDamageRatio':json.loads((src/'static_data_dec/constants.json').read_text('utf-8-sig'))['GimmickSpikeDamage']},'version':1,'id':'1-1','title':'旅馆','chapter':'坎特伯雷王国','stageName':stage['Name'],'map':mapname,'spawn':markers['default_start'],'actors':actors,'markers':markers,'regions':regions,'objects':objects,'camera':{'span':8,'narrowSpan':10,'aspectThreshold':1.5,'angle':45,'source':'base/stage StageCamera parent quaternion x=.38268346,w=.92387950; orthographic size=4; StageCameraController.get_DefaultCameraSize.'},'collision':{'cellOrigin':-.5,'floors':[list(f) for f in floors],'walls':walls},'scenes':scenes,'strings':{k:v for k,v in strings.items() if k.startswith(('easy_forest_1_1','forest_main_s','forest_main_new_s','dragon_knight'))},'source':{'colliderBundleSha256':collider_sources,'tilemapSha256':doc['sha256'],'eventJsonSha256':hashlib.sha256((src/'files/events/ForestMainNew.json').read_bytes()).hexdigest()},'audit':{'unknownOperations':unknown,'limitations':['C# event sections are reconstructed from region names, event JSON and object conditions; exact native controller conditions remain under reconstruction.','Opening rock item 20019, FX_hit and 0.6s impact delay are recovered from Lua; DropItem flight physics and DamageSquish/RedPulse still need calibration.','Native stair floor type 2 and jumpable wall type 3 are retained; diagonal floor fragments still need refinement.','Combat numbers, AI and attack timings are playable approximations, not a port of native battle code.']}}
 (out/'stage-1-1.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n','utf8');(out/'catalog.json').write_text(json.dumps({'version':1,'stages':[{'id':'1-1','title':'旅馆','chapter':'坎特伯雷王国','map':mapname,'file':'stage-1-1.json'}]},ensure_ascii=False,indent=2)+'\n','utf8')
 print(json.dumps({'map':mapname,'floors':len(floors),'walls':len(walls),'actors':len(actors),'objects':dict(__import__('collections').Counter(o['kind'] for o in objects)),'scenes':len(scenes),'unsupported':unknown},ensure_ascii=False))
if __name__=='__main__':main()
