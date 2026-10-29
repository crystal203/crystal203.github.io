# FX shared image imports

`import-character-native.py` and `compact-native-assets.py` share `native_asset_store.py`.
The former imports original bundles; the latter migrates existing character manifests
without changing effects or action graphs.

- Sprite reuse requires matching decoded RGBA bytes and dimensions after applying
  the existing atlas rectangle/rotation. Names only select candidates; they never
  establish equivalence. Original pivot, size, pixels-per-unit and sampler state stay
  with the Sprite. When an existing atlas does not match, the importer resolves the original Unity
  SpriteAtlas/render-data texture, merges split alpha if present, and shares that
  full native atlas with its original rectangle/packing transform. Only frames
  without an equivalent rectangular native atlas remain standalone.
- Full textures share PNG files by RGBA content hash. New shared file names use
  `shared_<original Texture name>_<hash>.png`, never the importing character.
  Original atlas images retain their full dimensions; they are not repacked or cropped. Texture bindings additionally
  include sampler state; sharing an image never forces another material's wrapping
  or filtering. Runtime manifests retain only reachable resource records.
- Reused frames set `clampUv`. The renderer applies main-texture UV animation inside
  the frame, keeps secondary/mask UVs independent, and clamps fragment sampling to
  the frame's texel centers. Existing atlas consumers without this flag are unchanged.
- `atlas-catalog.json` preserves import-only coordinates removed from runtime
  manifests. Keep this small catalog with the importer; it is outside deployment
  roots. Content hash caches are disposable.
- Original prefabs and their provenance live in `tools/fx/source-cache/prefabs` and
  `characters`, not `gtfx/assets`. The source cache is ignored by Git and excluded
  by `prepare-deploy.mjs`'s runtime roots. Runtime character packs contain no prefab
  URLs and need neither the importer nor its cache to play.
- Cleanup is restricted to importer-managed image names. All character manifests
  and direct references in runtime text files protect their images. Removed PNGs
  are retained under `source-cache/removed-textures` for local recovery. Unknown
  legacy assets are not deleted merely because a selected character stopped using them.

Existing imports: `python tools/fx/compact-native-assets.py --index gtfx/assets/characters/<id>.json`
Use `--native-atlases` when migrating older standalone frame exports back to their
original bundle atlases. Multiple indexes can follow `--index`. Scripts use the configured Python executable
and dependency directory. Normal imports automatically use the same resource policy.

For the five-character migration, `check-shared-assets.py --before
 tools/fx/source-cache/before-compaction` compares decoded resource hashes, sampler
state, Sprite metadata and effect definitions. This is a data comparison, not image
recognition or screenshot testing. Other characters may already refer to textures
not installed locally; the check separately reports these and verifies cleanup did
not remove them. Fixed numerical construction checks are `check-native-imports.mjs`
and `check-graph-import.mjs`; neither enumerates appearances or directions.

The local import configuration selects a Python 3.12 runtime and the `malloc`
allocator after intermittent allocator/access-violation failures in bulk catalog
processing. This setting is scoped to importer subprocesses, not the system or
the running offline server. Explicit caller `PYTHONMALLOC` settings are respected.
