#!/usr/bin/env python3
"""
gtatlas/assets sync tool.

Rebuilds D:\\github\\gtatlas\\assets from an unpacked Guardian Tales Unity export.

Data sources, in order of preference:
  1. a TexturePacker/Starling JSON atlas next to the PNG  (copied verbatim)
  2. the NGUI atlas ScriptableObject `<Name>.asset` (mSprites list)
  3. the NGUI atlas prefab `<Name>.prefab`          (mSprites list)
A PNG is only re-encoded when its pixels differ from what is already published;
otherwise the existing (better optimised) file is left alone.

Usage:
    python _tools/build_assets.py            # write assets
    python _tools/build_assets.py --check    # report only, change nothing
    python _tools/build_assets.py --validate # cross-check the YAML converter
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

SRC = Path(r"E:\GTFiles\sps_261004\ExportedProject\Assets")
DST = Path(__file__).resolve().parent.parent / "assets"

# ---------------------------------------------------------------------------
# manifest: dest stem -> (png relative to SRC, sprite-data spec)
#   data spec: ("json", rel) | ("yaml", rel) | ("auto", None)
# For "auto" the tool searches the whole export for a data file whose stem
# matches the PNG, preferring json > <Name>.asset > <Name>.prefab.
# ---------------------------------------------------------------------------
MANIFEST: list[tuple[str, str, tuple[str, str | None]]] = [
    # --- atlases already published (dest filename kept for zero churn) ---
    ("Badge", "spritesheets/badge/Badge.png", ("json", "spritesheets/badge/Badge.json")),
    ("battle", "spritesheets/battle ui/battle.png", ("json", "spritesheets/battle ui/battle.txt")),
    ("bosses", "spritesheets/bosses/bosses.png", ("json", "spritesheets/bosses/bosses.json")),
    ("characters", "spritesheets/characters/characters.png", ("json", "spritesheets/characters/characters.json")),
    ("items", "spritesheets/items/items/items.png", ("json", "spritesheets/items/items/items.json")),
    ("PortraitFrame", "spritesheets/portraitframe/PortraitFrame.png", ("json", "spritesheets/portraitframe/PortraitFrame.json")),
    ("portraits", "spritesheets/story-portraits/portraits.png", ("json", "spritesheets/story-portraits/portraits.json")),
    ("ProfilecardStickers", "spritesheets/profilecardstickers/ProfilecardStickers.png", ("json", "spritesheets/profilecardstickers/ProfileCardStickers.json")),
    # --- atlas pairs that were missing from gtatlas ---
    ("questItems", "spritesheets/items/quest/questItems.png", ("json", "spritesheets/items/quest/questItems.json")),
    ("farmItems", "Texture2D/farmItems.png", ("json", "TextAsset/farmItems.json")),
    ("MainUiS3", "spritesheets/main ui s3/MainUiS3.png", ("json", "spritesheets/main ui s3/MainUiS3.json")),
    ("main_ui", "spritesheets/main ui/main_ui.png", ("json", "spritesheets/main ui/main_ui.json")),
    ("localization", "spritesheets/localization/localization.png", ("json", "spritesheets/localization/localization.json")),
    ("LocalizationSub", "spritesheets/localizationsub/LocalizationSub.png", ("json", "spritesheets/localizationsub/LocalizationSub.json")),
    # stem kept as the game's own meta.image spelling (ProfilecardStickers2), mirroring
    # the already-published ProfilecardStickers pair, whose source file is ProfileCardStickers.json
    ("ProfilecardStickers2", "spritesheets/profilecardstickers/stickers2/ProfileCardStickers2.png", ("json", "spritesheets/profilecardstickers/stickers2/ProfileCardStickers2.json")),
    ("emblems", "spritesheets/emblems/emblems.png", ("auto", None)),
    ("rift", "spritesheets/rift/rift.png", ("auto", None)),
    ("Kamazon", "Texture2D/Kamazon.png", ("auto", None)),
    ("StickerPack", "Texture2D/StickerPack.png", ("auto", None)),
    # a Spine animation atlas: packed rects are stored rotated 90 deg clockwise
    ("construction_hh", "spine/heavenhold/construction/construction_hh.png",
     ("spine", "spine/heavenhold/construction/construction_hh.atlas.txt")),
]


# ---------------------------------------------------------------------------
# Unity YAML (NGUI atlas) -> sprite list
# ---------------------------------------------------------------------------
_NAME_RE = re.compile(r"^(\s*)- name:\s*(.*?)\s*$")
_FIELD_RE = re.compile(r"^\s{4,}([A-Za-z][A-Za-z0-9_]*):\s*(\S+)\s*$")

_INT_FIELDS = (
    "x", "y", "width", "height",
    "borderLeft", "borderRight", "borderTop", "borderBottom",
    "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
)


def _unquote(s: str) -> str:
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        return s[1:-1]
    return s


def parse_unity_sprites(path: Path) -> list[dict]:
    """Return the `mSprites` list of a Unity NGUI atlas .asset / .prefab."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    sprites: list[dict] = []
    cur: dict | None = None
    for line in lines:
        m = _NAME_RE.match(line)
        if m:
            cur = {"name": _unquote(m.group(2))}
            sprites.append(cur)
            continue
        if cur is None:
            continue
        f = _FIELD_RE.match(line)
        if not f:
            # a non-field line at low indent ends the block only if it is not
            # one of our numeric fields; keep it simple and just skip blanks.
            if line.strip() and not line.startswith("    "):
                cur = None
            continue
        key, val = f.group(1), f.group(2)
        if key in _INT_FIELDS:
            try:
                cur[key] = int(val)
            except ValueError:
                pass
    return [s for s in sprites if "x" in s and "width" in s]


def sprites_to_texturepacker(sprites: list[dict], image: str, size: tuple[int, int]) -> dict:
    """NGUI mSprites -> TexturePacker/Starling JSON (same shape the game already ships).

    NGUI stores the *trimmed* rect in width/height and the trim offset in
    paddingLeft/Top; TexturePacker stores the same numbers as frame.w/h and
    spriteSourceSize.x/y, with sourceSize = trimmed size + both paddings.
    """
    frames: dict[str, dict] = {}
    for s in sprites:
        w, h = s["width"], s["height"]
        pl, pr = s.get("paddingLeft", 0), s.get("paddingRight", 0)
        pt, pb = s.get("paddingTop", 0), s.get("paddingBottom", 0)
        frames[s["name"]] = {
            "frame": {"x": s["x"], "y": s["y"], "w": w, "h": h},
            "rotated": False,
            "trimmed": bool(pl or pr or pt or pb),
            "spriteSourceSize": {"x": pl, "y": pt, "w": w, "h": h},
            "sourceSize": {"w": w + pl + pr, "h": h + pt + pb},
        }
    return {
        "frames": frames,
        "meta": {
            "version": "1.0",
            "image": image,
            "format": "RGBA8888",
            "size": {"w": size[0], "h": size[1]},
            "scale": "1",
        },
    }


def dumps_tp(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Spine .atlas -> sprite list
#
# Layout: an unindented "<page>.png" line opens a page, unindented "key: value"
# lines are page properties, and any other unindented line opens a region whose
# fields sit on the following indented lines.
#
# A region with `rotate: true` is stored turned 90 degrees CLOCKWISE, so its
# packed rect is (size.h x size.w) -- the transpose of the display size. That
# was confirmed against construction_hh: reading `size` as written gives 22
# overlapping rects and 2 out-of-bounds; transposing gives 0 and 0.
# ---------------------------------------------------------------------------
_SPINE_PROP_RE = re.compile(r"^(size|format|filter|repeat|pma|scale):")


def parse_spine_atlas(path: Path) -> tuple[dict, list[dict]]:
    page: dict | None = None
    regions: list[dict] = []
    cur: dict | None = None
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if not line[:1].isspace():
            if line.endswith(".png"):
                page = {"image": line, "props": {}}
                cur = None
                continue
            if _SPINE_PROP_RE.match(line):
                if page is not None:
                    k, v = line.split(":", 1)
                    page["props"][k] = v.strip()
                continue
            cur = {"name": line, "rotate": False,
                   "xy": (0, 0), "size": (0, 0), "orig": None, "offset": (0, 0)}
            regions.append(cur)
            continue
        if cur is None:
            continue
        k, v = (s.strip() for s in line.strip().split(":", 1))
        if k in ("xy", "size", "orig", "offset"):
            cur[k] = tuple(int(x) for x in v.split(","))
        elif k == "rotate":
            cur["rotate"] = v.lower() == "true"
    return (page or {"image": path.stem + ".png", "props": {}}), regions


def spine_to_texturepacker(page: dict, regions: list[dict], size: tuple[int, int]) -> dict:
    """Spine region -> TexturePacker frame.

    Spine's `offset` is measured from the BOTTOM-left of the original image
    (libgdx y-up), whereas TexturePacker's spriteSourceSize is measured from the
    top-left, so the y offset is mirrored: src_y = orig_h - offset_y - h.
    Cross-checked against the game's own farmItems/characters JSON, where the raw
    offset y is wrong for 58/75 and 1757/1833 regions respectively and the
    mirrored value is right for all of them.
    """
    frames: dict[str, dict] = {}
    for r in regions:
        w, h = r["size"]
        orig = r["orig"] or (w, h)
        off_x, off_y = r["offset"] or (0, 0)
        src_y = orig[1] - off_y - h
        frames[r["name"]] = {
            "frame": {"x": r["xy"][0], "y": r["xy"][1], "w": w, "h": h},
            "rotated": bool(r["rotate"]),
            "trimmed": (w, h) != orig or off_x != 0 or src_y != 0,
            "spriteSourceSize": {"x": off_x, "y": src_y, "w": w, "h": h},
            "sourceSize": {"w": orig[0], "h": orig[1]},
        }
    return {
        "frames": frames,
        "meta": {
            "version": "1.0",
            "image": page["image"],
            "format": "RGBA8888",
            "size": {"w": size[0], "h": size[1]},
            "scale": "1",
        },
    }


# ---------------------------------------------------------------------------
# frames removed from a published atlas. The unpacked source is left intact, so
# these are applied on the way out.
# ---------------------------------------------------------------------------
DROP_FRAMES: dict[str, set[str]] = {
    # `white_girgas` is an atlas-only legacy alias: it occupies exactly the same
    # rect (1022,107,100,100) as `white_beast` (= 白雪), and the name appears in
    # no static table, no string key and no file in the sps/character/illust
    # dumps. The real White Day Girgas is the separate code `whiteday_girgas`.
    "portraits": {"white_girgas"},
}


# ---------------------------------------------------------------------------
# source discovery
# ---------------------------------------------------------------------------
def _rel(path: Path) -> str:
    return path.relative_to(SRC).as_posix()


def find_auto(png: Path) -> tuple[str, Path]:
    """Locate the NGUI sprite data for a PNG when no JSON atlas exists."""
    stem = png.stem
    cands: list[tuple[int, Path]] = []
    for p in SRC.rglob("*"):
        if p.suffix.lower() not in (".asset", ".prefab"):
            continue
        if p.stem.lower() != stem.lower():
            continue
        if not parse_unity_sprites(p):
            continue
        # a ScriptableObject .asset is the atlas itself; a .prefab is a scene
        # copy and sometimes carries a stale, shorter list
        rank = 0 if p.suffix.lower() == ".asset" else 1
        cands.append((rank, p))
    if not cands:
        raise FileNotFoundError(f"no sprite data found for {_rel(png)}")
    cands.sort(key=lambda t: (t[0], str(t[1])))
    return ("yaml", cands[0][1])


def png_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        return im.size


def png_pixels(path: Path) -> tuple[str, tuple[int, int], bytes]:
    with Image.open(path) as im:
        im = im.convert("RGBA")
        return im.mode, im.size, im.tobytes()


# ---------------------------------------------------------------------------
# validation of the YAML converter against shipped JSON atlases
# ---------------------------------------------------------------------------
VALIDATE = [
    ("spritesheets/badge/Badge.asset", "spritesheets/badge/Badge.json"),
    ("spritesheets/characters/characters.asset", "spritesheets/characters/characters.json"),
    ("spritesheets/bosses/bosses.prefab", "spritesheets/bosses/bosses.json"),
    ("spritesheets/localization/localization.prefab", "spritesheets/localization/localization.json"),
    ("spritesheets/main ui s3/MainUiS3.asset", "spritesheets/main ui s3/MainUiS3.json"),
    ("spritesheets/main ui/main_ui.prefab", "spritesheets/main ui/main_ui.json"),
    ("spritesheets/localizationsub/LocalizationSub.prefab", "spritesheets/localizationsub/LocalizationSub.json"),
    ("spritesheets/profilecardstickers/ProfileCardStickers.asset", "spritesheets/profilecardstickers/ProfileCardStickers.json"),
    ("spritesheets/profilecardstickers/stickers2/ProfilecardStickers2.asset", "spritesheets/profilecardstickers/stickers2/ProfileCardStickers2.json"),
    ("spritesheets/story-portraits/portraits.asset", "spritesheets/story-portraits/portraits.json"),
    ("spritesheets/items/items/items.asset", "spritesheets/items/items/items.json"),
    ("spritesheets/items/quest/questItems.asset", "spritesheets/items/quest/questItems.json"),
    ("MonoBehaviour/farmItems.asset", "TextAsset/farmItems.json"),
    # the Spine atlases, cross-checked against the TexturePacker JSON of the same image
    ("spine:TextAsset/farmItems.atlas.txt", "TextAsset/farmItems.json"),
    ("spine:TextAsset/characters.atlas.txt", "spritesheets/characters/characters.json"),
]


def validate() -> int:
    print("=== sprite-data converters, cross-checked against shipped TexturePacker JSON ===")
    print("    NGUI .asset/.prefab (mSprites) and Spine .atlas.txt are both converted to the")
    print("    TexturePacker shape and diffed against the game's own JSON for the same image.")
    print("    Names are compared with any trailing image extension stripped: some TexturePacker")
    print("    exports keep the source '.png'/'.psd' in the frame name, the NGUI atlas does not.")
    bad = 0
    for src, js in VALIDATE:
        is_spine = src.startswith("spine:")
        yp = SRC / (src.split(":", 1)[1] if is_spine else src)
        jp = SRC / js
        if is_spine:
            page, regions = parse_spine_atlas(yp)
            gen = spine_to_texturepacker(page, regions, (0, 0))["frames"]
        else:
            gen = sprites_to_texturepacker(parse_unity_sprites(yp), jp.name, (0, 0))["frames"]
        label = src
        ref_doc = json.loads(jp.read_text(encoding="utf-8"))
        ref = ref_doc["frames"]
        ref = ref if isinstance(ref, dict) else {}
        strip = lambda n: re.sub(r"\.(png|psd|jpg|jpeg|tga)$", "", n, flags=re.I)

        ref_by = {strip(k): v for k, v in ref.items()}
        ext_kept = sum(1 for k in ref if strip(k) != k)

        mism = []
        for name, g in gen.items():
            r = ref_by.get(strip(name))
            if r is None:
                mism.append(f"{name}: absent from JSON")
                continue
            rf = r.get("frame", r)
            if (rf["x"], rf["y"], rf["w"], rf["h"]) != (g["frame"]["x"], g["frame"]["y"], g["frame"]["w"], g["frame"]["h"]):
                mism.append(f"{name}: rect {rf} != {g['frame']}")
                continue
            if bool(r.get("rotated")) != g["rotated"]:
                mism.append(f"{name}: rotated {r.get('rotated')} != {g['rotated']}")
                continue
            rss, gss = r.get("spriteSourceSize"), g["spriteSourceSize"]
            if rss and (rss["x"], rss["y"]) != (gss["x"], gss["y"]):
                mism.append(f"{name}: trim offset {rss} != {gss}")
                continue
            rso, gso = r.get("sourceSize"), g["sourceSize"]
            if rso and (rso["w"], rso["h"]) != (gso["w"], gso["h"]):
                mism.append(f"{name}: sourceSize {rso} != {gso}")
        missing = [n for n in ref_by if n not in {strip(g) for g in gen}]
        status = "OK" if not mism and not missing else "FAIL"
        if status == "FAIL":
            bad += 1
        print(f"  [{status}] {label:58} yaml={len(gen):5} json={len(ref):5} "
              f"rect+trim+sourceSize mismatch={len(mism)} json-only={len(missing)} json-keeps-ext={ext_kept}")
        for line in mism[:3]:
            print(f"         - {line}")
        if missing:
            print(f"         - json-only sample: {missing[:4]}")
    print(f"\n{'ALL CONVERTER CHECKS PASSED' if bad == 0 else f'{bad} CHECK(S) FAILED'}")
    return 1 if bad else 0


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
def build(check_only: bool) -> int:
    DST.mkdir(parents=True, exist_ok=True)
    rows = []
    for stem, png_rel, (kind, data_rel) in MANIFEST:
        png = SRC / png_rel
        if not png.exists():
            print(f"  !! missing source PNG {png_rel}")
            continue
        size = png_size(png)

        if kind == "auto":
            kind, data_path = find_auto(png)
        else:
            data_path = SRC / data_rel
        if not data_path.exists():
            raise FileNotFoundError(data_path)

        if kind == "json":
            raw = data_path.read_text(encoding="utf-8")
            doc = json.loads(raw)
            n_frames = len(doc["frames"])
            json_bytes = raw.encode("utf-8")
            src_desc = _rel(data_path)
        elif kind == "spine":
            page, regions = parse_spine_atlas(data_path)
            doc = spine_to_texturepacker(page, regions, size)
            n_frames = len(regions)
            json_bytes = dumps_tp(doc).encode("utf-8")
            src_desc = _rel(data_path)
        else:
            sprites = parse_unity_sprites(data_path)
            doc = sprites_to_texturepacker(sprites, png.name, size)
            n_frames = len(sprites)
            json_bytes = dumps_tp(doc).encode("utf-8")
            src_desc = _rel(data_path)

        # Explicit frame drops. The source data stays untouched; the published
        # atlas is re-serialised without these entries.
        dropped = []
        for name in sorted(DROP_FRAMES.get(stem, ())):
            if name in doc["frames"]:
                del doc["frames"][name]
                dropped.append(name)
        if dropped:
            n_frames = len(doc["frames"])
            json_bytes = dumps_tp(doc).encode("utf-8")

        # --- JSON ---
        dst_json = DST / f"{stem}.json"
        json_changed = (not dst_json.exists()) or dst_json.read_bytes() != json_bytes

        # --- PNG: re-encode only when the pixels actually changed ---
        dst_png = DST / f"{stem}.png"
        png_action = "new"
        if dst_png.exists():
            if png_pixels(dst_png) == png_pixels(png):
                png_action = "kept (pixels identical, existing file is already optimised)"
            else:
                png_action = "re-encoded"
        if not check_only:
            if json_changed:
                dst_json.write_bytes(json_bytes)
            if png_action != "kept (pixels identical, existing file is already optimised)":
                with Image.open(png) as im:
                    im = im.convert("RGBA")
                    buf = io.BytesIO()
                    im.save(buf, "PNG", compress_level=9)
                data = buf.getvalue()
                # hard guarantee: the published PNG must decode to the same pixels
                with Image.open(io.BytesIO(data)) as back:
                    back = back.convert("RGBA")
                    assert back.size == im.size and back.tobytes() == im.tobytes(), stem
                dst_png.write_bytes(data)
        rows.append({
            "stem": stem, "src": src_desc, "kind": kind, "frames": n_frames,
            "size": f"{size[0]}x{size[1]}", "png": png_action,
            "json": "written" if json_changed else "unchanged",
        })

    print(f"{'atlas':36} {'frames':>7}  {'size':>10}  {'json':9}  png")
    for r in rows:
        print(f"{r['stem']:36} {r['frames']:7}  {r['size']:>10}  {r['json']:9}  {r['png']}")
    print(f"\n{len(rows)} atlas pairs; " + ("check only, nothing written" if check_only else f"written to {DST}"))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only")
    ap.add_argument("--validate", action="store_true", help="cross-check the YAML converter")
    a = ap.parse_args()
    if a.validate:
        return validate()
    return build(a.check)


if __name__ == "__main__":
    sys.exit(main())
