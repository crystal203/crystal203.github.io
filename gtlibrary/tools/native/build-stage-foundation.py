"""Extract a source-backed stage foundation (no certification of story parity) from native KONG, metadata and event JSON.
No game source is executed in the browser. Timelines use the shared MapEventPlayer.
"""
import argparse,copy,gzip,hashlib,json,math,re,sys,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'gtmap'))
from strict_kong import parse

def merge(a,b):
 out=copy.deepcopy(a)
 for k,v in (b or {}).items():out[k]=merge(out.get(k,{}) if isinstance(out.get(k),dict) else {},v) if isinstance(v,dict) else copy.deepcopy(v)
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--stage',required=True);ap.add_argument('--id',required=True);ap.add_argument('--reference',type=Path,required=True);ap.add_argument('--source',type=Path,required=True);ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--event',action='append',default=[]);ap.add_argument('--string-prefix',action='append',default=[]);a=ap.parse_args();src=a.source;root=a.root;out=root/'gtonline/assets';out.mkdir(parents=True,exist_ok=True)
 strings=json.loads((src/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'));stages=json.loads((src/'static_data_dec/stages.json').read_text('utf-8-sig'));stage=next(s for s in stages if s['Name']==a.stage);mapname=stage['Tilemap']['Default']
 doc=parse((src/'Tilemaps_decoded'/f'{mapname}.tilemap').read_bytes());items=json.loads(gzip.decompress((a.reference/'gtmap/assets/item-metadata.json.gz').read_bytes()));meta=json.loads(gzip.decompress((a.reference/'gtmap/assets/character-metadata.json.gz').read_bytes()))
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
    templates[go['m_Name']]={'center':[box['m_Center'][axis] for axis in ['x','z']],'size':[box['m_Size'][axis] for axis in ['x','z']],'minY':box['m_Center']['y']-box['m_Size']['y']/2,'maxY':box['m_Center']['y']+box['m_Size']['y']/2}
  collider_templates[tileset['name']]=templates;collider_sources[tileset['name']]=hashlib.sha256(raw).hexdigest()

 # Supplement older stage data without rewriting its protected object list.
 # A name may occur in several tilesets only when its collider is identical.
 shared={}
 for group in collider_templates.values():
  for name,box in group.items():
   if name in shared and shared[name]!=box:raise ValueError('Ambiguous collider template: '+name)
   shared[name]=box
 (out/'native-gimmick-colliders.json').write_text(json.dumps({'sources':collider_sources,'templates':shared},ensure_ascii=False,separators=(',',':'))+'\n','utf8')

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
     pos=e['position'];actors[e['name']]=actor(e['name'],v['characterId'],pos,False);actors[e['name']].update({'monster':l['name']=='monsters','native':v,'direction':{1:'back',2:'right',4:'front',8:'left'}.get(v.get('field38'),'front'),'animation':v.get('field78','idle'),'expression':v.get('field80','idle'),'equipment':{'item1':v.get('field60') or 0,'item2':v.get('field68') or 0},'crashBehaviour':v.get('overrides',{}).get('CrashBehaviour',{}).get('__class__')})
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
    elif spec.get('FieldObjectBehaviour',{}).get('__class__')=='Oak.DoorBehaviour' or 'door_forest' in name:kind='door';cat=1
    elif spec.get('FieldObjectBehaviour',{}).get('__class__')=='Oak.JumpTileBehaviour':kind='jump';cat=1
    elif spec.get('FieldObjectBehaviour',{}).get('__class__')=='Oak.BombFieldObjectBehaviour':kind='bomb';cat=1
    elif 'bomb_grass' in name:kind='bomb-flower';cat=1
    elif 'brazier' in name:kind='brazier';cat=1
    elif 'switch' in name:kind='switch';cat=1
    elif 'rock' in name or l['name']=='breakable' or spec.get('CombustibleBehaviour',{}).get('__class__')=='Oak.CombustibleBehaviour':kind='breakable';cat=1
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
     obj['nativeBounds']=[x-ex,box['minY'],z-ez,x+ex,box['maxY'],z+ez]
    objects.append(obj)
    # Native <CreateTileLayer>d__57 82dd2c8..82dd4bc: instantiate a separate
    # bomb1 at the flower transform using bomb1's own default component spec.
    if kind=='bomb-flower':
     bomb=copy.deepcopy(obj);bomb.update(id=obj['id']+':bomb',kind='bomb',name='[GIMMICK]bomb1',handle='',generated={'tileset':doc['tilesets'][t['ts']-1]['name'],'parent':obj['id'],'source':'82dd2c8..82dd4bc'})
     bomb['spec']=copy.deepcopy(items['defaults'][doc['tilesets'][t['ts']-1]['name']]['[GIMMICK]bomb1'])
     bb=collider_templates[doc['tilesets'][t['ts']-1]['name']]['[GIMMICK]bomb1'];bcx,bcz=bb['center'];bx,bz=bb['size'];bomb['collider']=[bcx-bx/2,bcz-bz/2,bcx+bx/2,bcz+bz/2];bomb['nativeBounds']=[bcx-bx/2,bb['minY'],bcz-bz/2,bcx+bx/2,bb['maxY'],bcz+bz/2]
     objects.append(bomb)
 actors['leader']=actor('leader','knight_male_2',markers['default_start'],True)

 floors=doc['arrays']['floors']['records'];walls=[]
 for name in ['mergedWalls','nonUnitSizedWalls']:
  for x,z,y,types,direction,w,h in doc['arrays'][name]['records']:walls.append([x-.5,z-.5,x+w-.5,z+h-.5,types,direction,y])
 reference=json.loads((a.reference/'gtonline/assets/stage-1-1.json').read_text('utf8'))
 mechanics={k:copy.deepcopy(reference['nativeMechanics'][k]) for k in ['damageDefaults','knightPresets','characterHitboxes','runCollision','burn','knightCombo','soundHandles','effectTimeLimits','spikeDamageRatio','itemPresentation'] if k in reference['nativeMechanics']}
 battles={}
 for handle,spec in actors.items():
  if not spec.get('monster'):continue
  n=spec['native'];group=n.get('fieldb0');region=n.get('overrides',{}).get('FieldObjectController',{}).get('Zone')
  if group:battles.setdefault(group,{'actors':[],'region':region})['actors'].append(handle)
 data={'version':1,'saveSchema':1,'id':a.id,'title':strings[a.stage],'chapter':reference['chapter'],'stageName':stage['Name'],'map':mapname,'spawn':markers['default_start'],'actors':actors,'markers':markers,'regions':regions,'objects':objects,'camera':reference['camera'],'collision':{'cellOrigin':-.5,'floors':[list(f) for f in floors],'walls':walls},'nativeMechanics':mechanics,'battles':battles,'scenes':{},'strings':{},'source':{'apkSha256':'11ad39a67bb2a7bad18f59a22303fb7347017f6830d80ec63db6efe4f3e91d1b','tilemapSha256':doc['sha256'],'colliderBundleSha256':collider_sources,'controllers':stage['Event']},'audit':{'status':'incomplete','unknownOperations':[],'limitations':[]}}
 sources={}
 for name in a.event:
  if not name or Path(name).name!=name or name in ['.','..']:raise ValueError('Invalid event resource name: '+name)
  file=src/'files/events'/(name+'.json');raw=file.read_bytes();sources[name]={'sha256':hashlib.sha256(raw).hexdigest(),'data':json.loads(raw.decode('utf-8-sig'))}
 keys=set()
 def texts(value):
  if isinstance(value,dict):
   for k,v in value.items():
    if k in ['code','Talk'] and isinstance(v,str):keys.add(v)
    texts(v)
  elif isinstance(value,list):
   for v in value:texts(v)
 texts(sources);texts(actors);texts(objects)
 data['strings']={k:v for k,v in strings.items() if k in keys or k.startswith(tuple(a.string_prefix))}
 data['totals']={'coins':sum(o['kind']=='coin' for o in objects),'stars':sum(o['kind']=='star' for o in objects),'chests':sum(o['spec'].get('FieldObjectBehaviour',{}).get('__class__') in ['Oak.TreasureBehaviour','Oak.FloatingItemBehaviour'] for o in objects)}
 data['nativeEvents']=sources
 (out/('stage-'+a.id+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
 print(json.dumps({'map':mapname,'actors':len(actors),'objects':len(objects),'totals':data['totals']}))
if __name__=='__main__':main()
