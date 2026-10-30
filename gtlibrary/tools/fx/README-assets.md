# FX shared image imports

Current end-to-end handoff: [特效复原交接流程](../../docs/fx-restoration-handoff.md).

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

## Preview targets

The FX action preview accepts a main ground point (`targetPosition: [x, 0, z]`)
and optional `secondaryTargets` in the same native coordinates. The old
`targetDistance` input remains supported when no point is specified. Use the
main-target button once, or the secondary-target button for repeated ground
picks; click a secondary target entry to remove it. Escape ends picking.
Picking uses the inverse native camera projection and preserves the view when
rebuilding an action. Target markers are preview guides and are excluded from exports.

`targeting.js` shares the main position and aim across target anchors, projectile
trajectories and graph movement. Target-attached plan events with native
`LimitTarget > 1` and `SearchType: Closest` select from the candidate positions,
using Radius/Range, the Angle sector (interpreted as its full angular width),
nearest-first ordering and the target limit. Other target events remain attached
to the main target. Graph collision nodes evaluate each candidate with a separate
hit record; adding targets does not replicate the cast, screen effect or action.
This extends the existing collision interpreter; it does not implement additional
collision shapes, team filtering or every game search strategy.

Focused checks for this change cover oblique projection round-trip, a diagonal
Adela dash, range/limit selection for the idol weapon action, and two nearby
versus one distant graph-collision target. No screenshot recognition or appearance
/direction sweeps are used.

## Projectile action imports

Resource discovery follows scalar and list projectile references, including option
overrides and recursively referenced projectiles. Legacy action-name discovery
uses exact resource tokens; tower and conquest variants are not selected by a
substring match. Weapon shoot offsets and custom idle clips are preserved.

The shared projectile action interpreter supports immediate grenade-launcher
shots, paired homing paths, and prepare/refresh redirect shots. Lua pair plans
carry a source hash and derive their spin limit from the original script.
The launcher .25-second action interval and immediate shot are verified against
registered native methods 0x8ae5910 and 0x8ae6448; prepare/refresh parameters
come from StaticData and native methods 0x8bf2248, 0x8bf32d4 and 0x8bf3d90.

Villain Redhood imports 22 effects and exposes normal, magazine-final, enhanced,
support, exclusive-weapon and myth previews, plus a full-magazine sequence.
The importer preserves MagazineSize. The magazine preview starts with full ammo
and the enhancement ready: each .25-second attack consumes one round, appends
the extra projectile only when its 3-second cooldown allows, and replaces the
last main projectile with SuperProjectileName. Projectile and impact tails overlap
subsequent shots. Replaying starts a fresh magazine; it does not carry battle
state across separate preview replays. Collision previews use point targets, so exact enemy
hitbox contact times and network/frame scheduling can differ from game captures.

The full-magazine timing and last-round decision are backed by registered
ManualGrenadeLauncher GetAttackType/StartAttack/OnUpdateFrameAttack and
ManualDiscreteStamina IsBreakAttack/AttackState. Local extraction evidence is
in source-cache/magazine-*. The focused check uses only myth/right/distance 6:
six rounds at 0, .25, .5, .75, 1 and 1.25 seconds, one extra opening projectile,
and a final super projectile with remaining effect tails retained.


The next batch imports Fallen Queen, Dokkaebi, Carp Girl, Gnome Doctor and
Invader Knight through the same source collector. Lua state patterns compile
into generic timeline operations; graph sync events retain their named recipient
instead of recursively entering the sender's projectile handler. This fixes the
Gnome Doctor ordinary-attack nontermination. Embedded Spine effects use the
original skeleton binary, atlas and shared texture bindings.

CustomAnimator curves retain their texture property name, including across state
transitions. Main texture, second texture and mask offset/scale animate separately.
This is required by Carp Girl's myth dragon meshes. MatCap/Detail follows the
APK shader's vertex-interpolated lookup and main * color * MatCap * 3 formula;
stale gradient and alpha-cutoff material fields are not shader features. Original
shader evidence is in source-cache/matcap-detail-native.txt.

Continuous basic actions are detected from the source's repeated action state
with a one-time upper-animation start. The additional `basic-continuous` module
keeps the character clock running, advances native particle random state for each
new effect instance, and skips the ordinary preview's inter-play delay. The Loop
control keeps the state running; pause/replay remain available. It does not infer
perpetual behavior for every finite basic attack.

`check-reported-fx.mjs` checks only ordinary Gnome Doctor construction, actual
Carp Girl myth mask curves, the duck's MatCap material, and three continuous
attack cycle boundaries including deterministic random-state replay. It uses no
image pixels, browser captures, skin sweep or facing sweep. Visual acceptance
remains a user review after reloading the page.


Follow-up at Carp Girl myth time 1.201 seconds:
- The reported blue shape belongs to the landing prefab, not the dragon-body
  prefab. Unity extrinsic Z-X-Y means Ry * Rx * Rz; Three.js needs intrinsic YXZ.
  Fix shape, particle and CustomAnimator Euler conversion consistently. The
  stored prefab quaternions remain unchanged. Primary convention reference:
  https://github.com/Unity-Technologies/Unity.Mathematics/blob/master/src/Unity.Mathematics/quaternion.cs
- Missing source normals require separate static and particle paths. The static
  default Normal shader channel is (0,0,-1,0); the native CPU mesh-particle
  BakeMesh probe instead outputs zero normals. `core.js` preserves that distinction
  via missingSourceNormals/missingMeshParticleNormal and retains supplied normals.
  Numerical probe artifacts: `tools/fx/source-cache/dokkaebi-native-mesh-probe`.
  This correction did not resolve the user's reported Dokkaebi model appearance;
  that visual issue was explicitly deferred, not accepted as fixed.
- Select the screen camera before building a screen prefab's particle simulation.
  ScreenEffectObject is authoritative even when an action omitted its screen flag.
  Both initial emitter transforms and subsequent sampling use that same camera.
- GraphStamina reads and consumes a real stamina state. CharacterSpec .ctor
  0x60e554c loads float 200 into MaxStamina (+0x1f4); IsBreakAttack 0x8b21880 compares
  remaining stamina <= cost. Gnome's cost 20 and duration .4 produce ten attacks,
  with the tenth enhanced. Pending projectile/effect tails overlap later shots.
  Each full-magazine preview starts full and ends empty; it is not a battle-wide
  reload/cooldown simulation. Importer exports battleDefaults for the common rule.

The targeted check is check-rendering-followup.mjs: one exact landing sample,
one missing-normal mesh, one screen prefab and one ordinary Gnome magazine.
The previous Adela fixed-case graph check also passes. No skin/facing sweep or
image recognition was performed. UI upper/lower folding preserves primary
selection, transport and timeline controls and remembers each fold separately.
