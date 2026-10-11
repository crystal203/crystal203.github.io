"""Extract isolated, literal dialogue/action calls; never infer Lua control flow.

Only unambiguous get_character handles actually placed in that map are accepted.
Each result is labelled an isolated rehearsal, rather than a complete cutscene.
"""
import argparse,gzip,hashlib,json,re,sys
from pathlib import Path

def arguments(source,start):
    parts=[];begin=start;depth=0;quote=None;escape=False
    for i in range(start,len(source)):
        c=source[i]
        if quote:
            if escape:escape=False
            elif c=='\\':escape=True
            elif c==quote:quote=None
        elif c in "'\"":quote=c
        elif c in '({[':depth+=1
        elif c in ')}]':
            if c==')' and depth==0:return parts+[source[begin:i].strip()]
            depth-=1
        elif c==',' and depth==0:parts.append(source[begin:i].strip());begin=i+1
    return []

def literal(s):
    m=re.fullmatch(r"['\"]([^'\"]+)['\"]",s.strip());return m[1] if m else None

def value(s):
    return literal(s) or next(iter(re.findall(r"\bname\s*=\s*['\"]([^'\"]+)['\"]",s)),None)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--output',type=Path);args=ap.parse_args();sys.path.insert(0,str(args.root/'tools/gtmap'));from strict_kong import parse
    strings=json.loads((args.source/'static_data_dec/strings-zhCN.json').read_text('utf-8-sig'));metadata=json.loads(gzip.decompress((args.root/'gtmap/assets/character-metadata.json.gz').read_bytes()));maps={};clips={};seen=set();sources={}
    def placed(name):
        if name in maps:return maps[name]
        result={};file=args.source/'Tilemaps_decoded'/f'{name}.tilemap'
        if file.exists():
            try:
                doc=parse(file.read_bytes())
                for layer in doc['layers']:
                    for prop in layer.get('properties',[]):
                        if prop['component']!='Tilemaps.CharacterPlaceholder':continue
                        e=layer['events'][prop['index']];v=prop['payload'].get('value',{});pos=e['position'];handle=e['name'];row=metadata['rows'].get(v.get('characterId'),{});ref=row.get('spine') or v.get('characterId','');ref=ref.get('default','') if isinstance(ref,dict) else ref;resource=ref.split('#')[0].split(':')[-1].split('/')[-1];resource=metadata['aliases'].get(resource,resource)
                        if not v.get('characterId') or max(abs(pos[0]),abs(pos[2]))>=998.5 or pos[0]==99 and pos[2]==99 or resource not in metadata['assets']:continue
                        if handle in result:result[handle]=None
                        else:result[handle]={'name':row.get('name') or v['characterId'],'position':[pos[0],pos[1]/2,pos[2]]}
            except (ValueError,KeyError):pass
        maps[name]=result;return result
    for path in sorted((args.source/'decrypted/Quest').rglob('*.lua')):
        raw=path.read_text('utf-8-sig');source=re.sub(r'--\[\[.*?\]\]','',raw,flags=re.S);source=re.sub(r'--[^\n]*','',source)
        stages=re.search(r'self\.available_stage_names\s*=\s*(\{[^}]*\}|[\"\'][^\"\']+[\"\'])',source)
        if not stages:continue
        names=re.findall(r"['\"]([^'\"]+)['\"]",stages[1]);handles={}
        for variable,handle in re.findall(r"\b(\w+)\s*=\s*get_character\(\s*['\"]([^'\"]+)['\"]\s*\)",source):handles.setdefault(variable,set()).add(handle)
        for variable,handle in re.findall(r"\b(\w+)\s*=\s*function\(\)\s*return\s+get_character\(\s*['\"]([^'\"]+)['\"]\s*\)",source):handles.setdefault(variable,set()).add(handle)
        for variable,getter in re.findall(r'local\s+(\w+)\s*=\s*self\.npc\.(\w+)\(\)',source):
            if getter in handles:handles.setdefault(variable,set()).update(handles[getter])
        for match in re.finditer(r'scene_util\.play_(normal|shout|thought)_speech_action\s*\(',source):
            parts=arguments(source,match.end())
            if len(parts)!=6:continue
            candidates=handles.get(parts[0],set())
            if len(candidates)!=1:continue
            handle=next(iter(candidates));key=literal(parts[5]) or next(iter(re.findall(r"\bkey\s*=\s*['\"]([^'\"]+)['\"]",parts[5])),None)
            if key not in strings:continue
            for name in names:
                actor=placed(name).get(handle)
                if not actor or (name,handle,key) in seen:continue
                seen.add((name,handle,key));relative=str(path.relative_to(args.source)).replace('\\','/');sources.setdefault(relative,hashlib.sha256(path.read_bytes()).hexdigest());index=len(clips.get(name,[]));title=f"对白动作摘录 · {actor['name']}：{re.sub('<[^>]*>','',strings[key])[:22]}"
                commands=[{'at':0,'op':'camera','position':actor['position'],'span':8},{'at':0,'op':'pose','target':handle,'animation':value(parts[3]) or 'idle','expression':value(parts[4]) or 'idle','duration':6,'loop':re.search(r'\bloop\s*=\s*false',parts[3]) is None},{'at':0,'op':'dialogue','target':handle,'speaker':actor['name'],'text':strings[key],'duration':6,'waitForClick':False,'bubbleType':{'normal':'talk','shout':'shout','thought':'thought'}[match[1]],'stringKey':key}]
                direction=literal(parts[2]);direction={'up':'back','down':'front'}.get(direction,direction)
                if direction in ['front','back','left','right']:commands[1]['direction']=direction
                clips.setdefault(name,[]).append({'id':f'native-line-{name}-{index}','version':1,'map':name,'title':title,'duration':6.1,'commands':commands,'source':relative.removeprefix('decrypted/')+' · '+key,'notes':'单个原生对白/动作调用的独立摘录；不是完整任务演出，不推断分支、前后顺序或移动。预留 6 秒连续自动播放；可在时间轴修改。'})
    output=args.output or args.root/'gtmap/assets/native-dialogue-clips';output.mkdir(parents=True,exist_ok=True)
    for name,rows in clips.items():(output/(name+'.json.gz')).write_bytes(gzip.compress(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    manifest={'version':1,'maps':{name:{'file':name+'.json.gz','count':len(rows)} for name,rows in clips.items()},'sources':sources,'stringTableSha256':hashlib.sha256((args.source/'static_data_dec/strings-zhCN.json').read_bytes()).hexdigest(),'total':sum(map(len,clips.values()))};(output/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8');print(f"{manifest['total']} literal calls across {len(clips)} maps")

if __name__=='__main__':main()
