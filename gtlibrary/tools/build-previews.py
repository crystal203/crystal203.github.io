"""Generate small list-only atlases; full-resolution download assets stay intact."""
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'resources' / 'previews'
OUTPUT.mkdir(parents=True, exist_ok=True)
CELL, COLS = 40, 32


def crop(image, entry):
    r = entry['frame']
    result = image.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    if entry.get('rotated'):
        result = result.transpose(Image.Transpose.ROTATE_90)
    result.thumbnail((36, 36), Image.Resampling.NEAREST)
    return result


def pack(name, entries):
    atlas = Image.new('RGBA', (COLS * CELL, max(1, math.ceil(len(entries) / COLS)) * CELL))
    frames = {}
    for i, (key, image) in enumerate(entries):
        x, y = i % COLS * CELL + (CELL - image.width) // 2, i // COLS * CELL + (CELL - image.height) // 2
        atlas.paste(image, (x, y))
        frames[key] = {'frame': {'x': x, 'y': y, 'w': image.width, 'h': image.height}, 'rotated': False}
    atlas.save(OUTPUT / (name + '.webp'), quality=82, method=6)
    (OUTPUT / (name + '.json')).write_text(json.dumps({'frames': frames}, separators=(',', ':')), encoding='utf-8')
    print(name, len(frames), 'frames;', (OUTPUT / (name + '.webp')).stat().st_size, 'image bytes')


images = {name: Image.open(ROOT / 'gtatlas' / 'assets' / (name + '.png')).convert('RGBA') for name in ('characters', 'portraits')}
for name, image in images.items():
    data = json.loads((ROOT / 'gtatlas' / 'assets' / (name + '.json')).read_text(encoding='utf-8-sig'))
    pack(name, [(key, crop(image, entry)) for key, entry in data['frames'].items()])
catalog = json.loads((ROOT / 'gtfx' / 'assets' / 'catalog.json').read_text(encoding='utf-8-sig'))
pack('fx', [(char['id'], crop(images['portraits' if char.get('portrait') else 'characters'], char.get('portrait') or char['avatar']))
            for char in catalog['characters'] if char.get('portrait') or char.get('avatar')])
