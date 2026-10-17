"""Inventory each authored gimmick and source animator once. Never certify runtime parity."""
import argparse,collections,gzip,hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'gtmap'))
from strict_kong import parse

LIMITS={
 'jump':'Crash alignment, gliding, aerial obstacles and native frame scheduling remain incomplete.',
 'bomb':'Native RNG sequence, timer-stop/wind-pot states, native throw trajectory, party damage and fuse persistence remain incomplete; tick audio uses viewport gating, not native camera grids.',
 'bomb-flower':'Separate native bomb generation is implemented; diagonal wall contact is still handled by the shared simplified collision service.',
 'switch':'Native pressure displacement and NPC/manual contacts are implemented; global gimmick-reset commands and customised NPC hitboxes remain incomplete.',
 'door':'Native condition groups, latch and basic height/timing are implemented; focus preview, timer bar, all reserve contacts and collision transition timing remain incomplete.',
 'gate':'Native animator start/end and sounds are wired; manual-close command and zone/notice/group subscriptions remain incomplete.',
 'spike':'Damage ratio is source-backed; exact native contact flags, invulnerability and knockback physics remain incomplete.',
 'push':'One-unit movement is implemented; native state timing, ice movement, camera-grid/reset commands remain incomplete.',
 'brazier':'Native on/off animator, fire spread and lifetime refresh are wired; complete save restoration, native culling/audio and frame scheduling remain incomplete.',
 'breakable':'Native damage classes and declared break effects are wired; attack/crash event flags, throw physics and complete drop rules remain incomplete.',
 'coin':'Source sprite/material and collection effect are wired; exact collection range, bobbing and native frame-level playback remain unverified.',
 'star':'Source sprite/material and collection effect are wired; exact collection range, bobbing and native frame-level playback remain unverified.',
 'item':'Source item presentation is wired; controller-specific grants, UI and native collection timing remain incomplete.',
 'chest':'Source open animation/rewards are wired; tutorial/controller gates and complete native item-choice presentation remain incomplete.',
 'portal':'Authored destination/exit data is present; exact native transition and completion controllers remain incomplete.',
 'sign':'Source text is present; complete native interaction/damage presentation and dialogue lifecycle remain unverified.',
 'map':'Source object is present; controller-specific map unlock/reveal behavior remains incomplete.'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);ap.add_argument('--source',type=Path,default=Path('E:/GTFiles'));ap.add_argument('--reference',type=Path);a=ap.parse_args();r=a.root;ref=a.reference or r
 def file(rel):return r/rel if (r/rel).is_file() else ref/rel
 catalog=json.loads(file('gtonline/assets/catalog.json').read_text('utf8'));index=json.loads(file('gtmap/assets/native-states.json').read_text('utf8'))['sets'];cache={};reports=[]
 for entry in catalog['stages']:
  stage=json.loads(file('gtonline/assets/'+entry['file']).read_text('utf8'));mapBytes=(a.source/'Tilemaps_decoded'/f"{stage['map']}.tilemap").read_bytes();nativeMap=parse(mapBytes);tiles={}
  for li,layer in enumerate(nativeMap['layers']):
   number=0
   for part in layer.get('partitions',[]):
    for t in part['tiles']:tiles[f'{li}:{number}']=nativeMap['tilesets'][t['ts']-1]['name'];number+=1
  rows=[]
  for o in stage['objects']:
   ts=o.get('generated',{}).get('tileset') or tiles.get(o['id']);assetPath=index.get('__online_'+o['name']) if o.get('generated') else index.get(ts);template=None
   if assetPath:
    if assetPath not in cache:cache[assetPath]=json.loads(gzip.decompress(file('gtmap/assets/'+assetPath).read_bytes()))
    template=cache[assetPath]['templates'].get(o['name'])
   classes={key:value.get('__class__') for key,value in o['spec'].items() if isinstance(value,dict) and value.get('__class__')};effects=[]
   damaged=o['spec'].get('DamagedBehaviour',{})
   for key in ['EffectName','RockBreakFxAsset']:
    if isinstance(damaged.get(key),str):effects.append({'name':damaged[key],'registered':'__online_'+damaged[key] in entry.get('nativePrefabs',[])})
   rows.append({'id':o['id'],'kind':o['kind'],'name':o['name'],'handle':o['handle'],'rotation':o['rotation'],'nativeTileset':ts,'components':classes,'animators':[{'name':c['name'],'states':[s['name'] for s in c['states']]} for c in (template or {}).get('controllers',[])],'customAnimators':[s['fields'].get('StartState') for s in (template or {}).get('scripts',[]) if s['type']=='CustomAnimator'],'declaredEffects':effects,'status':'partial' if classes else 'visual-only','limits':LIMITS.get(o['kind'],'Native behavior has not been audited.') if classes else 'No native component in this object record; legacy kind label does not imply gameplay.'})
  counts=collections.Counter(o['kind'] for o in rows);reports.append({'stage':stage['id'],'map':stage['map'],'nativeMapSha256':hashlib.sha256(mapBytes).hexdigest(),'objectCount':len(rows),'byKind':dict(counts),'allKindsReviewed':set(counts)<=set(LIMITS),'fullParityCertified':False,'objects':rows})
 output=r/'tools/native/evidence/stage-gimmick-audit.json';output.write_text(json.dumps({'schema':1,'scope':'Every object kind in currently registered stages; static source/presentation audit, not full native-runtime certification.','stages':reports},ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps({'stages':[{k:s[k] for k in ['stage','objectCount','byKind','allKindsReviewed']} for s in reports],'nativeAnimatorBundlesRead':len(cache)},ensure_ascii=False))
if __name__=='__main__':main()
