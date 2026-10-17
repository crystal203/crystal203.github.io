"""Portable, lossless structural IR for legacy native Screenplay JSON.

Keeps parallel/sequence scopes, original arguments, source pointers and callback
references. Unsupported semantics remain explicit blockers, never guessed waits.
This IR is a conversion artifact; emitting it does not certify game parity.
"""
import argparse,collections,gzip,hashlib,json,importlib.util
from pathlib import Path

# Shared operations already lowered by screenplay-compiler.py. New operations
# are retained in the IR and reported; native adapters can be added once.
_spec=importlib.util.spec_from_file_location('shared_screenplay_compiler',Path(__file__).with_name('screenplay-compiler.py'))
_compiler=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_compiler)
LOWERED=_compiler.LOWERED_OPERATIONS-{'call','custom_action','do','sequence'}
CONTROL_PROOF={'parallel':'ScreenplayDo.Operation 0x89ae818 / MoveNext 0x89aedec; WaitForAll after children',
 'sequence':'ScreenplaySequence.Operation 0x89af8e8 / MoveNext 0x89b0004; yield each child',
 'actorParallel':'ScreenplayObjectDo.Operation 0x89b7ac4 / MoveNext 0x89b8140',
 'actorSequence':'ScreenplayObjectSequence.Operation 0x89b8d70 / MoveNext 0x89b9548'}

def pointer(base,key):return base+'/'+str(key).replace('~','~0').replace('/','~1')

def native_json(text):
    # Native documents permit trailing commas. Preserve strings verbatim and
    # reject duplicate keys instead of silently discarding earlier operations.
    chars=list(text);quoted=False;escaped=False
    for i,c in enumerate(text):
        if quoted:
            if escaped:escaped=False
            elif c=='\\':escaped=True
            elif c=='"':quoted=False
        elif c=='"':quoted=True
        elif c==',':
            j=i+1
            while j<len(text) and text[j].isspace():j+=1
            if j<len(text) and text[j] in '}]':chars[i]=' '
    def pairs(rows):
        result={}
        for key,value in rows:
            if key in result:raise ValueError('Duplicate native JSON key: '+key)
            result[key]=value
        return result
    return json.loads(''.join(chars),object_pairs_hook=pairs)

def native_value(node):
    """Round-trip the parsed source structure; useful for checking no data loss."""
    kind=node['kind']
    if kind=='unresolved':return node['value']
    if kind=='operation':return node['args']
    if kind in ['actor','control']:return native_value(node['body'])
    if node['container']=='array':return [native_value(child) for child in node['children']]
    return {child['key']:native_value(child) for child in node['children']}

class ScreenplayIR:
    def __init__(self):
        self.operations=collections.Counter();self.callbacks=set();self.actions=set();self.bindings={};self.issues=[];self.options=collections.defaultdict(collections.Counter)
    def node(self,value,path='',actor=None):
        if isinstance(value,list):return {'kind':'sequence','container':'array','source':path,'children':[self.node(v,pointer(path,i),actor) for i,v in enumerate(value)]}
        if not isinstance(value,dict):
            self.issues.append({'source':path,'reason':'Expected native operation object or sequence'})
            return {'kind':'unresolved','source':path,'value':value}
        return {'kind':'parallel','container':'object','source':path,'children':[self.entry(k,v,pointer(path,k),actor) for k,v in value.items()]}
    def entry(self,op,args,path,actor):
        if op.startswith('$'):
            alias,*suffix=op.split(' ')
            mode='sequence' if suffix==['sequence'] else 'parallel'
            if suffix not in [[],['sequence']]:self.issues.append({'source':path,'reason':'Unsupported actor suffix','value':suffix})
            if isinstance(args,dict) and 'find' in args:self.bindings[alias]=args['find']
            body=self.node(args,path,alias)
            # Explicit "$actor sequence" applies to a dictionary too.
            return {'kind':'actor','key':op,'alias':alias,'mode':mode,'source':path,'body':body}
        if op in ['do','sequence']:
            return {'kind':'control','key':op,'mode':'parallel' if op=='do' else 'sequence','source':path,'body':self.node(args,path,actor)}
        self.operations[op]+=1
        if isinstance(args,dict):self.options[op].update(args.keys())
        result={'kind':'operation','key':op,'op':op,'args':args,'source':path}
        if actor:result['actor']=actor
        if op=='call':
            result['binding']='stage-callback';self.callbacks.add(str(args.get('name')) if isinstance(args,dict) else str(args))
        elif op=='custom_action':
            name=args.get('name') if isinstance(args,dict) else None
            result['binding']='actor-custom-action';self.actions.add(str(name))
            if name is None:self.issues.append({'source':path,'reason':'Custom action has no name'})
        elif op not in LOWERED:result['binding']='native-operation-adapter'
        return result
    def document(self,source,name,digest):
        if not isinstance(source,dict):raise ValueError('Screenplay document must contain named sections')
        sections={key:self.node(value,pointer('',key)) for key,value in source.items()}
        unresolved=sorted(set(self.operations)-LOWERED-{'call','custom_action'})
        if {k:native_value(v) for k,v in sections.items()}!=source:raise ValueError('IR round-trip lost native source structure')
        return {'schema':1,'format':'native-screenplay-ir','source':name,'sourceSha256':digest,'sections':sections,
            'bindings':self.bindings,'stageCallbacks':sorted(self.callbacks),'customActions':sorted(self.actions),
            'operations':dict(self.operations),'parameterKeys':{k:dict(v) for k,v in self.options.items()},
            'requiredOperationAdapters':unresolved,'structuralIssues':self.issues,'runtimeReady':False,
            'note':'Structural conversion preserves arguments. Runtime lowering and native controller bindings are separate requirements.'}

def convert(path,source_name=None):
    raw=path.read_bytes();return ScreenplayIR().document(native_json(raw.decode('utf-8-sig')),source_name or path.name,hashlib.sha256(raw).hexdigest())

def lower(document,stage,section,adapter=None):
    if document.get('format')!='native-screenplay-ir' or document.get('schema')!=1:raise ValueError('Unsupported IR schema')
    matches=[name for name,event in stage.get('nativeEvents',{}).items() if event['sha256']==document['sourceSha256']]
    if not matches:raise ValueError('IR source is not declared by this stage; bind its native resource explicitly')
    if section not in document['sections']:raise ValueError('Native section is missing: '+section)
    from screenplay_adapters import load_bindings
    callbacks,actions=load_bindings(adapter,stage)
    source={k:native_value(v) for k,v in document['sections'].items()}
    result=_compiler.ScreenplayCompiler(stage,callbacks,actions).compile(source,section,'files/events/'+matches[0]+'.json')
    result['sourceSha256']=document['sourceSha256'];result['adapter']=adapter
    return result

def section_report(node):
    operations=collections.Counter();callbacks=set();actions=set();parameters={};unresolved=[]
    def visit(value):
        kind=value['kind']
        if kind=='operation':
            op=value['op'];args=value['args'];operations[op]+=1
            if op=='call':callbacks.add(str(args.get('name')) if isinstance(args,dict) else str(args))
            elif op=='custom_action':actions.add(str(args.get('name')) if isinstance(args,dict) else '<missing>')
            if op in _compiler.OPTION_KEYS and isinstance(args,dict):
                extra=set(args)-_compiler.OPTION_KEYS[op]
                if extra:parameters.setdefault(op,set()).update(extra)
        elif kind in ['actor','control']:visit(value['body'])
        elif kind=='unresolved':unresolved.append(value['source'])
        else:
            for child in value['children']:visit(child)
    visit(node)
    return {'operations':dict(operations),'stageCallbacks':sorted(callbacks),'customActions':sorted(actions),
        'requiredOperationAdapters':sorted(set(operations)-LOWERED-{'call','custom_action'}),
        'unsupportedParameters':{k:sorted(v) for k,v in parameters.items()},'unresolvedNodes':unresolved}

def index(source,output):
    files=sorted(source.glob('*.json'))
    if len(files)>10000:raise ValueError('Source catalog exceeds 10000-file bound')
    documents=[];failures=[];operations=collections.Counter();per_operation=collections.defaultdict(set)
    for file in files:
        if file.stat().st_size>16*1024*1024:raise ValueError('Source document exceeds 16 MiB bound: '+file.name)
        try:doc=convert(file,file.relative_to(source).as_posix())
        except (ValueError,UnicodeDecodeError) as e:failures.append({'source':file.name,'reason':str(e)});continue
        documents.append(doc);operations.update(doc['operations'])
        for op in doc['operations']:per_operation[op].add(file.name)
    summary={'schema':1,'sourceFiles':len(files),'convertedDocuments':len(documents),'sections':sum(len(d['sections']) for d in documents),
        'operations':dict(operations.most_common()),'operationDocumentCounts':{k:len(v) for k,v in per_operation.items()},
        'stageCallbackReferences':sum(len(d['stageCallbacks']) for d in documents),'customActionReferences':sum(len(d['customActions']) for d in documents),
        'knownOpcodeOccurrences':sum(v for k,v in operations.items() if k in LOWERED),'totalOperationOccurrences':sum(operations.values()),
        'requiredOperationAdapters':dict((k,v) for k,v in operations.most_common() if k not in LOWERED|{'call','custom_action'}),
        'structuralIssues':sum(len(d['structuralIssues']) for d in documents),'failures':failures,'controlFlowEvidence':CONTROL_PROOF,
        'runtimeReadyDocuments':0,'storyParityCertified':False,
        'note':'Opcode counts are recognition counts, not executable-story coverage. Parameter variants and controller bindings still need lowering.',
        'documents':[{'source':d['source'],'sha256':d['sourceSha256'],'bindings':d['bindings'],
            'sections':{key:section_report(node) for key,node in d['sections'].items()},'issues':d['structuralIssues']} for d in documents]}
    output.mkdir(parents=True,exist_ok=True)
    (output/'screenplay-catalog.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n','utf8')
    payload=json.dumps({'schema':1,'documents':documents},ensure_ascii=False,separators=(',',':')).encode()
    (output/'screenplay-ir.json.gz').write_bytes(gzip.compress(payload,mtime=0))
    print(json.dumps({k:summary[k] for k in ['sourceFiles','convertedDocuments','sections','totalOperationOccurrences','knownOpcodeOccurrences','structuralIssues','failures']},ensure_ascii=False))

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    catalog=sub.add_parser('index');catalog.add_argument('--source',type=Path,required=True);catalog.add_argument('--output',type=Path,required=True)
    one=sub.add_parser('convert');one.add_argument('--source',type=Path,required=True);one.add_argument('--output',type=Path,required=True)
    compile_command=sub.add_parser('lower');compile_command.add_argument('--ir',type=Path,required=True);compile_command.add_argument('--stage',type=Path,required=True);compile_command.add_argument('--section',required=True);compile_command.add_argument('--adapter');compile_command.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    if args.command=='index':index(args.source,args.output)
    elif args.command=='convert':
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(convert(args.source),ensure_ascii=False,indent=2)+'\n','utf8')
    else:
        result=lower(json.loads(args.ir.read_text('utf8')),json.loads(args.stage.read_text('utf8')),args.section,args.adapter)
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
if __name__=='__main__':main()
