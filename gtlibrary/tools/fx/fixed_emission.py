"""Native birth layouts for stationary, fixed-seed particle bursts.

Unity's module-specific random streams are not the browser's PRNG. Keep the
native result as source data instead of adjusting an effect's coordinates.
"""
import hashlib
import json


def constant(curve, expected=None):
    return bool(curve and curve.get('minMaxState', 0) == 0 and
                (expected is None or curve.get('scalar') == expected))


def eligible(system):
    modules = system['modules']
    initial = modules['InitialModule']
    emission = modules.get('EmissionModule', {})
    bursts = emission.get('m_Bursts', [])
    # Narrow, explicit support: no motion, delay, looping, variable initial
    # properties, repeated bursts, or subemitters whose births depend on parents.
    return (system.get('autoRandomSeed') is False and bool(system.get('seed')) and
            not system['loop'] and constant(system['delay'], 0) and
            system['renderer']['mode'] == 0 and 'ShapeModule' in modules and
            set(modules) <= {'InitialModule', 'ShapeModule', 'EmissionModule', 'ColorModule', 'UVModule'} and
            constant(initial.get('startSpeed'), 0) and constant(initial.get('gravityModifier'), 0) and
            constant(initial.get('startLifetime')) and initial['startLifetime']['scalar'] > .05 and
            all(constant(initial.get(key)) for key in ('startSize', 'startSizeY', 'startSizeZ',
                                                       'startRotation', 'startRotationX', 'startRotationY')) and
            not initial.get('randomizeRotationDirection') and
            initial['startColor'].get('minMaxState', 0) == 0 and
            constant(emission.get('rateOverTime'), 0) and constant(emission.get('rateOverDistance'), 0) and
            len(bursts) == 1 and bursts[0]['time'] == 0 and bursts[0].get('cycleCount', 1) == 1 and
            bursts[0].get('probability', 1) == 1 and constant(bursts[0]['countCurve']))


def signature(system):
    data = {key: system.get(key) for key in ('seed', 'autoRandomSeed', 'duration', 'loop', 'speed', 'delay')}
    data['modules'] = {key: system['modules'].get(key) for key in ('InitialModule', 'ShapeModule', 'EmissionModule')}
    data['renderer'] = {key: system['renderer'].get(key) for key in ('mode', 'flip')}
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def node_path(effect, node_id):
    nodes = {node['id']: node for node in effect['nodes']}
    result = []
    while node_id != effect['root']:
        node = nodes[node_id]
        result.append(node['name'])
        node_id = node['parent']
    return '/'.join(reversed(result))


def apply_native_emission(manifest, directory):
    path = directory / (manifest['character'] + '.json')
    if not path.exists():
        return 0
    source = json.loads(path.read_text(encoding='utf8'))
    if source.get('version') != 1:
        raise ValueError(f'Unsupported native emission version: {path}')
    lookup = {(effect['preset'], node_path(effect, system['node'])): system
              for effect in manifest['effects'] for system in effect['systems']}
    for record in source['systems']:
        system = lookup.get((record['preset'], record['path']))
        if system is None or not eligible(system) or signature(system) != record['signature']:
            raise ValueError(f'Stale native emission: {record["preset"]}/{record["path"]}; rerun bake-fixed-emission.py')
        count = int(system['modules']['EmissionModule']['m_Bursts'][0]['countCurve']['scalar'])
        if len(record['particles']) != count or record['seed'] != (system['seed'] & 0xffffffff):
            raise ValueError(f'Invalid native emission count/seed: {record["path"]}')
        system['nativeEmission'] = {'version': 1, 'seed': record['seed'], 'particles': record['particles']}
    return len(source['systems'])
