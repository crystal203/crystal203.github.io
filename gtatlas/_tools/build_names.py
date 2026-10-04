#!/usr/bin/env python3
"""
Build code -> Chinese name sidecars for the published atlases.

Source: E:\\GTFiles\\static_data_dec
  strings-zhCN.json  flat {stringKey: text} table (169k keys)
  items / monsters / npc / heroes / visuals / stickers
                     entity tables linking an atlas code to a Name that is
                     itself a string key

Resolution order for an atlas code, highest confidence first:

  1. exact        the code is itself a string key
  2. _circle      a circular-mask variant of the same name (same wording)
  3. _kong        the Kong-region sprite variant of the same hero
  4. _myth        the bloom / ascended variant of the same hero
  5. _<rank>      a star-rank variant of the same hero, e.g. `akayuki_3` is the
                  3-star art of the hero whose base code is `akayuki`. The digit
                  is the hero's Rank + 1 in heroes.json (akayuki_2 -> Rank 1,
                  idol_captain_3 -> Rank 2), so it is a rarity tier, NOT the
                  star count printed in game. Only 1-2 digit suffixes are
                  stripped, so year-suffixed names (_2024) are never touched.
  6. combinations of 2-5
  7. table        an entity table maps the code to a Name whose name_/desc_ key
                  exists, and every entity sharing that code agrees

`_ex` and `_cm` are deliberately NOT stripped: they are separate tiers with
their own keys (（精品）/（纪念）), so stripping them would mislabel a frame.

Tier suffixes are also ANNOTATED in the Chinese name, so the variant is visible
and searchable (查「开花」或「3星」都能搜到):

  _myth   ->  名（开花）      the myth / awakened form. The game's own text uses
                              开花 (see the Star6StageCoffeePass strings), and it
                              applies to both heroes and their exclusive weapons
                              (cwp_*_myth). Annotated in every atlas.
  _<rank> ->  名（N星）       star-rank art tier of a hero. Annotated only for
                              RANK_NOTE_ATLASES, because in other atlases a
                              trailing number is an ordinary index (e.g. the item
                              tea_cup_filled_2 must NOT become "（2星）").

An atlas only gets a sidecar when at least MIN_RATE of its codes resolve, so
UI/localisation atlases whose frames are unnamed widget ids (battle, main_ui,
MainUiS3, localization, emblems, rift, construction_hh, questItems) are left
showing their internal codes.

Output: gtatlas/assets/<atlas>.zh.json  {"<code>": "<中文名>", ...}

Usage: python _tools/build_names.py [--check] [--verbose]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEC = Path(r"E:\GTFiles\static_data_dec")
HERE = Path(__file__).resolve().parent
DST = HERE.parent / "assets"

MIN_RATE = 0.50

# suffix -> safe to strip because it never changes the wording
SAFE_SUFFIXES = ("_circle", "_kong", "_myth")

# a trailing star-rank tier: `akayuki_3`, `caravan_lisa_01`. Restricted to one or
# two digits so that year-suffixed names (_2024, _1000day) are never truncated.
RANK_RE = re.compile(r"_(?:\d|0\d)$")

# `_myth` is the 开花 (myth / awakened) form everywhere it appears: hero art,
# hero weapons (cwp_*_myth) and the myth awakening stone.
MYTH_RE = re.compile(r"_myth$")
MYTH_NOTE = "开花"

# atlases where a trailing number really is a hero star-rank tier. Deliberately a
# short explicit list: in items/UI atlases the same shape is an ordinary index.
RANK_NOTE_ATLASES = {"characters"}

# matches an annotation this tool has already added, for idempotence
STAR_NOTE_RE = re.compile(r"（\d+星）")


# ---------------------------------------------------------------------------
# Explicit name fixes for codes the localization table does not name itself.
#
# The game is internally inconsistent about ONE hero. heroes.json and every asset
# call it `bridge_driver` (singular), but the only keys that name it are spelled
# with a stray plural `s`, so nothing the resolver does can reach them:
#
#     strings['bridge_drivers_3']              = "V"     <- the sprite name
#     strings['kc_bridge_driver']              = "V"     <- knowledge-collection entry
#     strings['shortstory_br23_bridge_driver'] = "V"     <- npc.json Name for that sprite
#
# Three independent keys agree, and the sibling keys are the same shape and are
# real names (bridge_chef_3 -> 佩珀, bridge_messenger_3 -> 塞拉), so the hero is
# called **V** — V Driver, the 坎特伯雷特快列车 of bridge_v_driver_main_name.
# name_bridge_driver / desc_ / profile_ are absent from BOTH strings-zhCN and
# strings-enUS, so there is nothing else to draw on.
#
# Values here are the plain name; annotate() still appends (3星)/(开花) afterwards.
NAME_FIXES: dict[str, dict[str, str]] = {
    "characters": {
        "bridge_driver_3": "V",             # star tiers of the same hero
        "bridge_driver_4": "V",
        "bridge_driver_5": "V",
        "bridge_driver_myth": "V",          # bloom form, same hero
        # the costume has no key in either locale. Composed from the four
        # corroborating *__kindergartener keys, which are all 「幼儿园<name>」:
        # eight_tail -> 幼儿园奈莉, sheep_girl -> 幼儿园蕾伊,
        # summer_android -> 幼儿园AA72, white_beast -> 幼儿园白雪.
        "bridge_driver_kindergartener": "幼儿园V",
    },
    "portraits": {
        "bridge_driver": "V",
        "bridge_driver_myth": "V",
    },
    "items": {
        # sibling shape: evolve_stone_bridge_messenger -> 反击的使者塞拉进化石,
        # myth_stone_bridge_messenger -> 反击的使者塞拉开花石. Only the short
        # name is known for this hero, so the same shape is applied to it.
        "evolve_stone_bridge_driver": "V进化石",
        "myth_stone_bridge_driver": "V开花石",
    },
}

EXT_RE = re.compile(r"\.(png|psd|jpg|jpeg|tga)$", re.I)

# every field an entity table might use to point at an atlas frame
CODE_FIELDS = ("SpriteName", "SpineAssetName", "PortraitAssetName", "Name", "Class", "VisualName")
NAME_FIELDS = ("Name", "Class", "VisualName")
TABLES = ("items.json", "monsters.json", "npc.json", "heroes.json", "visuals.json", "stickers.json")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build_entity_index(strings: dict) -> dict[str, set[str]]:
    """atlas code -> the set of string keys of every entity that uses it."""
    index: dict[str, set[str]] = {}

    def add(code, keys):
        if isinstance(code, str) and code:
            index.setdefault(code, set()).update(k for k in keys if k)

    for table in TABLES:
        path = DEC / table
        if not path.exists():
            continue
        data = load(path)
        if isinstance(data, dict):
            entries = [e for v in data.values() if isinstance(v, list) for e in v]
        else:
            entries = data
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            keys: list[str] = []
            for field in NAME_FIELDS:
                v = entry.get(field)
                if isinstance(v, str):
                    keys += [v, "name_" + v, "desc_" + v]
            codes: list[str] = []
            for field in CODE_FIELDS:
                v = entry.get(field)
                if isinstance(v, str):
                    codes.append(v.split("#")[0])
                elif isinstance(v, dict):
                    for vv in v.values():
                        if isinstance(vv, str):
                            for part in vv.split(":"):
                                codes.append(part.split("#")[0])
            for code in codes:
                add(code, keys)
    return index


def candidates(code: str) -> list[tuple[str, str]]:
    """Ordered (candidate, stage) list for one atlas code."""
    base = EXT_RE.sub("", code)
    out = [(base, "exact")]
    frontier = [base]
    for _ in range(2):                      # allow two stacked suffixes, e.g. _ex_circle
        nxt = []
        for cur in frontier:
            for suf in SAFE_SUFFIXES:
                if cur.endswith(suf) and len(cur) > len(suf):
                    trimmed = cur[: -len(suf)]
                    out.append((trimmed, "strip" + suf))
                    nxt.append(trimmed)
            if RANK_RE.search(cur):
                trimmed = RANK_RE.sub("", cur)
                out.append((trimmed, "strip_rank"))
                nxt.append(trimmed)
        frontier = nxt

    seen, uniq = set(), []
    for cand, stage in out:
        if cand not in seen:
            seen.add(cand)
            uniq.append((cand, stage))
    return uniq


def resolve(code: str, strings: dict, index: dict) -> tuple[str | None, str | None]:
    cands = candidates(code)
    for cand, stage in cands:
        for key in (cand, "name_" + cand, "desc_" + cand):
            value = strings.get(key)
            if isinstance(value, str) and value.strip():
                return value, stage
    for cand, stage in cands:
        keys = index.get(cand)
        if not keys:
            continue
        values = {strings[k] for k in keys
                  if isinstance(strings.get(k), str) and strings[k].strip()}
        if len(values) == 1:                # only when every user agrees
            return values.pop(), "table"
    return None, None


def annotate(code: str, zh: str | None, stem: str) -> str | None:
    """Spell the tier suffix out in the Chinese name.

    Applied on the CODE's suffix rather than on the resolution stage, because the
    game often ships its own key for the variant with no wording change at all
    (strings['adela_noble_myth'] is just 女男爵黛西, same as the base).
    """
    if not zh:
        return zh
    if MYTH_RE.search(code) and MYTH_NOTE not in zh:
        return f"{zh}（{MYTH_NOTE}）"
    if stem in RANK_NOTE_ATLASES:
        m = RANK_RE.search(code)
        # guard against double-annotating an already-noted name; a bare 星 is not
        # enough, since plenty of names legitimately contain it (流星弓, 星片...)
        if m and not STAR_NOTE_RE.search(zh):
            return f"{zh}（{int(m.group(0)[1:])}星）"
    return zh


def atlas_codes(stem: str) -> list[str]:
    frames = load(DST / f"{stem}.json")["frames"]
    return list(frames if isinstance(frames, dict) else (f["name"] for f in frames))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--verbose", action="store_true", help="list the codes left untranslated")
    args = ap.parse_args()

    if not DEC.exists():
        print(f"static data not found: {DEC}")
        return 1

    strings = load(DEC / "strings-zhCN.json")
    index = build_entity_index(strings)
    print(f"strings-zhCN.json: {len(strings)} keys; entity index: {len(index)} codes")

    stems = sorted(p.stem for p in DST.glob("*.json") if not p.name.endswith(".zh.json"))
    print(f"atlases: {len(stems)}   threshold: {MIN_RATE:.0%}\n")

    written, skipped = [], []
    print(f"{'atlas':26} {'codes':>6} {'named':>6} {'rate':>7}  verdict")
    for stem in stems:
        codes = atlas_codes(stem)
        stages: Counter = Counter()
        mapping: dict[str, str] = {}
        unmapped: list[str] = []
        for code in codes:
            zh = NAME_FIXES.get(stem, {}).get(code)
            stage = "fix" if zh else None
            if not zh:
                zh, stage = resolve(code, strings, index)
            zh = annotate(code, zh, stem)
            if zh:
                mapping[code] = zh
                stages[(stage or "?").split("_")[0]] += 1
            else:
                unmapped.append(code)

        # a fix that no longer matches a real frame is a typo in NAME_FIXES
        stale_fixes = set(NAME_FIXES.get(stem, ())) - set(codes)
        if stale_fixes:
            print(f"  !! NAME_FIXES[{stem!r}] targets frames that do not exist: {sorted(stale_fixes)}")

        rate = len(mapping) / max(len(codes), 1)
        out_path = DST / f"{stem}.zh.json"
        if rate >= MIN_RATE:
            verdict = "ship"
            written.append((stem, len(mapping), len(codes), rate))
            if not args.check:
                out_path.write_text(
                    json.dumps(mapping, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                    encoding="utf-8")
        else:
            verdict = "skip (too low)"
            skipped.append((stem, len(mapping), len(codes), rate))
            if not args.check and out_path.exists():
                out_path.unlink()           # never leave a stale sidecar behind

        print(f"{stem:26} {len(codes):6} {len(mapping):6} {100 * rate:6.1f}%  {verdict:16} {dict(stages)}")
        if args.verbose and unmapped:
            print(f"{'':26}   untranslated: {', '.join(unmapped[:12])}"
                  f"{' ...' if len(unmapped) > 12 else ''}")

    print(f"\nship {len(written)}, skip {len(skipped)}"
          + ("  (check only, nothing written)" if args.check else f"  -> {DST}"))
    if skipped:
        print("skipped: " + ", ".join(f"{s} ({100 * r:.0f}%)" for s, _, _, r in skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
