"""Offline bounded Lua trace -> static map timelines and explicit coverage audit.

Runs original scripts only inside an IO-free Lua environment. Unknown calls are
reported; traces are independent scene functions, never a saved-game simulation.
Requires lupa for offline generation, not for the browser viewer.
"""
import argparse,gzip,hashlib,json,re,sys
from collections import Counter,deque
from pathlib import Path

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--output',type=Path);ap.add_argument('--lua-libs',type=Path,default=Path('E:/GTFiles/_tools/lua-preview-libs'));ap.add_argument('--durations',type=Path,default=Path(__file__).parent/'evidence/world22-animation-durations.json');ap.add_argument('--max-branches',type=int,default=32);args=ap.parse_args()
 sys.path.insert(0,str(args.lua_libs));from lupa import LuaRuntime,lua_type
 sys.path.insert(0,str(args.root/'tools/gtmap'));from strict_kong import parse
 strings=json.loads((args.source/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'));meta=json.loads(gzip.decompress((args.root/'gtmap/assets/character-metadata.json.gz').read_bytes()));durations=json.loads(args.durations.read_text('utf8')) if args.durations and args.durations.exists() else {}
 helper=(Path(__file__).parent/'native-scene-recorder.lua').read_text('utf8');out=args.output or args.root/'gtmap/assets/native-world-scenes';out.mkdir(parents=True,exist_ok=True)
 maps={};field_handles={};scenes={};audit=[];resources=set();source_hashes={};missing_names=set();unknown_calls=Counter();unknown_durations=set()
 stages_data=json.loads((args.source/'static_data_dec/stages.json').read_text('utf-8-sig'));stage_maps={s['Name']:(s['Tilemap'].get('Default',s['Name']) if isinstance(s.get('Tilemap'),dict) else s.get('Tilemap') or s['Name']) for s in stages_data}
 def mapdata(name):
  if name in maps:return maps[name]
  actors={};markers={};doc=parse((args.source/'Tilemaps_decoded'/f'{name}.tilemap').read_bytes())
  field_handles[name]=set(doc['handleNames'].get(1,[]))
  for layer in doc['layers']:
   for e in layer.get('events',[]):markers[e['name']]=[e['position'][0],e['position'][1]/2,e['position'][2]]
   for prop in layer.get('properties',[]):
    if prop['component']!='Tilemaps.CharacterPlaceholder':continue
    event=layer['events'][prop['index']];value=prop['payload'].get('value',{});actors[event['name']]={'key':value.get('characterId',''),'position':markers[event['name']],'appearance':value.get('appearanceName') if value.get('hasAppearanceOverride') else None,'direction':{1:'back',2:'right',4:'front',8:'left'}.get(value.get('field38'),'front')}
  maps[name]=(actors,markers);return maps[name]
 def resource(key,appearance=None):
  row=meta['rows'].get(key,{});ref=appearance or row.get('spine') or key
  if isinstance(ref,dict):ref=ref.get('default') or next(iter(ref.values()),'')
  base,_,skin=ref.partition('#');parts=base.split(':');asset=parts[0] if len(parts)==2 and '/' not in base else parts[-1].split('/')[-1];skin=skin or (parts[1] if len(parts)==2 and '/' not in base else '')
  asset=meta['aliases'].get(asset,asset);return asset,skin,row
 def clean(value):
  if lua_type(value)=='table':
   if value['__vector'] is True:return [clean(value['x']),clean(value['y']),clean(value['z'])]
   if isinstance(value['__proxy'],str):raise ValueError('unresolved value:'+value['__proxy'])
   pairs={k:v for k,v in value.items() if lua_type(v)!='function'}
   if pairs and set(pairs)==set(range(1,len(pairs)+1)):return [clean(pairs[i]) for i in range(1,len(pairs)+1)]
   return {str(k):clean(v) for k,v in pairs.items() if isinstance(k,(str,int,float))}
  if isinstance(value,(str,int,float,bool)) or value is None:return value
  return None
 def source_without_comments(raw):return re.sub(r'--[^\n]*','',re.sub(r'--\[\[.*?\]\]','',raw,flags=re.S))
 version_source=(args.source/'decrypted/base/scene_util.lua').read_text('utf8');version_block=version_source[version_source.index('scene_util.default_version ='):version_source.index('function scene_util.get_version(')]
 preset_lua=LuaRuntime();preset_data=clean(preset_lua.execute('scene_util={};'+version_block+'\nreturn scene_util.version_args'))
 def context(file,name,branch):
  lua=LuaRuntime(unpack_returned_tuples=True,register_eval=False,register_builtins=False,attribute_filter=lambda *a:(_ for _ in ()).throw(AttributeError('Python attributes disabled')))
  commands=[];specs={};choice_options=[];choice_meta=[];local_notes=Counter();actors,markers=mapdata(stage_maps.get(name,name));groups={};stage_controllers={};fallback=markers.get('default_start') or next((p for p in markers.values() if max(abs(p[0]),abs(p[2]))<99),[0,0,0]);fallback=fallback[:]
  def to_lua(v):return lua.table_from(v,recursive=True)
  def bridge(kind,*values):
   if kind=='stage':return name
   if kind=='scene-entry':
    if values[0]=='companion_boy_zone_event' and 's3_companion_boy_event_zone' in markers:
     p=markers['s3_companion_boy_event_zone'];local_notes['estimated trigger-entry party formation (native region center)']+=1
     entry={'leader':p[:],'princess':[p[0]+1,p[1],p[2]+.5],'dragon_boy':[p[0]+1,p[1],p[2]-.5]}
     for h,pos in entry.items():
      if h in specs:specs[h]['position']=pos[:]
     return to_lua(entry)
    if values[0]=='steam_princess_zone_event' and 's2_steam_princess_event_zone' in markers:
     p=markers['s2_steam_princess_event_zone'];local_notes['estimated trigger-entry party formation (native region center)']+=1
     entry={'leader':p[:],'princess':[p[0]-.5,p[1],p[2]+1],'dragon_boy':[p[0]+.5,p[1],p[2]+1]}
     for h,pos in entry.items():
      if h in specs:specs[h]['position']=pos[:]
     return to_lua(entry)
    return None
   if kind=='animation-preset':
    animation,typ,version=values;version=version if isinstance(version,(int,float)) and version in [1,2] else 1;index=preset_data[int(version)-1] if isinstance(preset_data,list) else preset_data.get(str(int(version)),{});base=preset_data[0] if isinstance(preset_data,list) else preset_data.get('1',{});return to_lua(index.get(typ,{}).get(animation,base.get(typ,{}).get(animation,{})))
   if kind=='stage-controller':
    classname=values[0]
    if not isinstance(classname,str):raise ValueError('unresolved stage controller')
    if classname in stage_controllers:return stage_controllers[classname]
    raise ValueError('missing stage controller:'+classname)
   if kind=='actor':
    h,key,typ=values;info=actors.get(h,{});key=key or info.get('key') or ('fw_'+h if 'fw_'+h in meta['rows'] else h)
    if h=='leader':key='knight_male_2'
    asset,skin,row=resource(key,info.get('appearance'));p=info.get('position',fallback);p=p if max(abs(p[0]),abs(p[2]))<998.5 and not(p[0]==99 and p[2]==99) else fallback
    spec={'handle':h,'npc':key,'resource':asset,'name':row.get('name') if re.search('[\u3400-\u9fff]',row.get('name','')) else key,'position':p[:],'direction':info.get('direction','front')}
    if skin:spec['skin']=skin
    specs[h]=spec
    if typ=='character' and asset in meta['assets']:resources.add(asset)
    return to_lua(spec)
   if kind=='marker':return to_lua(markers[values[0]]) if values[0] in markers else None
   if kind=='interrupt':
    h,at,p=values
    previous=next((c for c in reversed(commands) if c.get('target')==h and c['op']=='move' and c['at']+c['duration']>at),None)
    if previous:previous['duration']=max(.001,at-previous['at']);previous['points']=[clean(p)]
    return
   if kind=='group':return groups.get(values[0])
   if kind=='text':
    key=str(values[0]);text=strings.get(key)
    if text is None:missing_names.add(key);local_notes['missing Chinese text:'+key]+=1;return key
    return text
   if kind=='duration':
    h,animation,direction=values
    if not isinstance(animation,str):raise ValueError('unresolved animation name')
    spec=specs[h];asset=spec['resource'];variant='side' if direction in ['left','right'] else {'up':'back','down':'front'}.get(direction,direction);variants=meta['assets'].get(asset,{}).get('variants',[])
    if variant not in variants:variant='front' if 'front' in variants else next(iter(variants),'')
    entry=durations.get(asset,{}).get(variant,{})
    actual=animation+'_'+variant if animation+'_'+variant in entry else animation
    if actual not in entry and not variant:
     directed=animation+'_'+('side' if direction in ['left','right'] else direction)
     matches=[n for n in entry if n==directed or re.sub(r'_(front|back|side)$','',n)==animation]
     if len(matches)==1:actual=matches[0]
    d=entry.get(actual)
    if d is None:unknown_durations.add(asset+':'+variant+':'+animation);local_notes['estimated animation duration:'+asset+':'+animation]+=1;d=1
    return max(.001,d)
   if kind=='choice':
    selected=clean(values[0]) or [];options=values[1];keys=[clean(options[i][1]) for i in range(1,len(options)+1)];keys=[k[0] if isinstance(k,list) else k for k in keys];choice_options.append(keys);rows=[]
    for i in range(1,len(options)+1):
     typ=options[i][2];custom=clean(typ) if lua_type(typ)=='table' else {};tendency=typ if isinstance(typ,str) else custom.get('name','custom')
     enabled=options[i][4] is not False and custom.get('active_condition') is not False
     row={'key':str(keys[i-1]),'text':strings.get(str(keys[i-1]),str(keys[i-1])),'tendency':tendency,'enabled':enabled,'hidden':options[i][4] is False}
     color=custom.get('color')
     if isinstance(color,dict) and all(isinstance(color.get(k),(int,float)) for k in ['r','g','b','a']):row['color']=[color[k]*(1 if color.get('__color32') else 255) for k in ['r','g','b','a']]
     if not enabled:row['color']=[217,217,217,255]
     if isinstance(custom.get('icon'),str):local_notes['custom choice icon:'+custom['icon']]+=1
     if tendency in ['intellect','brutal','mercy']:local_notes['unverified choice tint:'+tendency]+=1
     rows.append(row)
    choice_meta.append(rows);return branch[len(selected)] if len(branch)>len(selected) else 1
   if kind=='emit':
    at,op,target,data=values
    if target is not None and not isinstance(target,str):raise ValueError('unresolved command target')
    data=clean(data);data={k:v for k,v in data.items() if v is not None};c={'at':round(at,6),'op':op,**({'target':target} if target else {}),**data}
    if op=='choice':c.update(ordinal=len(choice_meta)-1,options=choice_meta[-1]);c.pop('key',None);c.pop('text',None)
    commands.append(c)
  env=lua.eval("function() return {assert=assert,error=error,ipairs=ipairs,pairs=pairs,next=next,pcall=pcall,select=select,setmetatable=setmetatable,getmetatable=getmetatable,rawget=rawget,rawset=rawset,type=type,tonumber=tonumber,tostring=tostring,math=math,string=string,table=table,utf8=utf8,coroutine=coroutine} end")()
  recorder=lua.execute(helper,env,bridge)
  loader=lua.eval("function(text,name,env) local f,e=load(text,'@'..name,'t',env);if not f then error(e)end;return f() end")
  wanted_controllers=set(re.findall(r'FireWorld[1-6]Controller',file.read_text('utf-8-sig')))
  if re.fullmatch(r'fireworld_[1-6]',name):wanted_controllers.add('FireWorld'+name[-1]+'Controller')
  for stage_file in (args.source/'decrypted/stageeventcontrollers/FireWorld').glob('*.lua'):
   if 'FireWorld'+stage_file.stem.removeprefix('Stage')+'Controller' not in wanted_controllers:continue
   try:
    stage_cls=loader(stage_file.read_text('utf-8-sig'),str(stage_file.relative_to(args.source)),env);stage_controllers[stage_cls['__class']]=recorder['stage_controller'](stage_cls)
   except Exception as e:local_notes['stage controller initialization:'+stage_file.name+':'+str(e)[:100]]+=1
  # A bounded instruction hook applies to main and every recorder coroutine.
  lua.execute("local count=0;debug.sethook(function() count=count+10000;if count>3000000 then error('instruction limit')end end,'',10000)")
  placer_path=args.source/'decrypted/Quest/Main/FireWorld/CharacterPlacer/Main/Section1.lua'
  if name=='fireworld_1':
   try:groups.update(dict(loader(placer_path.read_text('utf8'),str(placer_path),env)['groups'][name].items()))
   except Exception as e:local_notes['placer initialization:'+str(e)[:100]]+=1
  cls=loader(file.read_text('utf-8-sig'),str(file.relative_to(args.source)),env)
  controller_path=file.parent/'Controller.lua'
  if controller_path.exists():
   try:recorder['initialize_controller'](loader(controller_path.read_text('utf-8-sig'),str(controller_path.relative_to(args.source)),env))
   except Exception as e:local_notes['controller initialization:'+str(e).split('\n')[0][:150]]+=1
  return lua,env,recorder,cls,commands,specs,choice_options,local_notes
 files=sorted((args.source/'decrypted/Quest/Main/FireWorld').rglob('*.lua'))+sorted((args.source/'decrypted/stageeventcontrollers/FireWorld').glob('*.lua'))
 for file in files:
  raw=file.read_text('utf-8-sig');source=source_without_comments(raw);stages=re.search(r'self\.available_stage_names\s*=\s*(\{[^}]*\}|[\"\'][^\"\']+[\"\'])',source)
  rel=file.relative_to(args.source).as_posix();source_hashes[rel]=hashlib.sha256(file.read_bytes()).hexdigest()
  stage_match=re.fullmatch(r'Stage(\d+)',file.stem) if 'stageeventcontrollers' in file.parts else None
  if stage_match and not stages:stages=re.search(r'(.*)',"'fireworld_"+stage_match[1]+"'")
  if not stages:
   controller=file.parent/'Controller.lua'
   if controller.exists():stages=re.search(r'self\.available_stage_names\s*=\s*(\{[^}]*\}|[\"\'][^\"\']+[\"\'])',source_without_comments(controller.read_text('utf-8-sig')))
  if not stages:
   audit.append({'source':rel,'status':'support-module','reason':'无独立地图限制；控制器、角色布置或工具模块。'});continue
  declared=re.findall(r"['\"]([^'\"]+)['\"]",stages[1]);names=[]
  for n in declared:
   if (args.source/'Tilemaps_decoded'/f'{stage_maps.get(n,n)}.tilemap').exists():names.append(n)
   else:audit.append({'source':rel,'map':n,'status':'missing-map'})
  for name in names:
   try:lua,env,recorder,cls,*_=context(file,name,())
   except Exception as e:audit.append({'source':rel,'map':name,'status':'module-error','error':str(e)[:500]});continue
   getinfo=lua.eval('function(fn)return debug.getinfo(fn,"S")end');candidates=[]
   if lua_type(cls)!='table':continue
   lines=raw.splitlines()
   for method,fn in cls.items():
    if lua_type(fn)!='function' or method in ['init','enter','exit','dispose','on_pre_load']:continue
    info=getinfo(fn);body='\n'.join(lines[info['linedefined']-1:info['lastlinedefined']]);body=source_without_comments(body)
    if re.search(r'(scene_util\.|wp_util\.|speech_bubble_util\.|camera_util\.|character_util\.|screen_util\.|sp_util.start_scene|choose_util\.|animator:Play\()',body):candidates.append((method,info['linedefined']))
   for method,line in sorted(candidates,key=lambda x:x[1]):
    queue=deque([()]);seen=set();made=0
    while queue and made<args.max_branches:
     branch=queue.popleft()
     if branch in seen:continue
     seen.add(branch);made+=1;error=None;commands=[];specs={};option_keys=[];notes=Counter()
     try:
      lua,env,recorder,cls,commands,specs,option_keys,notes=context(file,name,branch)
      # Source-native preset construction is used when the scene does not call it.
      setup=cls['set_npc_presets_for_state'] if lua_type(cls['set_npc_presets_for_state'])=='function' else None
      result=recorder['run'](cls,method,setup);duration=result['duration'];notices=clean(result['notices']) or {};selected=clean(result['choices']) or [];error=result['error']
      full_branch=tuple(selected)
      if full_branch!=branch and full_branch in seen:continue
      seen.add(full_branch)
     except Exception as e:
      error=str(e)[:800];duration=max((c['at']+c.get('duration',0) for c in commands),default=0);notices={};selected=[]
     for j,keys in enumerate(option_keys):
      prefix=tuple(selected[:j])
      for k in range(1,len(keys)+1):
       alternative=prefix+(k,)
       if alternative not in seen and alternative!=branch:queue.append(alternative)
     unknown_calls.update(notices);notices.update(notes)
     valid=[];used=set()
     for c in commands:
      if c.get('target'):
       spec=specs.get(c['target'])
       if c['op']=='gimmick':
        if c['target'] in field_handles[stage_maps.get(name,name)]:valid.append(c)
        else:notices['missing gimmick handle:'+c['target']]=notices.get('missing gimmick handle:'+c['target'],0)+1
        continue
       if not spec or spec['resource'] not in meta['assets']:
        notices['unresolved resource:'+c['target']]=notices.get('unresolved resource:'+c['target'],0)+1;continue
       used.add(c['target'])
      if c['op']=='move' and c.get('animation') is None:c.pop('animation',None)
      for key in ['direction','lastDirection']:
       if key in c:c[key]={'up':'back','down':'front'}.get(c[key],c[key])
      valid.append(c)
     # Do not silently claim missing calls were restored.
     relative=file.relative_to(args.source/'decrypted').with_suffix('').as_posix().removeprefix('Quest/Main/FireWorld/');status='partial' if error or notices else 'converted';identifier=f"{relative}:{method}"
     branch_name=' / '.join(option_keys[i][v-1] for i,v in enumerate(selected) if i<len(option_keys))
     entry={'source':rel,'method':method,'line':line,'map':name,'branch':selected,'status':status,'commands':len(valid),'unsupported':notices}
     if error:entry['error']=error
     audit.append(entry)
     if not valid:continue
     actors_out=[specs[h] for h in sorted(used)];initial=[]
     for spec in actors_out:
      first_move=next((c for c in valid if c.get('target')==spec['handle'] and c['op']=='move'),None)
      if first_move and first_move['at']<.01 and not any(c['op']=='teleport' and c.get('target')==spec['handle'] and c['at']<=first_move['at'] for c in valid):
       dest=first_move['points'][0]
       if sum((a-b)**2 for a,b in zip(spec['position'],dest))>144:
        nearby=[p for n,p in mapdata(stage_maps.get(name,name))[1].items() if ('zone' in n or 'trigger' in n) and sum((a-b)**2 for a,b in zip(p,dest))<64]
        spec['position']=(min(nearby,key=lambda p:sum((a-b)**2 for a,b in zip(p,dest))) if nearby else dest)[:]
        notices['estimated standalone entry:'+spec['handle']]=1;entry['status']=status='partial'
     for spec in actors_out:initial.extend([{'at':0,'op':'teleport','target':spec['handle'],'position':spec['position']},{'at':0,'op':'pose','target':spec['handle'],'animation':'idle','direction':spec['direction'],'loop':True},{'at':0,'op':'visible','target':spec['handle'],'value':True},{'at':0,'op':'fade','target':spec['handle'],'value':1}])
     first=next((c for c in valid if c['op']=='camera'),None)
     if first is None or first['at']>0 or first.get('duration',0)>0:
      p=next((c['position'] for c in valid if c['op']=='teleport'),actors_out[0]['position'] if actors_out else [0,0,0]);initial.append({'at':0,'op':'camera','position':p,'span':9,**({'follow':'leader'} if 'leader' in used else {})})
     scene={'id':'fw-native-'+hashlib.sha256((identifier+name+str(selected)).encode()).hexdigest()[:14],'family':identifier+':'+name,'version':1,'map':stage_maps.get(name,name),'title':identifier,'duration':max(.1,duration+.5),'actors':actors_out,'commands':initial+valid,'source':rel.removeprefix('decrypted/')+':'+str(line),'notes':'原脚本离线转换；对白停留按字数估算，跳跃为近似。'+('部分调用尚未还原。' if status=='partial' else ''),'coverage':entry}
     try:
      json.dumps(scene,ensure_ascii=False,allow_nan=False)
      if len(actors_out)>64 or len(scene['commands'])>5000 or scene['duration']>3600:raise ValueError('timeline limits exceeded')
      for c in scene['commands']:
       if not 0<=c['at']<=3600 or not 0<=c.get('duration',0)<=3600:raise ValueError('invalid command time')
       for v in ([c['position']] if 'position' in c else c.get('points',[])):
        if not isinstance(v,list) or len(v)!=3 or any(not isinstance(x,(float,int)) for x in v):raise ValueError('invalid position')
     except (TypeError,ValueError) as e:
      def bad(v,path='scene'):
       if isinstance(v,dict):return next((found for k,x in v.items() if (found:=bad(x,path+'.'+str(k)))),'')
       if isinstance(v,list):return next((found for i,x in enumerate(v) if (found:=bad(x,path+'.'+str(i)))),'')
       return '' if v is None or isinstance(v,(str,int,float,bool)) else path
      entry['status']='invalid-trace';entry['error']='Invalid native timeline: '+str(e);print('Invalid trace',identifier,name,selected,bad(scene));continue
     scenes.setdefault(scene['map'],[]).append(scene)
    if queue:audit.append({'source':rel,'method':method,'map':name,'status':'branch-limit','remaining':len(queue)})
 for name,rows in scenes.items():(out/(name+'.json.gz')).write_bytes(gzip.compress(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
 manifest={'version':1,'world':22,'maps':{n:{'file':n+'.json.gz','count':len(rows)} for n,rows in scenes.items()},'total':sum(map(len,scenes.values())),'families':len({r['family'] for rows in scenes.values() for r in rows}),'sources':source_hashes,'coverageFile':'world22-coverage.json'}
 (out/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8')
 report={'world':22,'scriptFiles':len(source_hashes),'entries':audit,'totalPlayable':manifest['total'],'distinctScenes':manifest['families'],'statuses':dict(Counter(e['status'] for e in audit)),'unknownCalls':dict(unknown_calls),'missingChineseKeys':sorted(missing_names),'estimatedAnimationDurations':sorted(unknown_durations),'resources':sorted(resources)}
 (out/'world22-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
 print(json.dumps({k:report[k] for k in ['scriptFiles','totalPlayable','statuses']},ensure_ascii=False));print('Resources',len(resources),'unknown calls',len(unknown_calls))

if __name__=='__main__':main()
