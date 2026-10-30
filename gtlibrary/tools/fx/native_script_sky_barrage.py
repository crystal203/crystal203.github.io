"""Bounded source contract for a descending actor and radial falling shots."""
import hashlib
import re


def compile_sky_barrage_plan(a, lua, path):
    if not lua or not a.get('Name', '').startswith('Myth'):
        return None
    required = ['self.target_random_pos[idx]', 'math.cos(angle)', 'math.sin(angle)',
                'CS.Oak.Interpolations.EaseInCubic', 'CS.Oak.Interpolations.Linear',
                'shoot_helper_util.shoot_direction_at_position', "instantiate_effect(self, 'jump'",
                "instantiate_effect(self, 'explosion'", 'self.hit_timing[idx]']
    if not all(token in lua for token in required):
        return None
    if lua.count('random_util.get_random_value()') != 1 or 'random_util.get_random_int(' in lua:
        raise ValueError('Unsupported sky barrage random draw order')
    if any(token in lua for token in ['StartIndependentRoutine(', 'StartRoutine(', 'StartCoroutine(']):
        raise ValueError('Unsupported sky barrage independent routine')
    literal_keys = re.findall(r"battle_util\.instantiate_effect\(self,\s*['\"]([^'\"]+)['\"]", lua)
    if sorted(literal_keys) != ['explosion', 'jump']:
        raise ValueError('Unsupported sky barrage effect calls')
    def scalar(pattern):
        m = re.search(pattern, lua)
        if not m:
            raise ValueError('Incomplete sky barrage source binding: ' + pattern)
        return float(m[1])
    height = scalar(r'self\.jump_height\s*=\s*([\d.]+)')
    radius = scalar(r'vector\(math\.cos\(angle\),\s*0,\s*math\.sin\(angle\)\)\s*\*\s*([\d.]+)')
    span = scalar(r'local random_angle = random_util\.get_random_value\(\)\s*\*\s*([\d.]+)')
    step = scalar(r'random_angle = random_angle\s*\+\s*([\d.]+)')
    lead = scalar(r'self\.hit_timing\[idx\]\s*-\s*([\d.]+)')
    descent = re.search(r'EaseInCubic\(time_passed\s*-\s*([\d.]+),\s*0,\s*1,\s*([\d.]+)\)', lua)
    spin = re.search(r'Linear\(time_passed\s*-\s*([\d.]+),\s*0,\s*1,\s*([\d.]+)\)', lua)
    offset = re.search(r'local shoot_pos = self\.target_random_pos\[idx\]\s*\+\s*vector\(([^)]+)\)', lua)
    if not descent or not spin or not offset:
        raise ValueError('Missing sky barrage motion binding')
    descent_start, descent_duration = map(float, descent.groups())
    spin_start, spin_duration = map(float, spin.groups())
    rotation = scalar(r':Rotate\((-[\d.]+)\s*\*\s*progress,\s*0\)')
    fade = scalar(r'spine_set_alpha_fade\(self\.owner,\s*1,\s*([\d.]+)\)')
    landing = scalar(r'check_time_passed\(old_time_passed,\s*time_passed,\s*([\d.]+)\)\s*then\s*battle_util\.set_anim\(self,\s*self\.cs_action,\s*\x27landing\x27\)')
    land_fx = scalar(r'check_time_passed\(old_time_passed,\s*time_passed,\s*([\d.]+)\)\s*then\s*battle_util\.instantiate_effect\(self,\s*\x27jump\x27')
    times = a.get('HitTiming')
    if not isinstance(times, list) or not times or min(times) < lead:
        raise ValueError('Unsupported sky barrage HitTiming')
    # Only one source random draw precedes the radial point loop. Explicit
    # target_pos disables CalculateInnerTarget; no actor target is substituted.
    shoot = re.search(r'shoot_helper_util\.shoot_direction_at_position\((.*?)\n\s*\)', lua, re.S)
    if not shoot or re.sub(r'\s+', '', shoot[1]) != 'self.shoot_helper[1],shoot_pos,shoot_dir,nil,nil,nil,false,nil,self.target_random_pos[idx]':
        raise ValueError('Unsupported falling shot argument contract')
    constants = dict(jumpHeight=height, radius=radius, randomAngleSpan=span, angleStep=step,
                     shotLead=lead, shootOffset=[float(v) for v in offset[1].split(',')],
                     descentStart=descent_start, descentDuration=descent_duration,
                     spinStart=spin_start, spinDuration=spin_duration, rotation=rotation,
                     fadeDuration=fade, landingAnimationAt=landing, landingEffectAt=land_fx)
    return dict(behavior='source-sky-barrage', category='myth', id='myth', label='开花技能',
                action=a['Name'], mythOnly=True, end=a.get('ActionDuration', a.get('Duration', 1)),
                sourceConstants=constants, hitTimings=times, events=[dict(key='explosion', at=t, directed=False) for t in times] + [dict(key='jump',at=land_fx,anchor='feet',directed=False)],
                source=str(path), sourceSha256=hashlib.sha256(lua.encode()).hexdigest(),
                sourceIdiom='single-random-radial-falling-shots-cubic-spine-v1',
                nativeProjectileContract=dict(elfSha256='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db',
                    methods=['0x6c99004','0x6c9955c','0x6a595d0','0x6a450d0','0x6a47550'],
                    rule='explicit targetPos is stored at Projectile+0x48; UnityObjectPoolProjectile base movement follows direction and spec lifetime with targetToFollow=nil; do not clamp to HitTiming or invent a target collision'))
