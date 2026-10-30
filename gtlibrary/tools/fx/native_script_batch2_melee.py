"""Source-signature recipes for delayed melee and Lua-backed support actions."""
import hashlib
from pathlib import Path

def compile_batch2_melee_plan(a,lua,path):
    typ=a['Name'].split(':')[0]
    p=dict(behavior='timeline',category='basic',id='basic',label='普通攻击',action=a['Name'],end=a.get('ActionDuration',a.get('Duration',1)),clips=[],events=[],moves=[],spine=[],meleeTimeline=True)
    def ev(key,at=0,**kw):return dict(op='effect',key=key,at=at,anchor='center',nativePoolTransform='directional' if kw.get('directed',True) else 'direct',nativePoolLifetime=True,**kw)
    if lua and 'self.attack_duration = math.min(self.attack_duration, self.action.action_duration)' in lua and "self.action, 'light', bounds_util.get_center(self.owner), self.dir_vector" in lua:
        p.update(clips=[dict(key='bash',at=0)],events=[ev('light',a['HitTiming'])])
    elif lua and "self.attack_type == 'jump'" in lua and 'self.hit_timing - self.dash_timing' in lua and "local key = flip and 'flip' or 'slash'" in lua:
        kind=a['AttackType']; at=a['HitTiming']
        p.update(clips=[dict(key='action',at=0)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])])
        if kind=='slash':p['events']=[ev('slash',at,fourWay=True)]
        elif kind=='jump':p['events']=[ev('slash',at,fourWay=True,directionKeys=dict(right='slash',left='flip',back='slash',front='flip'),offsetByFacing=dict(right=1.2,left=1.2,front=1.1,back=1.1))]
        elif kind=='thrust':
            p['events']=[ev('cast',0,directed=False,follow=True,followSpine=True),ev('slash',at,anchorOverride='feet',fourWay=True)]
            p['events'][1]['anchor']='feet'
            p['spine']=[dict(op='jump',at=a['DashTiming'],height=1,duration=at-a['DashTiming'])]
        else:return None
    elif typ=='JumpStompSupport' and a.get('LuaAddOn')=='Gourry':
        addon=Path(path).parent/'Support'/('GourrySupportBattleAction.lua')
        lua=addon.read_text(encoding='utf8');path=addon
        if "self.hit_timing - 0.05" not in lua:return None
        p.update(category='support',id='support',label='连锁技能',sideDirection=True,clips=[dict(key='action',at=0)],nativeMotion=dict(op='jumpStomp',approach=a['JumpDuration'],hold=a['JumpInterval'],retreat=a['BackJumpDuration'],jumpHeight=a['JumpHeight'],backJumpHeight=a['BackJumpHeight'],contact=a['IsContact']),
          events=[ev('cast',0,directed=False,follow=True,followSpine=True),ev('slash',a['HitTiming']-.05,negativeKey='rslash',anchorOverride='target',offsetVector=[0,0,.2]),ev('smoke',a['Duration'],anchorOverride='feet',scale=.7,directed=False)])
        p['events'][1]['anchor']='target';p['events'][2]['anchor']='feet'
    elif lua and 'self.action.area_machine:change(nil)' in lua and 'self.sub_damage_scale = (1 - self.main_damage_scale)' in lua and 'character_util.jump(self.owner, 2.5, self.dash_duration)' in lua:
        p.update(category='cwp',id='cwp',label='专武技能',exclusive=True,clips=[dict(key='action',fallbackKey='actionbackup',at=0)],moves=[dict(op='dash',at=a['DashTiming'],duration=a['DashDuration'],speed=a['DashSpeed'])],spine=[dict(op='jump',at=a['DashTiming'],duration=a['DashDuration'],height=2.5)],events=[ev('cast',0,directed=False,follow=True,followSpine=True),ev('screen',a['AttackTiming'],screen=True,directed=False),ev('explosion',a['AttackTiming'],anchorOverride='feet',offset=a['Offset'],directed=False)],nativeAreaEnd=a['AttackTiming']+max(a['HitTiming']))
        p['events'][2]['anchor']='feet'
    else:return None
    for e in p['events']:e.pop('anchorOverride',None)
    p.update(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),sourceIdiom='source-melee-support-v1')
    return p



_compile_static_melee_plan=compile_batch2_melee_plan

def compile_batch2_melee_plan(a,lua,path):
    p=_compile_static_melee_plan(a,lua,path)
    if p:return p
    typ=a['Name'].split(':')[0]
    source=dict(source=str(path),sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    if lua and 'self.option_time_left = self.option_duration' in lua and 'self.owner.SpineController:Jump(1.5, self.dash_duration - 0.1)' in lua:
        return dict(behavior='source-batch2-melee',category='basic',id='basic',label='普通攻击',action=a['Name'],end=a['ActionDuration'],sourceMelee=dict(operation='delayed-melee-combo',boostBuff='buff_viking_special_option',boostEventId=300374),**source)
    if lua and 'self.charge_start_timing = self.charge_start_timing  * (1 - charge_start_scale)' in lua and 'self.move_blocked or self:check_collision(real_dt)' in lua:
        return dict(behavior='source-batch2-melee',category='cwp',id='cwp',label='专武技能',action=a['Name'],end=a['ActionDuration'],exclusive=True,sourceMelee=dict(operation='linear-charge',turnDegreesPerSecond=120),**source)
    if lua and 'instantiate_ownership_effect' in lua and "self, 'buff', member" in lua and 'self:apply_ascent_option(params)' in lua:
        return dict(behavior='timeline',category='support',id='support',label='连锁技能',action=a['Name'],end=a['Duration'],clips=[dict(key='action',at=0)],events=[dict(op='effect',key='cast',at=0,anchor='feet',directed=False,nativePoolTransform='direct',nativePoolLifetime=True),dict(op='effect',key='buff',at=0,anchor='feet',follow=True,directed=False,nativePoolTransform='direct',nativePoolLifetime=True)],moves=[],spine=[],meleeTimeline=True,optionParameterSource='active-ascent-option',**source)
    return None

_compile_reviewed_melee_plan=compile_batch2_melee_plan

def compile_batch2_melee_plan(a,lua,path):
    p=_compile_reviewed_melee_plan(a,lua,path)
    if p:
        if p.get('sourceIdiom')=='source-melee-support-v1' and a.get('AttackType')=='bash':p['sourceMelee']=dict(operation='mixed-melee-member')
        return p
    if a['Name'].split(':')[0]=='RoundAggro' and all(k in a for k in ['AggroPreset','AggroRadius']):
        return dict(behavior='timeline',category='role',id='role',label='角色技能',action=a['Name'],end=.4000000059604645,clips=[dict(animation='get',at=0,track='Upper'),dict(animation='mad',at=0,track='Emotion')],events=[dict(op='effect',preset=a['AggroPreset'],at=0,anchor='feet',follow=True,directed=False,nativePoolTransform='direct',nativePoolLifetime=True,scale=a['AggroRadius']/1.100000023841858)],moves=[],spine=[],meleeTimeline=True,requiredPoolPresets=[a['AggroPreset']],source='native ARM64 0x8b6e548/0x8b6f114',sourceSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db')
    return None
