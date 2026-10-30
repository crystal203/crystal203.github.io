"""Narrow source-literal FX position/direction contracts and fixed-clock myth idioms.

This module does not interpret Lua, resolve aliases or select hero identities.
It rejects ambiguous/multi-branch bindings instead of guessing their transforms.
"""
import copy
import hashlib
import importlib.util
import re
from pathlib import Path

_parser = None

def _arguments(text, start):
    global _parser
    if _parser is None:
        spec=importlib.util.spec_from_file_location('_native_event_bounded_calls',Path(__file__).with_name('audit-direction-contracts.py'))
        module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); _parser=module.arguments
    return _parser(text,start)

def _live_source(text):
    """Mask comments preserving line/byte offsets; preserve quoted arguments."""
    out=list(text); i=0
    while i<len(text):
        if text[i] in "'\"":
            quote=text[i];i+=1
            while i<len(text):
                if text[i]=='\\':i+=2;continue
                if text[i]==quote:i+=1;break
                i+=1
        elif text.startswith('--',i):
            match=re.match(r'--\[(=*)\[',text[i:])
            if match:
                close=']'+match.group(1)+']';end=text.find(close,i+len(match.group(0)));end=len(text) if end<0 else end+len(close)
            else:end=text.find('\n',i);end=len(text) if end<0 else end
            for n in range(i,end):
                if out[n]!='\n':out[n]=' '
            i=end
        else:i+=1
    return ''.join(out)

def _compact(text):return re.sub(r'\s+','',text)

def _owner_position(expression):
    text=_compact(expression)
    if text in ['character_util.get_position(self.owner)','self.owner.Position','battle_util.get_ground_pos(character_util.get_position(self.owner))','battle_util.get_ground_pos(self.owner.Position)']:return 'feet'
    if text=='bounds_util.get_center(self.owner)':return 'center'
    return None

def literal_source_calls(lua):
    text=_live_source(lua);rows=[]
    # Preserve strings for call arguments but exclude tokens inside strings.
    quote_ranges=[]
    for q in re.finditer(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"",text):quote_ranges.append((q.start(),q.end()))
    for m in re.finditer(r'\bbattle_util\.(instantiate_effect|instantiate_screen_effect)\s*\(',text):
        if any(a<=m.start()<b for a,b in quote_ranges):continue
        args,end=_arguments(text,m.end());screen=m.group(1)=='instantiate_screen_effect'
        key_arg=args[2] if screen and len(args)>2 else "'screen'" if screen else args[1] if len(args)>1 else ''
        key=re.fullmatch(r"['\"]([^'\"]+)['\"]",key_arg)
        rows.append(dict(key=key.group(1) if key else None,keyExpression=key_arg,position=args[2] if not screen and len(args)>2 else None,
                         rotation=args[3] if not screen and len(args)>3 else None,screen=screen,args=args,
                         start=m.start(),end=end,line=text.count('\n',0,m.start())+1))
    return rows

def normalize_literal_effect_positions(plan,lua,path=None):
    """Return a copied recipe with unambiguous owner positions and nil rotation.

    Same-key source calls must have exactly the same normalized expression.
    Dynamic key calls prevent normalization because their alias may match the
    event. Complex event transforms remain owned by their specific compiler.
    Nil direction is normalized separately from position: a height/anchor does
    not authorize actor rotation. Only bare, discarded-return source calls are
    accepted, so retained handles with later rotation stay with their compiler.
    Screen events, shader/pool offsets, disposal and lifetimes are untouched.
    """
    result=copy.deepcopy(plan)
    if not lua:return result
    calls=literal_source_calls(lua);text=_live_source(lua)
    if any(c['key'] is None for c in calls if not c['screen']):return result
    source_hash=hashlib.sha256(lua.encode('utf-8')).hexdigest()
    for field in ['events','breakEvents']:
        for event in result.get(field,[]):
            if event.get('op','effect')!='effect' or event.get('screen'):continue
            matches=[c for c in calls if not c['screen'] and c['key']==event.get('key')]
            # Source omission means identity before the pool's authored rotation.
            # Do not replace explicit event transforms or normalize assigned /
            # nested calls: their returned object can be rotated after creation.
            transform_fields=['euler','negativeEuler','angle','rotation','rotationType','directionVector','directionBone','directionKeys','link','bone','boneByFacing','followSpine','negativeKey','enhancedKey','negativeEnhancedKey','choices']
            if matches and not any(k in event for k in transform_fields):
                bare_nil=all(_compact(c['rotation'] or '') in ['', 'nil'] and len(c['args'])<=4
                    and not text[text.rfind('\n',0,c['start'])+1:c['start']].strip()
                    and not text[c['end']:text.find('\n',c['end']) if text.find('\n',c['end'])>=0 else len(text)].strip(' ;\t\r')
                    for c in matches)
                if bare_nil:
                    event['directed']=False
                    event['sourceDirectionContract']=dict(source=str(path) if path else None,sourceSha256=source_hash,
                        lines=[c['line'] for c in matches],expressions=[c['rotation'] for c in matches],directed=False,
                        rule='same literal key; all bare discarded-return calls omit rotation or pass nil; no explicit event transform')
            if any(k in event for k in ['height','heightByFacing','positionRule','bone','boneByFacing','link','followSpine','offsetVector','directionBone','directionKeys','negativeKey','enhancedKey','negativeEnhancedKey','choices']):continue
            expressions={_compact(c['position'] or '') for c in matches}
            if not matches or len(expressions)!=1:continue
            anchor=_owner_position(matches[0]['position'] or '')
            if anchor is None:continue
            event['anchor']=anchor
            event['sourcePositionContract']=dict(source=str(path) if path else None,sourceSha256=source_hash,
                lines=[c['line'] for c in matches],expression=matches[0]['position'],anchor=anchor,
                rule='same literal key and identical direct owner expression; no alias evaluation')
    return result

def compile_fixed_clock_myth_plan(a,lua,path):
    """Compile a bounded cast/slash/fire/screen/explosion clock choreography.

    Every FX call must be inside a flat literal-time check_time_passed block.
    Requiring all four known operations keeps the generic explosion fallback
    from silently accepting projectile/spine/routine mechanics.
    """
    if not a.get('Name','').startswith('Myth') or not lua:return None
    text=_live_source(lua);calls=literal_source_calls(lua)
    if len(calls)!=4 or sorted(c['key'] or '' for c in calls)!=['explosion','fire','screen','slash']:return None
    if re.search(r'\b(?:shoot_helper_util\.|coroutine_manager:|character_util\.(?:jump|recoil|spine_)|spine_util\.set_|self\.owner:Jump|CS\.Oak\.MoveOneFrameStageLogic\.ExecuteMove)',text):return None
    if not re.search(r"battle_util\.set_anim\(\s*self\s*,\s*self\.cs_action\s*,\s*['\"]cast['\"]\s*\)",text):return None
    blocks=[]
    for m in re.finditer(r'\bif\s+battle_util\.check_time_passed\s*\(',text):
        args,end=_arguments(text,m.end())
        if len(args)!=3 or [_compact(v) for v in args[:2]]!=['old_time_passed','time_passed']:continue
        if not re.fullmatch(r'\d+(?:\.\d+)?',args[2].strip()):continue
        then=re.match(r'\s*then\b',text[end:])
        if not then:continue
        begin=end+then.end();close=re.search(r'\bend\b',text[begin:])
        if not close:continue
        stop=begin+close.start();body=text[begin:stop]
        if re.search(r'\b(?:if|for|while|repeat|function)\b',body):continue
        blocks.append((begin,stop,float(args[2]),m.start(),stop+3))
    fx_blocks=[b for b in blocks if any(b[0]<=c['start']<b[1] for c in calls)]
    movement=re.search(r'\bfunction\s+local_class:update_movement\s*\([^)]*\)',text)
    if not movement or not fx_blocks:return None
    # The known idiom is a contiguous prefix of flat clock blocks in the
    # update method. Reject outer option/target branches and interleaved code.
    cursor=movement.end()
    for block in fx_blocks:
        if text[cursor:block[3]].strip():return None
        cursor=block[4]
    events=[]
    for call in calls:
        clocks=[b[2] for b in blocks if b[0]<=call['start']<b[1]]
        if len(clocks)!=1:return None
        event=dict(op='effect',key=call['key'],at=clocks[0])
        if call['screen']:
            if [_compact(x) for x in call['args']]!=['self','self.owner']:return None
            event.update(screen=True,directed=False,anchor='feet')
        else:
            position=_compact(call['position'] or '')
            if call['key']=='fire':
                match=re.fullmatch(r'bounds_util\.get_center\(self\.owner\)\+self\.dir_vector\*(\d+(?:\.\d+)?)',position)
                if not match:return None
                event.update(anchor='center',offset=float(match.group(1)))
            elif position=='bounds_util.get_center(self.owner)':event['anchor']='center'
            else:return None
            rotation=_compact(call['rotation'] or '')
            if rotation not in ['','nil','self.dir_vector']:return None
            event['directed']=rotation=='self.dir_vector'
        event['sourceClockContract']=dict(line=call['line'],time=clocks[0],kind='flat literal check_time_passed')
        events.append(event)
    events.sort(key=lambda e:e['at'])
    return dict(behavior='timeline',category='myth',id='myth',label='开花技能',action=a['Name'],mythOnly=True,
                end=a.get('ActionDuration',a.get('Duration',1)),exclusive=False,clips=[dict(key='cast',at=0)],
                moves=[],spine=[],alpha=[],events=events,source=str(path),sourceSha256=hashlib.sha256(lua.encode('utf-8')).hexdigest(),
                sourceIdiom='flat-clock-slash-fire-screen-explosion-v1')


def compile_party_heal_support_plan(a,lua,path):
    """Source-clocked party ownership effects for the single preview owner.

    This exact idiom never starts an actor animation in on_start. Existing
    stage-party/summoned entities are recipients; enemy targets are not party.
    The preview currently supplies its owner only, so no extra actors are made.
    """
    if not a.get('Name','').startswith('BasicSupport:') or not lua:return None
    text=_live_source(lua)
    required=['party_util.get_stage_members(self.owner)','character_util.is_dead(member)',
              'summonable_util.get_summmoned(member)','parent_follow_flag.position']
    if not all(value in text for value in required):return None
    if not re.search(r'function\s+local_class:on_start\(_\)\s*end',text):return None
    if not re.search(r'self.target_pos\s*=\s*character_util.get_position\(self.target\)',text):return None
    calls=literal_source_calls(lua)
    if sorted(c['key'] or '' for c in calls)!=['cast','heal','party']:return None
    cast=next(c for c in calls if c['key']=='cast')
    party=next(c for c in calls if c['key']=='party')
    if _compact(cast['position'] or '')!='self.target_pos':return None
    if _compact(party['position'] or '')!='character_util.get_position(member)':return None
    if len(party['args'])!=6 or [_compact(v) for v in party['args'][3:]]!=['nil','character_util.get_transform(member)','parent_follow_flag.position']:return None
    clocks=list(re.finditer(r'battle_util.check_time_passed\(old_time_passed,\s*time_passed,\s*([\d.]+)\)\s*then',text))
    before=[m for m in clocks if m.end()<cast['start']]
    if not before:return None
    clock=before[-1]
    if text[clock.end():cast['start']].strip():return None
    at=float(clock[1])
    events=[dict(op='effect',key='cast',at=at,anchor='targetGround',directed=False,nativePoolTransform='direct',nativePoolLifetime=True),
            dict(op='effect',key='party',at=at,anchor='feet',directed=False,follow=True,nativePoolTransform='direct',nativePoolLifetime=True)]
    return dict(behavior='timeline',category='support',id='support',label='连锁技能',action=a['Name'],end=a['Duration'],
                clips=[],events=events,moves=[],spine=[],alpha=[],mythPresetSource='action',
                previewRecipients='owner only; existing living party/summonables required for other ownership effects',
                sourceIdiom='source-clocked-party-position-follow-v1',source=str(path),sourceSha256=hashlib.sha256(lua.encode('utf-8')).hexdigest())
