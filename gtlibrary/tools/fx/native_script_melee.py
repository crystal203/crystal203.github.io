"""Native Lua idioms for melee/stamina/temporary-form action timelines.
Recipes are selected by source operations and static field contracts, never hero IDs.
"""
import hashlib,re

def compile_melee_plan(a, lua, path):
    f = lambda key: ['field', key]
    add = lambda *args: ['add', *args]
    sub = lambda *args: ['sub', *args]
    ev = lambda key, at=0, **kw: dict(op='effect', key=key, at=at, **kw)
    name = a['Name']
    category = ('basic' if name.startswith('Manual') else 'support' if name.startswith('BasicSupport:') else 'myth' if name.startswith('Myth') else 'cwp' if name.startswith('Cwp') else 'role' if name.startswith('Role') else None)
    if not category: return None
    plan = dict(behavior='timeline', category=category, id=category,
        label={'basic':'普通攻击','support':'连锁技能','myth':'开花技能','cwp':'专武技能','role':'角色技能'}[category],
        action=name, exclusive=category=='cwp', mythOnly=category=='myth',
        end=a.get('ActionDuration', a.get('Duration', 1)), clips=[], events=[], moves=[])
    anim = lambda key, at=0, **kw: dict(key=key, at=at, **kw)
    if category=='basic' and 'self.fx_punch' in lua and 'self.action.break_state' in lua and 'BreakOffset' in a:
        plan.update(staminaCost=a['StaminaPerAction'],
            clips=[anim('cast')], events=[ev('cast', negativeKey='cast_rev', follow=True, followSpine=True, until=f('ActionDuration'))],
            breakClips=[anim('break', f('DashTiming'))],
            breakMoves=[dict(op='dash', at=f('DashTiming'), duration=f('DashDuration'), speed=f('DashSpeed'))],
            breakEvents=[ev('dash', f('DashTiming'), follow=True, followSpine=True), ev('break', f('BreakTiming'), negativeKey='break_rev', anchor='feet', offset=f('BreakOffset'))])
    elif category=='support' and 'self.roll_start_dist' in lua and 'self.pass_dist' in lua and 'self.skin_name' in lua:
        # Sync locks a side direction, independently from the aimed diagonal.
        plan.update(sideDirection=True,
            clips=[anim('cast'), anim('roll', f('CastTiming')), anim('landing', sub(f('Duration'), .03))],
            moves=[dict(op='lerp', at=0, duration=f('CastTiming'), offset=['mul', -1, f('RollDistance')]),
                   dict(op='lerp', at=f('RollStartTiming'), duration=sub(f('RollEndTiming'), f('RollStartTiming')), offset=f('PassDistance'), ease='inQuad'),
                   dict(op='lerp', at=f('RollEndTiming'), duration=sub(f('Duration'), f('RollEndTiming')), to='origin')],
            skinPath=[dict(at=f('CastTiming'), end=sub(f('Duration'), .03), skinField='TransformSkinName')],
            spine=[dict(at=0, duration=.15, height=.7),
                   # Native JumpCalculator ignores the following same-tick 1.5 Jump while active.
                   dict(at=f('RollEndTiming'), duration=sub(f('Duration'), f('RollEndTiming')), height=3.5, aerialDuration=['mul', sub(f('Duration'), f('RollEndTiming')), .3])],
            events=[ev('cast', follow=True, followSpine=True),
                    ev('bamboo_rev', negativeKey='bamboo', anchor='targetGround', until=f('HitTiming')),
                    ev('dash', add(f('CastTiming'), .15), negativeKey='dash_rev', follow=True, followSpine=True, until=f('HitTiming')),
                    ev('dash_trail', add(f('CastTiming'), .15), follow=True, followSpine=True, until=f('HitTiming')),
                    ev('explo_rev', f('HitTiming'), negativeKey='explo', anchor='target'),
                    ev('dust', sub(f('Duration'), .03), anchor='feet')])
    elif category=='cwp' and 'self.fx_spin' in lua and 'self.skin_name' in lua and 'LandingTiming' in a:
        plan.update(clips=[anim('cast', fallbackKey='cast_fallback'), anim('roll', f('DashTiming')), anim('landing', f('LandingTiming'))],
            moves=[dict(op='dash', at=f('DashTiming'), duration=f('DashDuration'), speed=f('DashSpeed'), free=True)],
            skinPath=[dict(at=f('DashTiming'), end=f('ActionDuration'), skinField='TransformSkinName')],
            spine=[dict(at=f('DashTiming'), duration=sub(f('LandingTiming'), f('DashTiming')), height=6, aerialDuration=['mul', f('DashDuration'), .7])],
            events=[ev('screen', screen=True, directed=False), ev('dust', anchor='feet'),
                    ev('spin', follow=True, followSpine=True, until=f('ActionDuration')),
                    ev('explo', f('LandingTiming'), anchor='feet'), ev('dust', f('ActionDuration'), anchor='feet')])
    elif category=='myth' and "'explosion_left', character_util.get_position(self.owner)" in lua and "'explosion_right', character_util.get_position(self.owner)" in lua:
        positions={}
        for key,axis in [('explosion_left','left'),('explosion_right','right')]:
            match=re.search(r"['\"]"+key+r"['\"]\s*,\s*character_util\.get_position\(self.owner\)\s*\+\s*vector_util\."+axis+r"\s*\*\s*([\d.]+)",lua)
            if match:positions[key]=float(match[1])*(-1 if axis=='left' else 1)
        if len(positions)!=2:return None
        plan.update(sideDirection=True, clips=[anim('cast')], events=[ev('explosion_right', negativeKey='explosion_left', anchor='feet', directed=False,
            offsetVector=[positions['explosion_right'],0,0],negativeOffsetVector=[positions['explosion_left'],0,0],nativePoolTransform='direct',nativePoolLifetime=True)])
    else: return None
    plan.update(meleeTimeline=True, source=str(path), sourceSha256=hashlib.sha256(lua.encode()).hexdigest())
    return plan

