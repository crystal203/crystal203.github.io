"""Generate selectable equipment from native WeaponType and existing atlas frames."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def build(output=None, source=None, atlas=None):
    output = Path(output or ROOT / 'gtfx/assets')
    source = Path(source or output / 'native-source')
    atlas = Path(atlas or ROOT / 'gtatlas/assets/items.json')
    items = json.loads((source / 'items.json').read_text(encoding='utf-8'))
    frames = json.loads(atlas.read_text(encoding='utf-8'))['frames']
    groups = {}
    for item in items:
        kind = item.get('WeaponType')
        if item.get('Type') != 'weapon' or not kind:
            continue
        sprites = item.get('SpriteName') or {}
        names = [sprites] if isinstance(sprites, str) else sprites.values()
        for name in names:
            if name in frames:
                groups.setdefault(kind, set()).add(name)
    result = {kind: sorted(names) for kind, names in sorted(groups.items())}
    (output / 'weapon-types.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    return result

if __name__ == '__main__':
    print(json.dumps({kind: len(names) for kind, names in build().items()}))
