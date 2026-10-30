"""Read-only audit of compiled Lua effect direction contracts. Does not rewrite packs.
Source omission, explicit vector, quaternion, four-way and screen calls stay distinct.
"""
import argparse,hashlib,json,re
from pathlib import Path

def digest(data):return hashlib.sha256(data).hexdigest()

def arguments(source,start):
    args=[];begin=start;depth=0;quote=None;i=start
    while i<len(source):
        c=source[i]
        if quote:
            if c=='\\':i+=2;continue
            if c==quote:quote=None
        elif c in "\"'":quote=c
        elif source.startswith('--',i):
            stop=source.find('\n',i);i=len(source) if stop<0 else stop;continue
        elif c in '({[':depth+=1
        elif c in ')}]':
            if c==')' and depth==0:
                args.append(source[begin:i].strip());return args,i+1
            depth-=1
        elif c==',' and depth==0:args.append(source[begin:i].strip());begin=i+1
        i+=1
    raise ValueError('Unclosed source call at '+str(start))

def classify(rotation,source,prefix=''):
    r=rotation.strip()
    if r in ['', 'nil','unity_class.vector3.zero','vector_util.zero','CS.UnityEngine.Vector3.zero']:return 'omitted-or-zero'
    if 'quaternion' in r.lower():return 'quaternion-expression'
    if re.fullmatch(r'(?:self\.)?\w+',r):
        assignments=list(re.finditer(r'(?:local\s+)?'+re.escape(r)+r'\s*=\s*([^\n]+)',prefix))
        if assignments:
            value=assignments[-1].group(1).strip()
            if 'quaternion' in value.lower():return 'quaternion-variable'
            if 'offset_table[' in value:return 'four-way-source-table'
            if 'direction_util.to_4way_vector3' in value or 'direction_util.to_vector3' in value:return 'four-way-enum'
            if value in ['vector_util.right','vector_util.left','vector_util.forward','vector_util.back']:return 'fixed-world-vector'

    if 'get_dir_vector_from_assistant' in source and r in ['self.dir_vector','dir_vector','self.target_dir']:return 'four-way-assistant'
    if 'direction_util.to_4way_vector3' in r or 'direction_util.to_vector3' in r:return 'four-way-enum'
    if 'offset_table' in r:return 'four-way-source-table'
    if r in ['vector_util.right','vector_util.left','vector_util.forward','vector_util.back','vector_util.up','vector_util.down'] or re.fullmatch(r'-?vector\([^)]*\)',r):return 'fixed-world-vector'
    if any(k in r for k in ['dir','direction','forward','toward']):return 'explicit-vector'
    return 'unresolved-expression'

def calls(source):
    rows=[]
    for m in re.finditer(r'\b(battle_util\.(instantiate_effect|instantiate_screen_effect))\s*\(',source):
        # Ignore commented source calls, but preserve line numbers of live source.
        line_start=source.rfind('\n',0,m.start())+1
        if source[line_start:m.start()].lstrip().startswith('--'):continue
        args,end=arguments(source,m.end());screen=m.group(2)=='instantiate_screen_effect'
        keyarg=args[2] if screen and len(args)>2 else args[1] if not screen and len(args)>1 else "'screen'"
        key=re.fullmatch(r"['\"]([^'\"]+)['\"]",keyarg)
        rotation='' if screen else args[3] if len(args)>3 else ''
        rows.append(dict(line=source.count('\n',0,m.start())+1,function=m.group(1),key=key.group(1) if key else None,keyExpression=keyarg,rotation=rotation,classification='screen-space' if screen else classify(rotation,source,source[:m.start()])))
    return rows

def audit(root):
    evidence=[];certain=[];candidates=[];not_applicable=[];coverage_gaps=[];sources={};snapshots=[];class_counts={};plans_count=0
    for path in sorted((root/'gtfx/assets/native-characters').glob('*.json')):
        raw=path.read_bytes();pack=json.loads(raw);snapshots.append(dict(character=path.stem,path=str(path),sha256=digest(raw)))
        for plan in pack.get('plans',[]):
            source_path=Path(plan.get('source',''))
            if not plan.get('source') or not source_path.is_file():
                not_applicable.append(dict(character=path.stem,action=plan.get('action'),reason='No compiled Lua source reference'));continue
            plans_count+=1
            if str(source_path) not in sources:
                data=source_path.read_bytes();source=data.decode('utf-8-sig');sources[str(source_path)]=dict(sha256=digest(data),calls=calls(source))
            source=sources[str(source_path)];base=dict(character=path.stem,action=plan.get('action'),source=str(source_path),sourceSha256=source['sha256'],behavior=plan.get('behavior'),pattern=plan.get('pattern'))
            for call in source['calls']:
                row={**base,**call};evidence.append(row);class_counts[call['classification']]=class_counts.get(call['classification'],0)+1
            events=[]
            for field in ['events','breakEvents']:
                for index,event in enumerate(plan.get(field,[])):
                    if event.get('op','effect')=='effect':events.append((field,index,event))
            for field,index,event in events:
                key=event.get('key');base_event={**base,'eventField':field,'eventIndex':index,'key':key}
                if event.get('screen'):
                    not_applicable.append({**base_event,'reason':'Screen-space effect; world facing rotation is not applicable'});continue
                matches=[c for c in source['calls'] if c['key']==key and c['classification']!='screen-space']
                if not matches:
                    candidates.append({**base_event,'reason':'Dynamic key, helper or effect call cannot be matched to a literal Lua key'});continue
                classes={c['classification'] for c in matches};directed=event.get('directed',plan.get('behavior')=='timeline')
                record={**base_event,'directed':directed,'sourceClasses':sorted(classes),'sourceLines':sorted({c['line'] for c in matches})}
                if classes=={'omitted-or-zero'} and directed:
                    certain.append({**record,'error':'Compiled event rotates toward actor/target despite source nil/zero rotation'})
                elif classes <= {'explicit-vector','fixed-world-vector','four-way-assistant','four-way-enum','four-way-source-table'} and not directed:
                    # Parameterized runtime patterns may calculate explicit graphDirection outside events.
                    if event.get('link',{}).get('graphDirection') or event.get('directionVector'):continue
                    certain.append({**record,'error':'Compiled event suppresses an explicit source vector rotation'})
                elif classes & {'quaternion-expression','quaternion-variable'} and not any(k in event for k in ['euler','negativeEuler','link']):
                    candidates.append({**record,'reason':'Source quaternion needs exact Euler/quaternion operation contract review'})
                elif len(classes)>1 or 'unresolved-expression' in classes:
                    candidates.append({**record,'reason':'Multiple source branches or unresolved rotation expression require review'})
            covered={event.get('key') for _,_,event in events if event.get('key')}
            unbound=sorted({c['key'] for c in source['calls'] if c['key'] and c['classification']!='screen-space' and c['key'] not in covered})
            if unbound:
                coverage_gaps.append({**base,'keys':unbound,'reason':'Runtime pattern/helper-generated effects are source-listed but not directly checked as declarative literal-key events'})
            if plan.get('directionMode')=='assistant-fourway':
                not_applicable.append({**base,'reason':'Source four-way assistant contract explicitly preserved by runtime directionMode'})
    return dict(schema=1,scope='All existing native-character packs and their source-referenced compiled Lua plans; static audit only, no pixel or facing sweep',
                rules={'nilRotation':'Lua effect_util default Vector3.zero; native Instantiate retains identity before authored pool rotation','explicitRotation':'Only actual source direction/quaternion arguments authorize rotation','certainty':'Only unambiguous literal-key event mismatches are certain; dynamic helpers remain candidates'},
                counts=dict(packs=len(snapshots),compiledLuaPlans=plans_count,uniqueLuaSources=len(sources),sourceCalls=len(evidence),classifications=class_counts,certainErrors=len(certain),candidates=len(candidates),notApplicable=len(not_applicable),runtimeBindingCoverageGaps=len(coverage_gaps)),
                inputSnapshots=snapshots,sourceSnapshots={k:{'sha256':v['sha256']} for k,v in sources.items()},certainErrors=certain,candidates=candidates,notApplicable=not_applicable,runtimeBindingCoverageGaps=coverage_gaps,sourceCalls=evidence)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=Path(__file__).parents[2]);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args();report=audit(args.root);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report['counts'],ensure_ascii=False));print('Report:',args.output)
if __name__=='__main__':main()
