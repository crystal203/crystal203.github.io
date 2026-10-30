"""Registered native methods/fields for the inspected ARM64 APK, with bounded reads."""
import argparse
import importlib.util
import json
import struct
import sys
from pathlib import Path

def module(name, file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

workbench=module('native_workbench','native-workbench.py')
metadata_module=module('controller_metadata','inspect-controller-metadata.py')

class RegisteredImage(workbench.NativeImage):
    ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
    REGISTRATION=0x98fb820
    SCRIPTS_MODULE=0x9a3b730
    def __init__(self,profile):
        super().__init__(profile)
        if self.profile['elfSha256']!=self.ELF:
            raise ValueError('Registration addresses are pinned to the inspected ELF')
        self.definitions=metadata_module.ControllerMetadata(self.metadata)
        r=self.REGISTRATION
        self.typeCount=self.u64(r+48);self.typePointers=self.u64(r+56)
        self.fieldOffsets=self.u64(r+88)
        self.methodCount=self.u64(self.SCRIPTS_MODULE+8)
        self.methodPointers=self.u64(self.SCRIPTS_MODULE+16)
        if self.read(self.u64(self.SCRIPTS_MODULE),12)!=b'Scripts.dll\0':
            raise ValueError('Scripts module identity mismatch')
        if self.u64(r+80)!=len(self.definitions.types) or self.u64(r+96)!=len(self.definitions.types):
            raise ValueError('Metadata registration type count mismatch')
        if not 0<self.typeCount<1000000 or not 0<self.methodCount<1000000:
            raise ValueError('Invalid registration count')
        # Scripts.dll is the first image in this metadata. Verify each method's
        # RID rather than applying the Scripts pointer table to other assemblies.
        self.methods={};self.methodAliases={}
        for index in range(self.methodCount):
            raw=self.definitions.row('methods','<7I4H',index)
            if raw[6]!=0x06000001+index or raw[1]>=len(self.definitions.types):continue
            typ=self.definitions.types[raw[1]]
            name=typ['fullName']+'.'+self.definitions.string(raw[0])
            address=self.method_address(raw[6])
            if address:
                self.methodAliases.setdefault(address,[]).append(name)
                self.methods[address]=(address+4,name)
        self.check_method('Oak.StageEventControllerSuperTutorial','OnStageLoad',0x738d4cc)
        self.check_method('Oak.StageEventControllerSuperTutorial','OnEvent',0x738db64)

    def u64(self,address):
        raw=self.read(address,8)
        if len(raw)!=8:raise ValueError('Unmapped pointer: '+hex(address))
        return int.from_bytes(raw,'little')

    def method_address(self,token):
        rid=token&0xffffff
        if token>>24!=6 or not 1<=rid<=self.methodCount:raise ValueError('Method token outside Scripts module')
        return self.u64(self.methodPointers+(rid-1)*8)

    def type(self,index):
        if not 0<=index<self.typeCount:raise ValueError('Type registration index outside table')
        return self.type_pointer(self.u64(self.typePointers+index*8))

    def type_pointer(self,address,depth=0):
        if depth>8:raise ValueError('Recursive generic type exceeds limit')
        data=self.u64(address);bits=int.from_bytes(self.read(address+8,4),'little')
        kind=(bits>>16)&255;result=dict(pointer=hex(address),kind=kind,byref=bool(bits&(1<<29)))
        primitives={1:'System.Void',2:'System.Boolean',3:'System.Char',4:'System.SByte',5:'System.Byte',
                    6:'System.Int16',7:'System.UInt16',8:'System.Int32',9:'System.UInt32',10:'System.Int64',
                    11:'System.UInt64',12:'System.Single',13:'System.Double',14:'System.String',28:'System.Object'}
        if kind in primitives:result['name']=primitives[kind]
        elif kind in [17,18]:
            if data>=len(self.definitions.types):raise ValueError('Registered type definition outside table')
            result.update(definitionIndex=data,name=self.definitions.types[data]['fullName'])
        elif kind==21:
            base=self.type_pointer(self.u64(data),depth+1)
            inst=self.u64(data+8);count=self.u64(inst);argv=self.u64(inst+8)
            if not 0<count<=32:raise ValueError('Generic argument count outside limit')
            args=[self.type_pointer(self.u64(argv+i*8),depth+1) for i in range(count)]
            result.update(name=base.get('name','?')+'<'+','.join(a.get('name','?') for a in args)+'>',arguments=args)
        else:result['data']=hex(data)
        return result

    def describe(self,name):
        matches=([self.definitions.types[int(name[1:])]] if name.startswith('#')
                 else [r for r in self.definitions.types if r['fullName']==name])
        if len(matches)!=1:raise ValueError('Type must resolve uniquely: '+name)
        row=matches[0];result=self.definitions.describe(row)
        result['byvalType']=self.type(row['byvalTypeIndex'])
        offsets=self.u64(self.fieldOffsets+row['index']*8)
        for i,field in enumerate(result['fields']):
            field['offset']=struct.unpack('<i',self.read(offsets+i*4,4))[0]
            field['type']=self.type(field['typeIndex'])
        for method in result['methods']:
            for parameter in method.get('parameters',[]):parameter['type']=self.type(parameter['typeIndex'])
            if 'token' in method:
                token=int(method['token'],16)
                if method['index']<self.methodCount and token==0x06000001+method['index']:
                    method['address']=hex(self.method_address(token))
                else:method.update(address=None,addressStatus='outside the inspected Scripts.dll codegen module')
        return result

    def check_method(self,typ,name,address):
        methods=[m for m in self.describe(typ)['methods'] if m.get('name')==name]
        if len(methods)!=1 or int(methods[0]['address'],16)!=address:
            raise ValueError('Registered method anchor mismatch: '+typ+'.'+name)

    def usage(self,word):
        kind=word>>29;index=(word&0x1fffffff)>>1
        result=dict(word=hex(word),kind=kind,index=index)
        if kind==1:result.update(self.type(index))
        elif kind in [3,6]:
            method_index=index
            if kind==6:
                count=self.u64(self.REGISTRATION+64)
                if index>=count:raise ValueError('Method spec outside registration')
                pointer=self.u64(self.REGISTRATION+72)
                method_index,class_inst,method_inst=struct.unpack('<3i',self.read(pointer+index*12,12))
                result.update(classInstIndex=class_inst,methodInstIndex=method_inst)
            raw=self.definitions.row('methods','<7I4H',method_index)
            result.update(methodIndex=method_index,name=self.definitions.types[raw[1]]['fullName']+'.'+self.definitions.string(raw[0]))
        return result

    def literal(self,word):
        if word>>29!=5:return ''
        index=(word&0x1fffffff)>>1
        if index>=self.sc//8:return ''
        length,offset=struct.unpack_from('<II',self.metadata,self.sl+index*8)
        if length>5000:length^=0x66666666;offset^=0x66666666
        if length>5000 or offset+length>self.dc:return ''
        raw=bytes(self.metadata[self.sd+offset:self.sd+offset+length])
        for value in [raw,raw.translate(metadata_module.XOR66)]:
            try:text=value.decode('utf8')
            except UnicodeDecodeError:continue
            checked=text.replace('\n','').replace('\r','').replace('\t','')
            if checked.isprintable() or not checked:return text
        return ''

    def close(self):
        for mapped in self.maps:mapped.close()
        for file in self.files:file.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile',type=Path,required=True)
    parser.add_argument('--class',dest='classes',action='append',default=[])
    parser.add_argument('--usage',type=lambda s:int(s,0),action='append',default=[])
    parser.add_argument('--range',action='append',default=[])
    parser.add_argument('--method-range',action='append',default=[])
    parser.add_argument('--method',action='append',default=[],help='Exact registered fully qualified method; emit its bounded native body automatically')
    parser.add_argument('--find-type',action='append',default=[],help='Case-insensitive substring search over real metadata type names (bounded results)')
    parser.add_argument('--find-method',action='append',default=[],help='Case-insensitive substring search over registered native method names')
    parser.add_argument('--address',type=lambda s:int(s,0),action='append',default=[])
    parser.add_argument('--capstone-libs',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if len(args.classes)>32 or len(args.range)>8 or len(args.method_range)>8 or len(args.usage)>64 or len(args.address)>64 or len(args.method)>8 or len(args.find_type)>8 or len(args.find_method)>8:parser.error('Request exceeds bounded batch size')
    if args.capstone_libs:sys.path.insert(0,str(args.capstone_libs))
    image=RegisteredImage(args.profile)
    try:
        result=dict(schema=1,apkSha256=image.profile['apkSha256'],elfSha256=image.profile['elfSha256'],
                    registration=hex(image.REGISTRATION),scriptsModule=hex(image.SCRIPTS_MODULE),
                    methodCount=image.methodCount,typeCount=image.typeCount,
                    classes=[image.describe(c) for c in args.classes],
                    methods=[dict(address=hex(a),names=image.methodAliases.get(a,[])) for a in args.address],
                    usages=[image.usage(w) for w in args.usage])
        result['typeMatches']=[]
        for query in args.find_type:
            matches=[dict(index=t['index'],fullName=t['fullName']) for t in image.definitions.types if query.casefold() in t['fullName'].casefold()]
            result['typeMatches'].append(dict(query=query,total=len(matches),matches=matches[:128],truncated=len(matches)>128))
        result['methodMatches']=[]
        for query in args.find_method:
            matches=[dict(name=name,address=hex(address)) for address,names in sorted(image.methodAliases.items()) for name in names if query.casefold() in name.casefold()]
            result['methodMatches'].append(dict(query=query,total=len(matches),matches=matches[:128],truncated=len(matches)>128))
        result['selectedMethods']=[]
        addresses=sorted(image.methodAliases)
        for requested in args.method:
            matches=[address for address,names in image.methodAliases.items() if requested in names]
            if len(matches)!=1:raise ValueError('Method must resolve to one native address: '+requested)
            start=matches[0];end=next((a for a in addresses if a>start),None)
            if end is None or not 0<end-start<=16384:
                raise ValueError('Method exceeds bounded 16 KiB body; use an explicit --range: '+requested)
            file=args.output.with_name(args.output.stem+'-'+hex(start)[2:]+'.txt')
            file.parent.mkdir(parents=True,exist_ok=True)
            file.write_text(image.disassemble(start,end),'utf8')
            result['selectedMethods'].append(dict(name=requested,start=hex(start),end=hex(end),bodyBytes=end-start,aliases=image.methodAliases[start],disassembly=str(file)))
        result['methodRanges']=[]
        for span in args.method_range:
            start,end=[int(s,0) for s in span.split(':')]
            if not 0<end-start<=0x100000:raise ValueError('Method lookup range must be positive and <=1 MiB')
            rows=[{'address':hex(a),'names':names} for a,names in sorted(image.methodAliases.items()) if start<=a<end]
            if len(rows)>512:raise ValueError('Method lookup range exceeds 512 registered entries')
            result['methodRanges'].append({'start':hex(start),'end':hex(end),'methods':rows})
        for span in args.range:
            start,end=[int(s,0) for s in span.split(':')]
            if start%4 or end%4 or not 0<end-start<=16384:raise ValueError('Disassembly range must be aligned and <=16 KiB')
            file=args.output.with_name(args.output.stem+'-'+hex(start)[2:]+'.txt')
            file.parent.mkdir(parents=True,exist_ok=True);file.write_text(image.disassemble(start,end),'utf8')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
        print(json.dumps(dict(classes=len(args.classes),usages=len(args.usage),ranges=len(args.range),output=str(args.output))))
    finally:image.close()

if __name__=='__main__':main()
