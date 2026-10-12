"""Recover authenticated native sections with the APK's own protection decoder.

No native function is executed on the host; a bounded Unicorn ARM64 VM is used.
Refuses unknown binaries and only writes output after both CRC32 and SHA256 match.
"""
import argparse,hashlib,json,pathlib,struct,sys,zipfile,zlib

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apk',type=pathlib.Path,required=True);p.add_argument('--profile',type=pathlib.Path,default=pathlib.Path(__file__).parent/'profiles/3.51.0.json');p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--unicorn-libs',type=pathlib.Path);a=p.parse_args()
    if a.unicorn_libs:sys.path.insert(0,str(a.unicorn_libs))
    from unicorn import Uc,UC_ARCH_ARM64,UC_MODE_ARM,UC_HOOK_CODE
    from unicorn import arm64_const as r
    profile=json.loads(a.profile.read_text('utf8'))
    with zipfile.ZipFile(a.apk) as z:original=z.read('lib/arm64-v8a/libil2cpp.so');decoder=z.read(profile['decoder'])
    if hashlib.sha256(original).hexdigest()!=profile['elfSha256']:raise ValueError('Unknown libil2cpp version; recover and authenticate a new profile first')
    off=struct.unpack_from('<Q',decoder,0x20)[0];size,count=struct.unpack_from('<HH',decoder,0x36);segments=[]
    for i in range(count):
        header=off+i*size
        if struct.unpack_from('<I',decoder,header)[0]==1:
            fileoff,va=struct.unpack_from('<QQ',decoder,header+8);filesz,memsz=struct.unpack_from('<QQ',decoder,header+0x20);segments.append((va,fileoff,filesz,memsz))
    u=Uc(UC_ARCH_ARM64,UC_MODE_ARM);u.mem_map(0,(max(v+n for v,o,s,n in segments)+0xfff)&~0xfff)
    for va,fileoff,filesz,_ in segments:u.mem_write(va,decoder[fileoff:fileoff+filesz])
    u.mem_map(0x1000000,0x20000);u.mem_map(0x2000000,0x200000);u.reg_write(r.UC_ARM64_REG_CPACR_EL1,3<<20)
    def copy(uc,address,size,data):
        dest,source,n=[uc.reg_read(x) for x in (r.UC_ARM64_REG_X0,r.UC_ARM64_REG_X1,r.UC_ARM64_REG_X2)]
        if n>0x20000:raise ValueError('Decoder copy exceeds sandbox budget')
        uc.mem_write(dest,bytes(uc.mem_read(source,n)));uc.reg_write(r.UC_ARM64_REG_PC,uc.reg_read(r.UC_ARM64_REG_LR))
    for addr in profile['copyHooks']:
        address=int(addr,0);u.hook_add(UC_HOOK_CODE,copy,begin=address,end=address)
    seed=int(profile['seed'],0);key=('%08x%08x'%(seed,seed)).encode()+b'\0';table=bytes(x^profile['xor'] for x in range(256));results=[]
    for section in profile['sections']:
        va=int(section['va'],0);fo=int(section['offset'],0);n=section['bytes'];out=bytearray(original[fo:fo+n]);skip=0x2000-(va&0xfff)
        for offset in range(0,0x4000,0x800):
            u.mem_write(0x1000000,bytes(out[skip+offset:skip+offset+0x800]));u.mem_write(0x1010000,key)
            for reg,value in [(r.UC_ARM64_REG_SP,0x21f0000),(r.UC_ARM64_REG_LR,0x1ff000),(r.UC_ARM64_REG_X0,0x1000000),(r.UC_ARM64_REG_X1,0x800),(r.UC_ARM64_REG_X2,0x800),(r.UC_ARM64_REG_X3,0),(r.UC_ARM64_REG_X5,0x1010000),(r.UC_ARM64_REG_X6,16)]:u.reg_write(reg,value)
            u.emu_start(int(profile['decodeEntry'],0),0x1ff000,count=1000000);out[skip+offset:skip+offset+0x800]=u.mem_read(0x1000000,0x800)
        begin=skip+0x10000;count=(n-begin)//0x10000
        for i in range(count):
            start=begin+i*0x10000;out[start:start+0x4000]=bytes(out[start:start+0x4000]).translate(table)
            if i%8==7:
                group=start-0x70000;chunks=[out[group+j*0x10000:group+j*0x10000+0x4000] for j in range(8)]
                for j,dest in enumerate(profile['permutation']):out[group+dest*0x10000:group+dest*0x10000+0x4000]=chunks[j]
        start=begin+count*0x10000;out[start:]=bytes(out[start:]).translate(table);sha=hashlib.sha256(out).hexdigest();crc=f'{zlib.crc32(out):08x}'
        if crc!=section['crc32'] or sha!=section['sha256']:raise ValueError('Authentication failed for '+section['name']+': '+crc+' '+sha)
        a.out.mkdir(parents=True,exist_ok=True);path=a.out/('native-'+section['name']+'.bin');path.write_bytes(out);results.append(dict(section=section['name'],sha256=sha,crc32=crc,bytes=len(out)));print(section['name'],crc,sha,flush=True)
    (a.out/'recovery-report.json').write_text(json.dumps(results,indent=2)+'\n','utf8')

if __name__=='__main__':main()
