"""Batch six source-native actions, pinned to inspected ARM64 ELF."""
import hashlib
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_batch6_e_plan(a,lua,path):
 n=a['Name'];t=n.split(':')[0];category=None
 if t=='ManualKatanaSlash' and n.split(':')[-1].startswith('Admiral'):category='basic'
 elif n=='RoleHookTaunt:Admiral':category='role'
 elif n=='TankerSupport:Admiral':category='support'
 elif n=='CwpAdmiral' and "newclass('CwpAdmiralBattleAction')" in lua:category='cwp'
 if t in ('AkayukiSlash','AkayukiBatto'):category='basic'
 if t=='CwpAkayukiAkaoni':category='cwp'
 if not category:return None
 pools=['Manual_KatanaSlash_Simple','Manual_KatanaSlash_Simple_Flip'] if t=='AkayukiSlash' else ['FX_Dash_Simple','FX_Dash_Smoke','FX_Dash_Trail','FX_Akayuki_Basichit'] if t=='AkayukiBatto' else []
 return dict(requiredPoolPresets=pools,behavior='source-batch6-e',batch6Operation=t,category=category,id=category,label={'basic':'普通攻击','role':'角色技能','support':'连锁技能','cwp':'专武技能'}[category],action=n,end=a.get('ActionDuration',a.get('Duration',1)),exclusive=category=='cwp',source=str(path) if lua else 'native ARM64 '+t,sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else ELF)
