"""Exact C# WitchCoco actions, using registered ARM64 native source evidence."""
def compile_batch6_witch_plan(a,lua,path):
 n=a['Name'];typ=n.split(':')[0]
 if typ not in ['ManualDarkHound','ManualDarkHoundCluster','WitchCocoSupport','CwpWitchCocoHellHound']:return None
 if typ.startswith('Manual') and 'WitchCoco' not in n:return None
 category='basic' if typ.startswith('Manual') else 'support' if typ=='WitchCocoSupport' else 'cwp'
 return dict(behavior='source-batch6-witch',category=category,id=category,label={'basic':'普通攻击','support':'连锁技能','cwp':'专武技能'}[category],action=n,end=a.get('ActionDuration',a.get('Duration',1)),exclusive=category=='cwp',source='native:Oak.'+typ+'BattleAction',sourceEvidence='E:/GTFiles/fx-batch6-b-csharp-methods.json',requiredPoolPresets=['fx_m_dark_hound','fx_m_dark_hound_cast','fx_m_dark_hound_trail','fx_m_dark_hound_end','fx_m_dark_hound_explosion','fx_m_dark_claw'] if category!='cwp' else ['fx_cwp_hell_hound_magiccircle','fx_cwp_hell_hound_casting','fx_cwp_hell_hound_screen','fx_cwp_hell_hound_spawn','fx_cwp_hell_hound_right','fx_cwp_hell_hound_left','fx_cwp_hell_hound_up','fx_cwp_hell_hound_down','fx_cwp_hell_hound_trail','fx_cwp_hell_hound_end'])
