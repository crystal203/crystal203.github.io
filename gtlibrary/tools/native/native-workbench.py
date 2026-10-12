"""Versioned local native research cache: APK, Lua/static/map decode, Unity trees, FTS.

Large originals and derived data stay outside the static website. No game execution.
"""
import argparse, bisect, collections, hashlib, json, mmap, pathlib, re, sqlite3, struct, sys, zipfile, zlib

_parents=set()
def ensure_parent(path):
    parent=path.parent
    if parent not in _parents:parent.mkdir(parents=True,exist_ok=True);_parents.add(parent)

def sha_file(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def dump(path,obj):
    ensure_parent(path)
    path.write_text(json.dumps(obj,ensure_ascii=True,indent=2,default=lambda o: {'binaryBytes':len(o)} if isinstance(o,bytes) else str(o))+'\n','utf8')

def put(path,raw):
    ensure_parent(path)
    if not path.exists() or path.read_bytes()!=raw:path.write_bytes(raw)

def unpad(raw):
    n=raw[-1]
    if n<1 or n>16 or raw[-n:]!=bytes([n])*n:raise ValueError('Invalid PKCS7 padding')
    return raw[:-n]

def decrypt(raw,kind,name=''):
    from Cryptodome.Cipher import AES
    if kind=='lua':
        import lz4.block
        b=unpad(AES.new(b'e569092327744c2e65c5a0382e4037e3',AES.MODE_CBC,b'c323345463191717').decrypt(raw))
        return lz4.block.decompress(b[:-4],uncompressed_size=struct.unpack_from('<I',b,len(b)-4)[0])
    if kind=='static':
        h=raw[:16];salt=int.from_bytes(bytes(x^y for x,y in zip(b'k0ng',h[12:16][::-1])),'little',signed=True)
        key=hashlib.sha256(('kongstudios'+str(salt)).encode()).digest();iv=h;body=raw[16:]
    else:
        key=hashlib.sha256(('kongstudios'+name).encode()).digest();iv=bytes.fromhex('e0c6bf2f1ebdabf7d71032888878ecad');body=raw
    return zlib.decompress(unpad(AES.new(key,AES.MODE_CBC,iv).decrypt(body)),-15)

def decode_maps(native,out,report,record):
    count=0;entries=[];archive=out/'maps.kong.zip';temp=out/'maps.kong.zip.tmp'
    with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
        for namespace,base in [('cdn',native/'files/Tilemaps'),('apk',out/'apk/assets/Tilemaps')]:
            for source in sorted(base.rglob('*')):
                if not source.is_file() or source.suffix not in ('.bytes','.tilemap'):continue
                try:
                    original=source.read_bytes();raw=original if original[:4]==b'KONG' else decrypt(original,'map',source.stem)
                    if raw[:4]!=b'KONG':raise ValueError('Decoded map does not have the KONG signature')
                    member=(pathlib.PurePosixPath(namespace)/source.relative_to(base).as_posix()).with_suffix('.kong').as_posix();z.writestr(member,raw)
                    dest=out/'maps'/member;record(dest,namespace+':'+str(source.relative_to(base)),raw,'map-decoded');count+=1
                    entries.append({'member':member,'sourceSha256':hashlib.sha256(original).hexdigest(),'decodedSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
                    if count%250==0:print(f'map: {count} archived',flush=True)
                except Exception as e:report['failures'].append({'source':namespace+':'+str(source.relative_to(base)),'phase':'map-decrypt','error':str(e)})
    temp.replace(archive);report['maps']={'archive':archive.name,'entries':entries}
    print(f'map: {count} decoded',flush=True)

def prepare(a):
    native=a.native_root.resolve(); apk=a.apk.resolve(); tag=sha_file(apk);out=a.cache.resolve()/tag[:16];out.mkdir(parents=True,exist_ok=True)
    report={'schema':1,'apk':apk.name,'apkSha256':tag,'files':[],'decode':collections.Counter(),'failures':[],'limitations':[]};db=sqlite3.connect(out/'index.sqlite')
    db.executescript('CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, source TEXT, sha256 TEXT, bytes INTEGER, status TEXT); CREATE VIRTUAL TABLE IF NOT EXISTS documents USING fts5(path UNINDEXED, source UNINDEXED, text, tokenize="unicode61"); DELETE FROM files; DELETE FROM documents; CREATE TABLE IF NOT EXISTS methods(start INTEGER PRIMARY KEY,end INTEGER,name TEXT,class TEXT); DELETE FROM methods;')
    def record(path,source,raw,status,text=None):
        db.execute('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?)',(str(path),source,hashlib.sha256(raw).hexdigest(),len(raw),status));report['decode'][status]+=1
        if text is not None:db.execute('INSERT INTO documents VALUES(?,?,?)',(str(path),source,text))
    with zipfile.ZipFile(apk) as z:
        for entry in z.infolist():
            if entry.is_dir():continue
            name=entry.filename;dest=out/'apk'/name
            if not dest.resolve().is_relative_to((out/'apk').resolve()):raise ValueError('Unsafe APK path: '+name)
            raw=z.read(entry);put(dest,raw)
            text=raw.decode('utf8','replace') if name.endswith(('.lua','.json','.xml','.txt')) and b'\0' not in raw[:128] else None
            record(dest,'apk:'+name,raw,'apk-extracted',text)
            report['files'].append({'path':name,'bytes':len(raw),'crc32':f'{entry.CRC:08x}','sha256':hashlib.sha256(raw).hexdigest()})
        print(f'APK extracted: {len(report["files"])} files',flush=True)
    # Typed Unity serialized data, preserving PPtrs and path IDs for cross-file lookup.
    if a.unity_libs:sys.path.insert(0,str(a.unity_libs))
    import UnityPy
    useful={'MonoBehaviour','GameObject','Transform','RectTransform','AnimationClip','AnimatorController','AnimatorOverrideController','AudioMixerController','AudioMixerGroupController','AudioMixerSnapshotController','AudioSource','MonoScript','AssetBundle','TextAsset','AudioClip'}
    objects=out/'unity-objects.jsonl';object_count=0;bundle_count=0;types=collections.Counter();cached_rows={}
    if objects.exists():
        with objects.open(encoding='utf8',errors='replace') as f:
            for line in f:
                try:
                    row=json.loads(line)
                    if 'tree' in row:cached_rows[(row['source'],row['pathId'])]=row['tree']
                except ValueError:continue
    sources=list((out/'apk/assets/AssetBundles').rglob('*'))
    data=out/'apk/assets/bin/Data'
    sources += [p for p in data.glob('*') if p.name in ('globalgamemanagers','globalgamemanagers.assets','resources.assets','unity_builtin_extra') or re.fullmatch(r'(?:level\d+|sharedassets\d+\.assets)',p.name)]
    with objects.open('w',encoding='utf8') as log:
        for source in sources:
            if not source.is_file() or source.suffix=='.resS':continue
            try:env=UnityPy.load(str(source));bundle_count+=1
            except Exception as e:report['failures'].append({'source':str(source.relative_to(out)),'phase':'unity-load','error':str(e)});continue
            for obj in env.objects:
                typ=obj.type.name;types[typ]+=1;object_count+=1;row={'source':str(source.relative_to(out)),'pathId':str(obj.path_id),'type':typ,'bytes':obj.byte_size}
                if typ in useful:
                    dest=out/'unity'/source.relative_to(out/'apk')/(str(obj.path_id)+'.json')
                    try:
                        cached=cached_rows.get((row['source'],row['pathId']))
                        if cached is not None:tree=cached
                        elif dest.exists():
                            try:tree=json.loads(dest.read_text('utf8'))
                            except (ValueError,UnicodeError):tree=obj.read_typetree()
                        elif typ=='AudioClip':
                            clip=obj.read();tree={'m_Name':clip.m_Name,'m_Channels':clip.m_Channels,'m_Frequency':clip.m_Frequency,'m_Length':clip.m_Length,'m_CompressionFormat':str(clip.m_CompressionFormat)}
                        else:tree=obj.read_typetree()
                        row['name']=tree.get('m_Name','');text=json.dumps(tree,ensure_ascii=True,default=lambda o: {'binaryBytes':len(o)} if isinstance(o,bytes) else str(o));row['tree']=tree
                        # The JSONL stores every decoded tree; virtual paths resolve by
                        # source+pathId. Avoid tens of thousands of tiny disk writes.
                        record(dest,row['source']+':'+row['pathId'],text.encode('utf8'),'unity-tree',text);row['decoded']=str(dest.relative_to(out));row['storage']='unity-objects.jsonl'
                        if typ=='TextAsset':
                            asset=obj.read();payload=asset.m_Script
                            raw=payload.encode('utf8','surrogateescape') if isinstance(payload,str) else payload
                            body=dest.with_suffix('.bytes');put(body,raw)
                            try:text=raw.decode('utf8');record(body,row['source']+':'+row['pathId'],raw,'unity-text',text)
                            except UnicodeError:record(body,row['source']+':'+row['pathId'],raw,'unity-binary')
                    except Exception as e:row['error']=str(e);report['failures'].append({'source':row['source'],'pathId':row['pathId'],'type':typ,'phase':'unity-tree','error':str(e)})
                log.write(json.dumps(row,ensure_ascii=True,default=lambda o: {'binaryBytes':len(o)} if isinstance(o,bytes) else str(o))+'\n')
            db.commit();log.flush()
            print(f'Unity {bundle_count}: {source.name} ({object_count} objects)',flush=True)
    report['unity']={'containers':bundle_count,'objects':object_count,'types':dict(types)}
    # All persisted encrypted script/config/map sources, not just the current chapter.
    roots=[('lua',native/'files/GameScript','scripts','*.encrypted'),('static',native/'files/static_data','static','*')]
    for kind,base,folder,pattern in roots:
        count=0
        for source in sorted(base.rglob(pattern)):
            if not source.is_file() or source.suffix in ('.etag','.tmp'):continue
            dest=out/folder/source.relative_to(base)
            try:
                raw=decrypt(source.read_bytes(),kind,source.stem)
                suffix='.lua' if kind=='lua' else '.json' if kind=='static' and raw[:1] in (b'{',b'[') else '.kong' if raw[:4]==b'KONG' else '.bin'
                dest=dest.with_suffix(suffix);put(dest,raw)
                if suffix in ('.lua','.json'):
                    text=raw.decode('utf8');
                    if suffix=='.json':json.loads(text)
                    record(dest,str(source.relative_to(native)),raw,kind+'-decoded',text)
                else:record(dest,str(source.relative_to(native)),raw,kind+'-binary')
                count+=1
            except Exception as e:report['failures'].append({'source':str(source.relative_to(native)),'phase':kind+'-decrypt','error':str(e)})
        print(f'{kind}: {count} decoded',flush=True)
    decode_maps(native,out,report,record)
    # Existing event JSON is a separate source from Lua and must remain searchable.
    for source in sorted((native/'files/events').glob('*.json')):
        raw=source.read_bytes();record(source,str(source.relative_to(native)),raw,'event-json',raw.decode('utf8'))
    symbols=native/'_tools/ghidra/symbols.tsv';rows=[]
    for line in symbols.read_text('utf8').splitlines():
        p=line.split('\t')
        if len(p)>=4:rows.append((int(p[0],16),int(p[1],16),p[2],p[3]))
    db.executemany('INSERT OR REPLACE INTO methods VALUES(?,?,?,?)',rows);record(symbols,'ghidra/symbols.tsv',symbols.read_bytes(),'symbols',symbols.read_text('utf8'))
    for source in [native/'dump/Scripts.dll.cs',native/'GuardianTales_解密文档.md']:
        if source.exists():record(source,str(source.relative_to(native)),source.read_bytes(),'native-reference',source.read_text('utf8'))
    # Memory-mapped authenticated code sections are used instead of the shuffled ELF text.
    elf=out/'apk/lib/arm64-v8a/libil2cpp.so';elf_sha=sha_file(elf)
    section_specs=[('rodata',0x17178a0,0x29ceb078),('text',0x352700c,0x8d3f304d),('il2cpp',0x3a1e720,0x76f326d3)] if elf_sha=='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db' else [];sections=[]
    for name,va,crc in section_specs:
        source=native/f'online-native-evidence/oct12/native-{name}.bin'
        if not source.exists():continue
        raw=source.read_bytes();actual=zlib.crc32(raw)
        if actual!=crc:raise ValueError('Authenticated section CRC mismatch: '+str(source))
        sections.append({'name':name,'va':hex(va),'file':str(source),'bytes':len(raw),'crc32':f'{actual:08x}','sha256':hashlib.sha256(raw).hexdigest()})
    report['limitations']=['k1ng binary tables are preserved as binary; JSON static tables are independently decoded.','Unity objects without typetrees and non-text payloads remain explicitly indexed as raw objects.','Original APK ARM64 code is protected/shuffled. Disassembly must use the CRC-authenticated section overlays; symbol names alone are not proof.','Metadata header XOR is version-specific; the encrypted 0x1000..0x5000 region is not silently marked decoded.','The full Unity DSP graph is archived; the browser audio adapter does not emulate every mixer effect.']
    profile={'schema':1,'apkSha256':tag,'apk':str(apk),'elfSha256':elf_sha,'elf':str(elf),'symbols':str(symbols),'metadata':str(out/'apk/assets/bin/Data/Managed/Metadata/global-metadata.dat'),'sections':sections,'coverage':str(out/'report.json')}
    dump(out/'profile.json',profile);report['decode']=dict(report['decode']);db.commit();db.close();dump(out/'report.json',report)
    dump(a.cache/'current.json',{'profile':str(out/'profile.json'),'cache':str(out),'apkSha256':tag});print(json.dumps({'cache':str(out),'decode':report['decode'],'unity':report['unity'],'failures':len(report['failures'])},ensure_ascii=False),flush=True)

def refresh(a):
    """Retry only failed Unity objects and rescan maps, preserving a completed index."""
    if a.unity_libs:sys.path.insert(0,str(a.unity_libs))
    import UnityPy
    cache=a.cache
    if (cache/'current.json').exists():cache=pathlib.Path(json.loads((cache/'current.json').read_text('utf8'))['cache'])
    report=json.loads((cache/'report.json').read_text('utf8'));report['decode']=collections.Counter(report['decode']);db=sqlite3.connect(cache/'index.sqlite')
    def record(path,source,raw,status,text=None):
        old=db.execute('SELECT status FROM files WHERE path=?',(str(path),)).fetchone()
        if old:report['decode'][old[0]]-=1
        report['decode'][status]+=1
        db.execute('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?)',(str(path),source,hashlib.sha256(raw).hexdigest(),len(raw),status));db.execute('DELETE FROM documents WHERE path=?',(str(path),))
        if text is not None:db.execute('INSERT INTO documents VALUES(?,?,?)',(str(path),source,text))
    failures=report['failures'];report['failures']=[r for r in failures if r['phase'] not in ('unity-tree','map-decrypt')];groups=collections.defaultdict(set);repaired={}
    for failure in failures:
        if failure['phase']=='unity-tree':groups[failure['source']].add(failure['pathId'])
    # A prior refresh may have completed object repair before a map export was
    # interrupted. Reuse the JSONL evidence instead of rereading those bundles.
    with (cache/'unity-objects.jsonl').open(encoding='utf8') as src:
        for line in src:
            row=json.loads(line)
            if row['source'] in groups and 'tree' in row and 'error' not in row:groups[row['source']].discard(row['pathId'])
    for source,ids in groups.items():
        if not ids:continue
        env=UnityPy.load(str(cache/source))
        for obj in env.objects:
            if str(obj.path_id) not in ids:continue
            row={'source':source,'pathId':str(obj.path_id),'type':obj.type.name,'bytes':obj.byte_size}
            try:
                tree=obj.read_typetree();row.update(tree=tree,name=tree.get('m_Name',''),storage='unity-objects.jsonl')
                dest=cache/'unity'/pathlib.Path(source).relative_to('apk')/(str(obj.path_id)+'.json');row['decoded']=str(dest.relative_to(cache));text=json.dumps(tree,ensure_ascii=True,default=str);record(dest,source+':'+row['pathId'],text.encode(),'unity-tree',text)
                if obj.type.name=='TextAsset':
                    payload=obj.read().m_Script;raw=payload.encode('utf8','surrogateescape') if isinstance(payload,str) else payload;body=dest.with_suffix('.bytes');put(body,raw)
                    try:record(body,source+':'+row['pathId'],raw,'unity-text',raw.decode('utf8'))
                    except UnicodeError:record(body,source+':'+row['pathId'],raw,'unity-binary')
            except Exception as e:row['error']=str(e);report['failures'].append({'source':source,'pathId':row['pathId'],'type':obj.type.name,'phase':'unity-tree','error':str(e)})
            repaired[(source,row['pathId'])]=row
        db.commit();print('Retried '+source,flush=True)
    objects=cache/'unity-objects.jsonl';temp=objects.with_suffix('.new')
    with objects.open(encoding='utf8') as src,temp.open('w',encoding='utf8') as dst:
        for line in src:
            row=json.loads(line);key=(row['source'],row['pathId'])
            dst.write(json.dumps(repaired[key],ensure_ascii=True,default=str)+'\n' if key in repaired else line)
    temp.replace(objects);db.commit();report['decode']=collections.Counter(dict(db.execute('SELECT status,COUNT(*) FROM files GROUP BY status')));dump(cache/'report.json',report)
    decode_maps(a.native_root.resolve(),cache,report,record);db.commit();db.close();dump(cache/'report.json',report)
    print(json.dumps({'decode':report['decode'],'failures':len(report['failures'])}),flush=True)

class NativeImage:
    def __init__(self,profile):
        self.profile=json.loads(pathlib.Path(profile).read_text('utf8'));self.files=[];self.maps=[]
        def mapped(path):
            f=pathlib.Path(path).open('rb');self.files.append(f);m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ);self.maps.append(m);return m
        self.raw=mapped(self.profile['elf']);raw=self.raw;off=struct.unpack_from('<Q',raw,0x20)[0];size,count=struct.unpack_from('<HH',raw,0x36);self.segments=[];self.overlays=[];self.relocations={}
        for i in range(count):
            p=off+i*size
            if struct.unpack_from('<I',raw,p)[0]==1:
                fileoff,va=struct.unpack_from('<QQ',raw,p+8);n=struct.unpack_from('<Q',raw,p+0x20)[0];self.segments.append((va,va+n,fileoff))
        # ET_DYN on disk leaves pointer slots zero. Materialize RELATIVE addends at
        # load bias zero; otherwise ADRP/LDR cannot reach native string cache slots.
        shoff=struct.unpack_from('<Q',raw,0x28)[0];shsize,shcount=struct.unpack_from('<HH',raw,0x3a)
        for i in range(shcount):
            p=shoff+i*shsize
            if struct.unpack_from('<I',raw,p+4)[0]!=4:continue
            fo,n=struct.unpack_from('<QQ',raw,p+0x18);stride=struct.unpack_from('<Q',raw,p+0x38)[0]
            if stride!=24:continue
            for j in range(fo,fo+n,stride):
                address,kind,addend=struct.unpack_from('<QQq',raw,j)
                if kind&0xffffffff==1027:self.relocations[address]=struct.pack('<Q',addend&0xffffffffffffffff)
        for section in self.profile['sections']:
            data=mapped(section['file'])
            if len(data)!=section['bytes'] or zlib.crc32(data)!=int(section['crc32'],16):raise ValueError('Unverified native overlay: '+section['file'])
            self.overlays.append((int(section['va'],16),data))
        self.metadata=bytearray(pathlib.Path(self.profile['metadata']).read_bytes())
        for i in range(8,4096,4):struct.pack_into('<I',self.metadata,i,struct.unpack_from('<I',self.metadata,i)[0]^0x66666666)
        self.sl,self.sc,self.sd,self.dc=struct.unpack_from('<4I',self.metadata,8)
        self.methods={}
        for line in pathlib.Path(self.profile['symbols']).read_text('utf8').splitlines():
            p=line.split('\t')
            if len(p)>=4:self.methods[int(p[0],16)]=(int(p[1],16),p[3]+'.'+p[2])
    def read(self,a,n):
        base=a&~7;relocation=self.relocations.get(base)
        if relocation is not None and a+n<=base+8:return relocation[a-base:a-base+n]
        for va,data in self.overlays:
            if va<=a and a+n<=va+len(data):return data[a-va:a-va+n]
        for va,end,off in self.segments:
            if va<=a and a+n<=end:return self.raw[off+a-va:off+a-va+n]
        return b''
    def literal(self,word):
        if word>>29!=5:return ''
        index=(word&0x1fffffff)>>1
        if index>=self.sc//8:return ''
        length,offset=struct.unpack_from('<II',self.metadata,self.sl+index*8)
        if length>5000:length^=0x66666666;offset^=0x66666666
        if length>5000 or offset+length>self.dc:return ''
        raw=bytes(self.metadata[self.sd+offset:self.sd+offset+length]);s=raw.decode('utf8','replace')
        if any(ord(c)<32 for c in s):
            alt=bytes(c^0x66 for c in raw).decode('utf8','replace')
            if all(ord(c)>=32 or c in '\n\r\t' for c in alt):s=alt
        return s
    def disassemble(self,start,end):
        from capstone import Cs,CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN
        md=Cs(CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN);md.detail=True;regs={};lines=[]
        for pc in range(start,end,4):
            raw=self.read(pc,4);instructions=list(md.disasm(raw,pc))
            if not instructions:lines.append(f'{pc:x} .word {raw.hex()}');regs.clear();continue
            ins=instructions[0];note='';ops=ins.operands
            if ins.mnemonic in ('bl','b') and ops and ops[0].type==2:
                target=ops[0].imm;note=self.methods.get(target,('',f'sub_{target:x}'))[1]
            if ins.mnemonic=='adrp':regs[ins.reg_name(ops[0].reg)]=ops[1].imm
            elif ins.mnemonic.startswith('ldr') and len(ops)>1 and ops[1].type==3:
                reg=ins.reg_name(ops[0].reg);base=regs.get(ins.reg_name(ops[1].mem.base));regs.pop(reg,None)
                if base is not None:
                    addr=base+ops[1].mem.disp;data=self.read(addr,8);note+=f' VA {addr:x} {data.hex()}'
                    if len(data)==8:
                        val=struct.unpack('<Q',data)[0];regs[reg]=val;literal=self.literal(val)
                        if literal:note+=' literal='+repr(literal)
                        if reg.startswith('s'):note+=' float32='+repr(struct.unpack('<f',data[:4])[0])
            elif ins.mnemonic=='mov' and len(ops)==2:
                reg=ins.reg_name(ops[0].reg);value=regs.get(ins.reg_name(ops[1].reg)) if ops[1].type==1 else ops[1].imm if ops[1].type==2 else None
                regs.pop(reg,None)
                if value is not None:regs[reg]=value
            elif ins.mnemonic=='add' and len(ops)==3 and ops[2].type==2:
                base=regs.get(ins.reg_name(ops[1].reg));reg=ins.reg_name(ops[0].reg);regs.pop(reg,None)
                if base is not None:regs[reg]=base+ops[2].imm
            else:
                # Do not reuse a stale tracked value after an unhandled register write.
                try:
                    for reg in ins.regs_access()[1]:regs.pop(ins.reg_name(reg),None)
                except Exception:regs.clear()
            lines.append(f'{pc:x} {ins.mnemonic:8} {ins.op_str}'+(' // '+note if note else ''))
            if ins.mnemonic in ('bl','blr'):
                for i in range(19):regs.pop('x'+str(i),None)
        return '\n'.join(lines)+'\n'
    def close(self):
        for m in self.maps:m.close()
        for f in self.files:f.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('prepare');p.add_argument('--apk',type=pathlib.Path,required=True);p.add_argument('--native-root',type=pathlib.Path,required=True);p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('--unity-libs',type=pathlib.Path)
    p=sub.add_parser('refresh');p.add_argument('--native-root',type=pathlib.Path,required=True);p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('--unity-libs',type=pathlib.Path)
    p=sub.add_parser('search');p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('query');p.add_argument('--limit',type=int,default=12)
    p=sub.add_parser('method');p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('query');p.add_argument('--limit',type=int,default=40)
    p=sub.add_parser('object');p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('--source',required=True);p.add_argument('--id',required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--unity-libs',type=pathlib.Path);p.add_argument('--raw',action='store_true')
    p=sub.add_parser('map');p.add_argument('--cache',type=pathlib.Path,required=True);p.add_argument('--member',required=True);p.add_argument('--out',type=pathlib.Path,required=True)
    p=sub.add_parser('disasm');p.add_argument('--profile',type=pathlib.Path,required=True);p.add_argument('--start',type=lambda s:int(s,0),required=True);p.add_argument('--end',type=lambda s:int(s,0),required=True);p.add_argument('--out',type=pathlib.Path,required=True)
    a=parser.parse_args()
    if a.command=='prepare':prepare(a)
    elif a.command=='refresh':refresh(a)
    elif a.command in ('search','method','object','map'):
        cache=a.cache
        if (cache/'current.json').exists():cache=pathlib.Path(json.loads((cache/'current.json').read_text('utf8'))['cache'])
        if a.command=='map':
            with zipfile.ZipFile(cache/'maps.kong.zip') as z:put(a.out,z.read(a.member))
            print(a.out);return
        if a.command=='object':
            with (cache/'unity-objects.jsonl').open(encoding='utf8') as f:
                for line in f:
                    row=json.loads(line)
                    if row['source'].replace('\\','/')==a.source.replace('\\','/') and row['pathId']==a.id:
                        if a.raw or 'tree' not in row:
                            if a.unity_libs:sys.path.insert(0,str(a.unity_libs))
                            import UnityPy
                            source=(cache/row['source']).resolve()
                            if not source.is_relative_to((cache/'apk').resolve()):raise ValueError('Object source is outside APK cache')
                            obj=next(o for o in UnityPy.load(str(source)).objects if str(o.path_id)==a.id)
                            if a.raw:put(a.out,obj.get_raw_data());print(a.out);return
                            row['tree']=obj.read_typetree();row.pop('error',None);row['decodedOnDemand']=True
                        dump(a.out,row);print(a.out);return
            raise ValueError('Object not found')
        with sqlite3.connect(cache/'index.sqlite') as db:
            if a.command=='search':rows=db.execute("SELECT path, source, snippet(documents,2,'[',']',' … ',28) FROM documents WHERE documents MATCH ? LIMIT ?",(a.query,a.limit))
            else:rows=db.execute('SELECT printf("0x%x",start),printf("0x%x",end),class,name FROM methods WHERE class LIKE ? OR name LIKE ? LIMIT ?',('%'+a.query+'%','%'+a.query+'%',a.limit))
            for row in rows:print(json.dumps(row,ensure_ascii=False))
    else:
        image=NativeImage(a.profile)
        try:a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(image.disassemble(a.start,a.end),'utf8');print(a.out)
        finally:image.close()

if __name__=='__main__':main()
