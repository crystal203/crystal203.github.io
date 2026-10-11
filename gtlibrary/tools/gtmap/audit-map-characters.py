"""Audit plaintext map actor records against the deployed Spine catalog.

Reads bytes and metadata only; no rendering, extraction, Node or game execution.
"""
from pathlib import Path
import argparse, collections, gzip, hashlib, json
from strict_kong import Reader
from character_payload import read_character

def collect(data):
    r=Reader(data)
    if r.take(4)!=b'KONG':raise ValueError('not a plaintext KONG map')
    v=r.unpack('i');r.take(16)
    if v not in (9,11,12,13,14,15,16):raise ValueError('unknown map version')
    for _ in range(r.count(100)):
        r.string()
        for _ in range(r.count()):r.string()
    if v>=12:r.boolean()
    if v>=15:r.boolean()
    if v>=16:r.string()
    if v>=11:
        for _ in range(r.count(256)):
            r.take(1)
            for _ in range(r.count()):r.string()
    chars=[]
    def properties(events,count):
        for _ in range(r.count()):
            index=r.unpack('h');name=r.string();raw=r.take(r.count(len(data)))
            if not 0<=index<count:raise ValueError('property index out of range')
            if name=='Tilemaps.CharacterPlaceholder':
                value=read_character(raw)
                if events:value.update(handle=events[index][0],position=events[index][1])
                chars.append(value)
    for _ in range(r.count(256)):
        r.string();kind=r.unpack('i');r.take(4);count=r.count(100000)
        if kind==0:
            for _ in range(count):
                r.take(4);n=r.count();r.take(n*8);properties(None,n)
        elif kind==1:
            events=[(r.string(),r.unpack('3f')) for _ in range(count)]
            properties(events,count)
        else:raise ValueError('unknown layer type')
    for size,active in [(8,True),(8,v>=13),(12,True),(20,True),(12,v>=14),(20,v>=14)]:
        if active:r.take(r.count()*size)
    if r.pos!=len(data):raise ValueError('unexplained map bytes')
    return chars

def asset_ref(value):
    if isinstance(value,dict):value=value.get('default') or next(iter(value.values()),'')
    if not isinstance(value,str):return ''
    return value.split('#')[0].split(':')[-1].split('/')[-1] if '/' in value else value.split('#')[0].split(':')[0]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    ap.add_argument('--decoded',type=Path,default=Path('E:/GTFiles/Tilemaps_decoded'))
    ap.add_argument('--output',type=Path)
    args=ap.parse_args();root=args.root
    meta=json.loads(gzip.decompress((root/'gtmap/assets/character-metadata.json.gz').read_bytes()))
    catalog=json.loads((root/'gtmap/assets/catalog.json').read_text('utf8'))
    native={x['id']:x for x in meta['evidence'].get('nonSpine',[])}
    versions=collections.Counter();missing={};errors=[];mismatches=[];world22=[]
    maps=records=placed=resolved=staged=appearance=0
    for item in catalog['maps']:
        path=args.decoded/(item['id']+'.tilemap')
        if not path.exists():errors.append({'map':item['id'],'error':'plaintext source not available'});continue
        data=path.read_bytes()
        if hashlib.sha256(data).hexdigest()!=item['sha256']:
            mismatches.append(item['id']);continue
        try:chars=collect(data)
        except Exception as e:errors.append({'map':item['id'],'error':str(e)});continue
        maps+=1;mp=mr=0
        for c in chars:
            versions[c['version']]+=1;records+=1;appearance+=bool(c.get('appearanceName'))
            position=c.get('position',[999,0,999])
            if abs(position[0]-999)<=.5 or abs(position[2]-999)<=.5 or position[0]==position[2]==99:
                staged+=1;continue
            placed+=1;mp+=1;row=meta['rows'].get(c['characterId'],{})
            name=asset_ref(c.get('appearanceName') or row.get('spine') or c['characterId'])
            asset=name if name in meta['assets'] else meta['aliases'].get(name,meta['aliases'].get(c['characterId'],name))
            if asset in meta['assets']:resolved+=1;mr+=1;continue
            entry=missing.setdefault(asset,{'resource':asset,'placedRecords':0,'maps':set(),'ids':set(),'source':native.get(asset)})
            entry['placedRecords']+=1;entry['maps'].add(item['id']);entry['ids'].add(c['characterId'])
        if item['category']=='world_22':world22.append({'id':item['id'],'records':len(chars),'placed':mp,'resolved':mr})
    for entry in missing.values():
        entry['maps']=sorted(entry['maps']);entry['ids']=sorted(entry['ids'])
    result={'catalogMaps':len(catalog['maps']),'auditedMaps':maps,'sourceErrors':errors,'hashMismatches':mismatches,
            'records':records,'versions':dict(sorted(versions.items())),'staged':staged,'appearanceOverrides':appearance,
            'placed':placed,'resolvedPlaced':resolved,'unresolvedPlaced':placed-resolved,
            'unresolvedResources':len(missing),'missing':sorted(missing.values(),key=lambda x:(-x['placedRecords'],x['resource'])),
            'world22':world22,'limits':'Lookup audit, not proof that every actor renders. Scripts and outside-map staging are not executed.'}
    output=args.output or root/'tools/gtmap/evidence/map-character-inventory.json'
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('missing','world22')},ensure_ascii=False))

if __name__=='__main__':main()
