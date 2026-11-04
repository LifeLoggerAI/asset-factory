# Navigation successor 1.0.3

This isolated successor fixes six unsupported teleport disks in the actual
source-built street and backyard packages. The original #420 source, 1.0.2
artifacts and historical summary remain unchanged. All fifteen environments
still need production art rework and human visual approval.

The current authority is Asset Factory #420 at
`eba0c4ee7f60ef6e52d7d22a4cb885b926dc6c03`, Studio #154 at
`da11465dcaf77f07e8d65ed8d473e55681b16c7e` and Jobs #153 at
`800ea1bae5b85a470e657626bb11d4124a2646d4`. This work does not modify those
branches, Spatial, providers, promotion/resolution, store state or release
authority.

## Actual scope

The authenticated materialization of the retained v1.0.2 archive failed with
HTTP 403. Therefore this run independently regenerated a baseline from the
exact preserved public source and Studio specifications. It does not claim the
old private archive was rehashed or byte-identical to the regenerated baseline.
The regenerated baseline's 96 actual GLBs passed the independent checker and
the official Khronos validator with zero errors or warnings.

Successor packages copy all sixty render/collision GLBs, plus lighting and
camera files, byte-for-byte from that verified baseline. Geometry and visual
quality have not changed. New navigation metadata binds exact floor rectangles
to actual collision GLB triangles, chooses fully supported .65 m landing disks,
and records reachable/disconnected cell IDs. Old and new manifests are separately
hashed. No predecessor visual, runtime, device or approval result transfers.

The landing radius includes the agent footprint and authorizes **center-only
teleport landing**. It does not authorize roaming inside the radius. Complete
scene headroom, a movement controller and a baked runtime navmesh remain
unverified. The floor-disk algorithm checks exact rectangular-union containment
at a one-micrometer numerical tolerance, including interior holes and narrow
notches. Collision checks cover the landing cylinder against declared AABB
volumes, whose completeness still requires scene/runtime review.

Six worlds have disconnected walkable sectors: living room, street, church,
college dorm, lake/dock and office. Their explicit cell IDs and blockers remain
in the successor navigation data. `walkAcceptanceAllowed=false` remains set for
every world pending full runtime/controller/headroom acceptance. No automated
result upgrades these worlds to accepted navigation or final art.

## Reproduce

Materialize the exact #420 source and the exact Studio #154 specification tree
as documented by the preserved original README. In a new directory, reproduce
the baseline, then build successors. Both builders reject existing version
directories rather than overwriting history.

```sh
python3 model_forge/generic-worlds/v1/build/build.py
python3 model_forge/generic-worlds/v1/build/build_navigation_successor.py
python3 -m unittest discover -s model_forge/generic-worlds/v1/qa -p 'test_*.py'
python3 model_forge/generic-worlds/v1/qa/check_repository.py
python3 model_forge/generic-worlds/v1/qa/run_all.py model_forge/generic-worlds/v1 --version 1.0.3 --report /absolute/new/structural.json
python3 model_forge/generic-worlds/v1/qa/navigation_safety.py /absolute/package/1.0.3/manifest.json --report /absolute/new/navigation.json
```

The separate standalone consumer tool loads real GLBs with GLTFLoader, checks
imported bounds, renders five distance-based Three.js LOD selections including
switch-back, and produces front/rear/left/right eye-height review images. It
uses the existing pinned Three.js 0.180.0 toolchain. This run used supplemental
Chromium 153, not the standard managed browser or a physical device.

```sh
npm ci --ignore-scripts --prefix model_forge/generic-worlds/v1/build
node model_forge/generic-worlds/v1/build/audit_consumer.mjs --tools /absolute/build/node_modules --browser /absolute/chromium --playwright /absolute/playwright --version 1.0.3 --report /absolute/new/consumer.json
```

## Integration handoff

The binary archive contains separately versioned packages, exact file hashes,
static structural and navigation evidence, and standalone import/render evidence.
It is a rework candidate package, not a production-admitted environment library.
Do not consume or promote it automatically.

The Golden Master owner can review source patches independently of binary/art
admission. Before any environment admission: inspect each exact package and
literal pixels, resolve the canonical ID binding through Studio's existing
`pr154-source-binding.v1.json`, and select the meaning of canonical `-Z` forward.
No geometry-axis conversion has been applied. If forward means camera view,
the camera convention already matches. If it means asset front, transform
geometry/collision/navigation/anchors together by the explicitly receipted
180-degree Y rotation and recheck bounds/orientation. The standalone eye height
1.69 m is an explicit review variant and does not rewrite source cameras.

Remaining admissions are production art and human G8 judgment, complete
navigation/collision/controller behavior, actual UrAi imports and LOD behavior,
physical mobile/desktop/XR budgets and comfort, rights/provenance review,
independent review and governed promotion. Provider execution remains blocked by
credentials and bounded spend authority. This work used zero paid calls/credits.

All environment truth remains GENERIC and non-autobiographical. Runtime,
production, release, Golden Master, human visual and physical-device acceptance
remain false.
