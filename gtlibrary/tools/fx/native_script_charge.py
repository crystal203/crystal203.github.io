"""Source idioms for persistent charge/release and independent explosion states."""
import hashlib,re

def compile_charge_plan(a,lua,path):
    if not lua:return None
    source=dict(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if all(s in lua for s in ['function local_class:charge_level(level)','self.reverse_flag = not self.reverse_flag','self.sync_level + proj_index']):
        # Persist the source constants as a recipe. Runtime expands declared
        # charge thresholds and reverse state, without selecting actor names.
        speed=float(re.search(r'local dash_speed\s*=\s*([\d.]+)\s*\*\s*self.sync_level',lua)[1])
        offset=float(re.search(r'local init_pos\s*=\s*bounds_center\s*\+\s*([\d.]+)',lua)[1])
        dash=re.search(r'battle_util.melee_short_dash\(.*?self.sync_dir_vector,\s*([\d.]+),\s*([\d.]+),.*?nil,\s*([\d.]+)',lua,re.S)
        return dict(behavior='native-charge',category='basic',id='basic',label='蓄力普攻',action=a['Name'],
                    nativeCharge=dict(levelTimesField='ChargeDurations',maximumField='MaxChargeDuration',attackDurationField='AttackDuration',
                                      dashSpeedPerLevel=speed,dashAt=float(dash[1]),dashDuration=float(dash[2]),stopOffset=float(dash[3]),
                                      slashOffset=offset,projectileOriginOffset=1,enhancedProjectileOffset=int(re.search(r'proj_index = proj_index \+ (\d+)',lua)[1]),loopKeys=['loop','rloop'],slashKeys=['slash','rslash']),**source)
    if all(s in lua for s in ['self.explosion_state_machine','self.current_pos = self.owner.Position + self.offset * self.dir_vector','local explosion_timing = self.attack_timing + (index - 1) * self.term']):
        return dict(behavior='timeline',category='cwp',id='cwp',label='专武技能',action=a['Name'],exclusive=True,
                    mythPresetSource='action',end=a['ActionDuration'],meleeTimeline=True,clips=[dict(key='cast',at=0)],moves=[],spine=[],
                    events=[dict(op='effect',key='cast',at=0,anchor='feet',directed=False,nativePoolTransform='directional')]+[
                        dict(op='effect',key='explosion',at=a['AttackTiming']+i*a['DelayTerm'],anchor='feet',offset=a['Offset']+i*a['Distance'],
                             directed=True,nativePoolTransform='directional') for i in range(a['Limit'])],
                    independentStateEnd=a['AttackTiming']+(a['Limit']-1)*a['DelayTerm']+a['ExplosionDuration'],**source)
    return None
