#!/usr/bin/env python3
"""Independent verification of the published gtatlas/assets.

For every atlas pair it checks:
  * the JSON parses and has a meta block naming the PNG that sits beside it;
  * meta.size matches the real PNG size;
  * every frame rect is inside the PNG;
  * rects do not overlap (exact duplicates count as aliases, not overlaps);
  * the published PNG decodes to exactly the pixels of the source PNG.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_assets import DST, SRC, MANIFEST, png_pixels  # noqa: E402
from PIL import Image  # noqa: E402

# index.html injects region.name into innerHTML and into a single-quoted JS
# string inside an inline onclick. A quote or angle bracket actually breaks the
# row; a bare '&' renders literally in practice, so it is reported but not fatal.
BREAKING_RE = re.compile(r"""['"<>]""")
COSMETIC_RE = re.compile(r"""[&\\]""")

fails = 0

# source PNGs deliberately not published, with the reason
EXCLUDED = {
    "spritesheets/items/orb/orbItems.png":
        "atlas holds a single sprite (orb_test), too little to be useful - dropped by request",
    "spritesheets/garage/Garage.png":
        "two rift banner sprites only - dropped by request",
    "Texture2D/knight_captain_lost_memory_remind.png":
        "four cutscene frames, not sprite art - dropped by request",
    "Texture2D/KnightTraining.png":
        "four background/gift sprites only - dropped by request",
}


def check(stem, src_png: Path):
    global fails
    problems = []
    jp, pp = DST / f"{stem}.json", DST / f"{stem}.png"
    if not jp.exists():
        return [f"{stem}: JSON missing"], 0
    if not pp.exists():
        return [f"{stem}: PNG missing"], 0
    doc = json.loads(jp.read_text(encoding="utf-8"))
    frames = doc["frames"]
    frames = frames if isinstance(frames, dict) else {f["name"]: f for f in frames}
    meta = doc.get("meta", {})
    with Image.open(pp) as im:
        w, h = im.size
    if meta.get("image") != pp.name:
        problems.append(f"meta.image={meta.get('image')!r} != {pp.name!r}")
    if (meta.get("size", {}).get("w"), meta.get("size", {}).get("h")) != (w, h):
        problems.append(f"meta.size={meta.get('size')} != PNG {w}x{h}")

    oob, rotated = [], 0
    by_rect = defaultdict(list)
    zero = 0
    for name, f in frames.items():
        fr = f.get("frame", f)
        x, y = fr["x"], fr["y"]
        dw, dh = fr.get("w", fr.get("width")), fr.get("h", fr.get("height"))
        rot = bool(f.get("rotated"))
        if rot:
            rotated += 1
        if dw == 0 or dh == 0:
            zero += 1
        # a rotated frame is stored turned 90 deg, so its packed footprint is the
        # transpose of the display size
        pw, ph = (dh, dw) if rot else (dw, dh)
        if x < 0 or y < 0 or x + pw > w or y + ph > h:
            oob.append(name)
        by_rect[(x, y, pw, ph)].append(name)

    # overlap sweep over distinct rects (sorted by y, then x, so the early break is valid)
    rects = sorted(by_rect, key=lambda r: (r[1], r[0]))
    overlaps = []
    for i, a in enumerate(rects):
        ax, ay, aw, ah = a
        for b in rects[i + 1:]:
            bx, by, bw, bh = b
            if by >= ay + ah:
                break
            if ax < bx + bw and bx < ax + aw:
                overlaps.append((by_rect[a][0], by_rect[b][0]))

    # published pixels must equal the game's pixels
    same = png_pixels(pp) == png_pixels(src_png)

    # the viewer crops each rect out of the PNG: every rect must actually contain
    # visible pixels, which is what proves the JSON really belongs to this PNG.
    # A 1x1 transparent rect is the game's own "no sprite" placeholder convention
    # (e.g. items/empty, characters/big_boss, portraits/bounty_hunter) and is fine.
    with Image.open(pp) as im:
        rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    empty, placeholders = [], []
    for rect, group in by_rect.items():
        x, y, fw, fh = rect
        if alpha.crop((x, y, x + fw, y + fh)).getextrema()[1] == 0:
            (placeholders if (fw, fh) == (1, 1) else empty).append(group[0])
    if empty:
        problems.append(f"{len(empty)} frame rect(s) larger than 1x1 crop to fully transparent pixels: {empty[:3]}")
    hidden = len(empty) + len(placeholders)
    note = None
    if hidden:
        note = f"the viewer filters {hidden} blank frame(s) on load"
        if placeholders:
            note += f", e.g. {placeholders[:4]}"

    aliases = sum(len(v) - 1 for v in by_rect.values() if len(v) > 1)
    if oob:
        problems.append(f"{len(oob)} out-of-bounds: {oob[:3]}")
    if overlaps:
        problems.append(f"{len(overlaps)} overlapping rects: {overlaps[:3]}")
    if not same:
        problems.append("published pixels differ from the source PNG")
    # the viewer pastes region.name into inline HTML and a JS string literal
    unsafe = [n for n in frames if BREAKING_RE.search(n)]
    if unsafe:
        problems.append(f"{len(unsafe)} frame names break the viewer's inline onclick/innerHTML: {unsafe[:3]}")
    cosmetic = [n for n in frames if COSMETIC_RE.search(n)]
    biggest = max(((f.get('frame', f).get('w', 0), f.get('frame', f).get('h', 0)) for f in frames.values()),
                  default=(0, 0))
    print(f"  [{'OK' if not problems else 'FAIL'}] {stem:36} frames={len(frames):5} {w}x{h} "
          f"aliases={aliases:3} rotated={rotated:3} zero-size={zero:2} "
          f"biggest-sprite={biggest[0]}x{biggest[1]} pixels-match-source={same}")
    for p in problems:
        print(f"        - {p}")
    if cosmetic:
        print(f"        note: {len(cosmetic)} frame name(s) contain '&' or '\\' (renders fine): {cosmetic[:3]}")
    if note:
        print(f"        note: {note}")
    if problems:
        fails += 1
    return problems, len(frames)


print("=== verifying published gtatlas/assets against the sps_261004 export ===")
total = 0
for stem, png_rel, _ in MANIFEST:
    _, n = check(stem, SRC / png_rel)
    total += n

# report the source PNGs that ended up with no published pair
published = {(SRC / r).resolve() for _, r, _ in MANIFEST}
all_pngs = [p for p in SRC.rglob("*.png")]
unpaired = []
for p in all_pngs:
    if p.resolve() in published:
        continue
    unpaired.append(p.relative_to(SRC).as_posix())

print(f"\n{len(MANIFEST)} atlas pairs, {total} frames, {fails} failing")
print(f"\n=== source PNGs with no published atlas pair ({len(unpaired)}) ===")
for u in sorted(unpaired):
    reason = EXCLUDED.get(u)
    print(f"  {u}" + (f"\n      -> excluded on purpose: {reason}" if reason else "   <-- UNEXPLAINED"))
sys.exit(1 if fails else 0)
