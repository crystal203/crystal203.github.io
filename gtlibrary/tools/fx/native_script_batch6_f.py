"""Final classic C# action recipes; exact registered native types."""
def compile_batch6_f_plan(a,lua,path):
 n=a['Name'];t=n.split(':')[0]
 category='basic' if t in ['ManualChargeDeathFist','ManualThrustCombo'] else 'cwp'
 if n not in ['ManualChargeDeathFist:DesertSlave','ManualThrustCombo:SteamPrincess','CwpDesertSlaveEarthquake','CwpSteamPrincessImperialOrder','CwpGhostBusterMagitonChain']:return None
 pools=['fx_m_gauntlet_dash','FX_Common_Jump_small','fx_m_gauntlet_charging','fx_m_gauntlet_charging_lv1','fx_m_gauntlet_charging_lv2','fx_m_gauntlet_charging_lv3','fx_m_shockwave','fx_m_gauntlet_shockwave_lv1'] if t=='ManualChargeDeathFist' else ['Manual_Onehanded_SteamPrincess_Thrust'] if t=='ManualThrustCombo' else []
 return dict(behavior='source-batch6-f',batch6Operation=t,category=category,id=category,label='普通攻击' if category=='basic' else '专武技能',exclusive=category=='cwp',action=n,end=a.get('ActionDuration',a.get('AttackDuration',.4)),requiredPoolPresets=pools,source='native ARM64 Oak.'+t+'BattleAction',sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
