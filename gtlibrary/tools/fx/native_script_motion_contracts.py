"""Bounded Lua actor-motion contracts layered over existing timeline recipes.

No hero identity dispatch. Only augment a recipe when its source API, timing
and existing movement/alpha idiom agree; unsupported expressions stay unbound.
"""
import ast
import copy
import math
import re
from native_source_event_contracts import _arguments, _live_source


def _scalar(expression, action, bindings):
    expression = expression.strip()
    for member, field in bindings.items():
        expression = re.sub(r'\bself\.' + re.escape(member) + r'\b', repr(action.get(field)), expression)
    node = ast.parse(expression, mode='eval').body
    def read(value):
        if isinstance(value, ast.Constant) and type(value.value) in (int, float): return value.value
        if isinstance(value, ast.UnaryOp) and isinstance(value.op, ast.USub): return -read(value.operand)
        if isinstance(value, ast.BinOp):
            left, right = read(value.left), read(value.right)
            if isinstance(value.op, ast.Add): return left + right
            if isinstance(value.op, ast.Sub): return left - right
            if isinstance(value.op, ast.Mult): return left * right
            if isinstance(value.op, ast.Div): return left / right
        raise ValueError('Unbound source scalar: ' + expression)
    value = read(node)
    if not math.isfinite(value): raise ValueError('Non-finite source scalar')
    return value


def augment_source_motion_contracts(plan, action, lua, path=None):
    if not plan or plan.get('behavior') != 'timeline' or not lua: return plan
    text = _live_source(lua)
    bindings = dict(re.findall(r"self\.(\w+)\s*=\s*cs_util\.get_(?:float|int)_from_dictionary\(\s*\w+,\s*['\"]([^'\"]+)['\"]\s*\)", text))
    result = copy.deepcopy(plan)
    contracts = []
    calls = list(re.finditer(r'\bcharacter_util\.recoil_type_1\s*\(', text))
    # The accepted idiom is a single backwards short dash and recoil in the
    # same check_time_passed block. Existing bespoke/multi-recoil recipes win.
    if len(calls) == 1 and not result.get('nativeRecoils') and '-self.dir_vector' in text:
        call = calls[0]
        args, _ = _arguments(text, call.end())
        gates = list(re.finditer(r'if\s+battle_util\.check_time_passed\s*\(', text[:call.start()]))
        if len(args) == 6 and args[:2] == ['self.owner', 'self.dir_vector'] and gates:
            gate = gates[-1]
            timing, gate_end = _arguments(text, gate.end())
            body = text[gate_end:call.start()]
            if len(timing) == 3 and 'battle_util.melee_short_dash' in body and not re.search(r'\bfunction\b', body):
                try:
                    at = _scalar(timing[2], action, bindings)
                    values = [_scalar(value, action, bindings) for value in args[2:]]
                    def value(expression):
                        return action.get(expression[1]) if isinstance(expression, list) and expression[0] == 'field' else expression
                    moves = [m for m in result.get('moves', []) if m.get('op') == 'dash' and m.get('sign') == -1 and value(m.get('at')) == at]
                    if len(moves) == 1 and values[2] > 0:
                        result['nativeRecoils'] = [dict(at=at, distance=values[0], height=values[1], duration=values[2], angle=values[3])]
                        contracts.append(dict(api='character_util.recoil_type_1', line=text.count('\n', 0, call.start())+1, gate=timing[2], binding='single backwards short dash at the same source gate'))
                except (ValueError, TypeError, SyntaxError, ZeroDivisionError): pass
    aim = re.search(r'spine_util\.set_aim_point\(\s*self\.owner,\s*center\s*\+\s*self\.dir_vector,\s*center\s*\)', text)
    if aim and result.get('continuous') and 'local center = bounds_util.get_center(self.owner)' in text:
        result['nativeAim'] = dict(bone='b.aim', originHeight=['centerHeight'], windows=[dict(at=0, end=plan['end'])])
        contracts.append(dict(api='spine_util.set_aim_point', line=text.count('\n',0,aim.start())+1, binding='owner bounds center + full direction; continuous update'))
    fades = []
    for match in re.finditer(r'character_util\.spine_set_alpha_fade\s*\(', text):
        args, _ = _arguments(text, match.end())
        functions = list(re.finditer(r'function\s+[\w.]+:(\w+)\(', text[:match.start()]))
        if len(args) == 3 and args[0] == 'self.owner' and functions:
            try: fades.append((functions[-1].group(1), _scalar(args[1],action,bindings), _scalar(args[2],action,bindings), text.count('\n',0,match.start())+1))
            except (ValueError, TypeError, SyntaxError, ZeroDivisionError): pass
    alpha = result.get('alpha', [])
    if len(fades) == 2 and len(alpha) == 2 and all(set(row) <= {'at','value'} for row in alpha):
        start = next((f for f in fades if f[0] == 'on_start' and f[1] == 0), None)
        cancel = next((f for f in fades if f[0] == 'on_cancel' and f[1] == 1), None)
        if start and cancel and alpha[0] == dict(at=0,value=0) and alpha[1] == dict(at=plan['end'],value=1):
            result['alpha'] = [dict(at=0,from_=1,value=0,duration=start[2]),dict(at=plan['end'],from_=0,value=1,duration=cancel[2])]
            for row in result['alpha']: row['from'] = row.pop('from_')
            result['actorTailEnd'] = plan['end'] + cancel[2]
            result['sideDirection'] = True
            result['sideDirectionVertical'] = True
            contracts.append(dict(api='character_util.spine_set_alpha_fade', lines=[start[3],cancel[3]], binding='start fade and normal end on_cancel restore; actor tail retained'))
    if any(e.get('op') == 'projectile-return' for e in result.get('events', [])) and "battle_util.set_upper_anim(self.action, self.cs_action, 'attack')" in text:
        contracts.append(dict(api='battle_util.set_upper_anim', binding='return-projectile actor uses upper attack track'))
    if contracts:
        # These bounded scripts use the upper animation API exclusively.
        if 'battle_util.set_upper_anim(' in text and not re.search(r'battle_util\.set_anim\s*\(', text):
            for clip in result.get('clips', []): clip.setdefault('track', 'Upper')
        result['sourceMotionContracts'] = contracts
    return result
