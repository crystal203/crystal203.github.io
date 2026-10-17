"""Resolve bounded coroutine bodies from registered factory method references.

No legacy symbol guesses or adjacent type-index guesses. Codegen/metadata
registration and the pinned ELF are validated by RegisteredImage.
"""
import argparse,importlib.util,json,re,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('registered',Path(__file__).with_name('native-controller-image.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def inspect(image,address):
    addresses=sorted(image.methods)
    def end_of(start):return next((a for a in addresses if a>start),start+4096)
    end=min(end_of(address),address+4096)
    wrapper=image.disassemble(address,end)
    references={int.from_bytes(bytes.fromhex(word),'little') for word in re.findall(r'VA [0-9a-f]+ ([0-9a-f]{16})',wrapper)}
    rows=[]
    for word in sorted(references):
        if word>>29!=1:continue
        usage=image.usage(word)
        if not usage.get('name','').startswith('<'):continue
        definition=image.describe('#'+str(usage['definitionIndex']))
        moves=[m for m in definition['methods'] if m.get('name')=='MoveNext']
        if len(moves)!=1:continue
        if not moves[0].get('address'):raise ValueError('Iterator belongs to an unregistered codegen module')
        start=int(moves[0]['address'],16);end=end_of(start)
        if not 0<end-start<=16384:raise ValueError('Iterator body exceeds bounded 16 KiB range: '+hex(start))
        rows.append({'usage':usage,'definitionIndex':definition['index'],'name':definition['fullName'],
                     'start':hex(start),'end':hex(end),'disassembly':image.disassemble(start,end)})
    if not rows:raise ValueError('No registered iterator reference in factory '+hex(address))
    return {'factory':hex(address),'factoryNames':image.methodAliases.get(address,[]),'iterators':rows}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--profile',type=Path,required=True)
    p.add_argument('--method',action='append',type=lambda s:int(s,0),required=True)
    p.add_argument('--capstone-libs',type=Path);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    if len(args.method)>16:p.error('At most 16 factories per bounded batch')
    if args.capstone_libs:sys.path.insert(0,str(args.capstone_libs))
    image=module.RegisteredImage(args.profile)
    try:
        result={'schema':1,'elfSha256':image.profile['elfSha256'],'factories':[inspect(image,a) for a in args.method]}
        args.output.parent.mkdir(parents=True,exist_ok=True)
        for factory in result['factories']:
            for row in factory['iterators']:
                file=args.output.with_name(args.output.stem+'-'+row['start'][2:]+'.txt')
                file.write_text(row.pop('disassembly'),'utf8');row['bodyFile']=file.name
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
        print(json.dumps({'factories':len(result['factories']),'iterators':sum(len(r['iterators']) for r in result['factories']),'output':str(args.output)}))
    finally:image.close()
if __name__=='__main__':main()
