"""Source-only operations for the final basic/native group."""
import hashlib

def compile_batch6_root_plan(a,lua,path):
 n=a['Name'];typ=n.split(':')[0]
 if typ not in ['ManualBattleBallGirl','CwpBattleballGirl']:return None
 if not lua:return None
 basic=typ.startswith('Manual')
 return dict(action=n,behavior='source-batch6-root',category='basic' if basic else 'cwp',id='basic' if basic else 'cwp',label='普通攻击' if basic else '专武技能',exclusive=not basic,end=a.get('AnimDuration',a.get('ActionDuration',1)),operation='bat-basic' if basic else 'bat-meteor',source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
