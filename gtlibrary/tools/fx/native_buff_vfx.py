"""Source-backed ownership aura and one-use hit effect plans for buff options."""
import hashlib
from native_csharp_soundwave import attach_normal_trigger_options

def compile_buff_vfx(plan,action,rows,options,buffs,lua_root):
    attach_normal_trigger_options(plan,options,lua_root)
    if plan.get('behavior')!='timeline':return
    option_by_id={o['Id']:o for o in options}
    buff_by_name={b.get('Name'):b for b in buffs}
    for option in options:
        if option.get('Class')!='Lua' or not option.get('ScriptName'):continue
        path=lua_root.parent/'Option'/(option['ScriptName']+'Option.lua')
        if not path.exists():continue
        lua=path.read_text(encoding='utf8')
        if not all(s in lua for s in ['instantiate_ownership_effect(', 'self.current_left = self.apply_count','function local_class:get_attack_modifier',"battle_util.instantiate_effect(self, 'hit'"]):continue
        buff=option.get('BuffName')
        ids=action.get('OptionId',[]);ids=ids if isinstance(ids,list) else [ids]
        applies=plan.get('category')=='role' and option['Id'] in ids
        manager=next((r for r in rows if r.get('BuffName')==buff and action['Name'] in r.get('ExtraAction',[])),None)
        if not applies and not manager and action.get(plan.get('buffConditionField',''))!=buff:continue
        source_buff=buff_by_name.get(buff)
        if not source_buff:raise ValueError('Missing native ownership buff '+str(buff))
        hit=None
        if plan['category']=='basic':hit=action.get('AttackTiming',action.get('HitTiming',action.get('DashTiming',0)))
        elif plan['category']=='support':hit=action['HitTiming']
        elif plan['category']=='cwp':hit=action['HitTiming'][0]
        plan['buffVfx']=dict(buff=buff,optionId=option['Id'],option=option,mythOption=option_by_id.get(option.get('MythOptionId')),duration=source_buff['Duration'],applies=applies,hitAt=hit,source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
        return
