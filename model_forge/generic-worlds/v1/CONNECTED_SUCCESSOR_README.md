# Connected generic-world successor 1.0.4

This successor retains every conservative body-clear navigation cell, refuses
disconnected sectors, and independently binds complete collision cuboids and
floor triangles to the exported navigation. It stays GENERIC / NEEDS_REWORK.

Source authority: Asset Factory #423 at
`3e632587645af027c0f886ff31e34c8dab9bac24`, preserving #420 at
`eba0c4ee7f60ef6e52d7d22a4cb885b926dc6c03`; exact Studio #154 briefs at
`da11465dcaf77f07e8d65ed8d473e55681b16c7e`. The old private 1.0.2 archive
was not accessible. Regenerate from these exact source bytes; prior scratch
verification was lost with a workspace reset and is not current evidence.

Five worlds receive physical clearance changes: rear living cabinet +.90 m X,
outer classroom desks/chairs .20 m inward, church corridor +.75 m depth with
matching floor/ceiling/wall/collision, lake table/chair -.60 m Z, and a real level
street crossing with interrupted curbs. Other ten worlds preserve all GLB bytes.
The aligned .20 m grid uses .45 m body radius, .90 m minimum clearance, 1.70 m
height and three center-only .75 m teleport disks per world. Floor margins include
the full cell plus body footprint. Missing sectors are rejected, never pruned.

`audit_connected_world.py` reads complete active-scene cuboid triangles, binds
all obstacle/floor boxes, recovers the documented six-decimal authoring bounds
within 10 micrometers of measured float32 geometry, and rejects missing,
duplicate or unsafe cells. Runtime collision tolerances remain unverified.

Use isolated checkouts with Studio at sibling `../world-factory-studio`, then:

```sh
npm ci --ignore-scripts --prefix model_forge/generic-worlds/v1/build
python3 model_forge/generic-worlds/v1/build/build.py
python3 model_forge/generic-worlds/v1/build/build_navigation_successor.py
python3 model_forge/generic-worlds/v1/build/build_connected_successor.py
python3 model_forge/generic-worlds/v1/qa/run_tests.py --report /absolute/new/tests.json
python3 model_forge/generic-worlds/v1/qa/run_all.py model_forge/generic-worlds/v1 --version 1.0.4 --report /absolute/new/qa.json
python3 model_forge/generic-worlds/v1/qa/audit_connected_world.py /absolute/package/manifest.json --report /absolute/new/navigation.json
node model_forge/generic-worlds/v1/build/khronos.mjs /absolute/build/node_modules/gltf-validator 1.0.4 /absolute/new/khronos
node model_forge/generic-worlds/v1/build/audit_consumer.mjs --tools /absolute/build/node_modules --browser /absolute/chromium --playwright /absolute/playwright --version 1.0.4 --report /absolute/new/consumer.json
```

Builders and reports refuse existing output versions. Keep predecessor history.
Original local parametric geometry/materials use the repository Apache-2.0
license. No paid providers, source media or personal identity are introduced.
Coordinates are meters, right-handed +Y up, declared front +Z, camera forward -Z.
The owner must bind geometry/collision/navigation/anchors together and receipt
any conversion. Keep a captured insert's truth/provenance/consent independent.

Consume exact archive inventory and manifest hashes for deliberate owner review.
Do not transfer older package or Spatial-SHA acceptance. All walking, full-scene
headroom, controller, traffic, UrAi runtime, human art/accessibility and physical
device/XR/GPU/frame-time approval flags remain false. Cardinal screenshots show
outdoor missing horizons and periodic grass/water striping; separate measured
visual work is required. These source patches do not alter Spatial, Studio, Jobs,
provider routing or promotion authority. Final Home/Orb/Passport/Life Map art,
era/weather variants, characters, vehicles and audio remain unadmitted.
