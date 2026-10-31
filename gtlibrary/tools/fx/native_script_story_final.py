"""Exact final story hero rules, sourced from registered ARM64 and original Lua."""
import hashlib
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
def compile_story_final_plan(a,lua,path):
 n=a['Name'];t=n.split(':')[0]
 if n not in ['ManualGrenade:Maiden','ManualBounceFireball:Swindler','RoleMaiden','MaidenSupport','CwpMaiden','SwindlerSupport','CwpSwindlerMeteorStrike']:return None
 cat='basic' if t.startswith('Manual') else 'role' if t.startswith('Role') else 'cwp' if t.startswith('Cwp') else 'support'
 return dict(behavior='source-story-final',operation=t,category=cat,id=cat,label={'basic':'普通攻击','role':'角色技能','cwp':'专武技能','support':'连锁技能'}[cat],action=n,exclusive=cat=='cwp',end=a.get('ActionDuration',a.get('Duration',.5)),source=str(path) if lua else 'registered ARM64 ManualGrenade 0x8b29cd4; BounceFireball 0x8ad0e8c; MaidenSupport 0x8c2a240; SwindlerSupport 0x8c34434; MeteorRoutine 0x8be28d8',sourceSha256=hashlib.sha256(lua.encode()).hexdigest() if lua else ELF,requiredPoolPresets=['FX_shoot_01'] if t=='ManualGrenade' else [])
