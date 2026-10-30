"""Read-only native renderer flag audit; no imports, asset writes, or rendering.

Defaults to the ten second-batch character manifests. Source AssetBundles are
resolved using import-config.json, with optional APK fallback. Findings retain
reference evidence and hierarchy visibility rather than implying every exported
preset is used by the default preview scene.
"""
import argparse
import importlib
import json
from pathlib import Path
import sys
import zipfile

BATCH2 = 'tanker viking gourry stark captainrabbit whitebeast alpacagirl bluedragon lifeguardyuze frieren'.split()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--characters', nargs='+', default=BATCH2)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    config = read(args.repo / 'tools/fx/import-config.json')
    for path in config.get('pythonExtraLibs', []):
        sys.path.insert(0, path)
    if config.get('pythonLibs'):
        sys.path.insert(0, config['pythonLibs'])
    sys.modules['UnityPy.UnityPyBoost'] = None
    UnityPy = importlib.import_module('UnityPy')
    roots = [Path(config['bundleRoot'])] + [Path(p) for p in config.get('bundleFallbackRoots', [])]
    apk = None
    bundles = {}
    pool_rows = {row['PresetName']: row for row in read(args.repo / 'gtfx/assets/native-source/objectpoolspec.json')}

    def load(name):
        nonlocal apk
        if name not in bundles:
            path = next((root / name for root in roots if (root / name).is_file()), None)
            if path:
                raw = path.read_bytes()
            else:
                if apk is None:
                    apk = zipfile.ZipFile(config['apk'])
                raw = apk.read('assets/AssetBundles/Android/' + name)
            env = UnityPy.load(raw)
            objects = {}
            for obj in env.objects:
                objects.setdefault(str(obj.path_id), []).append(obj)
            bundles[name] = (env, objects)
        return bundles[name][1]

    report = {'scope': args.characters, 'source': 'original AssetBundle component m_Enabled',
              'sceneUsage': 'Reference evidence only; no default-scene or costume evaluation.',
              'characters': {}, 'disabled': [], 'mismatches': [], 'skipped': [], 'errors': []}
    for character in args.characters:
        manifest = read(args.repo / f'gtfx/assets/characters/{character}.json')
        native = read(args.repo / f'gtfx/assets/native-characters/{character}.json')
        refs = {}

        def walk(value, path):
            if isinstance(value, str):
                refs.setdefault(value, []).append(path)
            elif isinstance(value, dict):
                for key, item in value.items():
                    if key=='Name' or path.startswith('plans.') and key=='key':continue  # logical labels/spec identities, not pool preset references
                    walk(item, path + '.' + key)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    walk(item, path + '.' + str(i))

        for key in ['plans', 'actions', 'projectiles', 'options']:
            walk(native.get(key), key)
        summary = {'effects': len(manifest['effects']), 'particleSystems': 0, 'staticMeshes': 0,
                   'checkedParticleSystems': 0, 'checkedStaticMeshes': 0,
                   'disabledParticleRenderers': 0, 'disabledMeshRenderers': 0}
        report['characters'][character] = summary
        for effect in manifest['effects']:
            if effect.get('unavailable'):
                continue
            preset = effect['preset']
            bundle_name = effect.get('sourceBundle') or pool_rows.get(preset, {}).get('AssetBundleName')
            if not refs.get(preset) and not refs.get(effect.get('assetName')):
                report['skipped'].append({'character': character, 'preset': preset,
                                          'reason': 'No native action/option/plan/projectile preset reference; logical event keys are not pool identities.'})
                continue
            nodes = {str(n['id']): n for n in effect.get('nodes', [])}

            def active(node):
                seen = set()
                while str(node) in nodes and str(node) not in seen:
                    seen.add(str(node))
                    item = nodes[str(node)]
                    if not item.get('active', True):
                        return False
                    node = item.get('parent')
                return True

            try:
                objects = load(bundle_name)
                native_paths = None

                def source_by_hierarchy(node_id):
                    nonlocal native_paths
                    if native_paths is None:
                        native_paths = {}
                        target = effect.get('assetName') or pool_rows.get(preset, {}).get('AssetName')
                        roots_found = [obj for values in objects.values() for obj in values
                                       if obj.type.name == 'GameObject' and obj.read().m_Name.casefold() == target.casefold()]
                        if len(roots_found) != 1:
                            raise ValueError(f'{target}: {len(roots_found)} source prefab roots')

                        def visit(go_ref, path=()):
                            go = go_ref.read()
                            native_paths.setdefault(path, []).append(go)
                            transform = next(c.component.read() for c in go.m_Component if c.component.type.name == 'Transform')
                            for child in transform.m_Children:
                                child_go = child.read().m_GameObject
                                visit(child_go, path + (child_go.read().m_Name,))
                        visit(roots_found[0])
                    path = []
                    while str(node_id) in nodes and str(node_id) != str(effect['root']):
                        node = nodes[str(node_id)]
                        path.insert(0, node['name'])
                        node_id = node.get('parent')
                    matches = native_paths.get(tuple(path), [])
                    if len(matches) != 1:
                        raise ValueError(f'hierarchy {path}: {len(matches)} source matches')
                    return matches[0]
                for kind, entries in [('ParticleSystemRenderer', effect.get('systems', [])),
                                      ('MeshRenderer', [s for s in effect.get('statics', []) if s.get('mesh')])]:
                    for entry in entries:
                        summary['particleSystems' if kind == 'ParticleSystemRenderer' else 'staticMeshes'] += 1
                        if kind == 'ParticleSystemRenderer':
                            candidates = [o for o in objects.get(str(entry.get('sourceId')), []) if o.type.name == 'ParticleSystem']
                            go = candidates[0].read().m_GameObject.read() if len(candidates) == 1 else source_by_hierarchy(entry['node'])
                        else:
                            candidates = [o for o in objects.get(str(entry['node']), []) if o.type.name == 'GameObject']
                            go = candidates[0].read() if len(candidates) == 1 else source_by_hierarchy(entry['node'])
                        renderers = [c.component for c in go.m_Component if c.component.type.name == kind]
                        if len(renderers) != 1:
                            raise ValueError(f"{go.m_Name}: {len(renderers)} {kind} components")
                        source = renderers[0].read_typetree()
                        if 'm_Enabled' not in source:
                            raise ValueError(f'{go.m_Name}: m_Enabled absent')
                        enabled = bool(source['m_Enabled'])
                        summary['checkedParticleSystems' if kind == 'ParticleSystemRenderer' else 'checkedStaticMeshes'] += 1
                        if not enabled:
                            summary['disabledParticleRenderers' if kind == 'ParticleSystemRenderer' else 'disabledMeshRenderers'] += 1
                            exported = entry.get('renderer', {}).get('enabled') if kind == 'ParticleSystemRenderer' else entry.get('enabled')
                            hidden = bool(entry.get('emitterOnly')) if kind == 'ParticleSystemRenderer' else exported is False
                            ps = next((c.component for c in go.m_Component if c.component.type.name == 'ParticleSystem'), None)
                            finding = {'character': character, 'preset': preset, 'bundle': bundle_name,
                                       'kind': kind, 'name': go.m_Name, 'node': str(entry['node']),
                                       'sourceId': str(ps.path_id if ps else renderers[0].path_id),
                                       'exportedSourceId': entry.get('sourceId'),
                                       'rendererSourceId': str(renderers[0].path_id), 'sourceEnabled': enabled,
                                       'exportedEnabled': exported, 'emitterOnly': entry.get('emitterOnly'),
                                       'hierarchyActive': active(entry['node']),
                                       'references': refs.get(preset, refs.get(effect.get('assetName'), [])),
                                       'renderingMismatch': not hidden}
                            report['disabled'].append(finding)
                            if not hidden:
                                report['mismatches'].append(finding)
            except Exception as error:
                report['errors'].append({'character': character, 'preset': preset, 'error': str(error)})
        print(json.dumps({'character': character, **summary}), flush=True)
    if apk:
        apk.close()
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(encoded, encoding='utf8')
    else:
        print(encoded)
    print(json.dumps({'disabled': len(report['disabled']), 'mismatches': len(report['mismatches']),
                      'errors': len(report['errors']), 'bundles': len(bundles)}))
    if report['mismatches'] or report['errors']:raise SystemExit(1)


if __name__ == '__main__':
    main()
