"""Build auditable game categories from chapters, stage references and zh-CN strings."""
from pathlib import Path
import json,re,collections,hashlib,argparse
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'gtmap/assets/catalog.json';WORK=ROOT/'tools/gtmap';DATA=Path('E:/GTFiles/static_data_dec')
args=argparse.ArgumentParser();args.add_argument('--catalog',type=Path,default=OUT);OUT=args.parse_args().catalog
strings=json.loads((DATA/'strings-zhCN.json').read_text(encoding='utf8'));chapters=json.loads((DATA/'chapterdata.json').read_text(encoding='utf8'))['Chapter'];stages=json.loads((DATA/'stages.json').read_text(encoding='utf8'))
catalog=json.loads(OUT.read_text(encoding='utf8'));nodes={};refs=collections.defaultdict(list);audit=[]
def text(key,fallback):return strings.get(key) or fallback
def node(id,label,parent=None,order=0,section=None,key=None):
 if id not in nodes:nodes[id]={'id':id,'label':label,'parent':parent,'order':order,**({'section':section} if section else {}),**({'stringKey':key} if key else {})}
 return id
def values(x):
 if isinstance(x,str):yield x
 elif isinstance(x,dict):
  for v in x.values():yield from values(v)
for st in stages:
 for value in values(st.get('Tilemap')):refs[Path(value).stem.lower()].append(st)
main={};external={};short={};memo={}
for c in chapters:
 cid=c['ChapterId'];no=c['ChapterNo'];key=c['Chapters'];label=text(key,key)
 if 10000<=cid<10100:main[cid]=node('world_%02d'%no,('序章' if no==0 else '世界%02d · '%no+label),order=no,section='主线故事',key=key)
 elif 60000<=cid<61000:external[cid]=node('story_%02d'%no,label,order=100+no,section='外传故事',key=key)
 elif 70000<=cid<72000:
  node('short','短篇故事',order=200,section='其他故事');short[cid]=node('short_'+str(cid),label,'short',no,key=key)
 elif 72000<=cid<73000:
  node('memorial','回忆故事',order=201,section='其他故事');memo[cid]=node('memorial_'+str(cid),label,'memorial',no,key=key)
main[10023]=node('world_23','世界23（章节名未提供）',order=23,section='主线故事')
node('dungeons','副本与挑战',order=300,section='其他玩法');node('coop','合作玩法',order=400,section='其他玩法');node('guild','公会玩法',order=500,section='其他玩法');node('pvp','PVP',order=600,section='其他玩法');node('home','浮游城与世界探索',order=700,section='其他玩法');node('misc','杂项与测试',order=900,section='其他玩法')
def leaf(id,label,key=None,parent='dungeons',order=0):return node(id,text(key,label) if key else label,parent,order,key=key)
leaf('tower','迷宫','tower',order=1);leaf('goldentower','浮游城地下迷宫','goldentower',order=2);leaf('tower1000','轨道电梯','tower1000',order=3);leaf('elementaltower','边界迷宫','elementaltower',order=4);leaf('herotower','英雄迷宫','hero_tower_title',order=5);leaf('ancientmall','卡马逊乐园','ancientmall',order=6);leaf('resources','资源副本','rift_401',order=7);leaf('evolution','进化石副本','rift_402',order=8);leaf('mirror','魔镜裂痕',order=9);leaf('myth','开花石副本','myth_stone_dungeon',order=10);leaf('garage','觉醒副本','garage_dungeon',order=11);leaf('expedition','远征队','expedition',order=12);leaf('single_raid','首领连战','single_raid',order=13);leaf('roguechess','忒提斯英雄传','roguechess',order=14);leaf('gnome','地精仓库','rift_420',order=15);leaf('nebula','红色碎片副本','rift_421',order=16);leaf('rift_other','其他裂痕与挑战',order=17)
attrs={'light':'光','none':'普','fire':'火','ice':'水','earth':'土','darkness':'暗'}
for i,(attr,label) in enumerate(attrs.items()):node('elementaltower_'+attr,label+'属性','elementaltower',i)
leaf('coopexp','团队远征队','coop_expedition_title',parent='coop',order=1);leaf('coop_raid','团队赛',parent='coop',order=2);leaf('coop_defense','团队赛（防御）',parent='coop',order=3)
for i,key in enumerate(['coop_expedition_title_kamazon','coop_expedition_title_saya','coop_expedition_title_jade','coop_expedition_title_shikigami']):node('coopexp_s'+str(i),('早期关卡' if i==0 else '赛季'+str(i))+' · '+text(key,key),'coopexp',i,key=key)
for i in range(1,4):node('roguechess_s'+str(i),'赛季'+str(i),'roguechess',i)
for id,label,key in [('guild_hall','公会大厅',None),('guild_raid','公会协力讨伐','guild_raid'),('conquest','公会征战',None),('guild_arcade','公会小游戏',None),('guild_punchking','公会修炼场',None),('guild_war','要塞争夺战','guild_war')]:leaf(id,label,key,parent='guild',order=len(nodes))
leaf('arena','多人竞技赛','help_arena_title',parent='pvp',order=1);leaf('colosseum','圆形角斗场','help_colosseum_title',parent='pvp',order=2);leaf('deathmatch','死斗','deathmatch',parent='pvp',order=3)
for i,label in enumerate(['乱斗','团队','据点','热血']):node('deathmatch_'+str(i+1),label,'deathmatch',i)
leaf('heavenhold','浮游城与农场',parent='home',order=1);leaf('worldexplore','世界探索','world_exploration',parent='home',order=2)
# Filename families are used only after official stage references. Longer names win.
main_prefixes={'forest':1,'teatans':2,'magicschool':3,'desert':4,'china':5,'titantavern':6,'dungeonkingdom':7,'snowmountain':8,'steampunk':9,'futurecastle':10,'futurecastle_part2':11,'futurecastle_2':11,'demonworld':12,'lilithtower':13,'demonshire':14,'queenship':15,'queencastle':16,'civilwar':17,'laboseworld':18,'pixyworld':19,'pw':19,'dreamvillage':20,'dv':20,'waterworld':21,'ww':21,'fireworld':22,'fw':22,'castletown':23,'kc':23,'prologue':0,'prologue2':0}
story_prefixes={'highschool':1,'school':1,'movie':2,'fox':3,'cafe':4,'xm':5,'christmas':5,'afterworld':6,'blossom':7,'bridge_story':8,'short_story_bridge':8}
short_prefixes={'halloween':70001,'invader_reporter':70002,'idols1':70003,'rinshop':70004,'short_story_bari':70005,'short_story_dragon':70006,'short_story_lahn':70007,'short_story_mayreel':70008,'short_story_parvati':70009,'short_story_summer':70010,'short_story_rosetta':70011,'short_story_mermaid':70012,'short_story_shuran':70013,'short_story_milkyway':70014,'short_story_battleball':70015,'short_story_noel':70016,'short_story_lina':71016,'lina':71016,'short_story_dai':71020,'short_story_slime':71026,'short_story_frieren':71032,'short_story_clevatess':71038}
memo_prefixes={'memorial_amusementpark':72001,'memorial_bootcamp':72002,'memorial_magicalgirl':72003,'memorial_sunyeo':72004,'memorial_thief':72005,'memorial_carp_girl':72007}
def match(name,prefixes):
 for prefix,value in sorted(prefixes.items(),key=lambda p:-len(p[0])):
  if name==prefix or name.startswith(prefix+'_') or name.startswith(prefix+'-'):return value
 return None
def filename_story(name):
 n=re.sub(r'^(?:(?:alt|easy|new|newnew|nightmare|hell|substage|passage|rift)_)+','',name)
 v=match(n,short_prefixes)
 if v is not None:return short[v]
 v=match(n,memo_prefixes)
 if v is not None:return memo[v]
 v=match(n,story_prefixes)
 if v is not None:return 'story_%02d'%v
 v=match(n,main_prefixes)
 if v is not None:return 'world_%02d'%v
 return None
def family_category(st,name):
 f=int(st['Id'])//10000
 if f in main:return main[f]
 if 10100<=f<10300 or 11000<=f<11100:return main.get(10000+int(st['ChapterId']))
 if f in external:return external[f]
 if 61000<=f<61200:return external.get(60000+int(st['ChapterId']))
 if 62000<=f<62200:return filename_story(name)
 if f in short:return short[f]
 if f in memo:return memo[f]
 if f in [20201,20202]:return 'tower' if f==20201 else 'goldentower'
 if 21000<=f<21100:return 'tower1000'
 if f==22001:return 'ancientmall'
 if 23001<=f<=23006:return 'elementaltower_'+list(attrs)[f-23001]
 if f==24000:return 'worldexplore'
 if 25000<=f<25100:return 'expedition'
 if 26000<=f<26100:return 'heavenhold'
 if f==27001:return 'single_raid'
 if 28001<=f<=28003:return 'roguechess_s'+str(f-28000)
 if 29000<=f<29100:return 'herotower'
 if f==30301:return 'coop_raid'
 if f in [30302,30303]:return 'arena'
 if f==30306:return 'deathmatch_'+('1' if 'freeforall' in name else '3' if 'capture' in name else '4' if 'hotblood' in name else '2')
 if f==30305:return 'coop_defense'
 if f==31001:return 'colosseum'
 if 32001<=f<=32004:return 'coopexp_s'+str(f-32001)
 if f==32501:return 'coopexp_s3'
 if 33001<=f<=33004:return 'deathmatch_'+str(f-33000)
 if f==40401:return 'resources'
 if f in [40402,40403,40404,40411,40412,40413]:return 'evolution'
 if 40405<=f<=40410:return 'mirror'
 if 40414<=f<=40419:return 'myth'
 if f==40420:return 'gnome'
 if f==40421:return 'nebula'
 if 50000<=f<50100:return 'garage'
 if f==80800:return 'guild_hall'
 if f==81001:return 'guild_raid'
 if f in [82001,82901]:return 'conquest'
 if 83000<=f<83100:return 'guild_arcade'
 if f==84001:return 'guild_punchking'
 if 85000<=f<85100:return 'guild_war'
 return None
def fallback(name):
 if re.search(r'(?:^|[_-])test(?:\d|[_-]|$)',name) or name.endswith('_temp'):return 'misc'
 cat=filename_story(name)
 if cat:return cat
 if name.startswith('coop_exp_s'):
  m=re.match(r'coop_exp_s([123])',name)
  if m:return 'coopexp_s'+m[1]
 if name.startswith('coop_expedition'):return 'coopexp_s0'
 if name.startswith('elemental_tower_'):
  for attr in attrs:
   if name.startswith('elemental_tower_'+attr+'_'):return 'elementaltower_'+attr
 if name=='async_arena':return 'pvp'
 if name.startswith('evolve_'):return 'evolution'
 if name.startswith('new_rfit_'):return 'rift_other'
 if name.startswith('tower_'):
  for attr in attrs:
   if name.startswith('tower_'+attr+'_'):return 'elementaltower_'+attr
  if name.startswith('tower_hero_'):return 'herotower'
  if name.startswith('tower_record'):return 'tower1000'
  return 'tower'
 for prefix,cat in [('tower1000','tower1000'),('goldentower','goldentower'),('ancient_mall','ancientmall'),('roguelike_mall','ancientmall'),('roguechess','roguechess'),('mirror_rift','mirror'),('myth_nebula','nebula'),('myth_','myth'),('gnome_rift','gnome'),('garage','garage'),('expedition','expedition'),('raid_single','single_raid'),('coop_defense','coop_defense'),('coop_','coop_raid'),('raid_guild','guild_raid'),('raid_','coop_raid'),('guild_war','guild_war'),('guild_arcade','guild_arcade'),('guild_punchking','guild_punchking'),('conquest','conquest'),('guild','guild_hall'),('new_guild','guild_hall'),('arena_deathmatch','deathmatch'),('arena','arena'),('colosseum','colosseum'),('worldexplore','worldexplore'),('heavenhold','heavenhold'),('rift','rift_other'),('new_rift','rift_other')]:
  if name.startswith(prefix):return cat
 return 'misc'
for m in catalog['maps']:
 name=m['id'].lower();links=refs.get(name,[]);candidates=[(family_category(st,name),st) for st in links];candidates=[(c,st) for c,st in candidates if c in nodes]
 candidates.sort(key=lambda x:(0 if x[0].startswith(('world_','story_','short_','memorial_')) else 1,int(x[1]['Id'])))
 if candidates:cat,st=candidates[0];method='stage-reference';title=text(st['Name'],m['id']);m['stageOrder']=int(st.get('StageNo') or 0);m['stageId']=int(st['Id']);m['title']=title if title!=st['Name'] else m['id']
 else:cat=fallback(name);method='filename-family' if cat!='misc' else 'miscellaneous';m['title']=m['id'];m['stageOrder']=999
 m['sourceCategory']=m.get('sourceCategory',m['category']);m['category']=cat;path=[];cur=cat
 while cur:path.insert(0,cur);cur=nodes[cur]['parent']
 m['categoryPath']=path
 family=int(m.get('stageId',0))//10000
 m['variant']='地狱' if 10200<=family<10300 or name.startswith('hell_') else '噩梦' if 10100<=family<10200 or name.startswith('nightmare_') else '支线' if 11000<=family<11100 or name.startswith('substage_') else '通道' if 'passage' in name else '活动裂痕' if 62000<=family<62200 else ''
 audit.append({'id':m['id'],'category':cat,'method':method,'stageIds':[int(x['Id']) for x in links],'titleKey':candidates[0][1]['Name'] if candidates else None,'otherUses':sorted({x[0] for x in candidates if x[0]!=cat})})
nodes['elementaltower']['aliases']=['属性塔'];nodes['coopexp']['aliases']=['合作远征'];nodes['arena']['aliases']=['竞技场','冠军竞技场','大师多人竞技赛'];nodes['mirror']['aliases']=['魔镜裂痕副本']
used={c for m in catalog['maps'] for c in m['categoryPath']};catalog['categories']=sorted((n for n in nodes.values() if n['id'] in used),key=lambda n:n['order']);catalog['classificationVersion']=1;catalog['decodedCount']=sum(m.get('status')!='unavailable' for m in catalog['maps']);catalog['unavailableCount']=catalog['deployedCount']-catalog['decodedCount'];catalog['classificationSources']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [DATA/'chapterdata.json',DATA/'stages.json',DATA/'strings-zhCN.json']}
assert len(catalog['maps'])==2054 and len({m['id'] for m in catalog['maps']})==2054
assert next(m for m in catalog['maps'] if m['id']=='afterworld_1_1')['category']=='story_06'
assert next(m for m in catalog['maps'] if m['id']=='magicschool_1_1')['category']=='world_03'
assert next(m for m in catalog['maps'] if m['id']=='snowmountain_1_1')['category']=='world_08'
OUT.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8');(WORK/'evidence/classification-audit.json').write_text(json.dumps({'sources':catalog['classificationSources'],'nodes':catalog['categories'],'assignments':audit},ensure_ascii=False,indent=2),encoding='utf8')
print('Classified',len(catalog['maps']),'maps, nodes',len(catalog['categories']),'roots',sum(n['parent'] is None for n in catalog['categories']),collections.Counter(a['method'] for a in audit))
print('Misc',len([a for a in audit if a['category']=='misc']))
