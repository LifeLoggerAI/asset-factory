# Outdoor visual successor 1.0.5

The measured 1.0.4 street/backyard/lake candidates end without surrounding land;
several cardinal views show almost only the flat review background. Grass and
water also have dominant periodic stripe modes. This separate successor adds
original decorative distant terrain, extends the lake surface, and removes those
dominant material modes while preserving all collision/navigation bytes.

Source is stacked on Asset Factory #424 at
`c85a4628c5a8b0713a353ed197af1d46717aedb7`. The original #420 and #423
builders and every prior package version remain unchanged. Original geometry and
material synthesis use the repository Apache-2.0 license. Zero provider calls,
paid credits, personal media or captured-reality truth are introduced.

Only street, lake and backyard emit 1.0.5 packages. Each contains three render
LODs and the byte-identical 1.0.4 collision/navigation/lighting/camera dependencies.
Current indoor worlds remain at their 1.0.4 manifests. Terrain uses tiered closed
meshes with stitched unit normals and is explicitly decorative/unwalkable. Lake
water replaces the old small surface, so no coplanar duplicate remains. Material
modes/phases are shared across 128/256/512 px tiers; Fourier peak regression gates
reject the predecessor's strong stripe artifacts.

Generate the predecessors using CONNECTED_SUCCESSOR_README.md, then:

```sh
python3 model_forge/generic-worlds/v1/build/build_outdoor_successor.py
python3 model_forge/generic-worlds/v1/qa/run_tests.py --report /absolute/new/tests.json
python3 model_forge/generic-worlds/v1/qa/run_all.py model_forge/generic-worlds/v1 --version 1.0.5 --report /absolute/new/qa.json
node model_forge/generic-worlds/v1/build/khronos.mjs /absolute/build/node_modules/gltf-validator 1.0.5 /absolute/new/khronos
node model_forge/generic-worlds/v1/build/audit_consumer.mjs --tools /absolute/build/node_modules --browser /absolute/chromium --playwright /absolute/playwright --version 1.0.5 --report /absolute/new/consumer.json
```

All builders and receipts reject an existing target version. Verify exact archive
inventory, source hashes and per-world dependency manifests before owner review.
The larger render bounds describe distant scenery; the original collision and
navigation domain is not expanded. Keep that distinction in owner integration.
Coordinates remain meters, right-handed +Y up, front +Z, camera forward -Z.

These are still GENERIC / NEEDS_REWORK partial visual candidates. Smooth original
terrain/material manufacture fixes specific artifacts; it does not complete AAA
foliage, atmosphere, indirect light, art direction, dressing, audio or era variants.
Actual UrAi movement/headroom/collision tolerances, physical device GPU/frame-time
and memory, human comfort/accessibility and deliberate owner admission remain
open. Keep walking, runtime, visual, human/device, production and Golden Master
acceptance false. No Spatial, Studio, Jobs or provider administration is changed.
