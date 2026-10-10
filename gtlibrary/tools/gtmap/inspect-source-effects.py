from pathlib import Path
import gzip,json,re,collections
root=Path('D:/github/gtlibrary');manifest=json.loads((root/'gtmap/assets/native-effects.json').read_text());effects={};totals=collections.Counter();examples=collections.defaultdict(list)
for ts,path in manifest['sets'].items():
 with gzip.open(root/'gtmap/assets'/path,'rt',encoding='utf8') as f:a=json.load(f)
 for name,t in a['templates'].items():
  nodes={n['id']:n for n in t['nodes']}
  active=[]
  for s in t['systems']:
   n=nodes.get(s['node']);ok=True
   while n:
    if not n.get('active',True):ok=False
    n=nodes.get(n.get('parent'))
   if not ok or s['renderer']['mode']==5:continue
   active.append(s)
  effects[(ts,name)]=active
  totals['activeSystems']+=len(active)
  totals['loopingSystems']+=sum(s['loop'] for s in active)
  for s in active:
   names=' '.join(a['sprites'].get(i,{}).get('name','') for i in s['modules'].get('UVModule',{}).get('sprites',[]))+' '+s['name']+' '+name
   for kind,pattern in [('cloud','cloud|fog'),('fire','flame|fire|torch|candle'),('smoke','smoke|steam'),('leaf','leaf|leaves')]:
    if re.search(pattern,names,re.I):examples[kind].append({'set':ts,'tile':name,'node':s['name'],'loop':s['loop'],'spriteNames':names})
rows=[]
for path in (root/'tools/gtmap/evidence').glob('*map-cache.ndjson'):
 rows.extend(json.loads(line) for line in path.read_text(encoding='utf8').splitlines())
for kind,items in examples.items():
 print('\n',kind,len(items))
 emitted=set()
 for item in items:
  if not item['loop'] or (item['set'],item['tile']) in emitted:continue
  emitted.add((item['set'],item['tile']));maps=[r['id'] for r in rows if [item['set'],item['tile']] in r.get('used',[])]
  if maps:print(item['tile'],item['node'],'maps',maps[:4])
print(totals)
(root/'tools/gtmap/evidence/native-effects-examples.json').write_text(json.dumps({'totals':dict(totals),'examples':examples},ensure_ascii=False,indent=2),encoding='utf8')
